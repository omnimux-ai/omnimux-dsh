import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync } from 'node:fs';
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

test('rejects an EOF-resistant entry only after confirmed child cleanup', async (t) => {
  const f = makeFixture();
  const ownerRoot = realpathSync(f.dir);
  const pidFile = join(f.dir, 'child-owner.json');
  const fallback = { ownerRoot, childPid: null, signals: [], probes: [], gone: false };
  let timer;
  let observationError;
  let observationResult;
  try {
    f.write(f.expected, 'export const value = 37;\n');
    f.write(f.entry, `import { value } from './expected.mjs';\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(pidFile)}, JSON.stringify({ ownerRoot: ${JSON.stringify(ownerRoot)}, entryPath: ${JSON.stringify(f.entry)}, childPid: process.pid, parentPid: process.ppid }));\nif (value !== 37) throw new Error('unexpected');\nconsole.log('SOURCE_OBSERVATION_DONE');\nsetInterval(() => {}, 1000);\n`);
    try {
      observationResult = await Promise.race([
        observeLoadedSource({ rootDir: f.dir, entryName: 'entry.mjs', expectedName: 'expected.mjs', timeoutMs: 3000 }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('test observation wait exceeded 10000ms')), 10000);
        }),
      ]);
    } catch (error) {
      observationError = error;
    } finally {
      clearTimeout(timer);
    }
    const record = JSON.parse(readFileSync(pidFile, 'utf8'));
    assert.equal(record.ownerRoot, ownerRoot);
    assert.equal(record.entryPath, f.entry);
    assert.equal(record.parentPid, process.pid);
    assert.ok(Number.isSafeInteger(record.childPid) && record.childPid > 1 && record.childPid !== process.pid);
    assert.equal(observationResult, undefined, 'a forced child cleanup must not report observed');
    assert.ok(observationError, 'an EOF-resistant entry must reject');
    assert.equal(observationError.code, 'SOURCE_OBSERVATION_CHILD_EXIT_TIMEOUT');
    assert.equal(observationError.cleanup.ownerRoot, ownerRoot);
    assert.equal(observationError.cleanup.childPid, record.childPid);
    assert.equal(observationError.cleanup.childClosed, true);
    assert.deepEqual(observationError.cleanup.exit, { code: null, signal: 'SIGTERM' });
    assert.deepEqual(observationError.cleanup.close, { code: null, signal: 'SIGTERM' });
    assert.equal(observationError.cleanup.websocketClosed, true);
    assert.throws(() => process.kill(record.childPid, 0), { code: 'ESRCH' });
  } finally {
    clearTimeout(timer);
    t.diagnostic(JSON.stringify({ observationError: observationError && { message: observationError.message, code: observationError.code, cleanup: observationError.cleanup }, observationResult }));
    try {
      const record = JSON.parse(readFileSync(pidFile, 'utf8'));
      assert.equal(record.ownerRoot, ownerRoot);
      assert.equal(record.entryPath, f.entry);
      assert.equal(record.parentPid, process.pid);
      assert.ok(Number.isSafeInteger(record.childPid) && record.childPid > 1 && record.childPid !== process.pid);
      fallback.childPid = record.childPid;
      for (const signal of ['SIGTERM', 'SIGKILL']) {
        try {
          process.kill(record.childPid, 0);
          fallback.probes.push('alive');
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
          fallback.probes.push('ESRCH');
          fallback.gone = true;
          break;
        }
        assert.deepEqual(JSON.parse(readFileSync(pidFile, 'utf8')), record, 'owner record must remain identical before signaling');
        try {
          process.kill(record.childPid, signal);
          fallback.signals.push(signal);
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
          fallback.probes.push('ESRCH');
          fallback.gone = true;
          break;
        }
        const deadline = Date.now() + 1500;
        while (Date.now() < deadline) {
          try { process.kill(record.childPid, 0); } catch (error) {
            if (error.code !== 'ESRCH') throw error;
            fallback.probes.push('ESRCH');
            fallback.gone = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        if (fallback.gone) break;
      }
      assert.equal(fallback.gone, true, 'owned child must disappear within bounded fallback cleanup');
      assert.throws(() => process.kill(record.childPid, 0), { code: 'ESRCH' });
      rmSync(f.dir, { recursive: true, force: true });
    } finally {
      t.diagnostic(JSON.stringify({ fallback }));
    }
  }
});

test('rejects missing or unsafe arguments before doing anything', async () => {
  await assert.rejects(observeLoadedSource({}), { code: 'SOURCE_OBSERVATION_ROOT_REQUIRED' });
  await assert.rejects(observeLoadedSource({ rootDir: '/tmp/obs-x', entryName: '/abs/m.mjs', expectedName: 'x.mjs' }), { code: 'SOURCE_OBSERVATION_ARGUMENT' });
  await assert.rejects(observeLoadedSource({ rootDir: '/tmp/obs-x', entryName: '../up.mjs', expectedName: 'x.mjs' }), { code: 'SOURCE_OBSERVATION_ARGUMENT' });
});
