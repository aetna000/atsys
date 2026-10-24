import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const location = fileURLToPath(import.meta.url);
export const packaged = extname(location) === '.mjs';
export const applicationRoot = packaged ? dirname(location) : resolve(dirname(location), '..');
const sourceEntries: Record<string, string> = {
  cli: 'server/cli.ts',
  index: 'server/index.ts',
  daemon: 'server/operations/daemon.ts',
  'attempt-runner': 'server/operations/attempt-runner.ts',
  'hook-runner': 'server/operations/hook-runner.ts',
  'native-hook': 'server/operations/native-hook.ts',
};
export function runtimeEntry(name: keyof typeof sourceEntries) {
  return packaged
    ? resolve(applicationRoot, `${name}.mjs`)
    : resolve(applicationRoot, sourceEntries[name]);
}
export function runtimeArgs(name: keyof typeof sourceEntries, ...args: string[]) {
  return packaged
    ? [runtimeEntry(name), ...args]
    : [
        '--import',
        resolve(applicationRoot, 'node_modules/tsx/dist/loader.mjs'),
        runtimeEntry(name),
        ...args,
      ];
}
