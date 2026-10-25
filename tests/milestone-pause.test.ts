import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OperationsStore } from '../server/operations/store.js';
import { Watchdog } from '../server/operations/watchdog.js';
import { withDefaults } from '../server/operations/config.js';
import { createTask, changeTask } from '../server/operations/tasks.js';
import { killAttempt, killHookRun } from '../server/operations/processes.js';
import { mergeProgress, progressSchema } from '../server/operations/progress.js';
import { taskPresentation } from '../shared/task-presentation.js';
import type { ManagedTask, TaskConfig } from '../shared/operations.js';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const names = [
  'Inspect requirements',
  'Inspect code',
  'Plan changes',
  'Implement changes',
  'Add checks',
  'Run checks',
  'Review changes',
  'Prepare handoff',
];
async function fixture(
  fn: (f: {
    root: string;
    store: OperationsStore;
    submit: (config: Partial<TaskConfig>) => ManagedTask;
    until: (id: string, check: (task: ManagedTask) => boolean) => Promise<ManagedTask>;
    takeover: () => void;
  }) => Promise<void>,
) {
  const root = mkdtempSync(join(tmpdir(), 'atsys-milestones-'));
  const store = new OperationsStore(join(root, 'state'));
  let watchdog = new Watchdog(store);
  watchdog.claim();
  const submit = (config: Partial<TaskConfig>) =>
    createTask(
      store,
      withDefaults({
        name: 'Named milestones',
        objective: 'Verify real progress and owned process controls',
        cwd: root,
        worker: 'command',
        argv: [process.execPath, '-e', 'process.exit(0)'],
        validator: 'command',
        validationArgv: [process.execPath, '-e', 'process.exit(0)'],
        recovery: 'notify',
        timeoutSeconds: 10,
        ...config,
      }),
    );
  const until = async (id: string, check: (task: ManagedTask) => boolean) => {
    for (let i = 0; i < 250; i++) {
      watchdog.tick();
      const task = store.read().tasks.find((t) => t.id === id)!;
      if (check(task)) return task;
      await sleep(60);
    }
    throw Error(
      'Scenario timed out ' + JSON.stringify(store.read().tasks.find((t) => t.id === id)),
    );
  };
  try {
    await fn({
      root,
      store,
      submit,
      until,
      takeover: () => {
        store.update((s) => {
          s.daemon!.heartbeatAt = new Date(0).toISOString();
        });
        watchdog = new Watchdog(store);
        assert.ok(watchdog.claim());
      },
    });
  } finally {
    for (const t of store.read().tasks) {
      for (const a of t.attempts) killAttempt(a);
      for (const r of t.hookRuns ?? []) killHookRun(r);
    }
    await sleep(100);
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
}
test('named progress plans have fixed names/source and matching totals; legacy counts remain valid', () => {
  const p = {
    completed: 2,
    total: 8,
    milestones: names,
    planSource: 'Worker decomposition of objective and plan',
  };
  assert.ok(progressSchema.safeParse(p).success);
  assert.ok(!progressSchema.safeParse({ ...p, total: 9 }).success);
  assert.ok(!progressSchema.safeParse({ ...p, completed: 2.5 }).success);
  assert.ok(!progressSchema.safeParse({ ...p, planSource: undefined }).success);
  assert.throws(
    () => mergeProgress(p, { ...p, milestones: [...names.slice(0, 7), 'Move goalposts'] }),
    /cannot change/,
  );
  assert.throws(() => mergeProgress(p, { ...p, planSource: 'New source' }), /cannot change/);
  assert.deepEqual(mergeProgress(p, { completed: 3, total: 8 }).milestones, names);
  assert.deepEqual(mergeProgress(undefined, { completed: 2, total: 8 }), {
    completed: 2,
    total: 8,
  });
});
test('eight named milestones and provenance survive persistence; 8/8 cannot bypass a failing validator', async () =>
  fixture(async ({ root, submit, until, store }) => {
    const report = {
      completed: 8,
      total: 8,
      checkpoint: 'Work reported complete',
      milestones: names,
      planSource: 'Worker-authored decomposition of the declared objective',
    };
    const t = submit({
      progressFile: 'progress.json',
      argv: [
        process.execPath,
        '-e',
        `require('fs').writeFileSync('progress.json',JSON.stringify(${JSON.stringify(report)}))`,
      ],
      validationArgv: [process.execPath, '-e', 'process.exit(9)'],
    });
    const done = await until(t.id, (t) => t.status === 'needs_attention');
    assert.equal(done.attempts[0].progress?.milestones?.length, 8);
    assert.deepEqual(done.attempts[0].progressReporter, {
      kind: 'progress-file',
      reference: 'progress.json',
    });
    assert.equal(done.attempts.at(-1)?.validation?.passed, undefined);
    assert.equal(done.attempts.at(-1)?.status, 'failed');
    assert.equal(taskPresentation(done).milestones.length, 8);
    assert.match(taskPresentation(done).acceptance, /required/);
    assert.deepEqual(store.read().tasks[0].attempts[0].progress?.milestones, names);
    assert.ok(existsSync(join(root, 'progress.json')));
  }));
test('local pause freezes owned work, survives watchdog takeover and excludes paused time from deadlines', async () =>
  fixture(async ({ root, submit, until, store, takeover }) => {
    const t = submit({
      timeoutSeconds: 2,
      taskTimeoutSeconds: 3,
      progressTimeoutSeconds: 1,
      progressFile: 'progress.json',
      argv: [
        process.execPath,
        '-e',
        `const fs=require('fs');let n=0;setInterval(()=>{fs.writeFileSync('count',String(++n));fs.writeFileSync('progress.json',JSON.stringify({completed:n,total:6,checkpoint:'step-'+n}));if(n===6)process.exit(0)},200)`,
      ],
    });
    const running = await until(
      t.id,
      (t) => t.attempts[0]?.status === 'running' && existsSync(join(root, 'count')),
    );
    const pid = running.attempts[0].pid;
    changeTask(store, t.id, 'pause');
    assert.equal(store.read().tasks[0].status, 'pausing');
    await until(t.id, (t) => t.status === 'paused');
    const frozen = readFileSync(join(root, 'count'), 'utf8');
    await sleep(2500);
    takeover();
    await until(t.id, (t) => t.status === 'paused');
    assert.equal(readFileSync(join(root, 'count'), 'utf8'), frozen);
    changeTask(store, t.id, 'resume');
    const done = await until(t.id, (t) => t.status === 'completed');
    assert.equal(done.attempts[0].pid, pid);
    assert.equal(done.attempts.filter((a) => a.phase === 'worker').length, 1);
    assert.ok(done.pausedMs! >= 2400);
    assert.equal(done.pauseState, undefined);
  }));
test('stop kills a paused task without resuming its workload or scheduling recovery', async () =>
  fixture(async ({ root, store, submit, until }) => {
    const t = submit({
      argv: [
        process.execPath,
        '-e',
        `const fs=require('fs');let n=0;setInterval(()=>fs.writeFileSync('count',String(++n)),100)`,
      ],
    });
    await until(
      t.id,
      (t) => t.attempts[0]?.status === 'running' && existsSync(join(root, 'count')),
    );
    changeTask(store, t.id, 'pause');
    await until(t.id, (t) => t.status === 'paused');
    const count = readFileSync(join(root, 'count'), 'utf8');
    changeTask(store, t.id, 'stop');
    const stopped = await until(t.id, (t) => t.status === 'stopped');
    await sleep(300);
    assert.equal(readFileSync(join(root, 'count'), 'utf8'), count);
    assert.equal(stopped.pauseState, undefined);
    assert.ok(stopped.attempts[0].cleanupConfirmed);
    assert.equal(stopped.attempts.length, 1);
  }));
test('an active before-run callback can pause and resume without consuming its deadline', async () =>
  fixture(async ({ root, store, submit, until }) => {
    const t = submit({
      hooks: [
        {
          id: 'gate',
          events: ['before_run'],
          phases: ['worker'],
          argv: [
            process.execPath,
            '-e',
            `require('fs').writeFileSync('gate-started','yes');setTimeout(()=>console.log('{}'),700)`,
          ],
          timeoutSeconds: 1,
          intervalSeconds: 1,
          maxInvocations: 10,
          failurePolicy: 'fail',
          matcher: '.*',
        },
      ],
    });
    await until(t.id, (t) => !!t.hookRuns?.[0].pid && existsSync(join(root, 'gate-started')));
    changeTask(store, t.id, 'pause');
    await until(t.id, (t) => t.status === 'paused');
    await sleep(1600);
    changeTask(store, t.id, 'resume');
    const done = await until(t.id, (t) => t.status === 'completed');
    assert.equal(done.hookRuns?.[0].status, 'succeeded');
  }));
test('queued pause dispatches no worker and legacy runners cannot be mislabeled paused', async () =>
  fixture(async ({ store, submit, until }) => {
    const t = submit({});
    changeTask(store, t.id, 'pause');
    const paused = await until(t.id, (t) => t.status === 'paused');
    assert.equal(paused.attempts.length, 0);
    changeTask(store, t.id, 'resume');
    await until(t.id, (t) => t.status === 'completed');
    const t2 = submit({ argv: [process.execPath, '-e', 'setInterval(()=>{},1000)'] });
    await until(t2.id, (t) => !!t.attempts[0]?.pid);
    store.update((s) => {
      delete s.tasks.find((t) => t.id === t2.id)!.attempts[0].pauseProtocol;
    });
    assert.throws(() => changeTask(store, t2.id, 'pause'), /predates local pause/);
  }));
