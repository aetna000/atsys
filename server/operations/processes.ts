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
