import { execFileSync } from 'node:child_process';
import type { Attempt } from '../../shared/operations.js';
export function processAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
export function runnerIdentity(a: Attempt): 'owned' | 'gone' | 'foreign' {
  if (!a.pid || !processAlive(a.pid)) return 'gone';
  try {
    const command = execFileSync('ps', ['-p', String(a.pid), '-o', 'command='], {
      encoding: 'utf8',
      timeout: 2000,
    }).trim();
    return /attempt-runner\.(ts|mjs)(?:\s|$)/.test(command) && command.includes(a.id)
      ? 'owned'
      : 'foreign';
  } catch {
    return processAlive(a.pid) ? 'foreign' : 'gone';
  }
}
export function killAttempt(a: Attempt): boolean {
  if (!a.pid) return true;
  const identity = runnerIdentity(a);
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
