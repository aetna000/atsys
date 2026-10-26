import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  mkdirSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { OperationsStore } from '../server/operations/store.js';
import { Watchdog } from '../server/operations/watchdog.js';
import { createTask, changeTask, generateRetrospectiveReport } from '../server/operations/tasks.js';
import { withDefaults } from '../server/operations/config.js';
import { captureOutcome, verifyReport } from '../server/operations/reports.js';
import { killAttempt } from '../server/operations/processes.js';
import type { ManagedTask, TaskConfig } from '../shared/operations.js';
import type { GoalContract } from '../server/operations/goal.js';
const goal: GoalContract = {
  version: 1,
  successCriteria: ['Create output and independently check content'],
  deliverables: ['result.txt', 'durable AtSys report'],
  constraints: ['Local commands only'],
  assumptions: ['Two items are enough to test partial domain results'],
  unresolvedDecisions: [],
  stages: ['Prepare output', 'Verify output'],
  planSource: 'Fixture acceptance plan',
  observers: [
    {
      signal: 'validator',
      cadenceSeconds: 1,
      rationale: 'Independent content check after worker exit',
    },
  ],
  recoveryScope: 'Repeat only this idempotent local fixture',
  escalationConditions: ['Retry budget exhausted'],
  budget: 'One retry; no external API; costs unknown',
};
const outcome = {
  version: 1,
  summary: 'Two processed; one domain failure; token=private-value',
  results: [
    { name: 'item A', status: 'passed', detail: 'checked', evidence: ['result.txt'] },
    { name: 'item B', status: 'failed', detail: 'semantic check failed', evidence: [] },
  ],
  limitations: ['Unknown external costs'],
  metrics: [
    { name: 'processed', value: 2, unit: 'items' },
    { name: 'unmeasured', value: null, unit: 'items' },
  ],
  costs: [
    {
      amount: null,
      currency: 'USD',
      source: 'Fixture has no provider receipts',
      kind: 'reported',
      evidence: [],
    },
  ],
};
async function fixture(
  fn: (f: {
    root: string;
    store: OperationsStore;
    watchdog: Watchdog;
    submit: (c?: Partial<TaskConfig>) => ManagedTask;
    until: (id: string, pred: (t: ManagedTask) => boolean) => Promise<ManagedTask>;
  }) => Promise<void>,
) {
  const root = mkdtempSync(join(tmpdir(), 'atsys-goal-workflow-'));
  const store = new OperationsStore(join(root, 'data'));
  const watchdog = new Watchdog(store);
  watchdog.claim();
  const submit = (c: Partial<TaskConfig> = {}) =>
    createTask(
      store,
      withDefaults({
        name: 'Goal workflow fixture',
        objective: 'Produce output, preserve partial domain failures, validate and report',
        cwd: root,
        plan: 'Write output; independently verify it; deliver a durable report.',
        goalContract: goal,
        recovery: 'notify',
        maxRetries: 1,
        backoffSeconds: 0,
        timeoutSeconds: 15,
        argv: [process.execPath, '-e', `require('fs').writeFileSync('result.txt','ok')`],
        validator: 'command',
        validationArgv: [
          process.execPath,
          '-e',
          `process.exit(require('fs').readFileSync('result.txt','utf8')==='ok'?0:1)`,
        ],
        requiredArtifacts: ['result.txt'],
        ...c,
      }),
    );
  const until = async (id: string, pred: (t: ManagedTask) => boolean) => {
    const start = Date.now();
    while (Date.now() - start < 20000) {
      watchdog.tick();
      const task = store.read().tasks.find((t) => t.id === id)!;
      if (pred(task)) return task;
      await new Promise((r) => setTimeout(r, 80));
    }
    throw new Error(
      'Goal workflow timed out: ' + JSON.stringify(store.read().tasks.find((t) => t.id === id)),
    );
  };
  try {
    await fn({ root, store, watchdog, submit, until });
  } finally {
    for (const t of store.read().tasks)
      for (const a of t.attempts) if (!a.cleanupConfirmed) killAttempt(a);
    await new Promise((r) => setTimeout(r, 100));
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
}
test('goal workflow intake gates material ambiguity and missing observer/hook rationale; legacy stays compatible', async () =>
  fixture(async ({ root }) => {
    const c = {
      name: 'Qualified goal',
      objective: 'Create a verified artifact',
      cwd: root,
      argv: [process.execPath],
      plan: 'Create and validate output',
      goalContract: goal,
    };
    assert.doesNotThrow(() => withDefaults(c));
    const template = JSON.parse(
      execFileSync(
        'python3',
        ['-m', 'atsys', 'task', 'template', '--objective', 'Clarify the goal', '--project', root],
        { encoding: 'utf8', env: { ...process.env, PYTHONPATH: resolve('python') } },
      ),
    );
    assert.equal(template.goalContract.version, 1);
    assert.throws(() => withDefaults(template));
    assert.throws(
      () =>
        withDefaults({
          ...c,
          goalContract: {
            ...goal,
            unresolvedDecisions: ['Which destructive target is authorized?'],
          },
        }),
      /clarification/,
    );
    assert.throws(() => withDefaults({ ...c, plan: '' }), /execution plan/);
    assert.throws(
      () =>
        withDefaults({
          ...c,
          goalContract: {
            ...goal,
            observers: [{ signal: 'progress', cadenceSeconds: 5, rationale: 'Need real units' }],
          },
        }),
      /validator/,
    );
    assert.throws(
      () =>
        withDefaults({
          ...c,
          goalContract: {
            ...goal,
            observers: [
              ...goal.observers,
              {
                signal: 'hook',
                hookId: 'missing',
                cadenceSeconds: 5,
                rationale: 'Check readiness',
              },
            ],
          },
        }),
      /configured hook/,
    );
    assert.doesNotThrow(() => withDefaults({ ...c, goalContract: undefined }));
  }));
test('goal workflow real execution produces durable idempotent redacted report with partial domain failure and validator provenance', async () =>
  fixture(async ({ submit, until, store }) => {
    const t = submit({
      outcomeFile: 'outcome.json',
      outcomeRequired: true,
      argv: [
        process.execPath,
        '-e',
        `const fs=require('fs');fs.writeFileSync('result.txt','ok');fs.writeFileSync('outcome.json',${JSON.stringify(JSON.stringify(outcome))})`,
      ],
    });
    const done = await until(t.id, (t) => t.status === 'completed');
    assert.equal(done.attempts.length, 2);
    assert.equal(done.attempts[1].phase, 'validator');
    const report = done.reports!.at(-1)!;
    assert.equal(report.workflowAccepted, true);
    assert.equal(report.outcome!.data.results[1].status, 'failed');
    assert.equal(report.outcome!.provenance, 'worker-reported');
    assert.equal(report.outcome!.linkedValidatorAttemptId, done.attempts[1].id);
    assert.match(report.markdown, /Costs: unknown/);
    assert.match(report.markdown, /unmeasured = unknown/);
    assert.match(report.markdown, /Cost \(worker-reported\): unknown USD/);
    assert.ok(!JSON.stringify(report).includes('private-value'));
    assert.equal(report.digest.length, 64);
    verifyReport(store.directory, report);
    const receipt = JSON.stringify(done.attempts);
    assert.equal((generateRetrospectiveReport(store, t.id) as typeof report).id, report.id);
    assert.equal(store.read().tasks[0].reports!.length, 1);
    assert.equal(JSON.stringify(store.read().tasks[0].attempts), receipt);
    const reopened = new OperationsStore(store.directory);
    assert.equal(reopened.read().tasks[0].reports![0].id, report.id);
    reopened.close();
    const cli = execFileSync(
      process.execPath,
      ['--import', 'tsx', resolve('server/cli.ts'), 'task', 'report', t.id, '--json'],
      { encoding: 'utf8', env: { ...process.env, ATSYS_DATA_DIR: store.directory } },
    );
    assert.equal(JSON.parse(cli).digest, report.digest);
    assert.match(readFileSync(join(store.directory, report.path), 'utf8'), /item B/);
    writeFileSync(join(store.directory, report.path), '{}');
    assert.throws(() => verifyReport(store.directory, report), /verification/);
  }));
test('goal workflow validator failure, missing required outcome and terminal report-write failure cannot claim accepted', async () =>
  fixture(async ({ root, submit, until, store }) => {
    const failed = submit({ validationArgv: [process.execPath, '-e', 'process.exit(7)'] });
    const f = await until(failed.id, (t) => t.status === 'needs_attention');
    assert.equal(f.reports![0].workflowAccepted, false);
    assert.match(f.reports![0].markdown, /code 7/);
    const missing = submit({ outcomeFile: 'absent.json', outcomeRequired: true });
    const m = await until(missing.id, (t) => t.status === 'needs_attention');
    assert.equal(m.reports![0].workflowAccepted, false);
    assert.equal(m.attempts.at(-1)!.validation?.passed, false);
    rmSync(join(root, 'data/reports'), { recursive: true });
    writeFileSync(join(root, 'data/reports'), 'prevent report directory creation');
    store.update((state) => {
      state.telegram.enabled = true;
      state.telegram.hasToken = true;
      state.telegram.chatId = 'fixture-only-no-delivery';
    });
    const storage = submit();
    const s = await until(storage.id, (t) => !!t.reportError);
    assert.equal(s.status, 'needs_attention');
    assert.match(s.reportError!, /completion is not established/);
    assert.ok(!s.reports?.length);
    const withheld = store
      .read()
      .deliveries.find((d) => d.taskId === s.id && d.key.endsWith(':complete'));
    assert.equal(withheld?.status, 'failed');
    assert.match(withheld!.error!, /withheld/);
  }));
test('goal workflow bounded recovery preserves attempts and progress; stopped and blocked tasks get reports', async () =>
  fixture(async ({ root, store, submit, until }) => {
    const retry = submit({
      recovery: 'restart',
      progressFile: 'progress.json',
      argv: [
        process.execPath,
        '-e',
        `const fs=require('fs');if(!fs.existsSync('checkpoint')){fs.writeFileSync('checkpoint','1');fs.writeFileSync('progress.json',JSON.stringify({completed:1,total:2,checkpoint:'Output prepared'}));process.exit(9)}fs.writeFileSync('result.txt','ok');fs.writeFileSync('progress.json',JSON.stringify({completed:2,total:2,checkpoint:'Output verified'}))`,
      ],
    });
    const r = await until(retry.id, (t) => t.status === 'completed');
    assert.equal(r.attempts.filter((a) => a.phase === 'worker').length, 2);
    assert.equal(r.attempts[1].progress?.completed, 2);
    assert.deepEqual(r.attempts[1].progress?.milestones, goal.stages);
    assert.match(r.reports![0].markdown, /code 9/);
    const stop = submit({ argv: [process.execPath, '-e', 'setInterval(()=>{},1000)'] });
    await until(stop.id, (t) => t.attempts[0]?.status === 'running');
    changeTask(store, stop.id, 'stop');
    const stopped = await until(stop.id, (t) => t.status === 'stopped');
    assert.equal(stopped.reports!.at(-1)!.workflowAccepted, false);
    assert.match(stopped.reports!.at(-1)!.markdown, /Stopped by operator/);
    const blocked = submit({ argv: ['atsys-fixture-missing-executable'] });
    const b = await until(blocked.id, (t) => t.status === 'needs_attention');
    assert.match(b.reports![0].markdown, /Setup doctor blocked/);
    // Explicit legacy attachment uses existing receipts, never a rerun/config rewrite.
    store.update((s) => {
      const t = s.tasks.find((t) => t.id === retry.id)!;
      t.reports = [];
    });
    writeFileSync(join(root, 'legacy-outcome.json'), JSON.stringify(outcome));
    const before = store.read().tasks.find((t) => t.id === retry.id)!;
    const backfill = generateRetrospectiveReport(store, retry.id, 'legacy-outcome.json');
    assert.ok(!('error' in backfill));
    if ('error' in backfill) return;
    assert.equal(backfill.retrospective, true);
    assert.equal(backfill.outcome!.linkedValidatorAttemptId, undefined);
    const after = store.read().tasks.find((t) => t.id === retry.id)!;
    assert.deepEqual(after.config, before.config);
    assert.deepEqual(after.attempts, before.attempts);
    assert.deepEqual(after.events, before.events);
  }));
test('goal workflow rejects unbounded/escaping outcome and detects changed required content at terminal reporting', async () =>
  fixture(async ({ root, store, submit, until }) => {
    const config = withDefaults({
      name: 'Read evidence',
      objective: 'Read bounded outcome',
      cwd: root,
      argv: [process.execPath],
    });
    writeFileSync(join(root, 'oversized.json'), 'x'.repeat(64001));
    assert.throws(() => captureOutcome(config, 'oversized.json'), /64000/);
    symlinkSync('/etc/hosts', join(root, 'outside.json'));
    assert.throws(() => captureOutcome(config, 'outside.json'), /outside/);
    assert.throws(() => captureOutcome(config, '.env'), /private/);
    writeFileSync(join(root, 'malformed.json'), JSON.stringify({ ...outcome, arbitrary: 'no' }));
    assert.throws(() => captureOutcome(config, 'malformed.json'));
    const t = submit({
      outcomeFile: 'outcome.json',
      outcomeRequired: true,
      argv: [
        process.execPath,
        '-e',
        `const fs=require('fs');fs.writeFileSync('result.txt','ok');fs.writeFileSync('outcome.json',${JSON.stringify(JSON.stringify(outcome))})`,
      ],
    });
    // Stop ticking between validator exit and watchdog acceptance to simulate tampering.
    await until(t.id, (t) => t.attempts.at(-1)?.phase === 'validator');
    let validationPolls = 0;
    while (
      ++validationPolls < 200 &&
      store
        .read()
        .tasks.find((x) => x.id === t.id)!
        .attempts.at(-1)!.status !== 'succeeded'
    )
      await new Promise((r) => setTimeout(r, 50));
    assert.equal(
      store
        .read()
        .tasks.find((x) => x.id === t.id)!
        .attempts.at(-1)!.status,
      'succeeded',
    );
    writeFileSync(
      join(root, 'outcome.json'),
      JSON.stringify({ ...outcome, summary: 'Changed after validator' }),
    );
    const tampered = await until(t.id, (t) => !!t.reportError);
    assert.equal(tampered.status, 'needs_attention');
    assert.ok(!tampered.reports?.some((r) => r.workflowAccepted));
  }));

test('goal workflow authorized separate repair is reported with real command validation', async () =>
  fixture(async ({ root, store, submit, until }) => {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    const executable = join(bin, 'codex');
    writeFileSync(
      executable,
      `#!${process.execPath}\nconst fs=require('fs');const args=process.argv.slice(2);process.stdin.resume();process.stdin.on('end',()=>{const out=args[args.indexOf('--output-last-message')+1];if(args[args.indexOf('--sandbox')+1]==='read-only'){fs.writeFileSync(out,JSON.stringify({action:'repair',reason:'Local marker absent',instructions:'Create result.txt marker',blocker:null}))}else{fs.writeFileSync('result.txt','ok');fs.writeFileSync(out,JSON.stringify({fixed:true,summary:'Created required local marker'}))}});`,
    );
    chmodSync(executable, 0o700);
    const oldPath = process.env.PATH;
    process.env.PATH = bin + ':' + oldPath;
    try {
      const task = submit({
        recovery: 'supervised',
        allowRepair: true,
        maxSupervisorCalls: 1,
        argv: [process.execPath, '-e', `process.exit(require('fs').existsSync('result.txt')?0:3)`],
      });
      const done = await until(task.id, (t) => t.status === 'completed');
      assert.deepEqual(
        done.attempts.map((a) => a.phase),
        ['worker', 'supervisor', 'repair', 'worker', 'validator'],
      );
      assert.ok(done.events.some((e) => e.type === 'repair.authorized'));
      const report = done.reports!.at(-1)!;
      assert.match(report.markdown, /Created required local marker/);
      assert.equal(report.workflowAccepted, true);
      verifyReport(store.directory, report);
    } finally {
      process.env.PATH = oldPath;
    }
  }));
