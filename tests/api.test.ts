import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { ControlPlane } from '../server/control-plane.js';
test('API rejects unsafe origins, malformed input and contradictory decisions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atsys-api-'));
  const store = new Store(dir);
  const server = createApp(new ControlPlane(store)).listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const request = (path: string, body: unknown, origin?: string) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await fetch(base + '/api/health')).status, 200);
    assert.equal((await request('/api/runs', {}, 'https://evil.example')).status, 403);
    assert.equal((await request('/api/runs', {})).status, 400);
    const r = await request('/api/runs', {
      projectId: 'project-atmem',
      name: 'API smoke',
      objective: 'Validate API lifecycle',
      runtime: 'codex',
    });
    assert.equal(r.status, 201);
    const run = (await r.json()) as { id: string };
    assert.equal((await request(`/api/runs/${run.id}/stop`, {})).status, 200);
    assert.equal(
      (await request('/api/proposals/proposal-0042/decision', { decision: 'approve' })).status,
      200,
    );
    assert.equal(
      (await request('/api/proposals/proposal-0042/decision', { decision: 'reject' })).status,
      409,
    );
    assert.equal(
      (
        await fetch(base + '/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dailyBudget: -1 }),
        })
      ).status,
      400,
    );
    assert.equal((await request('/api/projects', { name: 'Repo', path: 'relative' })).status, 400);
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
