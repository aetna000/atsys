import { providerFor } from '../../shared/providers.js';
import { persistReport, terminal } from './reports.js';
import type { ManagedTask, TaskConfig } from '../../shared/operations.js';
import { DomainError } from '../control-plane.js';
import { creditPause, taskElapsed } from './pause.js';
import { validateConfig } from './config.js';
import { OperationsStore, stamp, taskEvent, uid } from './store.js';
export function requireHookSupport(store: OperationsStore, config: TaskConfig) {
  const agent = ['worker', 'supervisor', 'repair'].some((phase) => {
    const p = providerFor(config, phase as 'worker' | 'supervisor' | 'repair');
    return p && p !== 'codex';
  });
  const owner = store.read().daemon;
  const modern =
    agent ||
    config.supervisorProvider ||
    config.repairProvider ||
    config.repairModel ||
    config.repairEffort ||
    config.hooks.some((h) => h.events.some((e) => e.startsWith('agent_')));
  if (modern && owner && owner.providerProtocol !== 1)
    throw new DomainError(
      'This task requires an upgraded multi-provider watchdog. Restart the watchdog from this runtime; existing work is preserved.',
      409,
    );
  if (
    config.capacityFallbackModels?.length &&
    (!owner || owner.capacityProtocol !== 1 || Date.now() - Date.parse(owner.heartbeatAt) >= 10000)
  )
    throw new DomainError(
      'Capacity fallback requires a healthy upgraded watchdog. Restart an owned, idle watchdog using this runtime.',
      409,
    );
  if (!config.hooks.length) return;
  const daemon = store.read().daemon;
  if (!daemon || Date.now() - Date.parse(daemon.heartbeatAt) >= 10000 || daemon.hookProtocol !== 1)
    throw new DomainError(
      'Lifecycle hooks require a healthy upgraded watchdog. Restart the AtSys watchdog with this runtime before submitting or changing hook tasks.',
      409,
    );
}
export function createTask(store: OperationsStore, input: unknown) {
  const config = validateConfig(input);
  requireHookSupport(store, config);
  return store.update((s) => {
    const task: ManagedTask = {
      id: uid('task'),
      config,
      revision: 1,
      status: 'queued',
      createdAt: stamp(),
      updatedAt: stamp(),
      nextAttemptAt: stamp(),
      stopRequested: false,
      attempts: [],
      events: [],
    };
    if (config.worker !== 'command' && config.goalMonitoring && !config.progressFile) {
      config.progressFile = `.atsys/progress/${task.id}.json`;
      config.progressTimeoutSeconds ||= 600;
    }
    taskEvent(
      task,
      'system',
      'task.created',
      'Task accepted into durable queue. Awaiting watchdog claim.',
    );
    s.tasks.unshift(task);
    return task;
  });
}
export function changeTask(
  store: OperationsStore,
  id: string,
  action: 'stop' | 'retry' | 'configure' | 'pause' | 'resume',
  input?: unknown,
  revision?: number,
) {
  const config = action === 'configure' ? validateConfig(input) : undefined;
  if (config) requireHookSupport(store, config);
  if (action === 'retry') {
    const task = store.read().tasks.find((t) => t.id === id);
    if (task) requireHookSupport(store, task.config);
  }
  return store.update((s) => {
    const t = s.tasks.find((t) => t.id === id);
    if (!t) throw new DomainError('Task not found', 404);
    if (action === 'configure') {
      if (revision !== t.revision)
        throw new DomainError('Configuration changed. Reload before saving.');
      t.config = config!;
      t.revision++;
      taskEvent(
        t,
        'policy',
        'config.updated',
        'Configuration saved. Active attempts retain their snapshot; task lifetime and next attempts use the new policy.',
      );
    } else if (action === 'pause') {
      if (t.pauseState) return t;
      if (['completed', 'stopped', 'needs_attention'].includes(t.status))
        throw new DomainError('Only an executing or queued task can be paused', 409);
      const daemon = s.daemon;
      if (
        !daemon ||
        daemon.pauseProtocol !== 1 ||
        Date.now() - Date.parse(daemon.heartbeatAt) >= 10000
      )
        throw new DomainError(
          'Pause requires a healthy upgraded watchdog. Restart the watchdog with this runtime.',
          409,
        );
      if (
        t.attempts.some(
          (a) => ['starting', 'running'].includes(a.status) && a.pauseProtocol !== 1,
        ) ||
        t.hookRuns?.some((r) => r.status === 'running' && r.pauseProtocol !== 1)
      )
        throw new DomainError(
          'An active runner predates local pause support. Wait for it to finish, or stop and retry using the upgraded runtime.',
          409,
        );
      t.pauseState = { requestedAt: stamp(), previousStatus: t.status };
      t.status = 'pausing';
      taskEvent(
        t,
        'policy',
        'pause.requested',
        'Operator requested local process pause; awaiting watchdog confirmation.',
      );
    } else if (action === 'resume') {
      if (!t.pauseState) return t;
      if (s.daemon?.pauseProtocol !== 1 || Date.now() - Date.parse(s.daemon.heartbeatAt) >= 10000)
        throw new DomainError('Resume requires a healthy upgraded watchdog.', 409);
      if (taskElapsed(t) >= t.config.taskTimeoutSeconds * 1000)
        throw new DomainError(
          'Task lifetime expired. Stop it or increase the authorized lifetime before resuming.',
          409,
        );
      if (t.status === 'resuming') return t;
      creditPause(t);
      t.status = 'resuming';
      taskEvent(
        t,
        'policy',
        'resume.requested',
        'Operator requested resume of owned local process groups.',
      );
    } else if (action === 'stop') {
      if (['completed', 'stopped'].includes(t.status)) return t;
      creditPause(t);
      t.stopRequested = true;
      taskEvent(
        t,
        'policy',
        'stop.requested',
        'Operator requested stop. Watchdog will confirm process cleanup.',
      );
    } else {
      if (t.pauseState)
        throw new DomainError('Resume or stop the paused task before retrying', 409);
      if (
        !['needs_attention', 'stopped'].includes(t.status) ||
        t.attempts.some((a) => ['starting', 'running'].includes(a.status))
      )
        throw new DomainError(
          'Retry requires a stopped or needs-attention task with no active attempt.',
        );
      if (taskElapsed(t) >= t.config.taskTimeoutSeconds * 1000)
        throw new DomainError(
          'Task lifetime expired. Increase the task lifetime or create a new task.',
        );
      if (t.attempts.filter((a) => a.phase === 'worker').length > t.config.maxRetries)
        throw new DomainError(
          'Retry budget exhausted. Increase the retry limit explicitly before retrying.',
        );
      t.stopRequested = false;
      // Operator retry is a new worker authorization, not an instruction to replay
      // the watchdog's handling of a previously interrupted terminal attempt.
      for (const a of t.attempts) {
        if (!a.cleanupConfirmed)
          throw new DomainError('Retry requires confirmed cleanup of previous attempts.');
        a.handled = true;
      }
      t.status = 'queued';
      t.nextAttemptAt = stamp();
      t.attentionReason = undefined;
      taskEvent(
        t,
        'policy',
        'retry.authorized',
        'Operator authorized another attempt within the configured budget.',
      );
    }
    return t;
  });
}

// Explicit attachment only; no daemon launch, config edit or receipt rewrite.
export function generateRetrospectiveReport(
  store: OperationsStore,
  id: string,
  outcomeFile?: string,
) {
  return store.update((s) => {
    const task = s.tasks.find((t) => t.id === id);
    if (!task) throw new DomainError('Task not found', 404);
    if (!terminal(task))
      throw new DomainError('Retrospective reports require a terminal task', 409);
    try {
      return persistReport(store.directory, task, true, outcomeFile);
    } catch {
      task.reportError =
        'Retrospective report generation or verification failed; original receipts are unchanged.';
      return { error: task.reportError };
    }
  });
}
