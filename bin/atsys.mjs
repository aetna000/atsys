#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('../server/cli.ts', import.meta.url));
const child = spawn(
  process.execPath,
  [
    '--import',
    fileURLToPath(new URL('../node_modules/tsx/dist/loader.mjs', import.meta.url)),
    cli,
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
