import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { OperationsStore } from '../server/operations/store.js';
import { withDefaults } from '../server/operations/config.js';
import { createTask } from '../server/operations/tasks.js';
import {
  formatTaskStatus,
  plainText,
  readableAttemptLog,
  taskPresentation,
} from '../shared/task-presentation.js';
import { selectTask } from '../server/operations/monitor.js';
import type { Attempt } from '../shared/operations.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'atsys-presentation-'));
  const store = new OperationsStore(join(root, 'data'));
  const task = createTask(
    store,
    withDefaults({
      name: 'Benchmark with a long but readable goal',
      objective: 'Run twenty independent tasks and verify all evidence',
      cwd: root,
      argv: [process.execPath],
      recovery: 'notify',
    }),
  );
  task.status = 'needs_attention';
  task.attentionReason = 'Encrypted snapshot access is unavailable';
  task.attempts = [
    {
      id: 'worker',
      phase: 'worker',
      status: 'failed',
      progress: {
        completed: 2,
        total: 24,
        checkpoint: 'Source restored; awaiting frozen snapshot access',
      },
      config: task.config,
      output: '',
      heartbeatAt: task.createdAt,
    },
    {
      id: 'supervisor',
      phase: 'supervisor',
      status: 'succeeded',
      config: task.config,
      output: '',
      heartbeatAt: task.createdAt,
      proposal: {
        action: 'escalate',
        reason: task.attentionReason,
        instructions: 'Preserve evidence',
        blocker: {
          kind: 'authorization',
          evidence: ['snapshot receipt'],
          attemptedRemedies: ['Checked isolated clones'],
          requiredResolution:
            'Restore authorized access to the frozen snapshot. Never paste keys into terminal output.',
        },
      },
    },
  ] as Attempt[];
  return {
    root,
    store,
    task,
    close: () => {
      store.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
test('compact presentation preserves worker progress through diagnosis and shows next action', () => {
  const f = fixture();
  try {
    const p = taskPresentation(f.task);
    assert.equal(p.progress?.completed, 2);
    assert.match(p.next, /Restore authorized access/);
    for (const width of [40, 60, 88, 120]) {
      const text = formatTaskStatus(f.task, width);
      assert.ok(text.split('\n').every((line) => line.length <= width));
      assert.ok(text.split('\n').length <= 34);
      assert.match(text, /Needs your help/);
      assert.match(text, /NEXT:/);
      assert.ok(!text.includes('"argv"'));
      assert.ok(
        formatTaskStatus(f.task, width, Date.now(), 'http://localhost:4311', 24).split('\n')
          .length <= 22,
      );
    }
  } finally {
    f.close();
  }
});
test('readable logs suppress nested command output and strip terminal controls', () => {
  const output = [
    JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'command_execution',
        status: 'completed',
        exit_code: 0,
        aggregated_output: 'HUGE PRIVATE TOOL BODY',
      },
    }),
    JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: 'Source restored.\u001b[2J Next: validate snapshot.' },
    }),
    JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'command_execution',
        status: 'completed',
        exit_code: 1,
        aggregated_output: 'full traceback',
      },
    }),
  ].join('\n');
  const text = readableAttemptLog(output);
  assert.match(text, /Source restored/);
  assert.match(text, /exit 1/);
  assert.ok(!text.includes('HUGE PRIVATE'));
  assert.ok(!text.includes('full traceback'));
  assert.ok(!text.includes('\u001b'));
  assert.equal(plainText('\u001b[31merror\u001b[0m'), 'error');
  assert.ok(
    !readableAttemptLog('partial tool payload \\"type\\":\\"command_execution\\"').includes(
      'partial tool payload',
    ),
  );
  const decision = readableAttemptLog(
    JSON.stringify({
      item: {
        type: 'agent_message',
        text: JSON.stringify({
          action: 'escalate',
          reason: 'Restore source access',
          instructions: 'Preserve old records',
        }),
      },
    }),
  );
  assert.match(decision, /Decision: escalate/);
  assert.ok(!decision.includes('"instructions"'));
});

test('active diagnosis is not labelled standby and prior reported progress survives retry startup', () => {
  const f = fixture();
  try {
    f.task.status = 'supervising';
    const p = taskPresentation(f.task);
    assert.match(p.supervisor, /Investigating now/);
    assert.match(p.activity, /investigating/);
    f.task.status = 'running';
    f.task.attempts.push({
      ...f.task.attempts[0],
      id: 'new-worker',
      progress: undefined,
      status: 'running',
    });
    const resumed = taskPresentation(f.task);
    assert.equal(resumed.progress?.completed, 2);
    assert.equal(resumed.progressFromPreviousAttempt, true);
  } finally {
    f.close();
  }
});
test('task selection accepts unique prefix and refuses ambiguous IDs', () => {
  const f = fixture();
  try {
    assert.equal(selectTask([f.task], f.task.id.slice(0, 14)).id, f.task.id);
    assert.throws(
      () => selectTask([f.task, { ...f.task, id: f.task.id + 'extra' }], f.task.id.slice(0, 14)),
      /ambiguous/,
    );
    assert.throws(() => selectTask([]), /No managed tasks/);
  } finally {
    f.close();
  }
});
test('CLI human status/watch/logs preserve task show JSON and never mutate execution', () => {
  const f = fixture();
  try {
    f.store.update((s) => {
      s.tasks[0] = f.task;
    });
    const invoke = (args: string[]) =>
      execFileSync(process.execPath, [resolve('bin/atsys.mjs'), ...args], {
        env: { ...process.env, ATSYS_DATA_DIR: f.store.directory },
        encoding: 'utf8',
      });
    assert.match(invoke(['task', 'status', f.task.id]), /NEXT:/);
    assert.match(invoke(['status']), /Needs your help/);
    assert.match(invoke(['task', 'watch', f.task.id, '--once']), /TASK MONITOR/);
    assert.equal(JSON.parse(invoke(['task', 'show', f.task.id])).id, f.task.id);
    assert.equal(
      JSON.parse(invoke(['task', 'status', f.task.id, '--json'])).status,
      'needs_attention',
    );
    assert.match(invoke(['task', 'logs', f.task.id]), /No readable messages/);
    assert.equal(f.store.read().tasks[0].attempts.length, 2);
    assert.equal(f.store.read().tasks[0].stopRequested, false);
  } finally {
    f.close();
  }
});
test('live monitor suppresses heartbeat-only noise and closing it leaves execution untouched', async () => {
  const f = fixture();
  try {
    f.task.status = 'running';
    f.store.update((s) => {
      s.tasks[0] = f.task;
    });
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', resolve('server/cli.ts'), 'task', 'watch', f.task.id, '--interval', '1'],
      {
        env: { ...process.env, ATSYS_DATA_DIR: f.store.directory },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const exited = new Promise<void>((r) => child.once('exit', () => r()));
    let text = '';
    let announced = false;
    await new Promise<void>((resolve, reject) => {
      child.stdout.on('data', (chunk) => {
        text += chunk.toString();
        if (!announced && text.includes('TASK MONITOR')) {
          announced = true;
          resolve();
        }
      });
      child.once('error', reject);
      child.once('exit', () => {
        if (!text.includes('TASK MONITOR')) reject(new Error('monitor exited before rendering'));
      });
    });
    const heartbeat = setInterval(
      () =>
        f.store.update((s) => {
          s.tasks[0].attempts[0].heartbeatAt = new Date().toISOString();
        }),
      150,
    );
    try {
      await new Promise((r) => setTimeout(r, 2200));
    } finally {
      clearInterval(heartbeat);
      child.kill('SIGTERM');
      await exited;
    }
    assert.equal(text.split('ATSYS · TASK MONITOR').length - 1, 1);
    assert.equal(f.store.read().tasks[0].status, 'running');
    assert.equal(f.store.read().tasks[0].stopRequested, false);
  } finally {
    f.close();
  }
});
