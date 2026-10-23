import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { ControlPlane, validateResult } from '../server/control-plane.js';
import { executeProcess } from '../server/process-adapter.js';
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'atsys-process-'));
  const store = new Store(join(dir, 'data'));
  const plane = new ControlPlane(store);
  const project = plane.createProject({ name: 'Test repo', path: dir });
  return {
    dir,
    store,
    plane,
    project,
    close() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test('exit zero without declared validator remains incomplete', async () => {
  const f = fixture();
  try {
    const r = await executeProcess(f.plane, {
      projectId: f.project.id,
      cwd: f.dir,
      argv: [process.execPath, '-e', 'console.log("hello")'],
      timeoutSeconds: 5,
    });
    assert.equal(r.result, 'incomplete');
    assert.equal(r.status, 'blocked');
    assert.equal(
      f.store
        .read()
        .evidence.find((e) => e.id === r.artifact)
        ?.content.trim(),
      'hello',
    );
  } finally {
    f.close();
  }
});
test('explicit exit-code validator produces receipt and output digest', async () => {
  const f = fixture();
  try {
    const r = await executeProcess(f.plane, {
      projectId: f.project.id,
      cwd: f.dir,
      argv: [process.execPath, '-e', 'console.log("token=private-value")'],
      timeoutSeconds: 5,
      validator: 'exit-code',
    });
    assert.equal(r.result, 'validated_pass');
    assert.ok(r.validatorReceiptId);
    assert.ok(f.store.read().evidence.find((e) => e.id === r.artifact)?.digest);
    assert.match(f.store.read().evidence.find((e) => e.id === r.artifact)!.content, /\[REDACTED\]/);
  } finally {
    f.close();
  }
});
test('fresh benchmark artifact is validated; existing unchanged output is rejected', async () => {
  const f = fixture();
  try {
    const artifact = JSON.stringify({ total: 10, completed: 10, accuracy: 0.9, passed: true });
    const r = await executeProcess(f.plane, {
      projectId: f.project.id,
      cwd: f.dir,
      argv: [
        process.execPath,
        '-e',
        `require('fs').writeFileSync('results.json',${JSON.stringify(artifact)})`,
      ],
      timeoutSeconds: 5,
      validator: 'benchmark-json',
      artifact: 'results.json',
    });
    assert.equal(r.result, 'validated_pass');
    const stale = await executeProcess(f.plane, {
      projectId: f.project.id,
      cwd: f.dir,
      argv: [process.execPath, '-e', 'process.exit(0)'],
      timeoutSeconds: 5,
      validator: 'benchmark-json',
      artifact: 'results.json',
    });
    assert.equal(stale.result, 'validated_fail');
    assert.match(
      f.store.read().receipts.find((x) => x.id === stale.validatorReceiptId)!.detail,
      /unchanged/,
    );
  } finally {
    f.close();
  }
});
test('failed and timed-out process never claims completion', async () => {
  const f = fixture();
  try {
    const failed = await executeProcess(f.plane, {
      projectId: f.project.id,
      cwd: f.dir,
      argv: [process.execPath, '-e', 'process.exit(2)'],
      timeoutSeconds: 5,
      validator: 'exit-code',
    });
    assert.equal(failed.result, 'validated_fail');
    const timeout = await executeProcess(f.plane, {
      projectId: f.project.id,
      cwd: f.dir,
      argv: [process.execPath, '-e', 'setInterval(()=>{},100)'],
      timeoutSeconds: 1,
      validator: 'exit-code',
    });
    assert.equal(timeout.result, 'validated_fail');
    assert.match(
      f.store.read().receipts.find((x) => x.id === timeout.validatorReceiptId)!.detail,
      /timeout/,
    );
  } finally {
    f.close();
  }
});
test('API/CLI stop cancels only the managed process', async () => {
  const f = fixture();
  try {
    const running = executeProcess(f.plane, {
      projectId: f.project.id,
      cwd: f.dir,
      argv: [process.execPath, '-e', 'setInterval(()=>{},100)'],
      timeoutSeconds: 5,
      validator: 'exit-code',
    });
    const r = f.store.read().runs.find((r) => r.adapter === 'local-process')!;
    f.plane.stop(r.id);
    const result = await running;
    assert.equal(result.result, 'aborted');
    assert.ok(f.store.read().receipts.some((x) => x.runId === r.id && x.operation === 'stop'));
  } finally {
    f.close();
  }
});
test('out-of-root artifacts and invalid result objects are rejected', async () => {
  const f = fixture();
  try {
    await assert.rejects(
      () =>
        executeProcess(f.plane, {
          projectId: f.project.id,
          cwd: f.dir,
          argv: [process.execPath, '-e', ''],
          timeoutSeconds: 5,
          artifact: '../secret.json',
        }),
      /within project root/,
    );
    assert.equal(
      validateResult({ total: 10, completed: 10, accuracy: NaN, passed: true }).pass,
      false,
    );
    assert.equal(
      validateResult({ total: 10, completed: 9, accuracy: 0.9, passed: true }).pass,
      false,
    );
  } finally {
    f.close();
  }
});

test('split output secrets and JSON credentials are redacted before persistence', async () => {
  const f = fixture();
  try {
    const r = await executeProcess(f.plane, {
      projectId: f.project.id,
      cwd: f.dir,
      argv: [
        process.execPath,
        '-e',
        'process.stdout.write("token=");setTimeout(()=>console.log("split-private-value"),30);setTimeout(()=>console.log(JSON.stringify({password:"json-private-value"})),60)',
      ],
      timeoutSeconds: 5,
      validator: 'exit-code',
    });
    const content = f.store.read().evidence.find((e) => e.id === r.artifact)!.content;
    assert.doesNotMatch(content, /split-private-value|json-private-value/);
    assert.match(content, /REDACTED/);
  } finally {
    f.close();
  }
});
