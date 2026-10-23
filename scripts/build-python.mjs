import { build } from 'esbuild';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const output = join(root, 'python/atsys/_runtime');
execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: {
    cli: 'server/cli.ts',
    index: 'server/index.ts',
    daemon: 'server/operations/daemon.ts',
    'attempt-runner': 'server/operations/attempt-runner.ts',
  },
  outdir: output,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outExtension: { '.js': '.mjs' },
  banner: {
    js: "import { createRequire as __atsysCreateRequire } from 'node:module'; const require = __atsysCreateRequire(import.meta.url);",
  },
  legalComments: 'linked',
  metafile: false,
});
cpSync(join(root, 'dist'), join(output, 'dist'), { recursive: true });
mkdirSync(join(output, 'examples'));
cpSync(join(root, 'examples/checkpoint-task.mjs'), join(output, 'examples/checkpoint-task.mjs'));
cpSync(
  join(root, 'examples/coding-task.json'),
  join(root, 'python/atsys/resources/coding-task.json'),
);
// Emit authoritative defaults/schema for installed agents without asking them to inspect a checkout.
execFileSync(
  process.execPath,
  [
    '--import',
    'tsx',
    '--input-type=module',
    '-e',
    `import {taskDefaults} from './shared/operations.ts'; import {configSchema} from './server/operations/config.ts'; import {z} from 'zod'; import {writeFileSync} from 'node:fs'; writeFileSync('python/atsys/resources/task-defaults.json',JSON.stringify(taskDefaults,null,2)+'\\n');writeFileSync('python/atsys/resources/task-schema.json',JSON.stringify(z.toJSONSchema(configSchema),null,2)+'\\n');`,
  ],
  { cwd: root, stdio: 'inherit' },
);
const packages = [];
for (const name of readdirSync(join(root, 'node_modules'))) {
  if (name.startsWith('.')) continue;
  if (name.startsWith('@'))
    for (const child of readdirSync(join(root, 'node_modules', name)))
      packages.push(join(root, 'node_modules', name, child));
  else packages.push(join(root, 'node_modules', name));
}
const notices = [];
for (const path of packages) {
  if (!existsSync(join(path, 'package.json'))) continue;
  const p = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
  const licenseFiles = readdirSync(path).filter((name) =>
    /^(license|notice|copying)(\.|$)/i.test(name),
  );
  notices.push(
    `${p.name}@${p.version} · ${typeof p.license === 'string' ? p.license : 'See included notice'}\n${licenseFiles
      .map((name) => {
        try {
          return readFileSync(join(path, name), 'utf8');
        } catch {
          return '';
        }
      })
      .join('\n')}`,
  );
}
writeFileSync(
  join(output, 'THIRD_PARTY_NOTICES.txt'),
  notices.join('\n\n--------------------\n\n'),
);
writeFileSync(
  join(output, 'build.json'),
  JSON.stringify(
    {
      version: '0.2.0',
      node: '24.x',
      entries: ['cli.mjs', 'index.mjs', 'daemon.mjs', 'attempt-runner.mjs'],
    },
    null,
    2,
  ) + '\n',
);
console.log('Prepared self-contained Python package runtime:', output);
