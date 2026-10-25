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
function identity(
  a: { pid: number | null; id: string },
  pattern: RegExp,
): 'owned' | 'gone' | 'foreign' {
  if (!a.pid || !processAlive(a.pid)) return 'gone';
  try {
    const snapshot = execFileSync('ps', ['-p', String(a.pid), '-o', 'stat=', '-o', 'command='], {
      encoding: 'utf8',
      timeout: 2000,
    }).trim();
    const [state, ...commandParts] = snapshot.split(/\s+/);
    // An exited runner may remain in the process table until its parent reaps it.
    // kill(pid, 0) succeeds for zombies, whose command no longer carries our ID.
    // Its PID cannot be reused yet, so cleanup of its original group remains safe.
    if (state.startsWith('Z')) return 'gone';
    const command = commandParts.join(' ');
    return pattern.test(command) && command.includes(a.id) ? 'owned' : 'foreign';
  } catch {
    return processAlive(a.pid) ? 'foreign' : 'gone';
  }
}
export const runnerIdentity = (a: Attempt) => identity(a, /attempt-runner\.(ts|mjs)(?:\s|$)/);
export const hookRunnerIdentity = (a: HookRun) => identity(a, /hook-runner\.(ts|mjs)(?:\s|$)/);
export function killAttempt(a: Attempt): boolean {
  return killGroup(a, runnerIdentity(a));
}
export function killHookRun(a: HookRun): boolean {
  return killGroup(a, hookRunnerIdentity(a));
}
function killGroup(a: { pid: number | null }, identity: 'owned' | 'gone' | 'foreign'): boolean {
  if (!a.pid) return true;
  if (identity === 'foreign') return false;
  // The detached runner is the group leader. If its PID is absent, lingering children
  // still belong to that group; an existing foreign leader is never signaled.
  try {
    process.kill(-a.pid, 'SIGKILL');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ESRCH') return false;
  }
  return true;
}

export function signalAttempt(a: Attempt, signal: 'SIGSTOP' | 'SIGCONT') {
  return signalGroup(a, runnerIdentity(a), signal);
}
export function signalHookRun(a: HookRun, signal: 'SIGSTOP' | 'SIGCONT') {
  return signalGroup(a, hookRunnerIdentity(a), signal);
}
function signalGroup(
  a: { pid: number | null },
  identity: 'owned' | 'gone' | 'foreign',
  signal: 'SIGSTOP' | 'SIGCONT',
) {
  if (!a.pid) return true;
  if (identity === 'foreign') return false;
  try {
    process.kill(-a.pid, signal);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}
