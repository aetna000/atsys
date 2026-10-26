import { z } from 'zod';
import type { TaskConfig } from '../../shared/operations.js';
import { DomainError } from '../control-plane.js';
const text = z.string().trim().min(1).max(2000);
const list = z.array(text).max(30);
export const goalContractSchema = z
  .object({
    version: z.literal(1),
    successCriteria: list.min(1),
    deliverables: list.min(1),
    constraints: list,
    assumptions: list,
    unresolvedDecisions: list,
    stages: list.min(1),
    planSource: text,
    observers: z
      .array(
        z
          .object({
            signal: z.enum(['heartbeat', 'progress', 'activity', 'validator', 'hook']),
            rationale: text,
            cadenceSeconds: z.number().int().min(1).max(86400),
            hookId: z.string().max(120).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    recoveryScope: text,
    escalationConditions: list.min(1),
    budget: text,
  })
  .strict()
  .superRefine((g, ctx) => {
    if (new Set(g.stages).size !== g.stages.length)
      ctx.addIssue({ code: 'custom', message: 'Goal stages must be unique and ordered' });
  });
export type GoalContract = z.infer<typeof goalContractSchema>;
export function guardGoal(c: TaskConfig) {
  const g = c.goalContract;
  if (!g) return; // Existing local-operator contracts retain their original semantics.
  if (g.unresolvedDecisions.length)
    throw new DomainError(
      'Goal requires material clarification: ' + g.unresolvedDecisions.join('; '),
      400,
    );
  if (!c.plan.trim()) throw new DomainError('Goal contract requires an execution plan', 400);
  if (!g.observers.some((o) => o.signal === 'validator'))
    throw new DomainError('Goal plan must explain its declared validator', 400);
  for (const o of g.observers) {
    if (o.signal === 'progress' && !c.progressFile && !(c.worker !== 'command' && c.goalMonitoring))
      throw new DomainError('Progress observer requires a progress source', 400);
    if (o.signal === 'activity' && !c.activityTimeoutSeconds)
      throw new DomainError('Activity observer requires an inactivity window', 400);
    if (o.signal === 'hook' && !c.hooks.some((h) => h.id === o.hookId))
      throw new DomainError('Hook observer must reference a configured hook', 400);
  }
  for (const h of c.hooks)
    if (!g.observers.some((o) => o.signal === 'hook' && o.hookId === h.id))
      throw new DomainError('Every goal hook requires a documented observer rationale', 400);
}
export function contractProgress(
  c: TaskConfig,
  incoming: import('../../shared/operations.js').Progress,
) {
  const g = c.goalContract;
  if (!g) return incoming;
  if (
    incoming.total !== g.stages.length ||
    (incoming.milestones && JSON.stringify(incoming.milestones) !== JSON.stringify(g.stages)) ||
    (incoming.planSource && incoming.planSource !== g.planSource)
  )
    throw new Error('Progress must use the declared goal stages and plan source');
  return { ...incoming, milestones: g.stages, planSource: g.planSource };
}
