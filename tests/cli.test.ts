import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const cli = resolve('bin/atsys.mjs');
test('CLI attaches and detaches without rewriting project data, then runs explicit argv', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atsys-cli-'));
  const repo = join(dir, 'project');
  mkdirSync(repo);
  execFileSync('git', ['init', '--quiet', repo]);
  writeFileSync(join(repo, 'source.txt'), 'source remains intact\n');
  writeFileSync(join(repo, '.git/hooks/pre-commit'), 'existing hook\n');
  const invoke = (args: string[]) =>
    execFileSync(process.execPath, [cli, ...args], {
      cwd: repo,
      env: { ...process.env, ATSYS_DATA_DIR: join(dir, 'control') },
      encoding: 'utf8',
    });
  try {
    assert.match(invoke(['init', '--project', repo]), /Attached/);
    assert.ok(existsSync(join(repo, '.atsys/project.json')));
    assert.match(
      invoke([
        'run',
        '--attached',
        '--project',
        repo,
        '--validator',
        'exit-code',
        '--',
        process.execPath,
        '-e',
        'console.log("managed command")',
      ]),
      /validated_pass/,
    );
    assert.match(invoke(['status']), /completed/);
    assert.match(invoke(['uninstall', '--project', repo]), /preserved/);
    assert.equal(existsSync(join(repo, '.atsys/project.json')), false);
    assert.equal(readFileSync(join(repo, 'source.txt'), 'utf8'), 'source remains intact\n');
    assert.equal(readFileSync(join(repo, '.git/hooks/pre-commit'), 'utf8'), 'existing hook\n');
    assert.ok(existsSync(join(dir, 'control/control-plane.sqlite')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
