import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withDefaults } from '../server/operations/config.js';
import { codexInvocation, proposalParser } from '../server/operations/codex.js';
import { setupDoctor } from '../server/operations/doctor.js';
import { createTask } from '../server/operations/tasks.js';
import { OperationsStore } from '../server/operations/store.js';
import type { Attempt } from '../shared/operations.js';

test('Codex role handoff includes goal, permissions, validation and recovery; network is opt-in', () => {
  const root = mkdtempSync(join(tmpdir(), 'atsys-goal-contract-'));
  const store = new OperationsStore(join(root, 'data'));
  try {
    const t = createTask(
      store,
      withDefaults({
        name: 'Goal',
        objective: 'Recover local benchmark assets',
        cwd: root,
        worker: 'codex',
        plan: 'Use verified stable runtime; preserve old600',
        validator: 'command',
        validationArgv: [process.execPath, '-e', 'process.exit(0)'],
      }),
    );
    assert.match(t.config.progressFile, new RegExp(t.id));
    assert.equal(t.config.progressTimeoutSeconds, 600);
    const prior = {
      id: 'diagnosis',
      phase: 'supervisor',
      status: 'succeeded',
      proposal: {
        action: 'restart',
        reason: 'Recoverable setup',
        instructions: 'Restore pinned source into local workspace',
      },
      config: t.config,
      output: '',
    } as Attempt;
    t.attempts.push(prior);
    const worker = { id: 'worker', phase: 'worker', config: t.config } as Attempt;
    const w = codexInvocation(t, worker, 'schema', 'result');
    assert.match(w.prompt, /Restore pinned source/);
    assert.match(w.prompt, /Use verified stable runtime/);
    assert.match(w.prompt, /write meaningful progress/i);
    assert.ok(!w.argv.includes('sandbox_workspace_write.network_access=true'));
    worker.config = { ...t.config, networkAccess: true };
    assert.ok(
      codexInvocation(t, worker, 'schema', 'result').argv.includes(
        'sandbox_workspace_write.network_access=true',
      ),
    );
    const s = codexInvocation(t, { ...worker, phase: 'supervisor' }, 'schema', 'result');
    assert.match(s.prompt, /empty argv\/resumeArgv are valid/i);
    assert.match(s.prompt, /Use verified stable runtime/);
    assert.match(s.prompt, /attemptedRemedies/);
    assert.ok(!s.argv.includes('sandbox_workspace_write.network_access=true'));
    const repair = codexInvocation(t, { ...worker, phase: 'repair' }, 'schema', 'result');
    assert.match(repair.prompt, /Use verified stable runtime/);
    assert.match(repair.prompt, /Restore pinned source/);
    const explicit = createTask(
      store,
      withDefaults({
        name: 'Opt out',
        objective: 'Deliberately use activity monitoring only',
        cwd: root,
        worker: 'codex',
        goalMonitoring: false,
      }),
    );
    assert.equal(explicit.config.progressFile, '');
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('doctor creates only owned storage, proves write/read pilot and detects missing executables', () => {
  const root = mkdtempSync(join(tmpdir(), 'atsys-doctor-'));
  try {
    writeFileSync(join(root, 'user.txt'), 'preserve');
    const c = withDefaults({
      name: 'Doctor',
      objective: 'Check setup',
      cwd: root,
      argv: [process.execPath],
      recovery: 'notify',
    });
    const good = setupDoctor(root, c);
    assert.equal(good.ready, true);
    assert.ok(good.repairs.length);
    assert.equal(readFileSync(join(root, 'user.txt'), 'utf8'), 'preserve');
    const bad = setupDoctor(root, { ...c, argv: ['atsys-intentionally-missing-executable'] });
    assert.equal(bad.ready, false);
    assert.match(bad.checks.find((c) => !c.passed)!.detail, /unavailable/);
    assert.equal(setupDoctor(root, c).repairs.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('doctor refuses a setup-directory symlink outside the workspace', () => {
  const root = mkdtempSync(join(tmpdir(), 'atsys-doctor-link-'));
  const other = mkdtempSync(join(tmpdir(), 'atsys-doctor-outside-'));
  try {
    symlinkSync(other, join(root, '.atsys'));
    const r = setupDoctor(root);
    assert.equal(r.ready, false);
    assert.match(r.checks.find((c) => c.name === 'write-read-pilot')!.detail, /outside/);
    assert.equal(existsSync(join(other, 'probe.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  }
});

test('concrete blocker contract requires evidence, remedies and a resolution', () => {
  assert.throws(() =>
    proposalParser.parse({
      action: 'escalate',
      reason: 'Blocked',
      instructions: '',
      blocker: { kind: 'resource', evidence: [], attemptedRemedies: [], requiredResolution: '' },
    }),
  );
  assert.equal(
    proposalParser.parse({
      action: 'escalate',
      reason: 'Missing volume',
      instructions: '',
      blocker: {
        kind: 'external_dependency',
        evidence: ['mount inventory receipt'],
        attemptedRemedies: ['Checked authorized local and remote copies'],
        requiredResolution: 'Reconnect original encrypted data volume',
      },
    }).blocker?.kind,
    'external_dependency',
  );
});
