import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { OperationsStore, stamp, taskEvent } from './store.js';
import { inside } from './config.js';
import { codexInvocation, proposalParser, proposalSchema, repairSchema } from './codex.js';
import { redact, validateResult } from '../control-plane.js';
import type { Attempt } from '../../shared/operations.js';

const [directory, taskId, attemptId] = process.argv.slice(2);
const store = new OperationsStore(directory);
const initial = store.update((s) => {
  const task = s.tasks.find((t) => t.id === taskId);
  const a = task?.attempts.find((a) => a.id === attemptId);
  if (
    !task ||
    !a ||
    task.stopRequested ||
    a.status !== 'starting' ||
    (a.pid && a.pid !== process.pid)
  )
    return null;
  a.pid = process.pid;
  a.status = 'running';
  a.heartbeatAt = stamp();
  taskEvent(
    task,
    a.phase === 'supervisor' ? 'supervisor' : a.phase === 'validator' ? 'observer' : 'worker',
    'attempt.started',
    `${a.phase} process started (PID ${process.pid}).`,
  );
  return { task, attempt: a };
});
if (!initial) {
  store.close();
  process.exit(0);
}
const { task, attempt } = initial;
const c = attempt.config;
const attemptDir = join(directory, 'attempts', attempt.id);
mkdirSync(attemptDir, { recursive: true, mode: 0o700 });
const resultPath = join(attemptDir, 'response.json');
const schemaPath = join(attemptDir, 'schema.json');
function safeFile(path: string, max = 2_000_000) {
  const absolute = realpathSync(resolve(c.cwd, path));
  if (!inside(c.cwd, absolute)) throw new Error('Path resolves outside the task workspace');
  const st = statSync(absolute);
  if (!st.isFile() || st.size > max) throw new Error('Expected a bounded regular file');
  return { data: readFileSync(absolute, 'utf8'), mtime: st.mtimeMs, absolute };
}
let beforeArtifact: { data: string; mtime: number } | undefined;
try {
  if (c.artifact) beforeArtifact = safeFile(c.artifact);
} catch {
  /* absent before execution */
}
let argv =
  c.resumeArgv.length && task.attempts.filter((a) => a.phase === 'worker').length > 1
    ? c.resumeArgv
    : c.argv;
if (attempt.phase === 'validator') argv = c.validationArgv;
let prompt: string | undefined;
if (
  ['supervisor', 'repair'].includes(attempt.phase) ||
  (attempt.phase === 'worker' && c.worker === 'codex')
) {
  writeFileSync(
    schemaPath,
    JSON.stringify(attempt.phase === 'repair' ? repairSchema : proposalSchema),
    { mode: 0o600 },
  );
  const invocation = codexInvocation(task, attempt, schemaPath, resultPath);
  argv = invocation.argv;
  prompt = invocation.prompt;
}
let finished = false;
let failure: string | undefined;
let exitCode: number | null = null;
let output = '';
const buffers = { stdout: '', stderr: '' };
let lastProgressText = '';
const seenProgress = new Set<string>();
let progress = attempt.progress;
let lastProgressAt = attempt.startedAt;
let lastActivityAt = attempt.startedAt;
function readProgress() {
  const p = z
    .object({
      completed: z.number().nonnegative(),
      total: z.number().positive(),
      checkpoint: z.string().max(2000).optional(),
    })
    .passthrough()
    .parse(JSON.parse(safeFile(c.progressFile, 64000).data));
  if (p.completed > p.total) throw new Error('Progress exceeds total');
  return { completed: p.completed, total: p.total, checkpoint: p.checkpoint };
}
function captureProgress() {
  const p = readProgress();
  if (progress && (p.completed < progress.completed || p.total !== progress.total))
    throw new Error('Progress must not regress or move the goal');
  const signal = JSON.stringify([p.completed, p.total, p.checkpoint]);
  if (signal !== lastProgressText && !seenProgress.has(signal)) {
    seenProgress.add(signal);
    lastProgressText = signal;
    lastProgressAt = stamp();
    progress = p;
  }
}
try {
  if (c.progressFile && attempt.phase === 'worker') {
    const p = readProgress();
    lastProgressText = JSON.stringify([p.completed, p.total, p.checkpoint]);
    seenProgress.add(lastProgressText);
    progress = p; // Show the restored checkpoint without pretending it is new progress.
  }
} catch {
  /* optional source not created yet */
}
const timeout =
  (attempt.phase === 'supervisor'
    ? c.supervisorTimeoutSeconds
    : attempt.phase === 'repair'
      ? c.repairTimeoutSeconds
      : attempt.phase === 'validator'
        ? c.validationTimeoutSeconds
        : c.timeoutSeconds) * 1000;
function append(text: string) {
  output = (output + redact(text) + '\n').slice(-32000);
}
function feed(stream: keyof typeof buffers, chunk: Buffer) {
  lastActivityAt = stamp();
  buffers[stream] += chunk.toString();
  const lines = buffers[stream].split('\n');
  buffers[stream] = lines.pop() ?? '';
  for (const line of lines) append(line);
  // Never publish partial oversized lines; a secret may cross a chunk boundary.
  if (buffers[stream].length > 64000) buffers[stream] = '[oversized line omitted]';
}
const child = spawn(argv[0], argv.slice(1), {
  cwd: c.cwd,
  shell: false,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, ATSYS_TASK_ID: task.id, ATSYS_ATTEMPT_ID: attempt.id },
});
child.stdout.on('data', (b: Buffer) => feed('stdout', b));
child.stderr.on('data', (b: Buffer) => feed('stderr', b));
child.stdin.on('error', () => {});
child.stdin.end(prompt);
function terminate(reason: string) {
  if (failure || finished) return;
  failure = reason;
  child.kill('SIGTERM');
  setTimeout(() => {
    if (!finished) {
      child.kill('SIGKILL');
      finish();
    }
  }, 1500).unref();
}
function finish() {
  if (finished) return;
  finished = true;
  clearInterval(timer);
  if (c.progressFile && attempt.phase === 'worker') {
    try {
      captureProgress();
    } catch {
      /* Retain last valid report; never infer completion. */
    }
  }
  for (const value of Object.values(buffers)) if (value) append(value);
  let validation: Attempt['validation'];
  let proposal: Attempt['proposal'];
  let repairResult: Attempt['repairResult'];
  if (!failure && exitCode !== 0) failure = `Process exited with code ${exitCode ?? 'unknown'}`;
  if (!failure) {
    try {
      if (['supervisor', 'repair'].includes(attempt.phase)) {
        if (!existsSync(resultPath) || statSync(resultPath).size > 64000)
          throw new Error('Missing or oversized structured response');
        const result = JSON.parse(readFileSync(resultPath, 'utf8'));
        if (attempt.phase === 'supervisor') proposal = proposalParser.parse(result);
        else {
          repairResult = z
            .object({ fixed: z.boolean(), summary: z.string().max(16000) })
            .strict()
            .parse(result);
          if (!repairResult.fixed)
            failure = `Repair could not resolve failure: ${redact(repairResult.summary)}`;
        }
        if (proposal)
          proposal = {
            ...proposal,
            reason: redact(proposal.reason),
            instructions: redact(proposal.instructions),
            blocker: proposal.blocker
              ? {
                  ...proposal.blocker,
                  evidence: proposal.blocker.evidence.map(redact),
                  attemptedRemedies: proposal.blocker.attemptedRemedies.map(redact),
                  requiredResolution: redact(proposal.blocker.requiredResolution),
                }
              : proposal.blocker,
          };
        if (repairResult) repairResult.summary = redact(repairResult.summary);
      } else if (c.validator !== 'benchmark-json' || attempt.phase === 'validator')
        validation = {
          passed: true,
          detail:
            attempt.phase === 'validator'
              ? 'Independent validation command exited zero.'
              : c.validator === 'command'
                ? 'Worker exited zero; independent validation pending.'
                : 'Declared exit-code validator: process exited zero.',
        };
      else {
        const artifact = safeFile(c.artifact);
        if (
          beforeArtifact &&
          artifact.data === beforeArtifact.data &&
          artifact.mtime === beforeArtifact.mtime
        )
          throw new Error('Artifact was not updated by this attempt');
        if (!validateResult(JSON.parse(artifact.data)).pass)
          throw new Error(
            'Benchmark requires completed === total > 0, passed=true, accuracy >= 0.80',
          );
        validation = {
          passed: true,
          detail: 'Fresh benchmark artifact passed completeness and accuracy validation.',
          digest: createHash('sha256').update(artifact.data).digest('hex'),
          artifact: c.artifact,
        };
      }
      if (
        validation?.passed &&
        (attempt.phase === 'validator' || (attempt.phase === 'worker' && c.validator !== 'command'))
      ) {
        validation.artifacts = c.requiredArtifacts.map((path) => {
          const artifact = safeFile(path, 20_000_000);
          return {
            path,
            digest: createHash('sha256').update(readFileSync(artifact.absolute)).digest('hex'),
          };
        });
      }
    } catch (e) {
      failure = `Validation failed: ${e instanceof Error ? e.message : 'invalid result'}`;
      validation = { passed: false, detail: failure };
    }
  }
  store.update((s) => {
    const t = s.tasks.find((t) => t.id === taskId)!;
    const a = t.attempts.find((a) => a.id === attemptId)!;
    if (!['starting', 'running'].includes(a.status) || a.pid !== process.pid) return;
    a.status = t.stopRequested ? 'stopped' : failure ? 'failed' : 'succeeded';
    a.endedAt = stamp();
    a.heartbeatAt = stamp();
    a.output = output;
    a.progress = progress;
    a.lastProgressAt = lastProgressAt;
    a.lastActivityAt = lastActivityAt;
    a.failure = failure && redact(failure);
    a.exitCode = exitCode;
    a.validation = validation;
    a.proposal = proposal;
    a.repairResult = repairResult;
    taskEvent(
      t,
      a.phase === 'supervisor' ? 'supervisor' : a.phase === 'validator' ? 'observer' : 'worker',
      `attempt.${a.status}`,
      failure ??
        validation?.detail ??
        repairResult?.summary ??
        proposal?.reason ??
        'Attempt finished',
    );
  });
  store.close();
  process.exit(0);
}
const timer = setInterval(() => {
  try {
    const current = store.read().tasks.find((t) => t.id === taskId);
    const a = current?.attempts.find((a) => a.id === attemptId);
    if (!a || !['starting', 'running'].includes(a.status))
      return terminate('Attempt was fenced by watchdog');
    if (current?.stopRequested) return terminate('Operator requested stop');
    if (Date.now() - Date.parse(attempt.startedAt) > timeout)
      return terminate('Attempt deadline exceeded');
    if (
      c.activityTimeoutSeconds &&
      attempt.phase === 'worker' &&
      Date.now() - Date.parse(lastActivityAt) > c.activityTimeoutSeconds * 1000
    )
      return terminate('Activity stalled: no process output within configured window');
    if (c.progressFile && attempt.phase === 'worker') {
      try {
        captureProgress();
      } catch {
        /* absence/invalid telemetry never advances progress; stall deadline still applies */
      }
      if (
        c.progressTimeoutSeconds &&
        Date.now() - Date.parse(lastProgressAt) > c.progressTimeoutSeconds * 1000
      )
        return terminate('Progress stalled: no valid progress change within configured window');
    }
    store.update((s) => {
      const a = s.tasks.find((t) => t.id === taskId)?.attempts.find((a) => a.id === attemptId);
      if (a && a.status === 'running' && a.pid === process.pid) {
        a.heartbeatAt = stamp();
        a.output = output;
        a.progress = progress;
        a.lastProgressAt = lastProgressAt;
        a.lastActivityAt = lastActivityAt;
      }
    });
  } catch {
    terminate('Runner could not persist heartbeat');
  }
}, 1000);
child.on('error', (e) => {
  failure = `Unable to start executable: ${(e as NodeJS.ErrnoException).code ?? 'spawn error'}`;
  finish();
});
child.on('close', (code, signal) => {
  exitCode = code;
  if (signal && !failure) failure = `Process terminated by ${signal}`;
  finish();
});
process.on('SIGTERM', () => terminate('Runner terminated'));
process.on('SIGINT', () => terminate('Runner interrupted'));
