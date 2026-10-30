import { z } from 'zod';
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, resolve, relative, sep } from 'node:path';
import { taskDefaults, type TaskConfig } from '../../shared/operations.js';
import { DomainError } from '../control-plane.js';
import { goalContractSchema, guardGoal } from './goal.js';
import { hookSchema } from './hooks.js';
import { agentProviders, providerFor, providerCapabilities } from '../../shared/providers.js';
const effort = z.enum(['low', 'medium', 'high', 'xhigh']);
const arg = z
  .string()
  .max(8000)
  .refine((v) => !v.includes('\0'), 'NUL bytes are not allowed');
export const configSchema = z
  .object({
    goalContract: goalContractSchema.optional(),
    outcomeFile: z.string().max(1000).optional(),
    outcomeRequired: z.boolean().optional(),
    name: z.string().trim().min(1).max(120),
    objective: z.string().trim().min(3).max(6000),
    cwd: z.string().min(1).max(2000),
    worker: z.enum(['command', ...agentProviders]),
    supervisorProvider: z.enum(agentProviders).optional(),
    repairProvider: z.enum(agentProviders).optional(),
    repairModel: z.string().max(100).optional(),
    repairEffort: effort.optional(),
    trustedLocalExecution: z.boolean().optional(),
    argv: z.array(arg).max(100),
    resumeArgv: z.array(arg).max(100),
    model: z.string().max(100),
    capacityFallbackModels: z.array(z.string().trim().min(1).max(100)).max(5).optional(),
    reasoningEffort: effort,
    validator: z.enum(['exit-code', 'command', 'benchmark-json']),
    validationArgv: z.array(arg).max(100),
    validationTimeoutSeconds: z.number().int().min(1).max(86400),
    requiredArtifacts: z.array(z.string().min(1).max(1000)).max(30),
    activityTimeoutSeconds: z.number().int().min(0).max(86400),
    plan: z.string().max(12000),
    artifact: z.string().max(1000),
    progressFile: z.string().max(1000),
    timeoutSeconds: z.number().int().min(1).max(604800),
    taskTimeoutSeconds: z.number().int().min(1).max(2592000),
    heartbeatTimeoutSeconds: z.number().int().min(5).max(300),
    progressTimeoutSeconds: z.number().int().min(0).max(86400),
    recovery: z.enum(['notify', 'restart', 'supervised']),
    maxRetries: z.number().int().min(0).max(10),
    backoffSeconds: z.number().int().min(0).max(3600),
    supervisorModel: z.string().max(100),
    supervisorEffort: effort,
    supervisorTimeoutSeconds: z.number().int().min(5).max(3600),
    maxSupervisorCalls: z.number().int().min(0).max(10),
    allowRepair: z.boolean(),
    repairTimeoutSeconds: z.number().int().min(5).max(7200),
    networkAccess: z.boolean().default(false),
    goalMonitoring: z.boolean().default(true),
    hooks: z.array(hookSchema).max(16).default([]),
  })
  .strict();
export function inside(root: string, path: string) {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
export function validateConfig(input: unknown): TaskConfig {
  const c = configSchema.parse(input);
  for (const phase of ['worker', 'supervisor', 'repair'] as const) {
    if (phase !== 'worker' && c.recovery !== 'supervised') continue;
    if (phase === 'repair' && !c.allowRepair) continue;
    const provider = providerFor(c, phase);
    if (provider && provider !== 'codex' && phase !== 'supervisor' && !c.trustedLocalExecution)
      throw new DomainError(
        `${provider} ${phase} requires trustedLocalExecution=true: native CLI shell tools execute as your local user, without Codex sandbox guarantees.`,
        400,
      );
    if (!provider) continue;
    for (const hook of c.hooks.filter((h) => !h.phases.length || h.phases.includes(phase))) {
      for (const event of hook.events) {
        if (event.startsWith('codex_') && provider !== 'codex')
          throw new DomainError(
            `Hook ${hook.id}: use portable agent_* events for ${provider ?? 'command'} ${phase}`,
            400,
          );
        if (
          event.startsWith('agent_') &&
          (!provider ||
            !providerCapabilities
              .find((p) => p.id === provider)!
              .nativeEvents.some((supported) => supported === event))
        )
          throw new DomainError(
            `Hook ${hook.id}: ${event} is unavailable for ${provider ?? 'command'} ${phase}`,
            400,
          );
        if (
          provider === 'copilot' &&
          hook.failurePolicy === 'fail' &&
          ['agent_before_model_turn', 'agent_session_start', 'agent_pre_compact'].includes(event)
        )
          throw new DomainError(
            `Copilot ${event} is observation-only; choose failurePolicy=continue or a lifecycle gate`,
            400,
          );
      }
    }
  }
  if (new Set(c.hooks.map((h) => h.id)).size !== c.hooks.length)
    throw new DomainError('Hook IDs must be unique within a task', 400);
  try {
    c.cwd = realpathSync(c.cwd);
    if (!statSync(c.cwd).isDirectory()) throw new Error();
  } catch {
    throw new DomainError('Working directory must be an existing local directory', 400);
  }
  if (c.capacityFallbackModels?.length && (c.worker === 'command' || c.recovery === 'notify'))
    throw new DomainError(
      'Capacity fallbacks require a coding provider and restart or supervised recovery',
      400,
    );
  if (
    c.capacityFallbackModels?.some((m) => m === c.model.trim()) ||
    new Set(c.capacityFallbackModels).size !== (c.capacityFallbackModels?.length ?? 0)
  )
    throw new DomainError(
      'Capacity fallback models must be distinct from each other and the initial model',
      400,
    );
  if (c.worker === 'command' && !c.argv[0]?.trim())
    throw new DomainError('Command requires an executable in argv[0]', 400);
  if (c.resumeArgv.length && !c.resumeArgv[0].trim())
    throw new DomainError('Resume executable cannot be empty', 400);
  for (const path of [c.artifact, c.progressFile, c.outcomeFile ?? '', ...c.requiredArtifacts])
    if (path && (isAbsolute(path) || !inside(c.cwd, resolve(c.cwd, path))))
      throw new DomainError(
        'Artifact and progress paths must be inside the working directory',
        400,
      );
  if (c.validator === 'command' && !c.validationArgv[0]?.trim())
    throw new DomainError('A validation command is required', 400);
  if (c.validator === 'benchmark-json' && !c.artifact)
    throw new DomainError('Benchmark validation requires an artifact path', 400);
  if (
    c.progressTimeoutSeconds &&
    !c.progressFile &&
    !c.hooks.some((h) => h.events.includes('on_tick'))
  )
    throw new DomainError('Stall detection requires a progress JSON file or an on_tick hook', 400);
  if (c.outcomeRequired && !c.outcomeFile)
    throw new DomainError('Required outcome needs outcomeFile', 400);
  guardGoal(c);
  return c;
}
export const withDefaults = (input: Partial<TaskConfig>) =>
  validateConfig({ ...taskDefaults, ...input });
