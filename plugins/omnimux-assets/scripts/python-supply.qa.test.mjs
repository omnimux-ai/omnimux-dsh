/** Independent #766 supply QA. Offline, no production resolver import, payload read-only. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zstdDecompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import {
  chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifest, runtimeRoot, verifyBytes } from './python-supply.mjs';

const plugin = resolve(runtimeRoot, '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const inside = (root, path) => path.startsWith(root + sep);
const pinned = {
  arm64: ['ebcf53fe921c356ad2eecfcea370cb744e7bd96fdef41a53e1e8f32a15c6dfeb', '298d21ab43a8940a867fe356aca16bb216a2129f8df7f23a6a52e8bfa37446fa', '11.0', 0x100000c],
  x64: ['6704f2a981d7ea358d6a7ef4f2be2457d17a65ca096b466924f469eefc1c3d70', '29004fa50d925259627f7ad7f0a134f9dc7204bd09317e02226af8b188489ef2', '10.15', 0x1000007],
};
function run(file, args, options = {}) {
  const result = spawnSync(file, args, {
    encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024,
    env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' }, ...options,
  });
  assert.ifError(result.error);
  return result;
}
function ok(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.signal, null);
  return result.stdout;
}
function inventory(root, prefix = '') {
  const rows = [];
  for (const name of readdirSync(join(root, prefix)).sort()) {
    const path = join(prefix, name);
    const info = lstatSync(join(root, path));
    const row = { path, mode: info.mode & 0o7777 };
    if (info.isSymbolicLink()) row.link = readlinkSync(join(root, path));
    else if (info.isDirectory()) rows.push(...inventory(root, path));
    else {
      assert.ok(info.isFile(), `special file: ${path}`);
      const bytes = readFileSync(join(root, path));
      row.bytes = bytes.length;
      row.sha256 = digest(bytes);
    }
    rows.push(row);
  }
  return rows;
}
// Full supply snapshot includes archives, evidence and notices, not just executable bytes.
const before = inventory(runtimeRoot);
const supplySources = ['python-supply.mjs', 'python-supply-audit.mjs', 'python-supply-metadata.mjs', 'python-supply-notices.mjs', 'python-supply.test.mjs'];
const sourceHashes = Object.fromEntries(supplySources.map(name => [name, digest(readFileSync(join(plugin, 'scripts', name)))]));
const tmp = realpathSync(mkdtempSync(join(plugin, '.python-supply-qa-')));
process.on('exit', () => {
  try {
    assert.deepEqual(inventory(runtimeRoot), before, 'QA must not modify supplied runtime');
    for (const [name, hash] of Object.entries(sourceHashes)) assert.equal(digest(readFileSync(join(plugin, 'scripts', name))), hash);
    console.log('QA_RUNTIME_SNAPSHOT_SHA256=' + digest(JSON.stringify(before)));
    console.log('QA_SOURCE_HASHES=' + JSON.stringify(sourceHashes));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    assert.equal(existsSync(tmp), false);
    console.log('QA_TEMP_CLEANUP=YES');
  }
});
const home = join(tmp, 'home');
const cwd = join(tmp, 'cwd with spaces 测试');
const emptyPath = join(tmp, 'empty-path');
for (const dir of [home, cwd, emptyPath]) mkdirSync(dir, { mode: 0o700 });
const cleanEnv = { HOME: home, TMPDIR: tmp, PATH: emptyPath, LANG: 'C', LC_ALL: 'C' };
const helperBytes = readFileSync(join(plugin, 'src/storage-fs.py'));
const helper = join(tmp, 'storage-fs.py');
writeFileSync(helper, helperBytes, { mode: 0o600 });
console.log('QA_HELPER_SNAPSHOT_SHA256=' + digest(helperBytes));
const flags = ['-I', '-S', '-B', '-u'];
let nativeExe;
const verified = new Set();
function requireNative() {
  assert.equal(process.platform, 'darwin');
  assert.equal(process.arch, 'arm64', 'This run specifically requires real arm64; never spoof arch');
  assert.ok(verified.has('arm64'), 'Never execute before the complete archive/inventory validation');
  nativeExe = join(runtimeRoot, manifest.artifacts.find(x => x.arch === 'arm64').directory, 'python/bin/python3.13');
  return nativeExe;
}
function request(values) {
  const out = ok(run(requireNative(), [...flags, helper], {
    env: cleanEnv, cwd, input: JSON.stringify({ id: 1, ...values }) + '\n',
  }));
  return out.trim().split('\n').map(JSON.parse).find(row => row.id === 1 && ('result' in row || 'error' in row));
}

await test('manifest pins both real CPU archives, private relative paths and isolated flags', () => {
  assert.equal(manifest.version, '3.13.15');
  assert.equal(manifest.release, '20260807');
  assert.equal(manifest.upstreamCommit, '00c8a06113f11220667c3bcf5fab1672ff9e78ef');
  assert.deepEqual(manifest.executionFlags, flags);
  assert.deepEqual(manifest.artifacts.map(x => x.arch).sort(), ['arm64', 'x64']);
  verifyBytes(readFileSync(join(runtimeRoot, 'archives/SHA256SUMS')), manifest.checksums.sha256);
  for (const item of manifest.artifacts) {
    assert.equal(item.platform, 'darwin');
    assert.equal(item.sha256, pinned[item.arch][0]);
    assert.equal(item.executableSha256, pinned[item.arch][1]);
    assert.equal(item.minimumMacOS, pinned[item.arch][2]);
    for (const path of [item.directory, item.executable]) {
      assert.equal(isAbsolute(path), false);
      assert.ok(!path.split('/').includes('..'));
    }
    const url = new URL(item.url);
    assert.equal(url.origin, 'https://github.com');
    assert.equal(decodeURIComponent(url.pathname), `/astral-sh/python-build-standalone/releases/download/20260807/${item.filename}`);
    const row = readFileSync(join(runtimeRoot, 'archives/SHA256SUMS'), 'utf8').split('\n').find(x => x.trim().split(/\s+/).at(-1) === item.filename);
    assert.equal(row.trim().split(/\s+/)[0], item.sha256);
  }
});
for (const item of manifest.artifacts) {
  await test(`${item.arch}: archive and complete inventory match; all Mach-O dependencies resolve privately or to macOS`, () => {
    verifyBytes(readFileSync(join(runtimeRoot, 'archives', item.filename)), pinned[item.arch][0], item.compressedBytes);
    const root = join(runtimeRoot, item.directory);
    const rows = inventory(root);
    assert.deepEqual(rows, json(join(runtimeRoot, 'evidence', `${item.arch}-inventory.json`)).entries);
    assert.equal(rows.reduce((n, row) => n + (row.bytes || 0), 0), item.unpackedFileBytes);
    assert.equal(lstatSync(root).mode & 0o6022, 0);
    let binaries = 0;
    for (const row of rows) {
      const path = join(root, row.path);
      if (row.link !== undefined) {
        assert.equal(isAbsolute(row.link), false);
        assert.ok(inside(root, realpathSync(path)), row.path);
        continue;
      }
      assert.equal(row.mode & 0o6022, 0, row.path);
      if (!row.sha256) continue;
      const bytes = readFileSync(path);
      if (bytes.length < 8 || bytes.readUInt32LE(0) !== 0xfeedfacf) continue;
      binaries++;
      assert.equal(bytes.readUInt32LE(4), pinned[item.arch][3], row.path);
      const loads = ok(run('/usr/bin/otool', ['-l', path]));
      const linked = ok(run('/usr/bin/otool', ['-L', path]));
      const own = loads.match(/cmd LC_ID_DYLIB\s+cmdsize \d+\s+name (\S+)/)?.[1];
      const rpaths = [...loads.matchAll(/cmd LC_RPATH\s+cmdsize \d+\s+path (\S+)/g)].map(x => x[1]);
      const token = value => value.replace('@loader_path', dirname(path)).replace('@executable_path', join(root, 'python/bin'));
      for (const dep of linked.split('\n').slice(1).filter(Boolean).map(x => x.trim().split(' (')[0]).filter(x => x !== own)) {
        if (dep.startsWith('/usr/lib/') || dep.startsWith('/System/Library/Frameworks/')) continue;
        const candidates = dep.startsWith('@rpath/') ? rpaths.map(p => resolve(token(p), dep.slice(7))) : [resolve(token(dep))];
        assert.ok(candidates.some(p => existsSync(p) && inside(root, realpathSync(p))), `${row.path}: ${dep}`);
      }
      const minimum = [...loads.matchAll(/(?:minos (\d+\.\d+(?:\.\d+)?)|cmd LC_VERSION_MIN_MACOSX\s+cmdsize \d+\s+version (\d+\.\d+(?:\.\d+)?))/g)].map(x => x[1] || x[2]);
      assert.deepEqual(minimum, [item.minimumMacOS]);
    }
    assert.equal(binaries, 10);
    verifyBytes(readFileSync(join(root, item.executable)), pinned[item.arch][1]);
    verified.add(item.arch);
  });
}
await test('both license inventories cover bundled notices and full-build declared licenses without hiding zlib exception', () => {
  const indices = json(join(runtimeRoot, 'licenses/license-index.json'));
  const receipts = json(join(runtimeRoot, 'evidence/upstream-receipts.json'));
  for (const item of manifest.artifacts) {
    const index = indices.find(x => x.arch === item.arch);
    const full = receipts.find(x => x.filename.includes(`${item.triple}-pgo+lto-full`));
    const compressed = readFileSync(join(runtimeRoot, 'evidence', full.filename));
    verifyBytes(compressed, full.sha256, full.bytes);
    // Node's built-in decompressor avoids PATH tools or any Python dependency.
    const archive = join(tmp, `${item.arch}-verified-full.tar`);
    writeFileSync(archive, zstdDecompressSync(compressed), { mode: 0o600 });
    const raw = ok(run('/usr/bin/tar', ['-xOf', archive, 'python/PYTHON.json']));
    assert.deepEqual(JSON.parse(raw), json(join(runtimeRoot, 'evidence', `${item.arch}-PYTHON.json`)));
    const metadata = JSON.parse(raw);
    const declared = new Set([metadata.license_path, ...Object.values(metadata.build_info.extensions).flat().flatMap(x => x.license_paths || x.license_path || [])]);
    assert.equal(index.notices.length, 56);
    assert.equal(new Set(index.notices.map(x => x.path)).size, 56);
    for (const notice of index.notices) {
      assert.ok(inside(runtimeRoot.replace(/\/$/, ''), resolve(runtimeRoot, notice.path)));
      verifyBytes(readFileSync(join(runtimeRoot, notice.path)), notice.sha256);
      assert.ok(notice.source.startsWith('https://github.com/astral-sh/python-build-standalone/releases/download/20260807/'));
    }
    for (const name of declared) {
      if (name === 'licenses/LICENSE.zlib-ng.txt') {
        assert.equal(index.metadataException.length, 1);
        assert.equal(index.metadataException[0].archivePath, `python/${name}`);
        assert.ok(metadata.build_info.extensions.zlib.every(x => x.links.every(link => link.name === 'z' && link.system === true)));
      } else {
        const notice = index.notices.find(x => x.path === `licenses/${item.arch}-${name.replaceAll('/', '-')}`);
        assert.ok(notice, name);
        const extracted = run('/usr/bin/tar', ['-xOf', archive, `python/${name}`], { encoding: null });
        ok(extracted);
        verifyBytes(extracted.stdout, notice.sha256);
      }
    }
    const exe = run('/usr/bin/tar', ['-xOf', archive, 'python/install/bin/python3.13'], { encoding: null });
    ok(exe);
    verifyBytes(exe.stdout, item.executableSha256);
    const root = join(runtimeRoot, item.directory);
    for (const row of inventory(root).filter(x => x.sha256 && /licen[sc]e|copying|copyright/i.test(x.path.split('/').at(-1)))) {
      assert.ok(index.notices.some(x => x.path === `${item.directory}/${row.path}` && x.sha256 === row.sha256));
    }
    assert.ok(index.notices.some(x => x.path.includes('certifi/LICENSE')));
    assert.ok(readFileSync(join(root, 'python/lib/python3.13/site-packages/pip/_vendor/certifi/cacert.pem')).length > 0);
  }
  const notice = readFileSync(join(runtimeRoot, 'licenses/NOTICE.md'), 'utf8');
  for (const term of ['MPL-2.0', 'PSF', 'CNRI', 'BeOpen', 'CWI', 'Apache-2.0', 'pip', 'zlib-ng']) assert.ok(notice.includes(term), term);
});
await test('real acquisition rejects a tampered cached archive before extraction and without network', () => {
  const fixture = join(tmp, 'acquire');
  mkdirSync(join(fixture, 'scripts'), { recursive: true });
  mkdirSync(join(fixture, 'runtime/archives'), { recursive: true });
  cpSync(join(plugin, 'scripts/python-supply.mjs'), join(fixture, 'scripts/python-supply.mjs'));
  const original = Buffer.from('verified fixture, never executable');
  const sums = `${digest(original)}  fixture.tar.gz\n`;
  const local = { checksums: { sha256: digest(sums) }, artifacts: [{ filename: 'fixture.tar.gz', sha256: digest(original), compressedBytes: original.length, directory: 'must-not-extract' }] };
  writeFileSync(join(fixture, 'runtime/python-supply.json'), JSON.stringify(local));
  writeFileSync(join(fixture, 'runtime/archives/SHA256SUMS'), sums);
  const changed = Buffer.from(original); changed[0] ^= 1;
  writeFileSync(join(fixture, 'runtime/archives/fixture.tar.gz'), changed);
  const result = run(process.execPath, ['--input-type=module', '-e', 'globalThis.fetch=()=>{throw Error("NETWORK_FORBIDDEN")};const {acquire}=await import("./scripts/python-supply.mjs");await acquire();'], { cwd: fixture });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /python-supply-integrity-mismatch/);
  assert.doesNotMatch(result.stderr, /NETWORK_FORBIDDEN/);
  assert.equal(existsSync(join(fixture, 'runtime/must-not-extract.extracting')), false);
  assert.throws(() => verifyBytes(original, digest(original), original.length - 1), /integrity-mismatch/);
});
for (const attack of ['executable-tamper', 'escaping-link', 'writable-file']) {
  await test(`actual static auditor rejects isolated ${attack} fixture`, () => {
    const root = join(tmp, attack);
    for (const dir of ['scripts', 'runtime/archives', 'runtime/evidence', 'runtime/tree']) mkdirSync(join(root, dir), { recursive: true });
    for (const name of ['python-supply.mjs', 'python-supply-audit.mjs']) cpSync(join(plugin, 'scripts', name), join(root, 'scripts', name));
    const bytes = Buffer.from('not an executable');
    const item = { arch: 'arm64', filename: 'a', sha256: digest(bytes), compressedBytes: bytes.length, directory: 'tree', executable: 'exe', executableSha256: digest(bytes) };
    writeFileSync(join(root, 'runtime/python-supply.json'), JSON.stringify({ artifacts: [item] }));
    writeFileSync(join(root, 'runtime/archives/a'), bytes);
    writeFileSync(join(root, 'runtime/tree/exe'), attack === 'executable-tamper' ? Buffer.from('tampered') : bytes, { mode: attack === 'writable-file' ? 0o666 : 0o600 });
    if (attack === 'writable-file') {
      // writeFile's mode observes umask; chmod is confined to this synthetic fixture.
      chmodSync(join(root, 'runtime/tree/exe'), 0o666);
    }
    if (attack === 'escaping-link') symlinkSync('../../outside', join(root, 'runtime/tree/link'));
    if (attack === 'escaping-link') writeFileSync(join(root, 'outside'), 'fixture');
    const result = run(process.execPath, [join(root, 'scripts/python-supply-audit.mjs')]);
    assert.equal(result.status, 1);
    const expected = { 'executable-tamper': /python-supply-integrity-mismatch/, 'escaping-link': /escaping-symlink/, 'writable-file': /unsafe-write-or-setid-mode/ };
    assert.match(result.stderr, expected[attack]);
  });
}
await test('native helper runs with no PATH Python; PYTHON injection and CWD/site shadowing cannot load', () => {
  const missing = spawnSync('python3', ['--version'], { env: cleanEnv, cwd });
  assert.equal(missing.error?.code, 'ENOENT');
  const marker = join(tmp, 'python-injection-fired');
  const payload = `open(${JSON.stringify(marker)}, 'w').write('injected')\nraise RuntimeError('INJECTED')\n`;
  for (const name of ['sitecustomize.py', 'usercustomize.py', 'json.py']) writeFileSync(join(cwd, name), payload);
  const poisoned = { ...cleanEnv, PYTHONHOME: cwd, PYTHONPATH: cwd, PYTHONUSERBASE: cwd, PYTHONSTARTUP: join(cwd, 'sitecustomize.py'), PYTHONINSPECT: '1' };
  const code = 'import sys,json,platform,ssl,sqlite3,bz2,lzma,ctypes,fcntl,hashlib,unicodedata;print(json.dumps({"machine":platform.machine(),"version":platform.python_version(),"exe":sys.executable,"path":sys.path,"flags":[sys.flags.isolated,sys.flags.no_site,sys.flags.no_user_site,sys.flags.dont_write_bytecode],"ssl":ssl.OPENSSL_VERSION,"sqlite":sqlite3.sqlite_version}))';
  const identity = JSON.parse(ok(run(requireNative(), [...flags, '-c', code], { cwd, env: poisoned })));
  assert.equal(identity.machine, 'arm64');
  assert.equal(identity.version, '3.13.15');
  assert.equal(identity.exe, nativeExe);
  assert.deepEqual(identity.flags, [1, 1, 1, 1]);
  assert.ok(identity.path.every(path => inside(dirname(dirname(nativeExe)), path)));
  assert.equal(existsSync(marker), false);
  assert.deepEqual(request({ op: 'probe' }).result, { supported: true, python: '3.13.15', chunkBytes: 1048576 });
  console.log('QA_NATIVE_IDENTITY=' + JSON.stringify(identity));
});
await test('explicit supply-handoff environment whitelist removes PATH/PYTHON/DYLD injection before exec', () => {
  // Isolated consumer fixture, not a claim that engineer 110 resolver is implemented.
  const poisoned = { ...process.env, ...cleanEnv, PATH: cwd, PYTHONPATH: cwd, PYTHONHOME: cwd,
    DYLD_INSERT_LIBRARIES: join(cwd, 'never-load.dylib'), DYLD_LIBRARY_PATH: cwd,
    DYLD_FRAMEWORK_PATH: cwd, DYLD_FALLBACK_LIBRARY_PATH: cwd, DYLD_PRINT_LIBRARIES: '1' };
  const childEnv = Object.fromEntries(['HOME', 'TMPDIR', 'LANG', 'LC_ALL'].map(key => [key, poisoned[key]]));
  childEnv.PATH = emptyPath;
  assert.ok(Object.keys(childEnv).every(key => !key.startsWith('PYTHON') && !key.startsWith('DYLD_')));
  const code = 'import os,json,ctypes,ssl;print(json.dumps(dict(os.environ)))';
  const result = run(requireNative(), [...flags, '-c', code], { env: childEnv, cwd });
  const received = JSON.parse(ok(result));
  assert.ok(Object.keys(received).every(key => !key.startsWith('PYTHON') && !key.startsWith('DYLD_')));
  assert.equal(received.PATH, emptyPath);
  assert.equal(result.stderr, '');
});
await test('native payload relocates to spaced Unicode install root with relative dynamic dependencies intact', () => {
  const item = manifest.artifacts.find(x => x.arch === 'arm64');
  const source = join(runtimeRoot, item.directory);
  const destination = join(tmp, 'relocated install 空格');
  cpSync(source, destination, { recursive: true, verbatimSymlinks: true });
  assert.deepEqual(inventory(destination), inventory(source));
  const exe = join(destination, item.executable);
  verifyBytes(readFileSync(exe), item.executableSha256);
  const code = 'import sys,json,_tkinter,ssl,sqlite3,ctypes;print(json.dumps({"exe":sys.executable,"path":sys.path,"tk":_tkinter.TK_VERSION}))';
  const result = JSON.parse(ok(run(exe, [...flags, '-c', code], { cwd, env: cleanEnv })));
  assert.equal(result.exe, exe);
  assert.ok(result.path.every(path => inside(destination, path)));
  assert.deepEqual(inventory(destination), inventory(source), '-B must leave relocated copy unchanged');
});
await test('native narrow helper sync preserves JSON/hash and rejects relative escapes and symlink writes', () => {
  const root = join(tmp, 'sync'); mkdirSync(root);
  const value = { title: '供应QA', schema: 1 };
  assert.ok(request({ op: 'json', root, rel: 'nested/ledger.json', value }).result.sha256);
  assert.deepEqual(request({ op: 'read', root, rel: 'nested/ledger.json' }).result, value);
  const bytes = readFileSync(join(root, 'nested/ledger.json'));
  assert.equal(request({ op: 'hash', root, rel: 'nested/ledger.json' }).result.sha256, digest(bytes));
  symlinkSync('nested/ledger.json', join(root, 'alias'));
  for (const rel of ['alias', '../outside', '/absolute', 'nested/../escape']) {
    assert.ok(request({ op: 'json', root, rel, value: 'do-not-write' }).error, rel);
  }
  assert.deepEqual(readFileSync(join(root, 'nested/ledger.json')), bytes);
  assert.equal(existsSync(join(root, 'escape')), false);
});
await test('native asynchronous helper holds bounded FD stream and exclusive flock across processes', async () => {
  const root = join(tmp, 'async'); mkdirSync(root);
  const content = Buffer.alloc(150000, 0x76); writeFileSync(join(root, 'media'), content);
  const worker = spawn(requireNative(), [...flags, helper], { cwd, env: cleanEnv, stdio: ['pipe', 'pipe', 'pipe'] });
  const closed = once(worker, 'close');
  let stderr = ''; worker.stderr.on('data', chunk => { stderr += chunk; });
  const pending = new Map(); let sequence = 0;
  const lines = createInterface({ input: worker.stdout });
  lines.on('line', line => {
    const row = JSON.parse(line);
    if ('result' in row || 'error' in row) { pending.get(row.id)?.resolve(row); pending.delete(row.id); }
  });
  worker.on('close', () => { for (const waiter of pending.values()) waiter.reject(new Error('worker closed: ' + stderr)); pending.clear(); });
  const ask = values => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject });
    worker.stdin.write(JSON.stringify({ id, ...values }) + '\n');
  });
  const timer = setTimeout(() => worker.kill(), 15000);
  try {
    assert.equal((await ask({ op: 'probe' })).result.python, '3.13.15');
    const lock = (await ask({ op: 'lock', root, rel: 'writer.lock' })).result;
    assert.equal(request({ op: 'lock', root, rel: 'writer.lock' }).error.code, 'storage-busy');
    const opened = (await ask({ op: 'stream_open', root, rel: 'media' })).result;
    const chunks = []; let eof = false;
    while (!eof) {
      const row = (await ask({ op: 'stream_read', key: opened.key })).result;
      const bytes = Buffer.from(row.data, 'base64');
      assert.ok(bytes.length <= 65536); chunks.push(bytes); eof = row.eof;
    }
    assert.equal(chunks.length, 3);
    assert.deepEqual(Buffer.concat(chunks), content);
    assert.equal((await ask({ op: 'unlock', key: lock.key })).result, true);
    assert.ok(request({ op: 'lock', root, rel: 'writer.lock' }).result.key);
    worker.stdin.end(); assert.equal((await closed)[0], 0, stderr);
  } finally {
    clearTimeout(timer); lines.close();
    if (worker.exitCode === null) { worker.kill(); await closed; }
  }
});
await test('x64 evidence is accurately labelled translated; signing assessment is not installation acceptance', () => {
  const evidence = json(join(runtimeRoot, 'evidence/x64-execution-attempt.json'));
  assert.equal(evidence.hostArch, 'arm64');
  assert.match(evidence.mode, /NOT Intel native acceptance/);
  assert.equal(evidence.sha256, pinned.x64[1]);
  assert.equal(evidence.result.status, 0);
  assert.equal(JSON.parse(evidence.identity.stdout).machine, 'x86_64');
  const audit = json(join(runtimeRoot, 'evidence/static-audit.json'));
  for (const item of manifest.artifacts) {
    const row = audit.find(x => x.arch === item.arch);
    assert.equal(row.gatekeeper.status, 3);
    assert.match(row.gatekeeper.stderr, /rejected/);
    assert.doesNotMatch(row.extendedAttributes.stdout, /com\.apple\.quarantine/);
    const exe = join(runtimeRoot, item.directory, item.executable);
    const attrs = ok(run('/usr/bin/xattr', ['-l', exe]));
    assert.doesNotMatch(attrs, /com\.apple\.quarantine/);
    const signature = run('/usr/bin/codesign', ['--verify', '--strict', exe]);
    assert.equal(signature.status, item.arch === 'arm64' ? 0 : 1);
  }
  console.log('QA_X64_SCOPE=static+reviewed-translated-evidence; no Intel-native or minimum-OS claim');
});
