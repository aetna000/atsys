import { z } from 'zod';
import type { Progress } from '../../shared/operations.js';
export const progressSchema = z
  .object({
    completed: z.number().nonnegative(),
    total: z.number().positive(),
    checkpoint: z.string().max(2000).optional(),
    milestones: z.array(z.string().trim().min(1).max(300)).min(1).max(100).optional(),
    planSource: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.completed > p.total) ctx.addIssue({ code: 'custom', message: 'Progress exceeds total' });
    if (
      p.milestones &&
      (p.total !== p.milestones.length ||
        !Number.isInteger(p.completed) ||
        new Set(p.milestones).size !== p.milestones.length ||
        !p.planSource)
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Named milestones require unique ordered names, matching total, an integer completed count and planSource',
      });
  });
export function mergeProgress(previous: Progress | undefined, incoming: Progress): Progress {
  const next = progressSchema.parse(incoming);
  if (previous && (next.completed < previous.completed || next.total !== previous.total))
    throw new Error('Progress cannot regress or change the total');
  if (previous?.milestones) {
    if (
      (next.milestones &&
        JSON.stringify(next.milestones) !== JSON.stringify(previous.milestones)) ||
      (next.planSource && next.planSource !== previous.planSource)
    )
      throw new Error('Milestone names and plan source cannot change within an attempt');
    return progressSchema.parse({
      ...next,
      milestones: previous.milestones,
      planSource: previous.planSource,
    });
  }
  return next;
}
