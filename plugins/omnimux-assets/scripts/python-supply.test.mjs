/** Run with node --test scripts/python-supply.test.mjs after the static audit. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, lstatSync, readlinkSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { manifest, runtimeRoot, sha256, verifyBytes } from './python-supply.mjs';

const pluginRoot = resolve(runtimeRoot, '..');
const helper = join(pluginRoot, 'src/storage-fs.py');
const native = manifest.artifacts.find(x => x.platform === process.platform && x.arch === process.arch);
assert.ok(native, 'Run on a real supported Darwin architecture; do not spoof arch.');
const executable = join(runtimeRoot, native.directory, native.executable);
const flags = manifest.executionFlags;
const audit = JSON.parse(readFileSync(join(runtimeRoot, 'evidence/static-audit.json'), 'utf8'));
const evidence = { host: { platform: process.platform, arch: process.arch, node: process.version }, executable,
  executableSha256: sha256(readFileSync(executable)), helperSha256: sha256(readFileSync(helper)), flags, checks: [] };

/** Verify all installed bytes and links against the pre-execution inventory. */
function verifyInventory(artifact) {
  const root = join(runtimeRoot, artifact.directory);
  const inventory = JSON.parse(readFileSync(join(runtimeRoot, 'evidence', `${artifact.arch}-inventory.json`), 'utf8'));
  const expected = new Map(inventory.entries.map(row => [row.path, row]));
  let count = 0;
  function walk(relative = '') {
    for (const name of readdirSync(join(root, relative))) {
      const path = join(relative, name);
      const row = expected.get(path);
      assert.ok(row, `unrecorded payload: ${path}`);
      const stat = lstatSync(join(root, path));
      assert.equal(stat.mode & 0o7777, row.mode);
      if (row.link !== undefined) assert.equal(readlinkSync(join(root, path)), row.link);
      else if (row.sha256) assert.equal(sha256(readFileSync(join(root, path))), row.sha256);
      else { assert.ok(stat.isDirectory()); walk(path); }
      count++;
    }
  }
  walk();
  assert.equal(count, inventory.entries.length);
  verifyBytes(readFileSync(join(runtimeRoot, 'archives', artifact.filename)), artifact.sha256, artifact.compressedBytes);
}

for (const artifact of manifest.artifacts) verifyInventory(artifact);
assert.equal(evidence.executableSha256, audit.find(x => x.arch === native.arch).executableSha256);
const fixtures = mkdtempSync(join(runtimeRoot, 'supply-test-'));
const home = join(fixtures, 'home');
const cwd = join(fixtures, 'cwd');
const emptyPath = join(fixtures, 'empty-path');
for (const path of [home, cwd, emptyPath]) mkdirSync(path, { mode: 0o700 });
const cleanEnv = { HOME: home, TMPDIR: fixtures, PATH: emptyPath, LANG: 'C', LC_ALL: 'C' };
const poisonedEnv = { ...cleanEnv, PYTHONHOME: cwd, PYTHONPATH: cwd, PYTHONUSERBASE: cwd, PYTHONSTARTUP: join(cwd, 'sitecustomize.py') };
writeFileSync(join(cwd, 'sitecustomize.py'), 'raise RuntimeError("USER_SITE_INJECTION")\n');
writeFileSync(join(cwd, 'json.py'), 'raise RuntimeError("CWD_INJECTION")\n');

function requestSync(request, env = cleanEnv) {
  const result = spawnSync(executable, [...flags, helper], { cwd, env, input: JSON.stringify({ id: 1, ...request }) + '\n', encoding: 'utf8', timeout: 15000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const responses = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  return responses.find(x => x.id === 1 && ('result' in x || 'error' in x));
}

await test('archive tampering and wrong size fail before extraction', () => {
  const bytes = Buffer.from('fixture');
  assert.throws(() => verifyBytes(bytes, '0'.repeat(64)), /integrity-mismatch/);
  assert.throws(() => verifyBytes(bytes, sha256(bytes), 0), /integrity-mismatch/);
  verifyBytes(bytes, sha256(bytes), bytes.length);
});
await test('PATH has no Python and native private helper probes successfully', () => {
  const missing = spawnSync('python3', ['--version'], { env: cleanEnv, cwd });
  assert.equal(missing.error?.code, 'ENOENT');
  const reply = requestSync({ op: 'probe' }, poisonedEnv);
  assert.deepEqual(reply.result, { supported: true, python: manifest.version, chunkBytes: 1048576 });
  evidence.checks.push('no-PATH-python native sync helper probe with poisoned PYTHON variables');
});
await test('isolated interpreter imports only private stdlib and verifies native dependencies', () => {
  const code = 'import sys,json,os,ssl,sqlite3,bz2,lzma,ctypes,fcntl,hashlib,unicodedata; print(json.dumps({"version":sys.version,"executable":sys.executable,"prefix":sys.prefix,"path":sys.path,"isolated":sys.flags.isolated,"no_site":sys.flags.no_site,"no_user_site":sys.flags.no_user_site,"ssl":ssl.OPENSSL_VERSION,"sqlite":sqlite3.sqlite_version,"sha256":hashlib.sha256(b"supply").hexdigest()}))';
  const result = spawnSync(executable, [...flags, '-c', code], { cwd, env: poisonedEnv, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  const identity = JSON.parse(result.stdout);
  assert.equal(identity.executable, executable);
  assert.equal(identity.isolated, 1);
  assert.equal(identity.no_site, 1);
  assert.equal(identity.no_user_site, 1);
  assert.ok(identity.path.every(path => path.startsWith(join(runtimeRoot, native.directory))));
  evidence.identity = identity;
});
await test('real narrow helper writes, reads, hashes and rejects symlink targets', () => {
  const value = { schema: 1, title: '供应隔离样本' };
  assert.ok(requestSync({ op: 'json', root: cwd, rel: 'ledger.json', value }).result.sha256);
  assert.deepEqual(requestSync({ op: 'read', root: cwd, rel: 'ledger.json' }).result, value);
  const bytes = readFileSync(join(cwd, 'ledger.json'));
  assert.equal(requestSync({ op: 'hash', root: cwd, rel: 'ledger.json' }).result.sha256, sha256(bytes));
  symlinkSync('ledger.json', join(cwd, 'alias.json'));
  assert.ok(requestSync({ op: 'read', root: cwd, rel: 'alias.json' }).error);
  assert.equal(sha256(readFileSync(join(cwd, 'ledger.json'))), sha256(bytes));
  evidence.checks.push('native no-follow JSON atomic write/read/hash and symlink denial');
});
await test('async worker streams from same interpreter and enforces flock', async () => {
  const worker = spawn(executable, [...flags, helper], { cwd, env: cleanEnv, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '';
  let sequence = 0;
  const pending = new Map();
  worker.stdout.on('data', chunk => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const row = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      if ('result' in row || 'error' in row) { pending.get(row.id)?.(row); pending.delete(row.id); }
    }
  });
  const request = async values => {
    const id = ++sequence;
    const response = new Promise(resolve => pending.set(id, resolve));
    worker.stdin.write(JSON.stringify({ id, ...values }) + '\n');
    return response;
  };
  const timer = setTimeout(() => worker.kill(), 15000);
  try {
    assert.equal((await request({ op: 'probe' })).result.python, manifest.version);
    const lock = (await request({ op: 'lock', root: cwd, rel: 'writer.lock' })).result;
    assert.equal(requestSync({ op: 'lock', root: cwd, rel: 'writer.lock' }).error.code, 'storage-busy');
    const stream = (await request({ op: 'stream_open', root: cwd, rel: 'ledger.json' })).result;
    const chunk = (await request({ op: 'stream_read', key: stream.key })).result;
    assert.equal(chunk.eof, true);
    assert.deepEqual(Buffer.from(chunk.data, 'base64'), readFileSync(join(cwd, 'ledger.json')));
    assert.equal((await request({ op: 'unlock', key: lock.key })).result, true);
    worker.stdin.end();
    const [code] = await once(worker, 'close');
    assert.equal(code, 0);
    evidence.checks.push('native async same binary, bounded FD stream, competing process flock');
  } finally { clearTimeout(timer); if (worker.exitCode === null) worker.kill(); }
});

for (const artifact of manifest.artifacts) verifyInventory(artifact);
writeFileSync(join(runtimeRoot, 'evidence', `${native.arch}-execution.json`), JSON.stringify(evidence, null, 2) + '\n');
rmSync(fixtures, { recursive: true });
