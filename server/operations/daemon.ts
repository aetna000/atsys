import { resolve } from 'node:path';
import { OperationsStore } from './store.js';
import { Watchdog } from './watchdog.js';
import { deliverNext } from './telegram.js';
const store = new OperationsStore(
  resolve(process.argv[2] ?? process.env.ATSYS_DATA_DIR ?? '.atsys'),
);
const watchdog = new Watchdog(store);
if (!watchdog.claim()) {
  store.close();
  process.exit(0);
}
let delivering = false;
function tick() {
  try {
    if (store.read().daemon?.owner !== watchdog.owner) {
      store.close();
      process.exit(0);
    }
    watchdog.tick();
    if (!delivering) {
      delivering = true;
      void deliverNext(store, watchdog.owner)
        .catch(() => {})
        .finally(() => {
          delivering = false;
        });
    }
  } catch {
    console.error('Watchdog tick failed; durable state retained. Retrying.');
  }
}
tick();
const timer = setInterval(tick, 1000);
function stop() {
  clearInterval(timer);
  store.update((s) => {
    if (s.daemon?.owner === watchdog.owner) s.daemon = null;
  });
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
