import type { ManagedTask } from '../../shared/operations.js';
import { DomainError } from '../control-plane.js';
import { validateConfig } from './config.js';
import { OperationsStore, stamp, taskEvent, uid } from './store.js';
export function createTask(store: OperationsStore, input: unknown) {
  const config = validateConfig(input);
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
  action: 'stop' | 'retry' | 'configure',
  input?: unknown,
  revision?: number,
) {
  const config = action === 'configure' ? validateConfig(input) : undefined;
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
    } else if (action === 'stop') {
      if (['completed', 'stopped'].includes(t.status)) return t;
      t.stopRequested = true;
      taskEvent(
        t,
        'policy',
        'stop.requested',
        'Operator requested stop. Watchdog will confirm process cleanup.',
      );
    } else {
      if (
        !['needs_attention', 'stopped'].includes(t.status) ||
        t.attempts.some((a) => ['starting', 'running'].includes(a.status))
      )
        throw new DomainError(
          'Retry requires a stopped or needs-attention task with no active attempt.',
        );
      if (Date.now() - Date.parse(t.createdAt) >= t.config.taskTimeoutSeconds * 1000)
        throw new DomainError(
          'Task lifetime expired. Increase the task lifetime or create a new task.',
        );
      if (t.attempts.filter((a) => a.phase === 'worker').length > t.config.maxRetries)
        throw new DomainError(
          'Retry budget exhausted. Increase the retry limit explicitly before retrying.',
        );
      t.stopRequested = false;
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
