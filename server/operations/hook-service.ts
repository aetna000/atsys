import { spawn } from 'node:child_process';
import { suspended, taskElapsed } from './pause.js';
import { mergeProgress } from './progress.js';
import { runtimeArgs } from '../runtime.js';
import { OperationsStore, stamp, taskEvent, enqueue } from './store.js';
import { hookRunnerIdentity, killAttempt, killHookRun } from './processes.js';
import type { Attempt, HookRun, ManagedTask, OperationsState } from '../../shared/operations.js';
const inFlight = (r: HookRun) => r.status === 'queued' || r.status === 'running';
const executing = (a?: Attempt) => a && ['starting', 'running'].includes(a.status);
export class HookService {
  constructor(readonly store: OperationsStore) {}
  tick(owner: string) {
    const launches = this.store.update((s) => {
      if (s.daemon?.owner !== owner) return [] as { taskId: string; runId: string }[];
      for (const task of s.tasks) {
        if (suspended(task) && !task.stopRequested) continue;
        for (const run of task.hookRuns ?? []) {
          const attempt = task.attempts.find((a) => a.id === run.attemptId);
          const terminalCallback = ['on_task_complete', 'on_task_stop', 'on_escalation'].includes(
            run.event,
          );
          const obsolete =
            !terminalCallback &&
            (task.stopRequested ||
              taskElapsed(task) > task.config.taskTimeoutSeconds * 1000 ||
              ((run.event.startsWith('codex_') ||
                run.event === 'on_tick' ||
                run.event === 'before_run' ||
                run.event === 'before_validation') &&
                !executing(attempt)));
          if (inFlight(run) && obsolete && killHookRun(run)) {
            run.status = 'interrupted';
            run.error = 'Task stopped, expired or attempt ended before callback completed';
            run.endedAt = stamp();
            run.cleanupConfirmed = true;
          }
          if (run.status === 'running') {
            const age = Date.now() - Date.parse(run.startedAt!) - (run.pausedMs ?? 0);
            const identity = run.pid ? hookRunnerIdentity(run) : 'gone';
            if (
              age > (run.hook.timeoutSeconds + 3) * 1000 ||
              (age > 1000 && run.pid && identity === 'gone') ||
              (age > 10000 && !run.pid) ||
              Date.now() -
                Math.max(
                  Date.parse(run.heartbeatAt ?? run.startedAt!),
                  Date.parse(run.resumedAt ?? run.startedAt!),
                ) >
                15000
            ) {
              if (killHookRun(run)) {
                run.status = 'interrupted';
                run.error =
                  'Hook runner disappeared or exceeded its lease; delivery is not automatically replayed';
                run.endedAt = stamp();
                run.cleanupConfirmed = true;
              }
            }
          }
          if (inFlight(run) || run.applied) continue;
          if (!run.cleanupConfirmed) {
            if (!killHookRun(run)) continue;
            run.cleanupConfirmed = true;
          }
          this.apply(s, task, run, attempt);
        }
      }
      let count = s.tasks.reduce(
        (n, t) => n + (t.hookRuns ?? []).filter((r) => r.status === 'running').length,
        0,
      );
      const launches: { taskId: string; runId: string }[] = [];
      for (const task of s.tasks) {
        if (count >= 4) break;
        if (suspended(task)) continue;
        if (task.hookRuns?.some((r) => r.status === 'running')) continue;
        const next = task.hookRuns?.find((r) => r.status === 'queued');
        if (!next) continue;
        next.status = 'running';
        next.pauseProtocol = 1;
        next.startedAt = stamp();
        next.heartbeatAt = stamp();
        taskEvent(task, 'observer', 'hook.started', `${next.hook.id}: ${next.event} (${next.id})`);
        launches.push({ taskId: task.id, runId: next.id });
        count++;
      }
      return launches;
    });
    for (const launch of launches) {
      const child = spawn(
        process.execPath,
        runtimeArgs('hook-runner', this.store.directory, launch.taskId, launch.runId),
        { detached: true, stdio: 'ignore', env: process.env },
      );
      child.on('error', () => {});
      child.unref();
      this.store.update((s) => {
        const run = s.tasks
          .find((t) => t.id === launch.taskId)
          ?.hookRuns?.find((r) => r.id === launch.runId);
        if (run?.status === 'running' && !run.pid) run.pid = child.pid ?? null;
      });
    }
  }
  private apply(s: OperationsState, task: ManagedTask, run: HookRun, attempt?: Attempt) {
    run.applied = true;
    if (
      run.status === 'succeeded' &&
      run.result?.progress &&
      ['on_tick', 'codex_post_tool', 'codex_after_model_turn'].includes(run.event) &&
      executing(attempt) &&
      task.attempts.at(-1)?.id === attempt!.id
    ) {
      try {
        const p = mergeProgress(attempt!.progress, run.result.progress);
        const key = JSON.stringify([p.completed, p.total, p.checkpoint]);
        attempt!.hookProgressKeys ??= [];
        const old =
          attempt!.progress &&
          JSON.stringify([
            attempt!.progress.completed,
            attempt!.progress.total,
            attempt!.progress.checkpoint,
          ]);
        attempt!.progress = p;
        attempt!.progressReporter = { kind: 'hook', reference: run.hook.id };
        if (key !== old && !attempt!.hookProgressKeys.includes(key)) {
          attempt!.hookProgressKeys.push(key);
          attempt!.lastProgressAt = stamp();
          attempt!.progressPauseCreditMs = 0;
          taskEvent(
            task,
            'observer',
            'hook.progress',
            `${run.hook.id}: ${p.completed}/${p.total} reported units${p.checkpoint ? ` (${p.checkpoint})` : ''}`,
          );
        }
      } catch (error) {
        run.status = 'failed';
        run.error = error instanceof Error ? error.message : 'Invalid hook progress';
      }
    }

    const failed = run.status !== 'succeeded';
    taskEvent(
      task,
      'observer',
      failed ? 'hook.failed' : 'hook.succeeded',
      `${run.hook.id}: ${run.event}: ${run.error ?? run.result?.message ?? run.status}`,
    );
    if (failed)
      enqueue(
        s,
        task,
        'Incident',
        `Hook ${run.hook.id}: ${run.error ?? run.status}`,
        `${run.id}:failed`,
      );
    // Pre-run gates are handled by the watchdog; terminal callbacks are observations.
    if (
      (run.event !== 'on_tick' &&
        !(run.event.startsWith('codex_') && run.result?.decision === 'escalate')) ||
      !executing(attempt) ||
      task.attempts.at(-1)?.id !== attempt!.id
    )
      return;
    const decision = run.result?.decision;
    if (!(
      decision === 'fail' ||
      decision === 'escalate' ||
      (failed && run.hook.failurePolicy === 'fail')
    ))
      return;
    const cleaned = killAttempt(attempt!);
    attempt!.status = 'failed';
    attempt!.failure = `Hook ${run.hook.id}: ${run.error ?? run.result?.message ?? decision}`;
    attempt!.endedAt = stamp();
    attempt!.cleanupConfirmed = cleaned;
    taskEvent(task, 'observer', 'attempt.failed', attempt!.failure);
    if (decision === 'escalate') {
      task.status = 'needs_attention';
      task.attentionReason = attempt!.failure;
      taskEvent(task, 'policy', 'task.needs_attention', attempt!.failure);
      enqueue(s, task, 'Incident', attempt!.failure, `${run.id}:escalate`);
    }
  }
}
