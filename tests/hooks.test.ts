import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OperationsStore } from '../server/operations/store.js';
import { Watchdog } from '../server/operations/watchdog.js';
import { createTask, changeTask } from '../server/operations/tasks.js';
import { withDefaults } from '../server/operations/config.js';
import { hookSchema, hookResultSchema, queueHooks } from '../server/operations/hooks.js';
import { killAttempt, killHookRun } from '../server/operations/processes.js';
import { runtimeArgs } from '../server/runtime.js';
import { codexHookConfig, codexHookArgs } from '../server/operations/codex-hooks.js';
import type { TaskConfig, ManagedTask } from '../shared/operations.js';
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const handler = (code: string) => [
  process.execPath,
  '-e',
  `let raw='';process.stdin.on('data',b=>raw+=b);process.stdin.on('end',()=>{const ctx=JSON.parse(raw);${code}})`,
];
const hook = (events: string[], argv: string[], extra = {}) =>
  hookSchema.parse({ id: 'custom', events, argv, ...extra });
async function fixture(
  fn: (f: {
    root: string;
    store: OperationsStore;
    watchdog: Watchdog;
    submit: (c: Partial<TaskConfig>) => ManagedTask;
    until: (
      id: string,
      predicate: (t: ManagedTask) => boolean,
      timeout?: number,
    ) => Promise<ManagedTask>;
  }) => Promise<void>,
) {
  const root = mkdtempSync(join(tmpdir(), 'atsys-hooks-'));
  const store = new OperationsStore(join(root, 'state'));
  const watchdog = new Watchdog(store);
  watchdog.claim();
  const submit = (config: Partial<TaskConfig>) =>
    createTask(
      store,
      withDefaults({
        name: 'Hooks acceptance',
        objective: 'Verify lifecycle callbacks independently',
        cwd: root,
        worker: 'command',
        argv: [process.execPath, '-e', 'process.exit(0)'],
        validator: 'command',
        validationArgv: [process.execPath, '-e', 'process.exit(0)'],
        recovery: 'notify',
        timeoutSeconds: 20,
        backoffSeconds: 0,
        ...config,
      }),
    );
  const until = async (id: string, predicate: (t: ManagedTask) => boolean, timeout = 20000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      watchdog.tick();
      const t = store.read().tasks.find((t) => t.id === id)!;
      if (predicate(t)) return t;
      await pause(80);
    }
    throw new Error(
      'Hook scenario timed out: ' + JSON.stringify(store.read().tasks.find((t) => t.id === id)),
    );
  };
  try {
    await fn({ root, store, watchdog, submit, until });
  } finally {
    for (const t of store.read().tasks) {
      for (const a of t.attempts) killAttempt(a);
      for (const r of t.hookRuns ?? []) killHookRun(r);
    }
    await pause(100);
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
}
test('hooks gate workloads and validators and retain ordered lifecycle receipts', async () =>
  fixture(async ({ root, submit, until }) => {
    const argv = handler(
      `require('fs').appendFileSync('sequence',ctx.event+':'+ctx.attempt.phase+'\\n');console.log('{}')`,
    );
    const t = submit({
      argv: [process.execPath, '-e', `require('fs').appendFileSync('sequence','worker\\n')`],
      validationArgv: [
        process.execPath,
        '-e',
        `require('fs').appendFileSync('sequence','validator\\n')`,
      ],
      hooks: [
        hook(
          ['before_run', 'after_run', 'before_validation', 'after_validation', 'on_task_complete'],
          argv,
        ),
      ],
    });
    const done = await until(
      t.id,
      (t) =>
        t.status === 'completed' &&
        !!t.hookRuns?.some((r) => r.event === 'on_task_complete' && r.applied),
    );
    assert.deepEqual(readFileSync(join(root, 'sequence'), 'utf8').trim().split('\n'), [
      'before_run:worker',
      'worker',
      'after_run:worker',
      'before_run:validator',
      'before_validation:validator',
      'validator',
      'after_run:validator',
      'after_validation:validator',
      'on_task_complete:validator',
    ]);
    assert.ok(done.hookRuns?.every((r) => r.status === 'succeeded' && r.cleanupConfirmed));
    assert.equal(done.attempts.at(-1)?.validation?.passed, true);
  }));
test('before-run denial and invalid completion claims cannot execute or validate a task', async () =>
  fixture(async ({ root, submit, until }) => {
    for (const response of [
      { decision: 'fail', message: 'Preflight rejects this input' },
      { decision: 'complete' },
    ]) {
      const t = submit({
        argv: [process.execPath, '-e', `require('fs').writeFileSync('executed','bad')`],
        hooks: [
          hook(['before_run'], handler(`console.log(${JSON.stringify(JSON.stringify(response))})`)),
        ],
      });
      const done = await until(t.id, (t) => t.status === 'needs_attention');
      assert.equal(existsSync(join(root, 'executed')), false);
      assert.equal(done.attempts.length, 1);
      assert.equal(done.attempts[0].status, 'failed');
      assert.ok(done.hookRuns?.[0].applied);
    }
    assert.equal(
      hookResultSchema.safeParse({ decision: 'complete', allowRepair: true }).success,
      false,
    );
  }));
test('hook deadlines are bounded and continue policy is explicit', async () =>
  fixture(async ({ root, submit, until }) => {
    const hanging = handler(
      `require('fs').writeFileSync('hook-started','yes');setInterval(()=>{},1000)`,
    );
    const t = submit({ hooks: [hook(['before_run'], hanging, { timeoutSeconds: 1 })] });
    const blocked = await until(t.id, (t) => t.status === 'needs_attention');
    assert.equal(blocked.hookRuns?.[0].status, 'timed_out');
    assert.equal(existsSync(join(root, 'hook-started')), true);
    const allowed = submit({
      hooks: [hook(['before_run'], handler(`process.exit(9)`), { failurePolicy: 'continue' })],
    });
    const done = await until(allowed.id, (t) => t.status === 'completed');
    assert.ok(done.hookRuns?.some((r) => r.status === 'failed'));
    assert.equal(done.attempts.at(-1)?.validation?.passed, true);
  }));
test('on_tick supplies real progress for quiet work without bypassing independent acceptance', async () =>
  fixture(async ({ root, submit, until }) => {
    const observer = handler(
      `const n=Number(require('fs').readFileSync('units','utf8'));console.log(JSON.stringify({progress:{completed:n,total:5,checkpoint:'unit-'+n}}))`,
    );
    const t = submit({
      argv: [
        process.execPath,
        '-e',
        `const fs=require('fs');let n=0;fs.writeFileSync('units','0');setInterval(()=>{fs.writeFileSync('units',String(++n));if(n===5)process.exit(0)},850)`,
      ],
      validationArgv: [
        process.execPath,
        '-e',
        `process.exit(require('fs').readFileSync('units','utf8')==='5'?0:1)`,
      ],
      activityTimeoutSeconds: 0,
      progressTimeoutSeconds: 3,
      hooks: [hook(['on_tick'], observer, { intervalSeconds: 1, phases: ['worker'] })],
    });
    const done = await until(t.id, (t) => t.status === 'completed');
    assert.ok(done.attempts[0].progress!.completed > 0);
    assert.equal(done.attempts[0].progress!.total, 5);
    assert.equal(done.attempts.at(-1)?.validation?.passed, true);
    assert.equal(readFileSync(join(root, 'units'), 'utf8'), '5');
  }));
test('unchanged hook progress and exhausted hook budgets cannot keep a stalled worker alive', async () =>
  fixture(async ({ submit, until }) => {
    const t = submit({
      argv: [process.execPath, '-e', 'setInterval(()=>{},1000)'],
      progressTimeoutSeconds: 2,
      hooks: [
        hook(
          ['on_tick'],
          handler(
            `console.log(JSON.stringify({progress:{completed:0,total:10,checkpoint:'same'}}))`,
          ),
          { intervalSeconds: 1, maxInvocations: 2 },
        ),
      ],
    });
    const done = await until(t.id, (t) => t.status === 'needs_attention');
    assert.match(done.attentionReason!, /Progress stalled/);
    assert.equal(done.events.filter((e) => e.type === 'hook.progress').length, 1);
    assert.ok((done.hookCounts?.custom ?? 0) <= 2);
  }));
test('watchdog takeover adopts hooks and never silently replays an interrupted delivery', async () =>
  fixture(async ({ root, store, submit, until }) => {
    const t = submit({
      hooks: [
        hook(
          ['before_run'],
          handler(`require('fs').appendFileSync('calls','1');setInterval(()=>{},1000)`),
          { timeoutSeconds: 10 },
        ),
      ],
    });
    let current = await until(
      t.id,
      (t) => !!t.hookRuns?.[0].pid && existsSync(join(root, 'calls')),
    );
    killHookRun(current.hookRuns![0]);
    store.update((s) => {
      s.daemon!.heartbeatAt = new Date(0).toISOString();
    });
    const takeover = new Watchdog(store);
    assert.equal(takeover.claim(), true);
    for (let i = 0; i < 60; i++) {
      takeover.tick();
      current = store.read().tasks.find((x) => x.id === t.id)!;
      if (current.status === 'needs_attention') break;
      await pause(80);
    }
    assert.equal(current.status, 'needs_attention');
    assert.equal(current.hookRuns![0].status, 'interrupted');
    assert.equal(readFileSync(join(root, 'calls'), 'utf8'), '1');
  }));
test('operator stop cancels a blocked before-run hook and preserves its receipt', async () =>
  fixture(async ({ store, submit, until }) => {
    const t = submit({
      hooks: [hook(['before_run'], handler('setInterval(()=>{},1000)'), { timeoutSeconds: 20 })],
    });
    await until(t.id, (t) => !!t.hookRuns?.[0].pid);
    changeTask(store, t.id, 'stop');
    const stopped = await until(t.id, (t) => t.status === 'stopped' && !!t.hookRuns?.[0].applied);
    assert.equal(stopped.hookRuns![0].status, 'interrupted');
    assert.equal(stopped.attempts[0].pid, null);
  }));
test('native Codex tool bridge returns a real denial before the operation and carries model metadata', async () =>
  fixture(async ({ root, submit, until }) => {
    const bridge = runtimeArgs('native-hook', 'policy');
    const payload = {
      hook_event_name: 'PreToolUse',
      session_id: 's1',
      turn_id: 't1',
      model: 'test-model',
      tool_name: 'Bash',
      tool_use_id: 'call-1',
      tool_input: { command: 'forbidden operation' },
    };
    const worker = `const r=require('child_process').spawnSync(${JSON.stringify(process.execPath)},${JSON.stringify(bridge)},{input:${JSON.stringify(JSON.stringify(payload))},encoding:'utf8',env:process.env});const out=JSON.parse(r.stdout);if(out.hookSpecificOutput?.permissionDecision!=='deny')require('fs').writeFileSync('forbidden','ran');`;
    const t = submit({
      argv: [process.execPath, '-e', worker],
      validationArgv: [
        process.execPath,
        '-e',
        `process.exit(require('fs').existsSync('forbidden')?1:0)`,
      ],
      hooks: [
        hook(
          ['codex_pre_tool'],
          handler(
            `if(ctx.native.model!=='test-model')throw Error();console.log(JSON.stringify({decision:'fail',message:'Operation denied'}))`,
          ),
          { id: 'policy', matcher: '^Bash$' },
        ),
      ],
    });
    const done = await until(t.id, (t) => t.status === 'completed');
    assert.equal(existsSync(join(root, 'forbidden')), false);
    assert.equal(done.hookRuns?.[0].context.native?.toolCallId, 'call-1');
    assert.equal(done.hookRuns?.[0].result?.decision, 'fail');
    const config = codexHookConfig(t.config);
    assert.ok(config.hooks.PreToolUse);
    assert.ok(config.hooks.SessionStart);
    assert.equal(
      codexHookArgs(t.config).some((s) => s.includes('bypass')),
      false,
    );
  }));
test('native Codex handshake is required only for Codex phases, never the independent validator', async () =>
  fixture(async ({ root, submit, until }) => {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    const fake = join(bin, 'codex');
    const bridge = runtimeArgs('native-hook', '__atsys_probe__');
    writeFileSync(
      fake,
      `#!${process.execPath}\nconst cp=require('child_process');process.stdin.resume();process.stdin.on('end',()=>{const r=cp.spawnSync(${JSON.stringify(process.execPath)},${JSON.stringify(bridge)},{input:JSON.stringify({hook_event_name:'SessionStart',session_id:'fixture',model:'test'}),encoding:'utf8',env:process.env});process.exit(r.status||0)});\n`,
    );
    chmodSync(fake, 0o700);
    const original = process.env.PATH;
    process.env.PATH = `${bin}:${original}`;
    try {
      const t = submit({
        worker: 'codex',
        goalMonitoring: false,
        hooks: [hook(['codex_pre_tool'], handler(`console.log('{}')`), { phases: ['worker'] })],
      });
      const done = await until(t.id, (t) => t.status === 'completed');
      assert.ok(done.attempts[0].nativeHooksConnectedAt);
      assert.equal(done.attempts[1].phase, 'validator');
      assert.equal(done.attempts[1].nativeHooksConnectedAt, undefined);
      assert.equal(done.attempts[1].validation?.passed, true);
    } finally {
      process.env.PATH = original;
    }
  }));
test('receipt pruning cannot silently replay a previously delivered callback', async () =>
  fixture(async ({ root, store, submit, until }) => {
    const t = submit({
      hooks: [
        hook(
          ['before_run'],
          handler(`require('fs').appendFileSync('delivered','1');console.log('{}')`),
          { phases: ['worker'] },
        ),
      ],
    });
    const done = await until(t.id, (t) => t.status === 'completed');
    const old = done.hookRuns![0];
    store.update((s) => {
      const task = s.tasks.find((x) => x.id === t.id)!;
      task.hookRuns = [];
      queueHooks(task, 'before_run', task.attempts[0], `${task.attempts[0].id}:before_run`);
    });
    const replay = await until(t.id, (t) => !!t.hookRuns?.[0].applied);
    assert.equal(replay.hookRuns![0].id, old.id);
    assert.equal(replay.hookRuns![0].status, 'failed');
    assert.match(replay.hookRuns![0].error!, /refusing replay/);
    assert.equal(readFileSync(join(root, 'delivered'), 'utf8'), '1');
  }));
test('hook config rejects duplicate IDs, invalid matchers and unsupported events', async () =>
  fixture(async ({ root }) => {
    const h = hook(['before_run'], handler(`console.log('{}')`));
    assert.throws(
      () =>
        withDefaults({
          name: 'bad',
          objective: 'bad hook',
          cwd: root,
          argv: [process.execPath],
          hooks: [h, h],
        }),
      /unique/,
    );
    assert.equal(hookSchema.safeParse({ ...h, matcher: '[' }).success, false);
    assert.equal(
      hookSchema.safeParse({ ...h, events: ['before_model_http_request'] }).success,
      false,
    );
    writeFileSync(join(root, 'unrelated'), 'preserved');
  }));

test('a legacy healthy watchdog cannot silently accept hook tasks', async () =>
  fixture(async ({ root, store }) => {
    store.update((s) => {
      delete s.daemon!.hookProtocol;
    });
    assert.throws(
      () =>
        createTask(
          store,
          withDefaults({
            name: 'Upgrade guard',
            objective: 'Require hook-aware supervision',
            cwd: root,
            worker: 'command',
            argv: [process.execPath, '-e', 'process.exit(0)'],
            hooks: [hook(['before_run'], handler(`console.log('{}')`))],
          }),
        ),
      /healthy upgraded watchdog/,
    );
    assert.equal(store.read().tasks.length, 0);
  }));

test('native Codex escalation fences execution and records attention', async () =>
  fixture(async ({ root, submit, until }) => {
    const bridge = runtimeArgs('native-hook', 'escalate');
    const worker = `require('child_process').spawnSync(${JSON.stringify(process.execPath)},${JSON.stringify(bridge)},{input:JSON.stringify({hook_event_name:'PreToolUse',session_id:'escalation',turn_id:'one',tool_name:'Bash',tool_use_id:'call'}),encoding:'utf8',env:process.env});require('fs').writeFileSync('must-not-run','bad')`;
    const t = submit({
      argv: [process.execPath, '-e', worker],
      hooks: [
        hook(
          ['codex_pre_tool'],
          handler(
            `console.log(JSON.stringify({decision:'escalate',message:'Human review required'}))`,
          ),
          { id: 'escalate' },
        ),
      ],
    });
    const done = await until(t.id, (t) => t.status === 'needs_attention');
    assert.match(done.attentionReason!, /Human review required/);
    assert.equal(existsSync(join(root, 'must-not-run')), false);
    assert.equal(done.attempts.length, 1);
  }));

test('oversized native pre-tool payload returns an explicit supported denial', async () =>
  fixture(async ({ root, submit, until }) => {
    const bridge = runtimeArgs('native-hook', 'policy');
    const worker = `const result=require('child_process').spawnSync(${JSON.stringify(process.execPath)},${JSON.stringify(bridge)},{input:JSON.stringify({hook_event_name:'PreToolUse',tool_input:{command:'x'.repeat(65000)}}),encoding:'utf8',env:process.env});const response=JSON.parse(result.stdout);if(response.hookSpecificOutput?.permissionDecision!=='deny'||response.continue!==undefined)require('fs').writeFileSync('oversize-allowed','bad');`;
    const t = submit({
      argv: [process.execPath, '-e', worker],
      hooks: [hook(['codex_pre_tool'], handler(`console.log('{}')`), { id: 'policy' })],
      validationArgv: [
        process.execPath,
        '-e',
        `process.exit(require('fs').existsSync('oversize-allowed')?1:0)`,
      ],
    });
    await until(t.id, (task) => task.status === 'completed');
    assert.equal(existsSync(join(root, 'oversize-allowed')), false);
  }));

test('large native callback context stays valid JSON and redacts nested secrets', async () =>
  fixture(async ({ store, submit }) => {
    const t = submit({ hooks: [hook(['agent_pre_tool'], handler(`console.log('{}')`))] });
    store.update((s) => {
      const task = s.tasks.find((x) => x.id === t.id)!;
      queueHooks(task, 'agent_pre_tool', undefined, 'large-native', {
        provider: 'claude',
        event: 'PreToolUse',
        toolName: 'Write',
        toolInput: {
          content: 'x'.repeat(16000),
          token: 'private-value',
          nested: { password: 'hidden' },
        },
      });
    });
    const context = store.read().tasks.find((x) => x.id === t.id)!.hookRuns![0].context;
    const serialized = JSON.stringify(context);
    assert.ok(serialized.length > 8000);
    assert.equal((context.native!.toolInput as any).content.length, 8000);
    assert.doesNotMatch(serialized, /private-value|hidden/);
    assert.match(serialized, /REDACTED/);
  }));
