import { providerFor } from '../../shared/providers.js';
import { createHash } from 'node:crypto';
import {
  constants,
  mkdirSync,
  readSync,
  realpathSync,
  openSync,
  closeSync,
  fstatSync,
  fsyncSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { z } from 'zod';
import type { ManagedTask, TaskReport, TaskConfig, Attempt } from '../../shared/operations.js';
import { redact } from '../control-plane.js';
const text = z.string().max(2000);
export const outcomeSchema = z
  .object({
    version: z.literal(1),
    summary: text,
    results: z
      .array(
        z
          .object({
            name: z.string().min(1).max(200),
            status: z.enum(['passed', 'failed', 'partial', 'unknown']),
            detail: text,
            evidence: z.array(z.string().max(1000)).max(10).default([]),
          })
          .strict(),
      )
      .max(50),
    limitations: z.array(text).max(30),
    metrics: z
      .array(
        z
          .object({
            name: z.string().min(1).max(200),
            value: z.number().finite().nullable(),
            unit: z.string().max(100),
          })
          .strict(),
      )
      .max(30)
      .optional(),
    costs: z
      .array(
        z
          .object({
            amount: z.number().nonnegative().finite().nullable(),
            currency: z.string().min(1).max(20),
            source: text,
            kind: z.enum(['reported', 'estimated']),
            evidence: z.array(z.string().max(1000)).max(10),
          })
          .strict(),
      )
      .max(10)
      .optional(),
  })
  .strict();
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
function boundedRead(fd: number, max: number) {
  const buffer = Buffer.alloc(max + 1);
  let size = 0;
  while (size <= max) {
    const count = readSync(fd, buffer, size, max + 1 - size, size);
    if (!count) break;
    size += count;
  }
  if (size > max) throw new Error('File grew beyond bounded read limit');
  return buffer.subarray(0, size);
}
const clean = (s: string) =>
  redact(s)
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .slice(0, 2000);
function sanitize<T>(v: T): T {
  if (typeof v === 'string') return clean(v) as T;
  if (Array.isArray(v)) return v.map(sanitize) as T;
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sanitize(x)])) as T;
  return v;
}
export function captureOutcome(
  c: TaskConfig,
  file = c.outcomeFile,
): NonNullable<TaskReport['outcome']> | undefined {
  if (!file) return;
  // Resolve symlinks, refuse private credential filenames, and read at most 64 KiB.
  if (
    file
      .split(/[\\/]/)
      .some((part) => /^\.env(?:\.|$)/i.test(part) || /^(credentials|secrets?)(\.|$)/i.test(part))
  )
    throw new Error('Outcome path names private credential material');
  const root = realpathSync(c.cwd);
  const path = realpathSync(resolve(root, file));
  if (
    path
      .split(/[\\/]/)
      .some((part) => /^\.env(?:\.|$)/i.test(part) || /^(credentials|secrets?)(\.|$)/i.test(part))
  )
    throw new Error('Outcome resolves to private credential material');
  const rel = relative(root, path);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep))
    throw new Error('Outcome resolves outside workspace');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > 64000)
      throw new Error('Outcome must be a regular file of at most 64000 bytes');
    const data = boundedRead(fd, 64000);
    if (data.length > 64000) throw new Error('Outcome grew beyond limit');
    return {
      source: clean(file),
      digest: hash(data),
      provenance: 'worker-reported',
      data: sanitize(outcomeSchema.parse(JSON.parse(data.toString('utf8')))),
    };
  } finally {
    closeSync(fd);
  }
}
export const terminal = (t: ManagedTask) =>
  ['completed', 'needs_attention', 'stopped'].includes(t.status);
export function terminalKey(t: ManagedTask) {
  return hash(
    JSON.stringify([
      t.id,
      t.status,
      t.attempts.map((a) => [a.id, a.status]),
      t.events.find((e) =>
        ['task.completed', 'task.stopped', 'task.needs_attention'].includes(e.type),
      )?.id,
    ]),
  );
}
function receipt(t: ManagedTask): Attempt | undefined {
  const last = t.attempts.at(-1);
  if (!last || last.status !== 'succeeded' || !last.validation?.passed) return;
  if (
    last.phase === 'validator' ||
    (last.phase === 'worker' && last.config.validator !== 'command')
  )
    return last;
}
export function persistReport(
  directory: string,
  t: ManagedTask,
  retrospective = false,
  outcomeFile?: string,
): TaskReport {
  if (!terminal(t)) throw new Error('Reports require a terminal task');
  const key = terminalKey(t);
  const existing = t.reports?.find(
    (r) => r.terminalKey === key && (!outcomeFile || r.outcome?.source === outcomeFile),
  );
  if (existing) {
    verifyReport(directory, existing);
    t.reportError = undefined;
    return existing;
  }
  const accepted = receipt(t);
  const config = accepted?.config ?? t.attempts.at(-1)?.config ?? t.config;
  let outcome: TaskReport['outcome'];
  let outcomeError = '';
  try {
    outcome = captureOutcome(config, outcomeFile ?? config.outcomeFile);
  } catch {
    outcomeError = 'Structured outcome unavailable or invalid; no domain success inferred.';
  }
  if (
    outcome &&
    accepted?.validation?.artifacts?.some(
      (a) => a.path === (outcomeFile ?? config.outcomeFile) && a.digest === outcome!.digest,
    )
  )
    outcome.linkedValidatorAttemptId = accepted.id;
  if (
    config.outcomeRequired &&
    (!outcome || !outcome.linkedValidatorAttemptId) &&
    t.status === 'completed'
  )
    throw new Error('Required outcome missing, invalid, or differs from validator receipt');
  const workflowAccepted = t.status === 'completed' && !!accepted;
  const disposition: TaskReport['disposition'] =
    t.status === 'stopped'
      ? 'stopped'
      : workflowAccepted
        ? 'success'
        : t.attempts.at(-1)?.failure && !t.attempts.at(-1)?.proposal?.blocker
          ? 'failure'
          : 'blocked';
  const lines = [
    '# Task outcome report',
    retrospective
      ? 'Retrospective attachment: original execution and receipts were not changed or rerun.'
      : 'Automatically generated terminal report.',
    `Task: ${clean(config.name)} (${t.id})`,
    `Goal: ${clean(config.objective)}`,
    `Terminal state: ${t.status} at ${t.updatedAt} · Conclusion: ${disposition}`,
    `Workflow acceptance: ${workflowAccepted ? 'accepted by declared validator' : 'not established'}. Domain success is not inferred from task status.`,
    `Success criteria: ${config.goalContract?.successCriteria.map(clean).join('; ') || 'Legacy contract: see original objective and declared validator.'}`,
    `Constraints: ${config.goalContract?.constraints.map(clean).join('; ') || 'See original task configuration.'}`,
    `Coding providers: worker ${config.worker}; supervisor ${providerFor(config, 'supervisor')}; repair ${providerFor(config, 'repair')}.`,
    ...(['worker', 'repair'].some((phase) => {
      const p = providerFor(config, phase as 'worker' | 'repair');
      return p && p !== 'codex';
    })
      ? [
          'Copilot/Claude shell tools use authorized local-user execution; native permissions are not Codex OS sandbox containment.',
        ]
      : []),
    `Recovery limits: ${config.maxRetries} worker retries; ${config.maxSupervisorCalls} supervisor calls; ${config.timeoutSeconds}s attempt / ${config.taskTimeoutSeconds}s task; repair ${config.allowRepair ? 'authorized within scope' : 'not authorized'}.`,
    `Recovery scope: ${clean(config.goalContract?.recoveryScope ?? 'Original local-operator policy')}`,
    '## Work and attempts',
    ...t.attempts
      .slice(-100)
      .map(
        (a) =>
          `${a.id} · ${a.phase} · ${a.status} · provider=${a.provider ?? providerFor(a.config, a.phase) ?? 'command'} · ${a.startedAt} — ${a.endedAt ?? 'end unknown'}${a.failure ? ' · ' + clean(a.failure) : ''}${a.repairResult ? ' · Repair: ' + clean(a.repairResult.summary) : ''}`,
      ),
    t.attempts.length > 100
      ? 'Earlier attempts omitted from readable report; retained in task storage.'
      : '',
    `Reported progress: ${(() => {
      const a = t.attempts.findLast((a) => a.phase === 'worker' && a.progress);
      return a?.progress
        ? `${a.progress.completed}/${a.progress.total}; ${clean(a.progress.checkpoint ?? '')} (worker-reported, not acceptance)`
        : 'unknown';
    })()}`,
    '## Lifecycle hooks and cleanup',
    ...(t.hookRuns ?? [])
      .slice(-100)
      .map(
        (h) =>
          `${clean(h.hook.id)} · ${h.event} · ${h.status} · ${clean(h.error ?? h.result?.message ?? '')}`,
      ),
    t.attempts.some((a) => !a.cleanupConfirmed) ||
    t.hookRuns?.some(
      (h) => ['queued', 'running'].includes(h.status) || (h.pid && !h.cleanupConfirmed),
    )
      ? 'Cleanup is not confirmed for every process/callback. Terminal state does not establish that external effects or callbacks have stopped; inspect ownership before retry.'
      : 'Owned execution cleanup recorded; remote/provider side effects are not inferred.',
    '## Acceptance evidence',
    ...t.attempts
      .filter((a) => a.validation)
      .slice(-100)
      .flatMap((a) => [
        `${a.id} · ${a.phase}: ${a.validation!.passed ? 'receipt passed' : 'receipt failed'} · ${clean(a.validation!.detail)}`,
        ...(a.validation!.artifacts ?? []).map((v) => `${clean(v.path)} · SHA-256 ${v.digest}`),
        ...(a.validation!.digest
          ? [`${clean(a.validation!.artifact ?? '')} · SHA-256 ${a.validation!.digest}`]
          : []),
      ]),
    !accepted
      ? 'No successful final declared-validator receipt. Worker exit/progress alone is not acceptance.'
      : '',
    '## Domain outcome',
    outcome
      ? `Source: ${outcome.source} · SHA-256 ${outcome.digest} · worker-reported${outcome.linkedValidatorAttemptId ? '; content linked to validator receipt ' + outcome.linkedValidatorAttemptId + ' (does not independently verify every claim)' : '; no matching validator artifact receipt'}`
      : 'Domain results unknown; no structured outcome supplied.',
    outcome?.data.summary ?? '',
    ...(outcome?.data.results.map(
      (r) =>
        `${r.name}: ${r.status} · ${r.detail}${r.evidence.length ? ' · Evidence references (worker-reported): ' + r.evidence.join('; ') : ''}`,
    ) ?? []),
    ...(outcome?.data.metrics?.map(
      (m) => `Metric (worker-reported): ${m.name} = ${m.value ?? 'unknown'} ${m.unit}`,
    ) ?? []),
    ...(outcome?.data.costs?.map(
      (c) =>
        `Cost (worker-${c.kind}): ${c.amount ?? 'unknown'} ${c.currency}; source: ${c.source}; evidence references: ${c.evidence.join('; ') || 'none'}`,
    ) ?? []),
    '## Failures and limitations',
    ...[t.attentionReason, outcomeError, ...(outcome?.data.limitations ?? [])]
      .filter(Boolean)
      .map((v) => clean(v!)),
    'Costs: unknown; this execution service has no authoritative cost telemetry. No zero-cost assumption.',
    `Next action: ${t.status === 'stopped' ? 'Stopped by operator; review partial work before any separately authorized retry.' : workflowAccepted ? 'Review deliverables and domain failures/limitations; additional scope requires explicit authorization.' : 'Resolve the recorded blocker or validation failure; review authority and remaining retry budget before retry.'}`,
  ].filter(Boolean);
  const markdown = lines.join('\n\n');
  if (Buffer.byteLength(markdown) > 512000) throw new Error('Report exceeds bounded output limit');
  const generatedAt =
    t.events.find((e) =>
      ['task.completed', 'task.stopped', 'task.needs_attention'].includes(e.type),
    )?.at ?? t.updatedAt;
  const payload = {
    terminalKey: key,
    retrospective,
    generatedAt,
    taskId: t.id,
    status: t.status,
    disposition,
    workflowAccepted,
    ...(outcome ? { outcome } : {}),
    markdown,
  };
  const digest = hash(JSON.stringify(payload));
  const report: TaskReport = {
    id: `report-${digest}`,
    digest,
    path: `reports/${digest}.json`,
    ...payload,
  };
  const folder = join(directory, 'reports');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  try {
    const fd = openSync(
      join(directory, report.path),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeFileSync(fd, JSON.stringify(report, null, 2) + '\n');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    verifyReport(directory, report);
  }
  (t.reports ??= []).push(report);
  t.reportError = undefined;
  return report;
}
export function verifyReport(directory: string, report: TaskReport) {
  if (!/^[a-f0-9]{64}$/.test(report.digest) || report.path !== `reports/${report.digest}.json`)
    throw new Error('Invalid report identity');
  const fd = openSync(
    join(directory, report.path),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let disk: TaskReport;
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > 1000000) throw new Error('Report exceeds bounded storage limit');
    const bytes = boundedRead(fd, 1000000);
    if (bytes.length > 1000000) throw new Error('Report exceeds bounded storage limit');
    disk = JSON.parse(bytes.toString('utf8')) as TaskReport;
  } finally {
    closeSync(fd);
  }
  const { id, digest, path, ...payload } = disk;
  if (
    hash(JSON.stringify(payload)) !== report.digest ||
    digest !== report.digest ||
    id !== report.id ||
    path !== report.path ||
    JSON.stringify(disk) !== JSON.stringify(report)
  )
    throw new Error('Report digest verification failed');
  return report;
}
