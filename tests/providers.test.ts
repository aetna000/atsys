import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { OperationsStore } from '../server/operations/store.js';
import { Watchdog } from '../server/operations/watchdog.js';
import { createTask, changeTask } from '../server/operations/tasks.js';
import { withDefaults } from '../server/operations/config.js';
import { setupDoctor } from '../server/operations/doctor.js';
import { killAttempt, killHookRun } from '../server/operations/processes.js';
import { ProviderResult, agentInvocation } from '../server/operations/providers.js';
import { providerFor } from '../shared/providers.js';
import { taskPresentation, attemptLogEntries } from '../shared/task-presentation.js';
import { providerHookConfig } from '../server/operations/provider-hooks.js';
import type { ManagedTask, TaskConfig } from '../shared/operations.js';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fixture(
  fn: (f: {
    root: string;
    store: OperationsStore;
    submit: (c?: Partial<TaskConfig>) => ManagedTask;
    until: (id: string, p: (t: ManagedTask) => boolean) => Promise<ManagedTask>;
  }) => Promise<void>,
  mode: object = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'atsys-providers-'));
  const oldPath = process.env.PATH;
  const bin = join(root, 'bin');
  mkdirSync(bin);
  for (const p of ['codex', 'copilot', 'claude'])
    writeFileSync(
      join(bin, p),
      `#!${process.execPath}\n${readFileSync(resolve('tests/fixtures/provider-cli.cjs'), 'utf8')}`,
      { mode: 0o700 },
    );
  process.env.PATH = `${bin}:${oldPath}`;
  writeFileSync(join(root, 'fixture-mode.json'), JSON.stringify(mode));
  const store = new OperationsStore(join(root, 'state'));
  const watchdog = new Watchdog(store);
  watchdog.claim();
  const submit = (config: Partial<TaskConfig> = {}) =>
    createTask(
      store,
      withDefaults({
        name: 'Provider fixture (no model calls)',
        objective: 'Implement fixture feature with independent acceptance',
        cwd: root,
        worker: 'copilot',
        trustedLocalExecution: true,
        progressFile: 'progress.json',
        goalMonitoring: true,
        validator: 'command',
        validationArgv: [
          process.execPath,
          '-e',
          "const fs=require('fs');fs.writeFileSync('validated','yes');process.exit(fs.readFileSync('feature.txt','utf8')==='implemented'?0:1)",
        ],
        outcomeFile: 'outcome.json',
        outcomeRequired: true,
        recovery: 'notify',
        backoffSeconds: 0,
        timeoutSeconds: 15,
        plan: 'Inspect, implement, check; retain partial results',
        goalContract: {
          version: 1,
          successCriteria: ['Feature file contains implemented'],
          deliverables: ['feature.txt'],
          constraints: ['Fixture only'],
          assumptions: [],
          unresolvedDecisions: [],
          stages: ['Inspect', 'Implement', 'Check'],
          planSource: 'Fixture goal contract',
          observers: [
            { signal: 'validator', rationale: 'Independent file assertion', cadenceSeconds: 1 },
          ],
          recoveryScope: 'Fix fixture only',
          escalationConditions: ['Bounded repair fails'],
          budget: 'Two retries, no paid models',
        },
        ...config,
      }),
    );
  const until = async (id: string, p: (t: ManagedTask) => boolean) => {
    for (let n = 0; n < 300; n++) {
      watchdog.tick();
      const t = store.read().tasks.find((t) => t.id === id)!;
      if (p(t)) return t;
      await sleep(60);
    }
    const t = store.read().tasks.find((t) => t.id === id)!;
    throw new Error(
      JSON.stringify({
        status: t.status,
        reason: t.attentionReason,
        attempts: t.attempts.map((a) => ({
          phase: a.phase,
          status: a.status,
          failure: a.failure,
          output: a.output,
        })),
      }),
    );
  };
  try {
    await fn({ root, store, submit, until });
  } finally {
    for (const t of store.read().tasks) {
      for (const a of t.attempts) killAttempt(a);
      for (const h of t.hookRuns ?? []) killHookRun(h);
    }
    await sleep(100);
    store.close();
    process.env.PATH = oldPath;
    rmSync(root, { recursive: true, force: true });
  }
}
for (const provider of ['codex', 'copilot', 'claude'] as const) {
  test(`${provider}: real managed fixture invocation, goal milestones, independent validation and report`, () =>
    fixture(async ({ submit, until, root }) => {
      const t = submit({ worker: provider });
      const done = await until(t.id, (t) => t.status === 'completed');
      assert.equal(done.attempts.filter((a) => a.phase === 'validator').length, 1);
      assert.ok(existsSync(join(root, 'validated')));
      assert.equal(done.attempts[0].progress?.completed, 3);
      assert.equal(done.reports?.at(-1)?.workflowAccepted, true);
      const seen = JSON.parse(readFileSync(join(root, `seen-${provider}-worker.json`), 'utf8'));
      assert.match(seen.prompt, /goal contract/i);
      assert.ok(!seen.args.some((x: string) => /bypassPermissions|--yolo|--allow-all/.test(x)));
    }));
}
for (const provider of ['copilot', 'claude'] as const) {
  test(`${provider}: pause/resume/stop controls own the real fixture process group`, () =>
    fixture(
      async ({ root, store, submit, until }) => {
        const t = submit({ worker: provider, outcomeRequired: false });
        await until(t.id, (t) => t.status === 'running' && existsSync(join(root, 'ticks')));
        changeTask(store, t.id, 'pause');
        await until(t.id, (t) => t.status === 'paused');
        const frozen = readFileSync(join(root, 'ticks'), 'utf8');
        await sleep(250);
        assert.equal(readFileSync(join(root, 'ticks'), 'utf8'), frozen);
        changeTask(store, t.id, 'resume');
        await until(
          t.id,
          (t) => t.status === 'running' && readFileSync(join(root, 'ticks'), 'utf8') !== frozen,
        );
        changeTask(store, t.id, 'stop');
        const stopped = await until(t.id, (t) => t.status === 'stopped');
        assert.equal(stopped.attempts.filter((a) => a.phase === 'worker').length, 1);
      },
      { quiet: true },
    ));
  test(`${provider}: a denied native tool cannot reach a validator`, () =>
    fixture(
      async ({ submit, until }) => {
        const t = submit({
          worker: provider,
          goalContract: undefined,
          hooks: [
            {
              id: 'deny',
              events: ['agent_pre_tool'],
              argv: [
                process.execPath,
                '-e',
                "console.log(JSON.stringify({decision:'fail',message:'Fixture policy denial'}))",
              ],
              phases: ['worker'],
              timeoutSeconds: 2,
              intervalSeconds: 1,
              maxInvocations: 1,
              failurePolicy: 'fail',
              matcher: '.*',
            },
          ],
        });
        const done = await until(t.id, (t) => t.status === 'needs_attention');
        assert.equal(done.attempts.filter((a) => a.phase === 'validator').length, 0);
        assert.equal(done.hookRuns?.[0].result?.decision, 'fail');
      },
      { hooks: true },
    ));
  test(`${provider}: supervisor, authorized repair and retry use the selected provider`, () =>
    fixture(
      async ({ root, submit, until }) => {
        const t = submit({ worker: provider, recovery: 'supervised', allowRepair: true });
        const done = await until(t.id, (t) => t.status === 'completed');
        assert.deepEqual(
          done.attempts.map((a) => a.phase),
          ['worker', 'supervisor', 'repair', 'worker', 'validator'],
        );
        assert.ok(existsSync(join(root, 'repaired')));
        const diagnosis = JSON.parse(
          readFileSync(join(root, `seen-${provider}-supervisor.json`), 'utf8'),
        );
        const tools =
          diagnosis.args[
            diagnosis.args.indexOf(provider === 'claude' ? '--tools' : '--available-tools') + 1
          ];
        assert.doesNotMatch(tools, /Bash|bash|edit|write|task/i);
        assert.equal(existsSync(join(root, 'seen-codex-supervisor.json')), false);
      },
      { recovery: true },
    ));
  test(`${provider}: native portable hooks connect and retain provider/tool evidence`, () =>
    fixture(
      async ({ root, submit, until }) => {
        const t = submit({
          worker: provider,
          hooks: [
            {
              id: 'observe',
              events: ['agent_pre_tool', 'agent_post_tool'],
              argv: [
                process.execPath,
                '-e',
                "console.log(JSON.stringify({decision:'continue',message:'fixture hook observed'}))",
              ],
              phases: ['worker'],
              timeoutSeconds: 3,
              intervalSeconds: 1,
              maxInvocations: 5,
              failurePolicy: 'fail',
              matcher: '.*',
            },
          ],
          goalContract: undefined,
        });
        const done = await until(t.id, (t) => t.status === 'completed');
        assert.ok(done.attempts[0].nativeHooksConnectedAt);
        assert.deepEqual(
          done.hookRuns?.map((r) => r.context.native?.provider),
          [provider, provider],
        );
        assert.equal(done.hookRuns?.[0].event, 'agent_pre_tool');
        assert.equal(existsSync(join(root, '.claude/settings.json')), false);
        assert.equal(existsSync(join(root, '.github/hooks')), false);
      },
      { hooks: true },
    ));
  test(`${provider}: zero exit with provider error cannot reach validation`, () =>
    fixture(
      async ({ root, submit, until }) => {
        const t = submit({ worker: provider });
        const done = await until(t.id, (t) => t.status === 'needs_attention');
        assert.match(done.attempts[0].failure!, /Provider|Claude result/);
        assert.equal(existsSync(join(root, 'validated')), false);
      },
      { error: true },
    ));
}
test('mixed provider roles remain independent and retain approved repair authority', () =>
  fixture(
    async ({ root, submit, until }) => {
      const t = submit({
        worker: 'copilot',
        supervisorProvider: 'claude',
        repairProvider: 'codex',
        recovery: 'supervised',
        allowRepair: true,
      });
      const done = await until(t.id, (t) => t.status === 'completed');
      assert.ok(existsSync(join(root, 'seen-claude-supervisor.json')));
      assert.ok(existsSync(join(root, 'seen-codex-repair.json')));
      assert.equal(taskPresentation(done).policy.supervisorProvider, 'claude');
    },
    { recovery: true },
  ));
test('malformed supervisor proposal cannot authorize repair or completion', () =>
  fixture(
    async ({ root, submit, until }) => {
      const t = submit({ recovery: 'supervised', allowRepair: true, maxSupervisorCalls: 1 });
      const done = await until(t.id, (t) => t.status === 'needs_attention');
      assert.equal(done.attempts.filter((a) => a.phase === 'repair').length, 0);
      assert.equal(existsSync(join(root, 'repaired')), false);
    },
    { recovery: true, malformed: true },
  ));
test('provider policy guards, legacy inheritance and compatibility diagnostics', () =>
  fixture(async ({ root, store }) => {
    const old = withDefaults({
      cwd: root,
      name: 'Legacy policy',
      worker: 'codex',
      objective: 'Check legacy policy',
    });
    assert.equal(providerFor(old, 'supervisor'), 'codex');
    for (const provider of ['copilot', 'claude'] as const) {
      assert.throws(() => withDefaults({ ...old, worker: provider }), /trustedLocalExecution/);
      const c = withDefaults({ ...old, worker: provider, trustedLocalExecution: true });
      assert.equal(providerFor(c, 'repair'), provider);
      assert.ok(setupDoctor(root, c).ready);
      store.update((s) => {
        s.daemon!.providerProtocol = undefined;
      });
      assert.throws(() => createTask(store, c), /upgraded multi-provider/);
      store.update((s) => {
        s.daemon!.providerProtocol = 1;
      });
    }
    const hook = {
      id: 'unsupported',
      events: ['agent_post_compact'],
      argv: ['node'],
      phases: ['worker'],
      timeoutSeconds: 2,
      intervalSeconds: 1,
      maxInvocations: 1,
      failurePolicy: 'continue',
      matcher: '.*',
    };
    assert.throws(
      () =>
        withDefaults({
          ...old,
          worker: 'copilot',
          trustedLocalExecution: true,
          hooks: [hook as any],
        }),
      /unavailable/,
    );
  }));
test('provider result parsing is strict, bounded and renders native messages/tools', () => {
  const p = new ProviderResult('copilot');
  p.feed(JSON.stringify({ type: 'assistant.message', data: { content: 'not JSON' } }));
  assert.throws(() => p.result());
  const output = [
    {
      type: 'tool.execution_start',
      data: { toolName: 'bash', toolCallId: 'x', arguments: { command: 'npm test' } },
    },
    { type: 'tool.execution_complete', data: { toolCallId: 'x', success: true } },
    { type: 'assistant.message', data: { content: 'Human readable Copilot\nSecond line' } },
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'y', name: 'Read', input: {} },
          { type: 'text', text: 'Human readable Claude' },
        ],
      },
    },
  ]
    .map((v) => JSON.stringify(v))
    .join('\n');
  const entries = attemptLogEntries(output);
  assert.ok(entries.some((e) => e.message === 'Finished: bash'));
  assert.ok(entries.some((e) => e.message === 'Human readable Copilot\nSecond line'));
  assert.ok(entries.some((e) => e.message === 'Human readable Claude'));
  assert.equal(providerHookConfig('copilot', { hooks: [] }).hooks.preToolUse, undefined);
});

test('Copilot automatic model routing does not receive unsupported reasoning effort', async () =>
  fixture(async ({ root, submit }) => {
    for (const model of ['', 'auto', 'explicit-test-model']) {
      const task = submit({ model });
      const attempt = { phase: 'worker', config: task.config, id: 'test-invocation' } as any;
      const invocation = agentInvocation(task, attempt, '', '', root);
      assert.equal(invocation.argv.includes('--reasoning-effort'), model === 'explicit-test-model');
      assert.ok(invocation.prompt.includes(JSON.stringify(task.config.goalContract!.stages)));
      assert.ok(
        invocation.prompt.includes(
          `exactly ${JSON.stringify(task.config.goalContract!.planSource)}`,
        ),
      );
      assert.doesNotMatch(invocation.prompt, /You choose the number of milestones/);
    }
  }));
