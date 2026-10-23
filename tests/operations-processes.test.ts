import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import type { Attempt } from '../shared/operations.js';
import { runnerIdentity, killAttempt, processAlive } from '../server/operations/processes.js';

test('exited zombie runners are gone while live unrelated processes stay protected', async () => {
  // Hold an exited child unreaped so the OS race is deterministic, not a timed guess.
  const parent = spawn(
    'python3',
    [
      '-u',
      '-c',
      `import os, sys
pid = os.fork()
if pid == 0:
    os._exit(0)
print(pid, flush=True)
try:
    sys.stdin.read()
finally:
    os.waitpid(pid, 0)
`,
    ],
    { detached: true, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const closed = once(parent, 'close');
  try {
    const [output] = await once(parent.stdout, 'data');
    const pid = Number(String(output).trim());
    assert.ok(Number.isInteger(pid) && pid > 0);
    let state = '';
    for (let i = 0; i < 100; i++) {
      state = execFileSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' }).trim();
      if (state.startsWith('Z')) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(state.startsWith('Z'), `Expected unreaped zombie, got ${state}`);
    assert.equal(processAlive(pid), true, 'kill(pid, 0) still sees the zombie');
    assert.equal(runnerIdentity({ pid, id: 'completed-attempt' } as Attempt), 'gone');
    assert.equal(killAttempt({ pid, id: 'completed-attempt' } as Attempt), true);
    const foreign = { pid: parent.pid!, id: 'unrelated-attempt' } as Attempt;
    assert.equal(runnerIdentity(foreign), 'foreign');
    assert.equal(killAttempt(foreign), false);
    assert.equal(processAlive(parent.pid!), true);
  } finally {
    parent.stdin.end();
    await closed;
  }
});
