import type { ManagedTask } from '../../shared/operations.js';
import { OperationsStore, stamp, taskEvent } from './store.js';
import { signalAttempt, signalHookRun } from './processes.js';
export const suspended = (task: ManagedTask) => !!task.pauseState;
export function taskElapsed(task: ManagedTask, now = Date.now()) {
  const pending =
    task.pauseState && !task.pauseState.resumeRequestedAt
      ? now - Date.parse(task.pauseState.requestedAt)
      : 0;
  return now - Date.parse(task.createdAt) - (task.pausedMs ?? 0) - pending;
}
export function creditPause(task: ManagedTask) {
  const state = task.pauseState;
  if (!state || state.resumeRequestedAt) return;
  state.resumeRequestedAt = stamp();
  const duration = Math.max(0, Date.parse(state.resumeRequestedAt) - Date.parse(state.requestedAt));
  task.pausedMs = (task.pausedMs ?? 0) + duration;
  if (task.nextAttemptAt)
    task.nextAttemptAt = new Date(Date.parse(task.nextAttemptAt) + duration).toISOString();
  for (const attempt of task.attempts.filter((a) => ['starting', 'running'].includes(a.status))) {
    attempt.pausedMs = (attempt.pausedMs ?? 0) + duration;
    attempt.progressPauseCreditMs = (attempt.progressPauseCreditMs ?? 0) + duration;
    attempt.activityPauseCreditMs = (attempt.activityPauseCreditMs ?? 0) + duration;
    attempt.resumedAt = state.resumeRequestedAt;
  }
  for (const run of task.hookRuns?.filter((r) => r.status === 'running') ?? []) {
    run.pausedMs = (run.pausedMs ?? 0) + duration;
    run.resumedAt = state.resumeRequestedAt;
  }
}
export function reconcilePause(task: ManagedTask): boolean {
  if (!task.pauseState || task.stopRequested) return false;
  if (task.status === 'paused' || task.status === 'needs_attention') return true;
  const resume = task.status === 'resuming';
  const signal = resume ? 'SIGCONT' : 'SIGSTOP';
  const attempts = task.attempts.filter((a) => ['starting', 'running'].includes(a.status));
  const runs = task.hookRuns?.filter((r) => r.status === 'running') ?? [];
  // All identities are checked individually; never signal a foreign process.
  const results = [
    ...attempts.map((a) => signalAttempt(a, signal)),
    ...runs.map((r) => signalHookRun(r, signal)),
  ];
  if (results.some((ok) => !ok)) {
    task.status = 'needs_attention';
    task.attentionReason =
      'Pause/resume could not verify every process group. Some owned groups may be suspended; use Resume or Stop after inspecting ownership.';
    taskEvent(task, 'policy', 'pause.blocked', task.attentionReason);
    return true;
  }
  if (resume) {
    task.status = task.pauseState.previousStatus;
    task.pauseState = undefined;
    task.attentionReason = undefined;
    taskEvent(
      task,
      'policy',
      'task.resumed',
      'Owned local processes resumed; AtSys deadline clocks exclude the operator pause.',
    );
    return false;
  }
  task.status = 'paused';
  taskEvent(
    task,
    'policy',
    'task.paused',
    'Owned local process groups suspended. Remote requests and provider-internal deadlines may continue.',
  );
  return true;
}
export async function waitForResume(store: OperationsStore, id: string) {
  while (true) {
    const task = store.read().tasks.find((t) => t.id === id);
    if (!task || task.stopRequested) return false;
    if (!suspended(task)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
