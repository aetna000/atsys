// A real, harmless multi-step recovery drill: deliberately crash once, then resume checkpoint.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const directory = resolve(process.argv[2] ?? '.');
mkdirSync(directory, { recursive: true });
const checkpoint = join(directory, 'progress.json');
const marker = join(directory, 'failed-once');
let completed = existsSync(checkpoint) ? JSON.parse(readFileSync(checkpoint, 'utf8')).completed : 0;
const total = 12;
const timer = setInterval(() => {
  completed++;
  writeFileSync(checkpoint, JSON.stringify({ completed, total, checkpoint: `step-${completed}` }));
  console.log(`Completed step ${completed}/${total}`);
  if (completed === 4 && !existsSync(marker)) {
    writeFileSync(marker, 'intentional recovery drill');
    console.error('Recovery drill: intentional first-attempt failure. Checkpoint is saved.');
    process.exit(17);
  }
  if (completed >= total) {
    clearInterval(timer);
    writeFileSync(join(directory, 'result.json'), JSON.stringify({ completed, total, passed: true, accuracy: 0.92 }));
    console.log('All steps completed; result artifact written.');
  }
}, 1000);
