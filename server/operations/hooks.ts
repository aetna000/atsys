import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  hookEvents,
  type Attempt,
  type HookEvent,
  type HookRun,
  type ManagedTask,
} from '../../shared/operations.js';
import { redact } from '../control-plane.js';

export const hookSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    events: z.array(z.enum(hookEvents)).min(1).max(hookEvents.length),
    argv: z
      .array(
        z
          .string()
          .min(1)
          .max(8000)
          .refine((v) => !v.includes('\0')),
      )
      .min(1)
      .max(100),
    phases: z
      .array(z.enum(['worker', 'supervisor', 'repair', 'validator']))
      .max(4)
      .default([]),
    timeoutSeconds: z.number().int().min(1).max(300).default(30),
    intervalSeconds: z.number().int().min(1).max(86400).default(30),
    maxInvocations: z.number().int().min(1).max(10000).default(1000),
    failurePolicy: z.enum(['fail', 'continue']).default('fail'),
    matcher: z
      .string()
      .max(200)
      .refine((v) => {
        try {
          new RegExp(v);
          return true;
        } catch {
          return false;
        }
      }, 'Invalid hook matcher regex')
      .default('.*'),
  })
  .strict();
export const hookResultSchema = z
  .object({
    message: z.string().max(4000).optional(),
    decision: z.enum(['continue', 'fail', 'escalate']).optional(),
    progress: z
      .object({
        completed: z.number().nonnegative(),
        total: z.number().positive(),
        checkpoint: z.string().max(2000).optional(),
      })
      .strict()
      .refine((p) => p.completed <= p.total)
      .optional(),
  })
  .strict();
export function queueHooks(
  task: ManagedTask,
  event: HookEvent,
  attempt?: Attempt,
  trigger = event as string,
  native?: HookRun['context']['native'],
): string[] {
  const hooks = (attempt?.config ?? task.config).hooks ?? [];
  task.hookRuns ??= [];
  task.hookCounts ??= {};
  const digestKey = (key: string) => createHash('sha256').update(`${task.id}:${key}`).digest('hex');
  task.hookDeliveryKeys ??= task.hookRuns.map((r) => digestKey(r.key));
  const ids: string[] = [];
  for (const hook of hooks) {
    if (
      !hook.events.includes(event) ||
      (attempt && hook.phases.length && !hook.phases.includes(attempt.phase))
    )
      continue;
    const key = `${hook.id}:${trigger}`;
    const existing = task.hookRuns.find((r) => r.key === key);
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const count = task.hookCounts[hook.id] ?? 0;
    if (
      event === 'on_tick' &&
      (count >= hook.maxInvocations ||
        task.hookRuns.some(
          (r) => r.hook.id === hook.id && ['queued', 'running'].includes(r.status),
        ))
    )
      continue;
    const deliveryKey = digestKey(key);
    const replay = task.hookDeliveryKeys.includes(deliveryKey);
    const id = `hook-${deliveryKey.slice(0, 32)}`;
    const now = new Date().toISOString();
    const context: HookRun['context'] = {
      protocol: 'atsys-hook-v1',
      invocationId: id,
      event,
      occurredAt: now,
      task: {
        id: task.id,
        name: task.config.name,
        objective: task.config.objective,
        cwd: task.config.cwd,
        status: task.status,
        revision: task.revision,
      },
      attempt: attempt
        ? {
            id: attempt.id,
            phase: attempt.phase,
            status: attempt.status,
            startedAt: attempt.startedAt,
            heartbeatAt: attempt.heartbeatAt,
            lastProgressAt: attempt.lastProgressAt,
            progress: attempt.progress,
            failure: attempt.failure,
            output: attempt.output.slice(-8000),
          }
        : null,
      ...(native ? { native } : {}),
    };
    const run: HookRun = {
      id,
      key,
      event,
      hook: structuredClone(hook),
      attemptId: attempt?.id,
      context: JSON.parse(redact(JSON.stringify(context))),
      createdAt: now,
      pid: null,
      status: replay || count >= hook.maxInvocations ? 'failed' : 'queued',
    };
    if (run.status === 'failed') {
      run.error = replay
        ? 'Hook delivery already recorded outside retained history; refusing replay'
        : 'Hook invocation budget exhausted';
      run.endedAt = now;
    } else {
      task.hookCounts[hook.id] = count + 1;
      task.hookDeliveryKeys.push(deliveryKey);
    }
    task.hookRuns.push(run);
    // Keep pending/unapplied receipts and gate dependencies, prune only old settled history.
    while (task.hookRuns.length > 200) {
      const index = task.hookRuns.findIndex(
        (r) =>
          r.applied &&
          r.cleanupConfirmed &&
          !task.attempts.some((a) => a.status === 'starting' && a.hookGateRunIds?.includes(r.id)),
      );
      if (index < 0) break;
      task.hookRuns.splice(index, 1);
    }
    ids.push(id);
  }
  return ids;
}
export function queueLifecycleHooks(task: ManagedTask, type: string, trigger: string) {
  if (type.startsWith('hook.')) return;
  const attempt = task.attempts.at(-1);
  const mapping: Record<string, HookEvent> = {
    'attempt.succeeded': 'after_run',
    'attempt.failed': 'on_run_error',
    'runner.lost': 'on_run_error',
    'retry.authorized': 'on_recovery',
    'repair.authorized': 'on_recovery',
    'task.completed': 'on_task_complete',
    'task.stopped': 'on_task_stop',
    'task.needs_attention': 'on_escalation',
  };
  if (mapping[type]) queueHooks(task, mapping[type], attempt, trigger);
  if (
    attempt?.phase === 'validator' &&
    ['attempt.succeeded', 'attempt.failed', 'runner.lost'].includes(type)
  )
    queueHooks(task, 'after_validation', attempt, `${trigger}:validation`);
}
export function queueTickHooks(task: ManagedTask, attempt: Attempt) {
  task.hookTickAt ??= {};
  for (const hook of attempt.config.hooks ?? []) {
    if (!hook.events.includes('on_tick')) continue;
    const key = `${attempt.id}:${hook.id}`;
    const now = Date.now();
    if (now - Date.parse(task.hookTickAt[key] ?? attempt.startedAt) < hook.intervalSeconds * 1000)
      continue;
    // queueHooks selects all tick definitions; filter by passing a temporary snapshot.
    const snapshot = { ...attempt, config: { ...attempt.config, hooks: [hook] } };
    queueHooks(task, 'on_tick', snapshot, `${key}:${now}`);
    task.hookTickAt[key] = new Date(now).toISOString();
  }
}
