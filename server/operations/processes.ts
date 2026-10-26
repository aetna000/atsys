import { execFileSync } from 'node:child_process';
import type { Attempt, HookRun } from '../../shared/operations.js';
export function processAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
type ProcessIdentity = 'owned' | 'gone' | 'foreign' | 'unknown';
type Inspection = { identity: ProcessIdentity; detail: string };
function errorCode(error: unknown) {
  const code = (error as NodeJS.ErrnoException)?.code;
  // Never retain raw errors, command lines or arbitrary platform/provider text.
  return ['ESRCH', 'EPERM', 'EACCES', 'ETIMEDOUT', 'ENOENT', 'EIO'].includes(code ?? '')
    ? code
    : 'OTHER';
}
function identity(a: { pid: number | null; id: string }, pattern: RegExp): Inspection {
  if (!a.pid) return { identity: 'gone', detail: 'no-pid' };
  try {
    process.kill(a.pid, 0);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH'
      ? { identity: 'gone', detail: 'absent' }
      : { identity: 'unknown', detail: `probe-error:${errorCode(error)}` };
  }
  try {
    const snapshot = execFileSync('ps', ['-p', String(a.pid), '-o', 'stat=', '-o', 'command='], {
      encoding: 'utf8',
      timeout: 2000,
    }).trim();
    const [state, ...commandParts] = snapshot.split(/\s+/);
    // An exited runner may remain in the process table until its parent reaps it.
    // kill(pid, 0) succeeds for zombies, whose command no longer carries our ID.
    // Its PID cannot be reused yet, so cleanup of its original group remains safe.
    if (state.startsWith('Z')) return { identity: 'gone', detail: 'zombie' };
    const command = commandParts.join(' ');
    if (!command || state.startsWith('E') || state.startsWith('X'))
      return { identity: 'unknown', detail: 'exiting-or-empty-command' };
    return pattern.test(command) && command.includes(a.id)
      ? { identity: 'owned', detail: 'runner-match' }
      : { identity: 'foreign', detail: 'runner-mismatch' };
  } catch (error) {
    // A failed inspection is not evidence of either ownership or a foreign PID.
    try {
      process.kill(a.pid, 0);
    } catch (probeError) {
      if ((probeError as NodeJS.ErrnoException).code === 'ESRCH')
        return { identity: 'gone', detail: 'absent-after-inspection' };
    }
    return { identity: 'unknown', detail: `inspection-error:${errorCode(error)}` };
  }
}
export const inspectRunner = (a: Attempt) => identity(a, /attempt-runner\.(ts|mjs)(?:\s|$)/);
export const runnerIdentity = (a: Attempt) => inspectRunner(a).identity;
export const hookRunnerIdentity = (a: HookRun) =>
  identity(a, /hook-runner\.(ts|mjs)(?:\s|$)/).identity;
export function cleanupAttempt(a: Attempt) {
  // Always inspect again immediately before signaling; an earlier gone observation
  // cannot authorize a signal to a PID that now belongs to another process.
  const observation = inspectRunner(a);
  const result = killGroup(a, observation.identity);
  return {
    ...result,
    diagnostic: `${observation.identity}/${observation.detail}; ${result.detail}`,
  };
}
export function killAttempt(a: Attempt): boolean {
  return cleanupAttempt(a).confirmed;
}
export function killHookRun(a: HookRun): boolean {
  return killGroup(a, hookRunnerIdentity(a)).confirmed;
}
function killGroup(a: { pid: number | null }, identity: ProcessIdentity) {
  if (!a.pid) return { confirmed: true, detail: 'no-group' };
  if (identity === 'foreign' || identity === 'unknown')
    return { confirmed: false, detail: 'signal-refused' };
  // The detached runner is the group leader. If its PID is absent, lingering children
  // still belong to that group; an existing foreign leader is never signaled.
  try {
    process.kill(-a.pid, 'SIGKILL');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ESRCH')
      return { confirmed: false, detail: `signal-error:${errorCode(e)}` };
  }
  return { confirmed: true, detail: 'group-terminated-or-absent' };
}

export function signalAttempt(a: Attempt, signal: 'SIGSTOP' | 'SIGCONT') {
  return signalGroup(a, runnerIdentity(a), signal);
}
export function signalHookRun(a: HookRun, signal: 'SIGSTOP' | 'SIGCONT') {
  return signalGroup(a, hookRunnerIdentity(a), signal);
}
function signalGroup(
  a: { pid: number | null },
  identity: ProcessIdentity,
  signal: 'SIGSTOP' | 'SIGCONT',
) {
  if (!a.pid) return true;
  if (identity === 'foreign' || identity === 'unknown') return false;
  try {
    process.kill(-a.pid, signal);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}
