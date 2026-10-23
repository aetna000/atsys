import { resolve } from 'node:path';
import { Store } from './store.js';
import { ControlPlane } from './control-plane.js';
import { createApp } from './app.js';
import { OperationsStore } from './operations/store.js';
import { ensureDaemon } from './operations/service.js';
const operations = new OperationsStore(resolve(process.env.ATSYS_DATA_DIR ?? '.atsys'));
ensureDaemon(operations);
const daemonTimer = setInterval(() => ensureDaemon(operations), 5000);
const port = Number(process.env.ATSYS_PORT ?? 4310);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('ATSYS_PORT must be 1024..65535');
const store = new Store(resolve(process.env.ATSYS_DATA_DIR ?? '.atsys'));
const plane = new ControlPlane(store);
plane.reconcile();
const server = createApp(plane, operations).listen(port, '127.0.0.1', () =>
  console.log(
    `AtSys local console: http://127.0.0.1:${port} · sample workspace explicitly simulated`,
  ),
);
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `Port ${port} is in use. Set ATSYS_PORT to another loopback port.`
      : error.message,
  );
  process.exitCode = 1;
  clearInterval(timer);
  clearInterval(daemonTimer);
  store.close();
});
const timer = setInterval(() => {
  try {
    plane.tick();
  } catch (error) {
    console.error(
      'Control-plane tick failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}, 2000);
function stop() {
  clearInterval(timer);
  clearInterval(daemonTimer);
  server.close(() => {
    store.close();
    operations.close();
    process.exit(0);
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
