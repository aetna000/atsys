import type { FullConfig } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { OperationsStore } from '../server/operations/store.js';
import { killAttempt } from '../server/operations/processes.js';
export default async function cleanup(config: FullConfig) {
  const directory = config.metadata.operationsDataDir as string;
  const store = new OperationsStore(directory);
  try {
    const s = store.read();
    for (const t of s.tasks) for (const a of t.attempts) if (!a.cleanupConfirmed) killAttempt(a);
    if (s.daemon) {
      try {
        const command = execFileSync('ps', ['-p', String(s.daemon.pid), '-o', 'command='], {
          encoding: 'utf8',
        });
        if (command.includes('operations/daemon.ts') && command.includes(directory))
          process.kill(s.daemon.pid, 'SIGTERM');
      } catch {
        /* already stopped */
      }
    }
  } finally {
    store.close();
  }
}
