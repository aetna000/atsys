import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OperationsStore, stamp } from '../server/operations/store.js';
import { Watchdog } from '../server/operations/watchdog.js';
import { createTask, changeTask } from '../server/operations/tasks.js';
import { withDefaults } from '../server/operations/config.js';
import { killAttempt } from '../server/operations/processes.js';
import { configureTelegram, queueTestMessage, deliverNext } from '../server/operations/telegram.js';
import type { ManagedTask, TaskConfig } from '../shared/operations.js';
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fixture(
  fn: (f: {
    store: OperationsStore;
    watchdog: Watchdog;
    root: string;
    submit: (c: Partial<TaskConfig>) => ManagedTask;
    until: (id: string, p: (t: ManagedTask) => boolean, timeout?: number) => Promise<ManagedTask>;
  }) => Promise<void>,
) {
  const root = mkdtempSync(join(tmpdir(), 'atsys-ops-'));
  const store = new OperationsStore(join(root, 'data'));
  const watchdog = new Watchdog(store);
  assert.equal(watchdog.claim(), true);
  const submit = (c: Partial<TaskConfig>) =>
    createTask(
      store,
      withDefaults({
        name: 'Operational test',
        objective: 'Verify durable execution and recovery',
        cwd: root,
        argv: [process.execPath, '-e', 'process.exit(0)'],
        recovery: 'notify',
        heartbeatTimeoutSeconds: 5,
        timeoutSeconds: 20,
        backoffSeconds: 0,
        ...c,
      }),
    );
  const until = async (id: string, p: (t: ManagedTask) => boolean, timeout = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      watchdog.tick();
      const t = store.read().tasks.find((t) => t.id === id)!;
      if (p(t)) return t;
      await pause(100);
    }
    throw new Error('Timed out: ' + JSON.stringify(store.read().tasks.find((t) => t.id === id)));
  };
  try {
    await fn({ store, watchdog, root, submit, until });
  } finally {
    for (const t of store.read().tasks)
      for (const a of t.attempts) if (!a.cleanupConfirmed) killAttempt(a);
    await pause(100);
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
}
test('real task crash resumes declared checkpoint command and validates artifact', async () =>
  fixture(async ({ submit, until, root, store }) => {
    const script = `const fs=require('fs');if(!fs.existsSync('checkpoint')){fs.writeFileSync('checkpoint','4');console.error('intentional failure');process.exit(17)}fs.writeFileSync('result.json',JSON.stringify({completed:12,total:12,passed:true,accuracy:0.92}));console.log('resumed from '+fs.readFileSync('checkpoint','utf8'))`;
    const argv = [process.execPath, '-e', script];
    const task = submit({
      argv,
      resumeArgv: argv,
      recovery: 'restart',
      maxRetries: 1,
      validator: 'benchmark-json',
      artifact: 'result.json',
    });
    const done = await until(task.id, (t) => t.status === 'completed');
    assert.equal(done.attempts.length, 2);
    assert.equal(done.attempts[0].exitCode, 17);
    assert.match(done.attempts[1].output, /resumed from 4/);
    assert.equal(done.attempts[1].validation?.digest?.length, 64);
    assert.ok(done.events.some((e) => e.type === 'incident.opened'));
    assert.ok(done.events.some((e) => e.type === 'retry.authorized'));
    const reopened = new OperationsStore(join(root, 'data'));
    assert.equal(reopened.read().tasks[0].status, 'completed');
    reopened.close();
    assert.equal(store.read().tasks.length, 1);
  }));
test('watchdog takeover adopts running attempt; killed runner is detected and recovery bounded', async () =>
  fixture(async ({ submit, until, store, watchdog }) => {
    const task = submit({
      argv: [process.execPath, '-e', 'setInterval(()=>console.log("alive"),200)'],
      recovery: 'restart',
      maxRetries: 1,
    });
    let t = await until(task.id, (t) => t.attempts[0]?.status === 'running');
    const first = t.attempts[0];
    const second = new Watchdog(store);
    assert.equal(second.claim(), false);
    store.update((s) => {
      s.daemon!.heartbeatAt = new Date(0).toISOString();
    });
    assert.equal(second.claim(), true);
    second.tick();
    assert.equal(store.read().tasks[0].attempts.length, 1);
    assert.equal(store.read().tasks[0].attempts[0].pid, first.pid);
    // Return ownership to the fixture's tick loop after proving adoption and old-owner fencing.
    watchdog.tick();
    assert.equal(store.read().daemon!.owner, second.owner);
    store.update((s) => {
      s.daemon!.heartbeatAt = new Date(0).toISOString();
    });
    assert.equal(watchdog.claim(), true);
    process.kill(first.pid!, 'SIGKILL');
    t = await until(task.id, (t) => t.attempts.length === 2 && t.attempts[1].status === 'running');
    assert.equal(t.attempts[0].status, 'lost');
    assert.equal(t.attempts[0].cleanupConfirmed, true);
    process.kill(t.attempts[1].pid!, 'SIGKILL');
    t = await until(task.id, (t) => t.status === 'needs_attention');
    assert.equal(t.attempts.length, 2);
    assert.match(t.attentionReason!, /budget exhausted/i);
  }));
test('live process with frozen progress escalates; changing unrelated timestamps is not progress', async () =>
  fixture(async ({ submit, until }) => {
    const task = submit({
      argv: [
        process.execPath,
        '-e',
        `const fs=require('fs');setInterval(()=>fs.writeFileSync('progress.json',JSON.stringify({completed:1,total:10,updated:Date.now()})),100)`,
      ],
      progressFile: 'progress.json',
      progressTimeoutSeconds: 1,
      recovery: 'notify',
    });
    const t = await until(task.id, (t) => t.status === 'needs_attention');
    assert.match(t.attentionReason!, /progress stalled/i);
    assert.ok(t.attempts[0].heartbeatAt);
    assert.notEqual(t.status, 'completed');
  }));
test('hard timeout and operator stop terminate owned processes without recovery replay', async () =>
  fixture(async ({ submit, until, store }) => {
    const deadline = submit({
      argv: [process.execPath, '-e', 'setInterval(()=>{},1000)'],
      timeoutSeconds: 1,
    });
    const failed = await until(deadline.id, (t) => t.status === 'needs_attention');
    assert.match(failed.attentionReason!, /deadline/);
    const stop = submit({
      argv: [process.execPath, '-e', 'setInterval(()=>{},1000)'],
      recovery: 'restart',
    });
    await until(stop.id, (t) => t.attempts[0]?.status === 'running');
    changeTask(store, stop.id, 'stop');
    const stopped = await until(stop.id, (t) => t.status === 'stopped');
    assert.equal(stopped.attempts.length, 1);
    assert.equal(stopped.attempts[0].cleanupConfirmed, true);
  }));
test('invalid and unchanged benchmark artifacts cannot report success; snapshots and revisions are enforced', async () =>
  fixture(async ({ root, submit, until, store }) => {
    writeFileSync(
      join(root, 'result.json'),
      JSON.stringify({ total: 2, completed: 2, passed: true, accuracy: 1 }),
    );
    const task = submit({ validator: 'benchmark-json', artifact: 'result.json' });
    const t = await until(task.id, (t) => t.status === 'needs_attention');
    assert.match(t.attentionReason!, /not updated/);
    assert.throws(() => changeTask(store, t.id, 'configure', t.config, 0), /Configuration changed/);
    const updated = changeTask(
      store,
      t.id,
      'configure',
      { ...t.config, supervisorModel: 'test-model', maxRetries: 4 },
      1,
    );
    assert.equal(updated.revision, 2);
    assert.equal(updated.attempts[0].config.supervisorModel, '');
    assert.throws(() => submit({ artifact: '../escape', validator: 'benchmark-json' }), /inside/);
    assert.throws(() => submit({ progressTimeoutSeconds: 5 }), /progress JSON/);
  }));
test('Codex supervisor proposal passes independent policy and a separate repair before retry', async () =>
  fixture(async ({ root, submit, until }) => {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    // Fake provider implements the documented CLI contract; no credentials/model calls.
    writeFileSync(
      join(bin, 'codex'),
      `#!${process.execPath}\nconst fs=require('fs');const a=process.argv.slice(2);let p='';process.stdin.on('data',x=>p+=x);process.stdin.on('end',()=>{const out=a[a.indexOf('--output-last-message')+1];const sandbox=a[a.indexOf('--sandbox')+1];fs.appendFileSync('invocations.jsonl',JSON.stringify({args:a,sandbox})+'\\n');if(sandbox==='read-only'){fs.writeFileSync(out,JSON.stringify({action:'repair',reason:'missing marker',instructions:'Create repaired marker'}));}else{fs.writeFileSync('repaired','yes');fs.writeFileSync(out,JSON.stringify({fixed:true,summary:'Created repair marker'}));}console.log(JSON.stringify({type:'turn.completed'}));});`,
      { mode: 0o700 },
    );
    const oldPath = process.env.PATH;
    process.env.PATH = bin + ':' + oldPath;
    try {
      const t = submit({
        argv: [process.execPath, '-e', `process.exit(require('fs').existsSync('repaired')?0:1)`],
        recovery: 'supervised',
        allowRepair: true,
        supervisorModel: 'contract-model',
        maxRetries: 1,
      });
      const done = await until(t.id, (t) => t.status === 'completed');
      assert.deepEqual(
        done.attempts.map((a) => a.phase),
        ['worker', 'supervisor', 'repair', 'worker'],
      );
      assert.ok(done.events.some((e) => e.type === 'repair.authorized'));
      const invocations = readFileSync(join(root, 'invocations.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((x) => JSON.parse(x));
      assert.deepEqual(
        invocations.map((x) => x.sandbox),
        ['read-only', 'workspace-write'],
      );
      assert.ok(invocations[0].args.includes('contract-model'));
      assert.ok(!invocations[0].args.includes('--dangerously-bypass-approvals-and-sandbox'));
    } finally {
      process.env.PATH = oldPath;
    }
  }));
test('Telegram token stays private; delivery survives transient errors with bounded retry', async () =>
  fixture(async ({ store }) => {
    const token = '123456:abcdefghijklmnopqrstuv';
    configureTelegram(store, {
      enabled: true,
      chatId: '1234',
      token,
      onIncident: true,
      onRecovery: true,
      onCompletion: true,
      maxAttempts: 2,
    });
    assert.equal(JSON.stringify(store.read()).includes(token), false);
    assert.equal(statSync(join(store.directory, 'telegram-secret.json')).mode & 0o777, 0o600);
    const msg = queueTestMessage(store);
    const owner = store.read().daemon!.owner;
    let calls = 0;
    const request = (async (url: unknown, init?: RequestInit) => {
      calls++;
      assert.ok(String(url).endsWith('/sendMessage'));
      assert.equal(JSON.parse(String(init?.body)).chat_id, '1234');
      return new Response(JSON.stringify({ ok: calls === 2 }), { status: calls === 2 ? 200 : 503 });
    }) as typeof fetch;
    await deliverNext(store, owner, request);
    let d = store.read().deliveries.find((d) => d.id === msg.id)!;
    assert.equal(d.status, 'pending');
    assert.equal(d.error?.includes(token), false);
    store.update((s) => {
      s.deliveries[0].nextAt = stamp();
    });
    await deliverNext(store, owner, request);
    d = store.read().deliveries[0];
    assert.equal(d.status, 'sent');
    assert.equal(d.attempts, 2);
    await deliverNext(store, owner, request);
    assert.equal(calls, 2);
  }));
test('generic coding output is independently validated; failed checks trigger recovery', async () =>
  fixture(async ({ submit, until }) => {
    const task = submit({
      argv: [process.execPath, '-e', `require('fs').writeFileSync('feature.txt','implemented')`],
      validator: 'command',
      validationArgv: [
        process.execPath,
        '-e',
        `const fs=require('fs');if(!fs.existsSync('test-attempt')){fs.writeFileSync('test-attempt','1');console.error('test failed');process.exit(1)}if(fs.readFileSync('feature.txt','utf8')!=='implemented')process.exit(2);console.log('test passed')`,
      ],
      requiredArtifacts: ['feature.txt'],
      recovery: 'restart',
      maxRetries: 1,
    });
    const done = await until(task.id, (t) => t.status === 'completed');
    assert.deepEqual(
      done.attempts.map((a) => a.phase),
      ['worker', 'validator', 'worker', 'validator'],
    );
    assert.equal(done.attempts[1].status, 'failed');
    assert.equal(done.attempts[3].validation?.artifacts?.[0].path, 'feature.txt');
    assert.equal(done.attempts[3].validation?.artifacts?.[0].digest.length, 64);
  }));
test('supervisor cannot authorize repair when local policy denies it', async () =>
  fixture(async ({ root, submit, until }) => {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'codex'),
      `#!${process.execPath}\nconst fs=require('fs');const a=process.argv.slice(2);process.stdin.resume();process.stdin.on('end',()=>fs.writeFileSync(a[a.indexOf('--output-last-message')+1],JSON.stringify({action:'repair',reason:'Fix needed',instructions:'Please repair'})));`,
      { mode: 0o700 },
    );
    const old = process.env.PATH;
    process.env.PATH = bin + ':' + old;
    try {
      const task = submit({
        argv: [process.execPath, '-e', 'process.exit(1)'],
        recovery: 'supervised',
        allowRepair: false,
      });
      const t = await until(task.id, (t) => t.status === 'needs_attention');
      assert.deepEqual(
        t.attempts.map((a) => a.phase),
        ['worker', 'supervisor'],
      );
      assert.match(t.attentionReason!, /permission/);
    } finally {
      process.env.PATH = old;
    }
  }));
test('missing required artifacts and no-output stalls cannot claim completion', async () =>
  fixture(async ({ submit, until }) => {
    const missing = submit({ requiredArtifacts: ['missing.zip'] });
    const m = await until(missing.id, (t) => t.status === 'needs_attention');
    assert.match(m.attentionReason!, /Validation failed/);
    const silent = submit({
      argv: [process.execPath, '-e', 'setInterval(()=>{},1000)'],
      activityTimeoutSeconds: 1,
    });
    const s = await until(silent.id, (t) => t.status === 'needs_attention');
    assert.match(s.attentionReason!, /Activity stalled/);
  }));
