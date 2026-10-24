import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import type { Server } from 'node:http';
import { Store } from '../server/store.js';
import { ControlPlane } from '../server/control-plane.js';
import { createApp } from '../server/app.js';
import { OperationsStore } from '../server/operations/store.js';
import { withDefaults } from '../server/operations/config.js';
import { killAttempt } from '../server/operations/processes.js';
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const close = (s: Server) =>
  new Promise<void>((resolve, reject) => s.close((e) => (e ? reject(e) : resolve())));
test('direct task links work under hidden installation directories without exposing dotfiles', async () => {
  const root = mkdtempSync(join(tmpdir(), 'atsys-deep-link-'));
  const publicRoot = join(root, '.hidden-install', 'dist');
  mkdirSync(publicRoot, { recursive: true });
  writeFileSync(join(publicRoot, 'index.html'), '<html>AtSys public app</html>');
  writeFileSync(join(publicRoot, '.private'), 'never expose this');
  const store = new Store(join(root, 'state'));
  const server = createApp(new ControlPlane(store), undefined, publicRoot).listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    for (const path of ['/', '/tasks/existing-task', '/.private']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), '<html>AtSys public app</html>');
    }
    assert.equal((await fetch(base + '/api/not-a-route')).status, 404);
  } finally {
    await close(server);
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test('managed task survives API shutdown; task config and notification secrets enforce API boundaries', async () => {
  const root = mkdtempSync(join(tmpdir(), 'atsys-api-durable-'));
  const store = new Store(root);
  const ops = new OperationsStore(root);
  const plane = new ControlPlane(store);
  let server: Server | undefined;
  async function start() {
    server = createApp(plane, ops).listen(0, '127.0.0.1');
    await new Promise<void>((r) => server!.once('listening', r));
    return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }
  try {
    let base = await start();
    const request = (path: string, body: unknown, method = 'POST', origin?: string) =>
      fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
        body: JSON.stringify(body),
      });
    const config = withDefaults({
      name: 'Survives dashboard closure',
      objective: 'Finish execution while the HTTP service is offline',
      cwd: root,
      argv: [process.execPath, '-e', `setTimeout(()=>console.log('finished independently'),1500)`],
      recovery: 'notify',
    });
    assert.equal(
      (await request('/api/tasks', config, 'POST', 'https://foreign.example')).status,
      403,
    );
    const submitted = await request('/api/tasks', config);
    assert.equal(submitted.status, 201);
    const task = (await submitted.json()) as { id: string };
    assert.equal(
      (await request(`/api/tasks/${task.id}`, { config, revision: 99 }, 'PATCH')).status,
      409,
    );
    const token = '654321:abcdefghijklmnopqrstuv';
    const tg = await request(
      '/api/telegram',
      {
        enabled: false,
        chatId: '1234',
        token,
        onIncident: true,
        onRecovery: true,
        onCompletion: true,
        maxAttempts: 2,
      },
      'PATCH',
    );
    assert.equal(tg.status, 200);
    assert.equal(JSON.stringify(await tg.json()).includes(token), false);
    assert.equal((await request('/api/telegram/test', {})).status, 409);
    await close(server!);
    server = undefined;
    for (let i = 0; i < 100; i++) {
      if (ops.read().tasks.find((t) => t.id === task.id)?.status === 'completed') break;
      await pause(100);
    }
    assert.equal(ops.read().tasks[0].status, 'completed');
    base = await start();
    const state = (await (await fetch(base + '/api/operations')).json()) as {
      tasks: { id: string; status: string }[];
    };
    assert.equal(state.tasks[0].id, task.id);
    assert.equal(state.tasks[0].status, 'completed');
    assert.equal(JSON.stringify(state).includes(token), false);
  } finally {
    if (server) await close(server);
    const s = ops.read();
    for (const t of s.tasks) for (const a of t.attempts) if (!a.cleanupConfirmed) killAttempt(a);
    if (s.daemon) {
      try {
        const cmd = execFileSync('ps', ['-p', String(s.daemon.pid), '-o', 'command='], {
          encoding: 'utf8',
        });
        if (cmd.includes('operations/daemon.ts') && cmd.includes(root))
          process.kill(s.daemon.pid, 'SIGTERM');
      } catch {
        /*gone*/
      }
    }
    await pause(200);
    ops.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
