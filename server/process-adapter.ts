import { spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import type { Run } from '../shared/types.js';
import { TERMINAL } from '../shared/types.js';
import {
  ControlPlane,
  DomainError,
  event,
  hash,
  id,
  now,
  redact,
  validateResult,
} from './control-plane.js';
export interface ProcessOptions {
  projectId: string;
  argv: string[];
  cwd: string;
  timeoutSeconds: number;
  validator?: 'exit-code' | 'benchmark-json';
  artifact?: string;
}
export async function executeProcess(plane: ControlPlane, options: ProcessOptions): Promise<Run> {
  if (!options.argv.length) throw new DomainError('Supply an explicit command after --', 400);
  if (
    !Number.isInteger(options.timeoutSeconds) ||
    options.timeoutSeconds < 1 ||
    options.timeoutSeconds > 86400
  )
    throw new DomainError('Timeout must be 1..86400 seconds', 400);
  const root = realpathSync(options.cwd);
  if (!statSync(root).isDirectory()) throw new DomainError('Project root must be a directory', 400);
  let artifactPath: string | undefined;
  let previousDigest: string | undefined;
  if (options.artifact) {
    const path = resolve(root, options.artifact);
    const rel = relative(root, path);
    if (rel.startsWith('..') || isAbsolute(rel))
      throw new DomainError('Artifact must remain within project root', 400);
    artifactPath = path;
    if (existsSync(path)) {
      const real = realpathSync(path);
      if (relative(root, real).startsWith('..'))
        throw new DomainError('Artifact symlink escapes project root', 400);
      if (statSync(real).size > 2_000_000)
        throw new DomainError('Existing result artifact exceeds 2 MB', 400);
      previousDigest = hash(readFileSync(real, 'utf8'));
    }
  }
  const run = plane.store.update((s) => {
    if (!s.projects.some((p) => p.id === options.projectId))
      throw new DomainError('Unknown project', 404);
    const r: Run = {
      id: id('run'),
      projectId: options.projectId,
      name: redact(options.argv.slice(0, 3).join(' ')).slice(0, 120),
      objective: `Explicit local argv execution; validator: ${options.validator ?? 'none (incomplete until reviewed)'}`,
      command: redact(options.argv.map((a) => JSON.stringify(a)).join(' ')),
      runtime: 'local-process',
      adapter: 'local-process',
      status: 'running',
      startedAt: now(),
      updatedAt: now(),
      progress: null,
      total: null,
      budget: 0,
      timeoutSeconds: options.timeoutSeconds,
      result: 'not_evaluated',
      validator: options.validator ?? 'none',
      attempts: 0,
      nativeSessionId: id('process'),
    };
    s.runs.unshift(r);
    s.agents.push({
      id: `worker-${r.id}`,
      projectId: r.projectId,
      name: `local-process-${r.id.slice(-4)}`,
      role: 'worker',
      runtime: 'local-process',
      model: 'No model · local argv',
      status: 'healthy',
      capabilities: {
        logs: true,
        toolHooks: false,
        nativePause: false,
        nativeResume: false,
        steering: false,
        usage: false,
      },
      sessionId: r.nativeSessionId,
      lastHeartbeat: now(),
      simulated: false,
    });
    return r;
  });
  let output = '';
  let timedOut = false;
  let cancelled = false;
  let lines = 0;
  let spawnError: string | undefined;
  const child = spawn(options.argv[0], options.argv.slice(1), {
    cwd: root,
    shell: false,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  plane.store.update((s) => {
    const r = s.runs.find((r) => r.id === run.id)!;
    r.nativeSessionId = `pid:${child.pid ?? 'unavailable'}`;
    s.agents.find((a) => a.id === `worker-${r.id}`)!.sessionId = r.nativeSessionId;
    event(s, r, 'run.started', 'Local argv execution started. No shell interpolation.');
  });
  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  function terminate() {
    try {
      if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
      else child.kill('SIGTERM');
    } catch {
      /* process already ended */
    }
    forceTimer = setTimeout(() => {
      try {
        if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        /* process already ended */
      }
    }, 1500);
    forceTimer.unref();
  }
  const capture = (raw: string) => {
    const text = redact(raw);
    output = (output + text + '\n').slice(-64000);
    if (lines++ < 300)
      plane.store.update((s) => {
        const r = s.runs.find((r) => r.id === run.id)!;
        r.updatedAt = now();
        event(s, r, 'process.output', text);
      });
  };
  const buffers = { stdout: '', stderr: '' };
  const dropped = { stdout: false, stderr: false };
  const receive = (stream: 'stdout' | 'stderr', chunk: Buffer) => {
    const parts = chunk.toString('utf8').split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (!dropped[stream]) buffers[stream] += parts[i];
      if (i < parts.length - 1) {
        capture(buffers[stream] + (dropped[stream] ? ' [line truncated]' : ''));
        buffers[stream] = '';
        dropped[stream] = false;
      } else if (buffers[stream].length > 64000) {
        buffers[stream] = buffers[stream].slice(0, 64000);
        dropped[stream] = true;
      }
    }
  };
  child.stdout.on('data', (chunk) => receive('stdout', chunk));
  child.stderr.on('data', (chunk) => receive('stderr', chunk));
  const timeout = setTimeout(() => {
    timedOut = true;
    terminate();
  }, options.timeoutSeconds * 1000);
  const poll = setInterval(() => {
    const r = plane.store.read().runs.find((r) => r.id === run.id);
    if (r?.status === 'aborted' && !cancelled) {
      cancelled = true;
      terminate();
    } else if (r && !TERMINAL.includes(r.status))
      plane.store.update((s) => {
        const a = s.agents.find((a) => a.id === `worker-${run.id}`);
        if (a) a.lastHeartbeat = now();
      });
  }, 500);
  const handleSignal = () => {
    cancelled = true;
    plane.stop(run.id);
    terminate();
  };
  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);
  const code = await new Promise<number | null>((resolveExit) => {
    child.once('error', (e) => {
      spawnError = redact(e.message);
    });
    child.once('close', (code) => resolveExit(code));
  });
  for (const stream of ['stdout', 'stderr'] as const) if (buffers[stream]) capture(buffers[stream]);
  clearTimeout(timeout);
  clearInterval(poll);
  if (forceTimer) clearTimeout(forceTimer);
  process.removeListener('SIGINT', handleSignal);
  process.removeListener('SIGTERM', handleSignal);
  return plane.store.update((s) => {
    const r = s.runs.find((r) => r.id === run.id)!;
    const a = s.agents.find((a) => a.id === `worker-${r.id}`);
    if (a) {
      a.status = 'idle';
      a.lastHeartbeat = now();
    }
    const ev = {
      id: id('evidence'),
      runId: r.id,
      kind: 'log' as const,
      title: 'Captured process output',
      content: output || spawnError || '(No output)',
      digest: hash(output || spawnError || '(No output)'),
      createdAt: now(),
      simulated: false,
    };
    s.evidence.push(ev);
    r.artifact = ev.id;
    r.updatedAt = now();
    r.finishedAt = now();
    if (r.status === 'aborted' || cancelled) {
      r.status = 'aborted';
      r.result = 'aborted';
      event(s, r, 'process.cancelled', 'Local process terminated after controlled stop.');
      return r;
    }
    let pass = false;
    let reason = 'No validator declared. Exit alone does not prove task completion.';
    if (timedOut) reason = 'Process exceeded declared timeout.';
    else if (spawnError) reason = `Process failed to start: ${spawnError}`;
    else if (code !== 0) reason = `Process exited with code ${code}.`;
    else if (options.validator === 'exit-code') {
      pass = true;
      reason = 'Explicit exit-code validator passed: code 0. Captured output digest retained.';
    } else if (options.validator === 'benchmark-json') {
      try {
        if (!artifactPath) throw new Error('No --artifact path declared');
        const actual = realpathSync(artifactPath);
        if (relative(root, actual).startsWith('..'))
          throw new Error('Artifact symlink escapes project root');
        const stat = statSync(actual);
        if (stat.size > 2_000_000) throw new Error('Artifact exceeds 2 MB');
        const content = readFileSync(actual, 'utf8');
        if (hash(content) === previousDigest || stat.mtimeMs < Date.parse(r.startedAt) - 1000)
          throw new Error('Artifact is unchanged or predates this run');
        const result = validateResult(JSON.parse(content));
        pass = result.pass;
        reason = result.reason;
        const artifact = {
          id: id('artifact'),
          runId: r.id,
          kind: 'artifact' as const,
          title: 'Declared benchmark result',
          content: redact(content),
          digest: hash(redact(content)),
          sourceDigest: hash(content),
          sourcePath: relative(root, actual),
          createdAt: now(),
          simulated: false,
        };
        s.evidence.push(artifact);
        r.artifact = artifact.id;
      } catch (e) {
        reason = e instanceof Error ? e.message : 'Artifact validation failed';
      }
    }
    const rec = {
      id: id('op'),
      runId: r.id,
      operation: 'validate',
      outcome: pass
        ? 'passed'
        : options.validator || code !== 0 || timedOut
          ? 'failed'
          : 'incomplete',
      detail: reason,
      timestamp: now(),
    };
    s.receipts.push(rec);
    r.validatorReceiptId = rec.id;
    r.status = pass
      ? 'completed'
      : code !== 0 || timedOut || spawnError || options.validator
        ? 'failed'
        : 'blocked';
    r.result = pass
      ? 'validated_pass'
      : code !== 0 || timedOut || spawnError || options.validator
        ? 'validated_fail'
        : 'incomplete';
    event(s, r, 'process.result', reason, 'observer', pass ? 'info' : 'warning', [r.artifact]);
    return r;
  });
}
