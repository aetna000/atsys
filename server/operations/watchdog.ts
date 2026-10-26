import { providerFor } from '../../shared/providers.js';
import { spawn } from 'node:child_process';
import { runtimeArgs } from '../runtime.js';
import type { Attempt, ManagedTask, OperationsState } from '../../shared/operations.js';
import { OperationsStore, enqueue, stamp, taskEvent, uid } from './store.js';
import { cleanupAttempt, inspectRunner, killAttempt } from './processes.js';
import { blockerParser } from './codex.js';
import { setupDoctor } from './doctor.js';
import { HookService } from './hook-service.js';
import { reconcilePause, taskElapsed } from './pause.js';
import { queueHooks, queueTickHooks } from './hooks.js';
export const active = (a: Attempt) => ['starting', 'running'].includes(a.status);
export function daemonHealthy(s: OperationsState) {
  return !!s.daemon && Date.now() - Date.parse(s.daemon.heartbeatAt) < 10000;
}
export class Watchdog {
  readonly owner = uid('daemon');
  constructor(readonly store: OperationsStore) {}
  claim() {
    return this.store.update((s) => {
      if (s.daemon?.owner !== this.owner && daemonHealthy(s)) return false;
      for (const t of s.tasks.filter((t) =>
        ['running', 'supervising', 'repairing', 'recovering', 'queued'].includes(t.status),
      )) {
        taskEvent(
          t,
          'observer',
          'watchdog.claimed',
          'Watchdog acquired durable ownership and will reconcile existing attempts.',
        );
      }
      s.daemon = {
        owner: this.owner,
        pid: process.pid,
        heartbeatAt: stamp(),
        startedAt: stamp(),
        providerProtocol: 1,
        hookProtocol: 1,
        pauseProtocol: 1,
      };
      return true;
    });
  }
  tick() {
    new HookService(this.store).tick(this.owner);
    const launches = this.store.update((s) => {
      if (s.daemon?.owner !== this.owner) return [] as { taskId: string; attemptId: string }[];
      s.daemon.heartbeatAt = stamp();
      s.daemon.providerProtocol = 1;
      s.daemon.hookProtocol = 1;
      s.daemon.pauseProtocol = 1;
      const launches: { taskId: string; attemptId: string }[] = [];
      for (const task of s.tasks) {
        if (reconcilePause(task)) continue;
        if (
          ['completed', 'stopped', 'needs_attention'].includes(task.status) &&
          !task.stopRequested
        )
          continue;
        const current = task.attempts.at(-1);
        const lifetimeExpired = taskElapsed(task) > task.config.taskTimeoutSeconds * 1000;
        if (task.stopRequested || lifetimeExpired) {
          if (current && !current.cleanupConfirmed) {
            if (!killAttempt(current)) {
              this.attention(
                s,
                task,
                'Cannot confirm process ownership for cleanup. Manual inspection required.',
              );
              continue;
            }
            current.cleanupConfirmed = true;
            if (active(current)) {
              current.status = 'stopped';
              current.endedAt = stamp();
            }
          }
          if (lifetimeExpired && !task.stopRequested)
            this.attention(s, task, 'Task lifetime exceeded. Automatic work stopped.');
          else if (task.status !== 'stopped') {
            task.status = 'stopped';
            task.pauseState = undefined;
            taskEvent(
              task,
              'policy',
              'task.stopped',
              'Stop completed; owned process group terminated.',
            );
          }
          task.stopRequested = false;
          continue;
        }
        if (
          current?.status === 'starting' &&
          !current.pid &&
          current.hookGateRunIds?.length &&
          !current.hookGatePassed
        ) {
          const gates = current.hookGateRunIds.map((id) => task.hookRuns?.find((r) => r.id === id));
          if (gates.some((r) => !r?.applied)) {
            current.heartbeatAt = stamp();
            continue;
          }
          const denied = gates.find(
            (r) =>
              r &&
              (r.result?.decision === 'escalate' ||
                r.result?.decision === 'fail' ||
                (r.status !== 'succeeded' && r.hook.failurePolicy === 'fail')),
          );
          if (denied) {
            current.status = 'failed';
            current.failure = `Before-run hook ${denied.hook.id}: ${denied.error ?? denied.result?.message ?? denied.result?.decision}`;
            current.endedAt = stamp();
            current.cleanupConfirmed = true;
            taskEvent(task, 'observer', 'attempt.failed', current.failure);
            if (denied.result?.decision === 'escalate') {
              this.attention(s, task, current.failure);
              continue;
            }
          } else {
            current.hookGatePassed = true;
            current.pausedMs = 0;
            current.progressPauseCreditMs = 0;
            current.activityPauseCreditMs = 0;
            current.resumedAt = undefined;
            current.startedAt = stamp();
            current.heartbeatAt = stamp();
            current.lastProgressAt = stamp();
            launches.push({ taskId: task.id, attemptId: current.id });
            continue;
          }
        }
        if (current && active(current)) {
          if (current.status === 'running') queueTickHooks(task, current);
          if (
            current.phase === 'worker' &&
            (!current.lastObservedAt ||
              Date.now() - Date.parse(current.lastObservedAt) >=
                (current.config.goalContract?.observers.find((o) => o.signal === 'progress')
                  ?.cadenceSeconds ?? 60) *
                  1000)
          ) {
            current.lastObservedAt = stamp();
            const age = Math.max(
              0,
              Math.floor((Date.now() - Date.parse(current.lastProgressAt)) / 1000),
            );
            taskEvent(
              task,
              'observer',
              'goal.checked',
              `Goal check: ${current.progress ? `${current.progress.completed}/${current.progress.total} worker-reported units` : 'no reported goal progress yet'}; last progress ${age}s ago. ` +
                `Progress stall window ${current.config.progressTimeoutSeconds ? current.config.progressTimeoutSeconds + 's' : 'disabled'}; ` +
                `output inactivity window ${current.config.activityTimeoutSeconds ? current.config.activityTimeoutSeconds + 's' : 'disabled'}. Heartbeat is liveness only; completion awaits independent validation.`,
            );
          }
          const stale =
            Date.now() -
              Math.max(
                Date.parse(current.heartbeatAt),
                Date.parse(current.resumedAt ?? current.heartbeatAt),
              ) >
            current.config.heartbeatTimeoutSeconds * 1000;
          const observation = current.pid ? inspectRunner(current) : undefined;
          const dead = observation?.identity === 'gone';
          const phaseTimeout =
            current.phase === 'worker'
              ? current.config.timeoutSeconds
              : current.phase === 'supervisor'
                ? current.config.supervisorTimeoutSeconds
                : current.phase === 'validator'
                  ? current.config.validationTimeoutSeconds
                  : current.config.repairTimeoutSeconds;
          const overdue =
            Date.now() - Date.parse(current.startedAt) - (current.pausedMs ?? 0) >
            (phaseTimeout + 3) * 1000;
          if (stale || dead || overdue || current.cleanupPendingAt) {
            if (!this.cleanup(s, task, current, observation)) continue;
            current.status = 'lost';
            current.endedAt = stamp();
            current.failure = dead
              ? 'Runner process disappeared'
              : overdue
                ? 'Attempt exceeded hard deadline'
                : stale
                  ? 'Runner heartbeat expired'
                  : 'Runner cleanup reconciliation required';
            taskEvent(task, 'observer', 'runner.lost', current.failure);
          } else continue;
        }
        if (current && !current.handled) {
          if (!current.cleanupConfirmed) {
            if (!this.cleanup(s, task, current)) continue;
          }
          current.handled = true;
          if (
            current.phase === 'worker' &&
            current.status === 'succeeded' &&
            current.config.validator === 'command'
          ) {
            this.launch(task, 'validator', launches, current.config);
            continue;
          }
          if (
            ['worker', 'validator'].includes(current.phase) &&
            current.status === 'succeeded' &&
            current.validation?.passed
          ) {
            task.status = 'completed';
            task.attentionReason = undefined;
            taskEvent(task, 'observer', 'task.completed', current.validation.detail);
            enqueue(s, task, 'Completed', current.validation.detail, `${current.id}:complete`);
            continue;
          }
          if (['worker', 'validator'].includes(current.phase)) {
            taskEvent(
              task,
              'observer',
              'incident.opened',
              current.failure ?? 'Workload failed validation',
            );
            enqueue(
              s,
              task,
              'Incident',
              current.failure ?? 'Workload failed validation',
              `${current.id}:incident`,
            );
            if (task.config.recovery === 'supervised') {
              if (
                task.attempts.filter((a) => a.phase === 'supervisor').length >=
                task.config.maxSupervisorCalls
              ) {
                this.attention(s, task, 'Supervisor invocation budget exhausted.');
                continue;
              }
              this.launch(task, 'supervisor', launches);
              continue;
            }
            if (task.config.recovery === 'restart')
              this.retry(s, task, current.failure ?? 'Workload failed');
            else this.attention(s, task, current.failure ?? 'Workload failed');
          } else if (current.phase === 'supervisor') {
            if (task.config.recovery !== 'supervised') {
              this.attention(
                s,
                task,
                'Recovery policy changed during diagnosis. Review the proposal before retrying.',
              );
              continue;
            }
            if (current.status !== 'succeeded' || !current.proposal) {
              this.attention(
                s,
                task,
                `Supervisor failed: ${current.failure ?? 'no valid proposal'}`,
              );
              continue;
            }
            const p = current.proposal;
            taskEvent(task, 'supervisor', 'proposal.received', `${p.action}: ${p.reason}`);
            if (p.action === 'restart') this.retry(s, task, p.reason);
            else if (
              p.action === 'repair' &&
              task.config.allowRepair &&
              this.retryAvailable(task)
            ) {
              taskEvent(
                task,
                'policy',
                'repair.authorized',
                'Configured policy permits one bounded workspace-write repair for this escalation.',
              );
              this.launch(task, 'repair', launches);
            } else if (p.action === 'escalate' && !blockerParser.safeParse(p.blocker).success) {
              taskEvent(
                task,
                'policy',
                'escalation.unsubstantiated',
                'Escalation lacks a concrete blocker with evidence, attempted remedies and required resolution. Requesting bounded diagnostic follow-up, not replaying the workload.',
              );
              if (
                task.attempts.filter((a) => a.phase === 'supervisor').length <
                task.config.maxSupervisorCalls
              )
                this.launch(task, 'supervisor', launches);
              else
                this.attention(
                  s,
                  task,
                  'Diagnostic budget exhausted without an evidence-backed blocker. ' + p.reason,
                );
            } else
              this.attention(
                s,
                task,
                p.action === 'repair'
                  ? 'Repair requested but permission or retry budget is unavailable. ' + p.reason
                  : `${p.reason}${p.blocker ? ` Blocker: ${p.blocker.kind}. Required: ${p.blocker.requiredResolution}. Evidence: ${p.blocker.evidence.join('; ')}. Remedies attempted: ${p.blocker.attemptedRemedies.join('; ')}` : ''}`,
              );
          } else {
            if (current.status === 'succeeded' && current.repairResult?.fixed)
              this.retry(s, task, current.repairResult.summary);
            else this.attention(s, task, current.failure ?? 'Repair did not resolve the failure');
          }
        }
        if (
          ['queued', 'recovering'].includes(task.status) &&
          Date.parse(task.nextAttemptAt) <= Date.now()
        ) {
          if (!this.retryAvailable(task)) {
            this.attention(s, task, 'Retry budget exhausted.');
            continue;
          }
          this.launch(task, 'worker', launches);
        }
      }
      return launches;
    });
    for (const launch of launches) {
      const child = spawn(
        process.execPath,
        runtimeArgs('attempt-runner', this.store.directory, launch.taskId, launch.attemptId),
        { detached: true, stdio: 'ignore', env: process.env },
      );
      child.on('error', () => {
        /* persisted starting lease expires and becomes an incident */
      });
      child.unref();
      this.store.update((s) => {
        const a = s.tasks
          .find((t) => t.id === launch.taskId)
          ?.attempts.find((a) => a.id === launch.attemptId);
        if (a && a.status === 'starting' && !a.pid) a.pid = child.pid ?? null;
      });
    }
    new HookService(this.store).tick(this.owner);
  }
  private retryAvailable(t: ManagedTask) {
    return t.attempts.filter((a) => a.phase === 'worker').length <= t.config.maxRetries;
  }
  private cleanup(
    s: OperationsState,
    task: ManagedTask,
    attempt: Attempt,
    initial?: ReturnType<typeof inspectRunner>,
  ) {
    const result = cleanupAttempt(attempt);
    attempt.cleanupDiagnostic =
      (initial ? `observed=${initial.identity}/${initial.detail}; cleanup=` : '') +
      result.diagnostic;
    if (!result.confirmed) {
      if (!attempt.cleanupPendingAt) {
        attempt.cleanupPendingAt = stamp();
        taskEvent(task, 'observer', 'cleanup.pending', attempt.cleanupDiagnostic);
      }
      // Match terminal cleanup's bounded reconciliation window. Pending cleanup
      // stays sticky even if the next process snapshot changes; no retry can run.
      if (Date.now() - Date.parse(attempt.cleanupPendingAt) >= 2000)
        this.attention(
          s,
          task,
          `Process group cleanup could not be confirmed: ${attempt.cleanupDiagnostic}`,
        );
      return false;
    }
    attempt.cleanupConfirmed = true;
    if (attempt.cleanupPendingAt)
      taskEvent(task, 'observer', 'cleanup.confirmed', attempt.cleanupDiagnostic);
    attempt.cleanupPendingAt = undefined;
    return true;
  }
  private retry(s: OperationsState, t: ManagedTask, reason: string) {
    if (!this.retryAvailable(t)) return this.attention(s, t, 'Retry budget exhausted. ' + reason);
    t.status = 'recovering';
    t.nextAttemptAt = new Date(Date.now() + t.config.backoffSeconds * 1000).toISOString();
    taskEvent(
      t,
      'policy',
      'retry.authorized',
      `Retry using configured ${t.config.worker !== 'command' ? `${t.config.worker} objective and approved recovery guidance` : t.config.resumeArgv.length ? 'checkpoint resume argv' : 'original command'}. ${reason}`,
    );
    enqueue(s, t, 'Recovery', `Retry scheduled: ${reason}`, `${t.attempts.at(-1)!.id}:retry`);
  }
  private attention(s: OperationsState, t: ManagedTask, reason: string) {
    if (t.status === 'needs_attention' && t.attentionReason === reason) return;
    t.status = 'needs_attention';
    t.attentionReason = reason;
    taskEvent(t, 'policy', 'task.needs_attention', reason);
    enqueue(
      s,
      t,
      'Incident',
      `Needs your attention: ${reason}`,
      `${t.id}:${t.attempts.length}:attention`,
    );
  }
  private launch(
    t: ManagedTask,
    phase: Attempt['phase'],
    launches: { taskId: string; attemptId: string }[],
    config = t.config,
  ) {
    const a: Attempt = {
      provider: providerFor(config, phase),
      pauseProtocol: 1,
      id: uid('attempt'),
      phase,
      status: 'starting',
      pid: null,
      startedAt: stamp(),
      heartbeatAt: stamp(),
      lastProgressAt: stamp(),
      output: '',
      ...(phase === 'worker'
        ? { progress: t.attempts.findLast((a) => a.phase === 'worker' && a.progress)?.progress }
        : {}),
      config: structuredClone(config),
      handled: false,
    };
    t.attempts.push(a);
    if (phase === 'worker') {
      const pilot = setupDoctor(config.cwd, config);
      taskEvent(t, 'observer', 'setup.checked', JSON.stringify(pilot));
      if (!pilot.ready) {
        a.status = 'failed';
        a.failure =
          'Setup doctor blocked execution: ' +
          pilot.checks
            .filter((c) => !c.passed)
            .map((c) => `${c.name}: ${c.detail}`)
            .join('; ');
        a.output = JSON.stringify(pilot);
        a.endedAt = stamp();
        a.cleanupConfirmed = true;
        t.status = 'running';
        return;
      }
    }
    t.status =
      phase === 'worker' || phase === 'validator'
        ? 'running'
        : phase === 'supervisor'
          ? 'supervising'
          : 'repairing';
    taskEvent(t, 'system', 'attempt.scheduled', `${phase} attempt durably scheduled.`);
    a.hookGateRunIds = queueHooks(t, 'before_run', a, `${a.id}:before_run`);
    if (phase === 'validator')
      a.hookGateRunIds.push(...queueHooks(t, 'before_validation', a, `${a.id}:before_validation`));
    if (!a.hookGateRunIds.length) launches.push({ taskId: t.id, attemptId: a.id });
  }
}
