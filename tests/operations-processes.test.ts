import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Attempt } from '../shared/operations.js';
import {
  cleanupAttempt,
  runnerIdentity,
  killAttempt,
  processAlive,
} from '../server/operations/processes.js';
import { OperationsStore, stamp } from '../server/operations/store.js';
import { Watchdog } from '../server/operations/watchdog.js';
import { createTask } from '../server/operations/tasks.js';
import { withDefaults } from '../server/operations/config.js';

// Script only OS observations/signals for an impossible fixture PID. Real-process
// takeover is exercised in operations.test.ts; this makes the narrow exit race
// repeatable without a timing guess, host ps permissions or signals to real PIDs.
function cleanupFixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'atsys-cleanup-'));
  const store = new OperationsStore(join(root, 'data'));
  const watchdog = new Watchdog(store);
  watchdog.claim();
  const task = createTask(
    store,
    withDefaults({
      name: 'Cleanup reconciliation',
      objective: 'Never replay before cleanup',
      cwd: root,
      argv: [process.execPath, '-e', 'process.exit(0)'],
      recovery: 'restart',
      maxRetries: 1,
      backoffSeconds: 60,
    }),
  );
  const attempt: Attempt = {
    id: 'fixture-attempt',
    phase: 'worker',
    status: 'running',
    pid: 2_000_000_000,
    startedAt: stamp(),
    heartbeatAt: stamp(),
    lastProgressAt: stamp(),
    config: task.config,
    handled: false,
    output: '',
  };
  store.update((s) => {
    s.tasks[0].status = 'running';
    s.tasks[0].attempts.push(attempt);
  });
  let present = true;
  let snapshot = `S node attempt-runner.ts ${attempt.id}`;
  let snapshots: string[] = [];
  let inspectError = '';
  let signalError = '';
  const signals: (number | NodeJS.Signals | undefined)[] = [];
  const originalKill = process.kill.bind(process);
  t.mock.method(process, 'kill', (pid: number, signal?: number | NodeJS.Signals) => {
    if (Math.abs(pid) !== attempt.pid) return originalKill(pid, signal);
    if (signal === 0) {
      if (!present) throw Object.assign(new Error('absent'), { code: 'ESRCH' });
      return true;
    }
    signals.push(signal);
    if (signalError)
      throw Object.assign(new Error('sensitive signal error'), { code: signalError });
    return true;
  });
  t.mock.method(childProcess, 'execFileSync', () => {
    if (inspectError)
      throw Object.assign(new Error('sensitive command line'), { code: inspectError });
    return snapshots.shift() ?? snapshot;
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    store,
    watchdog,
    attempt,
    signals,
    snapshot(value: string) {
      snapshot = value;
    },
    snapshotSequence(...values: string[]) {
      snapshots = values;
    },
    inspectionFailure(value: string) {
      inspectError = value;
    },
    signalFailure(value: string) {
      signalError = value;
    },
    gone() {
      present = false;
    },
  };
}

test('active cleanup reconciles gone then uncertain identity without signaling from the old observation', (t) => {
  const f = cleanupFixture(t);
  f.snapshotSequence('Z <defunct>');
  f.snapshot('E');
  f.watchdog.tick();
  let task = f.store.read().tasks[0];
  assert.equal(task.status, 'running');
  assert.equal(task.attempts.length, 1);
  assert.equal(task.attempts[0].handled, false);
  assert.ok(task.attempts[0].cleanupPendingAt);
  assert.match(
    task.events.find((e) => e.type === 'cleanup.pending')!.message,
    /observed=gone\/zombie; cleanup=unknown\/exiting-or-empty-command; signal-refused/,
  );
  assert.deepEqual(f.signals, []);
  // A fresh foreign observation must still be refused, even with pending cleanup.
  f.snapshot('S unrelated live process');
  f.watchdog.tick();
  assert.deepEqual(f.signals, []);
  assert.equal(f.store.read().tasks[0].attempts.length, 1);
  f.gone();
  f.watchdog.tick();
  task = f.store.read().tasks[0];
  assert.equal(task.status, 'recovering');
  assert.equal(task.attempts[0].status, 'lost');
  assert.equal(task.attempts[0].cleanupConfirmed, true);
  assert.equal(task.attempts[0].cleanupPendingAt, undefined);
  assert.ok(task.events.some((e) => e.type === 'cleanup.confirmed'));
  assert.deepEqual(f.signals, ['SIGKILL']);
  assert.equal(task.attempts.length, 1, 'backoff still applies after confirmed cleanup');
});

test('uncertain inspection is bounded and redacted; unrelated live identity is never signaled', (t) => {
  const f = cleanupFixture(t);
  f.store.update((s) => {
    s.tasks[0].attempts[0].heartbeatAt = new Date(0).toISOString();
  });
  f.inspectionFailure('EPERM');
  f.watchdog.tick();
  let task = f.store.read().tasks[0];
  assert.equal(task.status, 'running');
  assert.match(
    task.attempts[0].cleanupDiagnostic!,
    /unknown\/inspection-error:EPERM; signal-refused/,
  );
  assert.doesNotMatch(JSON.stringify(task), /sensitive command line/);
  assert.deepEqual(f.signals, []);
  // The original two-second deadline is retained across observations/takeover.
  f.store.update((s) => {
    s.tasks[0].attempts[0].cleanupPendingAt = new Date(Date.now() - 2100).toISOString();
    s.daemon!.heartbeatAt = new Date(0).toISOString();
  });
  const next = new Watchdog(f.store);
  assert.equal(next.claim(), true);
  f.inspectionFailure('');
  f.snapshot('S unrelated live process');
  next.tick();
  task = f.store.read().tasks[0];
  assert.equal(task.status, 'needs_attention');
  assert.match(task.attentionReason!, /foreign\/runner-mismatch; signal-refused/);
  assert.equal(task.attempts[0].cleanupConfirmed, undefined);
  assert.equal(task.attempts[0].handled, false);
  assert.equal(task.attempts.length, 1);
  assert.deepEqual(f.signals, []);
  assert.equal(task.reports?.at(-1)?.workflowAccepted, false);
});

test('verified ownership with signal failure is distinct from identity uncertainty', (t) => {
  const f = cleanupFixture(t);
  f.signalFailure('EPERM');
  const result = cleanupAttempt(f.attempt);
  assert.equal(result.confirmed, false);
  assert.equal(result.diagnostic, 'owned/runner-match; signal-error:EPERM');
  assert.doesNotMatch(JSON.stringify(result), /sensitive/);
  assert.deepEqual(f.signals, ['SIGKILL']);
  f.signalFailure('ESRCH');
  assert.equal(cleanupAttempt(f.attempt).confirmed, true, 'absent group is already clean');
});

test('exited zombie runners are gone while live unrelated processes stay protected', async () => {
  // Hold an exited child unreaped so the OS race is deterministic, not a timed guess.
  const parent = spawn(
    'python3',
    [
      '-u',
      '-c',
      `import os, sys
pid = os.fork()
if pid == 0:
    os._exit(0)
print(pid, flush=True)
try:
    sys.stdin.read()
finally:
    os.waitpid(pid, 0)
`,
    ],
    { detached: true, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const closed = once(parent, 'close');
  try {
    const [output] = await once(parent.stdout, 'data');
    const pid = Number(String(output).trim());
    assert.ok(Number.isInteger(pid) && pid > 0);
    let state = '';
    for (let i = 0; i < 100; i++) {
      state = execFileSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' }).trim();
      if (state.startsWith('Z')) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(state.startsWith('Z'), `Expected unreaped zombie, got ${state}`);
    assert.equal(processAlive(pid), true, 'kill(pid, 0) still sees the zombie');
    assert.equal(runnerIdentity({ pid, id: 'completed-attempt' } as Attempt), 'gone');
    assert.equal(killAttempt({ pid, id: 'completed-attempt' } as Attempt), true);
    const foreign = { pid: parent.pid!, id: 'unrelated-attempt' } as Attempt;
    assert.equal(runnerIdentity(foreign), 'foreign');
    assert.equal(killAttempt(foreign), false);
    assert.equal(processAlive(parent.pid!), true);
  } finally {
    parent.stdin.end();
    await closed;
  }
});
