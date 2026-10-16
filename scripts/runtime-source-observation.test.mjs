import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { observeLoadedSource } from './runtime-source-observation.mjs';

const root = dirname(fileURLToPath(import.meta.url));

function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'obs-'));
  return {
    dir,
    expected: join(dir, 'expected.mjs'),
    decoyDir: join(dir, 'decoy'),
    entry: join(dir, 'entry.mjs'),
    write(file, text) { writeFileSync(file, text); },
  };
}

test('observes the parsed script bytes exactly for a controlled entry', async () => {
  const f = makeFixture();
  try {
    f.write(f.expected, 'export const value = 37;\n');
    f.write(f.entry, `import { value } from './expected.mjs';\nif (value !== 37) throw new Error('unexpected');\nconsole.log('SOURCE_OBSERVATION_DONE');\nprocess.stdin.resume();\n`);
    const result = await observeLoadedSource({
      rootDir: f.dir,
      entryName: 'entry.mjs',
      expectedName: 'expected.mjs',
      timeoutMs: 15000,
    });
    assert.equal(result.status, 'observed');
    assert.equal(result.scope, 'controlled-esm-only');
    assert.equal(result.activation, 'not-proven');
    assert.equal(result.productLoaded, 'not-tested');
    assert.equal(result.url.startsWith('file://'), true);
    assert.equal(result.isModule, true);
    assert.equal(result.bytes > 0, true);
    assert.match(result.sha256, /^[0-9a-f]{64}$/);
    assert.equal(result.matching, 1);
    assert.equal(result.decoyAbsent, true);
    assert.equal(result.exit.code, 0);
    assert.equal(result.exit.signal, null);
    assert.equal(result.observations.childPid > 0, true);
    assert.ok(result.rawReceipts.stdout.includes('SOURCE_OBSERVATION_DONE'));
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('reports decoy absent when no decoy is supplied', async () => {
  const f = makeFixture();
  try {
    f.write(f.expected, 'export const value = 37;\n');
    f.write(f.entry, `import { value } from './expected.mjs';\nconsole.log('SOURCE_OBSERVATION_DONE');\nprocess.stdin.resume();\n`);
    const result = await observeLoadedSource({ rootDir: f.dir, entryName: 'entry.mjs', expectedName: 'expected.mjs' });
    assert.equal(result.status, 'observed');
    assert.equal(result.decoyAbsent, true);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('rejects a decoy that is actually imported by the entry', async () => {
  const f = makeFixture();
  try {
    mkdirSync(f.decoyDir, { recursive: true });
    f.write(f.expected, 'export const value = 37;\n');
    f.write(join(f.decoyDir, 'expected.mjs'), 'export const value = 999;\n');
    f.write(f.entry, `import { value } from './expected.mjs';\nimport './decoy/expected.mjs';\nconsole.log('SOURCE_OBSERVATION_DONE');\nprocess.stdin.resume();\n`);
    await assert.rejects(
      observeLoadedSource({ rootDir: f.dir, entryName: 'entry.mjs', expectedName: 'expected.mjs', decoyName: 'decoy/expected.mjs' }),
      { code: 'SOURCE_OBSERVATION_DECOY_LOADED' },
    );
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('rejects when the entry does not load the expected file', async () => {
  const f = makeFixture();
  try {
    f.write(f.expected, 'export const value = 37;\n');
    f.write(join(f.dir, 'other.mjs'), 'export const value = 1;\n');
    f.write(f.entry, `import { value } from './other.mjs';\nconsole.log('SOURCE_OBSERVATION_DONE');\nprocess.stdin.resume();\n`);
    await assert.rejects(
      observeLoadedSource({ rootDir: f.dir, entryName: 'entry.mjs', expectedName: 'expected.mjs' }),
      { code: 'SOURCE_OBSERVATION_SOURCE_NOT_LOADED' },
    );
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('rejects a non-zero child exit without calling it success', async () => {
  const f = makeFixture();
  try {
    f.write(f.expected, 'export const value = 37;\n');
    f.write(f.entry, `import { value } from './expected.mjs';\nthrow new Error('boom');\n`);
    await assert.rejects(
      observeLoadedSource({ rootDir: f.dir, entryName: 'entry.mjs', expectedName: 'expected.mjs' }),
      { code: 'SOURCE_OBSERVATION_CHILD_EXIT' },
    );
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('rejects missing or unsafe arguments before doing anything', async () => {
  await assert.rejects(observeLoadedSource({}), { code: 'SOURCE_OBSERVATION_ROOT_REQUIRED' });
  await assert.rejects(observeLoadedSource({ rootDir: '/tmp/obs-x', entryName: '/abs/m.mjs', expectedName: 'x.mjs' }), { code: 'SOURCE_OBSERVATION_ARGUMENT' });
  await assert.rejects(observeLoadedSource({ rootDir: '/tmp/obs-x', entryName: '../up.mjs', expectedName: 'x.mjs' }), { code: 'SOURCE_OBSERVATION_ARGUMENT' });
});
