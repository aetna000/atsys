import type { ManagedTask } from '../../shared/operations.js';
import { formatTaskStatus } from '../../shared/task-presentation.js';
import { OperationsStore } from './store.js';
import { DomainError } from '../control-plane.js';

export function selectTask(tasks: ManagedTask[], id?: string) {
  if (!id) {
    const task = tasks[0];
    if (!task) throw new DomainError('No managed tasks yet. Create a task first.', 404);
    return task;
  }
  const exact = tasks.find((t) => t.id === id);
  if (exact) return exact;
  const matches = tasks.filter((t) => t.id === id || t.id.startsWith(id));
  if (matches.length !== 1)
    throw new DomainError(
      matches.length ? 'Task ID is ambiguous; use more characters.' : 'Task not found.',
      404,
    );
  return matches[0];
}

export async function watchTask(
  store: OperationsStore,
  id: string | undefined,
  options: { interval: number; once: boolean; dashboard: string },
) {
  if (!Number.isInteger(options.interval) || options.interval < 1 || options.interval > 60)
    throw new DomainError('Watch interval must be an integer from 1 to 60 seconds.', 400);
  const tty = !!process.stdout.isTTY && !options.once;
  let stopped = false;
  let wake: (() => void) | undefined;
  let lastSignal = '';
  let lastFrame = '';
  const stop = () => {
    stopped = true;
    wake?.();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  if (tty) process.stdout.write('\u001b[?1049h\u001b[?25l');
  try {
    while (!stopped) {
      const task = selectTask(store.read().tasks, id);
      const worker = task.attempts.findLast((a) => a.phase === 'worker');
      const signal = JSON.stringify([
        task.status,
        task.revision,
        task.events[0]?.id,
        worker?.progress,
      ]);
      lastFrame = formatTaskStatus(
        task,
        process.stdout.columns || 88,
        Date.now(),
        options.dashboard,
        process.stdout.rows || Infinity,
      );
      if (tty)
        process.stdout.write(
          '\u001b[H\u001b[2J' +
            lastFrame +
            '\n\nCtrl+C closes this monitor only. The task keeps its own supervision.\n',
        );
      else if (signal !== lastSignal) console.log(lastFrame + '\n');
      lastSignal = signal;
      if (options.once || ['completed', 'stopped', 'needs_attention'].includes(task.status)) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          wake = undefined;
          resolve();
        }, options.interval * 1000);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    if (tty) process.stdout.write('\u001b[?25h\u001b[?1049l' + lastFrame + '\n');
  }
}
