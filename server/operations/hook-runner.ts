import { spawn } from 'node:child_process';
import { OperationsStore, stamp } from './store.js';
import { hookResultSchema } from './hooks.js';
import { redact } from '../control-plane.js';
import type { HookResult } from '../../shared/operations.js';
const [directory, taskId, runId] = process.argv.slice(2);
const store = new OperationsStore(directory);
const initial = store.update((s) => {
  const task = s.tasks.find((t) => t.id === taskId);
  const run = task?.hookRuns?.find((r) => r.id === runId);
  if (!run || run.status !== 'running' || (run.pid && run.pid !== process.pid)) return null;
  run.pid = process.pid;
  run.heartbeatAt = stamp();
  return { run, cwd: run.context.task.cwd };
});
if (!initial) {
  store.close();
  process.exit(0);
}
const { run, cwd } = initial;
let stdout = '',
  stderr = '',
  done = false;
const child = spawn(run.hook.argv[0], run.hook.argv.slice(1), {
  cwd,
  shell: false,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    ATSYS_DATA_DIR: directory,
    ATSYS_TASK_ID: taskId,
    ATSYS_ATTEMPT_ID: run.attemptId ?? '',
    ATSYS_HOOK_EVENT: run.event,
    ATSYS_HOOK_INVOCATION_ID: run.id,
  },
});
function finish(status: 'succeeded' | 'failed' | 'timed_out', error?: string) {
  if (done) return;
  done = true;
  clearTimeout(deadline);
  clearInterval(heartbeat);
  let result: HookResult | undefined;
  if (status === 'succeeded') {
    try {
      result = hookResultSchema.parse(JSON.parse(stdout.trim() || '{}'));
    } catch {
      status = 'failed';
      error = 'Hook must return one valid atsys-hook-v1 result JSON object on stdout';
    }
  }
  store.update((s) => {
    const current = s.tasks.find((t) => t.id === taskId)?.hookRuns?.find((r) => r.id === runId);
    if (!current || current.status !== 'running' || current.pid !== process.pid) return;
    current.status = status;
    current.endedAt = stamp();
    current.heartbeatAt = stamp();
    current.error = error && redact(error);
    current.stderr = redact(stderr).slice(-8000);
    current.result = result && JSON.parse(redact(JSON.stringify(result)));
  });
  store.close();
  process.exit(0);
}
// The watchdog kills the entire detached group after the receipt is persisted.
const deadline = setTimeout(() => {
  child.kill('SIGKILL');
  finish('timed_out', 'Hook deadline exceeded');
}, run.hook.timeoutSeconds * 1000);
const heartbeat = setInterval(() => {
  try {
    let owned = false;
    store.update((s) => {
      const current = s.tasks.find((t) => t.id === taskId)?.hookRuns?.find((r) => r.id === runId);
      if (current?.status === 'running' && current.pid === process.pid) {
        current.heartbeatAt = stamp();
        owned = true;
      }
    });
    if (!owned) {
      child.kill('SIGKILL');
      process.exit(0);
    }
  } catch {
    child.kill('SIGKILL');
    process.exit(1);
  }
}, 1000);
child.stdin.on('error', () => {});
child.stdin.end(JSON.stringify(run.context));
child.stdout.on('data', (b) => {
  stdout += b.toString();
  if (Buffer.byteLength(stdout) > 32000) {
    child.kill('SIGKILL');
    finish('failed', 'Hook stdout exceeded 32 KB');
  }
});
child.stderr.on('data', (b) => {
  stderr = (stderr + b.toString()).slice(-16000);
});
child.on('error', (e) =>
  finish(
    'failed',
    `Cannot start hook executable: ${(e as NodeJS.ErrnoException).code ?? 'spawn error'}`,
  ),
);
child.on('close', (code, signal) =>
  finish(
    code === 0 ? 'succeeded' : 'failed',
    code === 0 ? undefined : `Hook exited ${code ?? signal ?? 'unknown'}`,
  ),
);
