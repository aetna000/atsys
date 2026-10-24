import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import metadata from '../package.json' with { type: 'json' };
import { VERSION } from '../shared/version.js';

test('release version agrees across Python, application and lockfile', () => {
  const root = new URL('../', import.meta.url);
  const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
  assert.equal(read('pyproject.toml').match(/^version = "([^"]+)"/m)?.[1], VERSION);
  assert.equal(read('python/atsys/__init__.py').match(/__version__ = "([^"]+)"/)?.[1], VERSION);
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.version, metadata.version);
  assert.equal(lock.packages[''].version, metadata.version);
  const normalized = metadata.version
    .replace(/-alpha\.(\d+)$/, 'a$1')
    .replace(/-beta\.(\d+)$/, 'b$1')
    .replace(/-rc\.(\d+)$/, 'rc$1');
  assert.equal(normalized, VERSION);
});
