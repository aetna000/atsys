import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { ControlPlane, redact } from '../server/control-plane.js';
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'atsys-test-'));
  const store = new Store(dir);
  const plane = new ControlPlane(store);
  return {
    dir,
    store,
    plane,
    close() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test('durable seed and state revisions survive reopen', () => {
  const f = fixture();
  const revision = f.store.read().revision;
  f.plane.updateSettings({ dailyBudget: 31 });
  f.store.close();
  const reopened = new Store(f.dir);
  assert.equal(reopened.read().settings.dailyBudget, 31);
  assert.ok(reopened.read().revision > revision);
  reopened.close();
  rmSync(f.dir, { recursive: true });
});
test('approval is idempotent and conflicting decision cannot replay an operation', () => {
  const f = fixture();
  try {
    const p = f.store.read().proposals.find((p) => p.status === 'pending')!;
    const receipt = f.plane.decide(p.id, 'approve');
    assert.equal(f.plane.decide(p.id, 'approve').id, receipt.id);
    assert.throws(() => f.plane.decide(p.id, 'reject'), /already/);
    assert.equal(f.store.read().runs.find((r) => r.id === p.runId)!.attempts, 1);
  } finally {
    f.close();
  }
});
test('rejected recovery remains blocked with durable denial', () => {
  const f = fixture();
  try {
    const p = f.store.read().proposals[0];
    f.plane.decide(p.id, 'reject');
    assert.equal(f.store.read().runs.find((r) => r.id === p.runId)!.status, 'blocked');
    assert.equal(f.store.read().receipts.at(-1)?.outcome, 'rejected');
  } finally {
    f.close();
  }
});
test('policy forbids stale terminal, wrong target and exhausted recovery', () => {
  for (const kind of ['terminal', 'target', 'limit']) {
    const f = fixture();
    try {
      const p = f.store.read().proposals[0];
      f.store.update((s) => {
        const r = s.runs.find((r) => r.id === p.runId)!;
        if (kind === 'terminal') r.status = 'aborted';
        if (kind === 'target') s.proposals[0].target = 'another-run';
        if (kind === 'limit') r.attempts = s.settings.retryLimit;
      });
      assert.throws(() => f.plane.decide(p.id, 'approve'), /policy/i);
      assert.equal(f.store.read().proposals[0].status, 'pending');
    } finally {
      f.close();
    }
  }
});
test('simulated pass requires validated artifact and receipt', () => {
  const f = fixture();
  try {
    const run = f.plane.createRun({
      projectId: 'project-atmem',
      name: 'Verification',
      objective: 'Run evaluation',
      runtime: 'codex',
    });
    for (let i = 0; i < 30; i++) f.plane.tick();
    const result = f.store.read().runs.find((r) => r.id === run.id)!;
    assert.equal(result.result, 'validated_pass');
    assert.ok(result.validatorReceiptId);
    assert.ok(
      f.store
        .read()
        .evidence.find((e) => e.id === result.artifact)
        ?.digest.match(/^[a-f0-9]{64}$/),
    );
  } finally {
    f.close();
  }
});
test('stopping twice is idempotent and stale proposal cannot resume', () => {
  const f = fixture();
  try {
    const p = f.store.read().proposals[0];
    f.plane.stop(p.runId);
    const count = f.store.read().receipts.length;
    f.plane.stop(p.runId);
    assert.equal(f.store.read().receipts.length, count);
    assert.throws(() => f.plane.decide(p.id, 'approve'), /policy/i);
  } finally {
    f.close();
  }
});
test('usage deduplicates invocation identity and keeps unknown amount', () => {
  const f = fixture();
  try {
    const u = f.store.read().usage.find((u) => u.amount === null)!;
    f.plane.recordUsage(u);
    assert.equal(f.store.read().usage.filter((x) => x.invocationId === u.invocationId).length, 1);
    assert.equal(f.store.read().usage.find((x) => x.id === u.id)!.amount, null);
  } finally {
    f.close();
  }
});
test('logs redact common secret formats', () => {
  assert.equal(
    redact('Authorization: Bearer secret-value token=abc123 sk-123456789abcdef'),
    'Authorization: Bearer [REDACTED] token=[REDACTED] [REDACTED]',
  );
});

test('all seeded evidence digests match the captured content', () => {
  const f = fixture();
  try {
    for (const evidence of f.store.read().evidence) {
      assert.equal(evidence.digest, createHash('sha256').update(evidence.content).digest('hex'));
    }
  } finally {
    f.close();
  }
});

test('concurrent simulated workers retain distinct event agent and session identities', () => {
  const f = fixture();
  try {
    const a = f.plane.createRun({
      projectId: 'project-atmem',
      name: 'First worker',
      objective: 'Check A',
      runtime: 'codex',
    });
    const b = f.plane.createRun({
      projectId: 'project-atmem',
      name: 'Second worker',
      objective: 'Check B',
      runtime: 'claude-code',
    });
    const events = f.store.read().events.filter((e) => e.type === 'run.started');
    const first = events.find((e) => e.runId === a.id)!;
    const second = events.find((e) => e.runId === b.id)!;
    assert.notEqual(first.agentId, second.agentId);
    assert.equal(first.nativeSessionId, a.nativeSessionId);
    assert.equal(second.nativeSessionId, b.nativeSessionId);
    assert.equal(second.runtime, 'claude-code');
  } finally {
    f.close();
  }
});
