import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { GraphInspector, candidateConfig, managedSpec, payloadManifest, hashFile, readYaml } from './materialize-graph.mjs';
import { prepareCandidateDependencies, privatePnpmEnvironment, registryGate, validateAcquisitionLock } from './materialize-cache.mjs';

// All fixtures live under this ignored task worktree, never under real profiles.
const here = path.dirname(fileURLToPath(import.meta.url));
const taskRoot = path.dirname(here);
const helper = path.join(here, 'managed-tarball-archive.py');
const makeRoot = t => {
  const parent = path.join(taskRoot, '.workbuddy');
  const root = fs.realpathSync(fs.mkdtempSync(path.join(parent, 'managed-778-t02-qa-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
};
const write = (file, bytes) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); };
const json = (file, value) => write(file, JSON.stringify(value));
const py = (script, args = [], input = {}) => spawnSync('python3', ['-B', '-c', script, helper, ...args], {
  input: JSON.stringify(input), encoding: 'utf8', timeout: 30000,
  env: { ...process.env, TMPDIR: input.tarball ? path.dirname(input.tarball) : path.join(taskRoot, '.workbuddy') },
});
const loadPython = `import importlib.util,sys,json,os,io,tarfile,hashlib,gzip\ns=importlib.util.spec_from_file_location('qa_archive',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nr=json.load(sys.stdin)\n`;
function archive(root) {
  const tarball = path.join(root, 'input.tgz');
  const result = py(`import tarfile,io,json,sys\nr=json.load(sys.stdin)\nwith tarfile.open(r['path'],'w:gz') as t:\n for n,b in [('package/package.json',b'{"name":"viewer","version":"1.0.0"}'),('package/sub/data.txt',b'payload')]:\n  i=tarfile.TarInfo(n);i.size=len(b);i.mode=0o644;t.addfile(i,io.BytesIO(b))\n`, [], { path: tarball });
  assert.equal(result.status, 0, result.stderr);
  return { tarball, name: 'viewer', version: '1.0.0', sha256: hashFile(tarball) };
}
const action = (name, request) => spawnSync('python3', ['-B', helper, name], {
  input: JSON.stringify(request), encoding: 'utf8', timeout: 30000,
  env: { ...process.env, TMPDIR: request.tarball ? path.dirname(request.tarball) : path.join(taskRoot, '.workbuddy') },
});

// Directory-race tests patch only the imported module's OS seam in a child process.
// They do not modify the helper, archives after approval, or any other source file.
test('QA-ARC01 extraction detects a subdirectory replacement after the member FD opens', t => {
  const root = makeRoot(t); const request = archive(root);
  const destination = path.join(root, 'out'); const outside = path.join(root, 'outside');
  fs.mkdirSync(outside); write(path.join(outside, 'sentinel'), 'unchanged');
  const before = payloadManifest(outside);
  const result = py(loadPython + `g=m.ArchiveGuard();g.freeze(r)\noriginal=m.os.open;swapped=False\ndef opened(name,flags,*args,**kwargs):\n global swapped\n fd=original(name,flags,*args,**kwargs)\n if name=='data.txt' and flags & os.O_CREAT and not swapped:\n  swapped=True;os.rename(r['destination']+'/sub',r['destination']+'/detached');os.mkdir(r['destination']+'/sub')\n return fd\nm.os.open=opened\ntry:\n g.extractVerified(r['destination']);print(json.dumps({'rejected':False,'swapped':swapped}))\nexcept (ValueError,OSError) as e:print(json.dumps({'rejected':True,'swapped':swapped,'error':str(e)}))\n`, [], { ...request, destination, outside });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(payloadManifest(outside), before);
  const resultJson = JSON.parse(result.stdout);
  assert.equal(resultJson.swapped, true);
  assert.equal(resultJson.rejected, true, 'changed extraction subtree must not be reported as verified');
});

test('QA-ARC02 root replacement after member FD opens is rejected without following symlink', t => {
  const root = makeRoot(t); const request = archive(root);
  const destination = path.join(root, 'out'); const outside = path.join(root, 'outside'); fs.mkdirSync(outside);
  const result = py(loadPython + `g=m.ArchiveGuard();g.freeze(r)\noriginal=m.os.open;swapped=False\ndef opened(name,flags,*args,**kwargs):\n global swapped\n fd=original(name,flags,*args,**kwargs)\n if name=='data.txt' and flags & os.O_CREAT and not swapped:\n  swapped=True;os.rename(r['destination'],r['destination']+'-detached');os.symlink(r['outside'],r['destination'])\n return fd\nm.os.open=opened\ntry:g.extractVerified(r['destination']);sys.exit(0)\nexcept (ValueError,OSError):sys.exit(3)\n`, [], { ...request, destination, outside });
  assert.equal(result.status, 3, result.stderr); assert.deepEqual(fs.readdirSync(outside), []);
});

test('QA-ARC03 exact compressed/member/path budgets pass and one-less rejects', t => {
  const root = makeRoot(t); const request = archive(root);
  const result = py(loadPython + `raw=open(r['tarball'],'rb').read()\nfor key,value in [('compressed',len(raw)),('members',2),('path',len('package/package.json'))]:\n limits=dict(m.LIMITS);limits[key]=value;m.ArchiveGuard(limits).freeze(r)\n limits[key]=value-1\n try:m.ArchiveGuard(limits).freeze(r)\n except ValueError:pass\n else:raise AssertionError(key+' accepted over limit')\nprint('three boundaries checked')\n`, [], request);
  assert.equal(result.status, 0, result.stderr);
});

test('QA-ARC04 freeze has five exact decimal identities and preserves original archive', t => {
  const root = makeRoot(t); const request = archive(root); const original = fs.readFileSync(request.tarball);
  const result = action('freeze', { ...request, destination: path.join(root, 'frozen.tgz') });
  assert.equal(result.status, 0, result.stderr);
  const identity = JSON.parse(result.stdout).identity;
  assert.equal(identity.length, 5); assert.ok(identity.every(v => typeof v === 'string' && /^\d+$/.test(v)));
  assert.deepEqual(fs.readFileSync(request.tarball), original);
  assert.equal(fs.statSync(path.join(root, 'frozen.tgz')).mode & 0o777, 0o400);
});

test('QA-ARC05 complete gzip carrying a truncated tar is rejected', t => {
  const root = makeRoot(t); const request = archive(root);
  const result = py(loadPython + `raw=gzip.decompress(open(r['tarball'],'rb').read())\n# Exactly two complete headers and padded bodies, but no tar end-of-archive blocks.\nopen(r['tarball'],'wb').write(gzip.compress(raw[:2048]))\nr['sha256']=hashlib.sha256(open(r['tarball'],'rb').read()).hexdigest()\ntry:m.ArchiveGuard().freeze(r);print(json.dumps({'rejected':False}))\nexcept (ValueError,OSError,tarfile.TarError,EOFError):print(json.dumps({'rejected':True}))\n`, [], request);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).rejected, true, 'tar terminator truncation must not be accepted');
});

function graphFixture(t) {
  const root = makeRoot(t); const profile = path.join(root, 'profile');
  const dependencies = {}; const packages = {}; const snapshots = {}; const listDeps = {};
  for (const [consumer, version] of [['a', '1.0.0'], ['b', '2.0.0']]) {
    const parent = path.join(profile, 'node_modules', consumer);
    const plugin = path.join(parent, 'node_modules/plugin'); const peer = path.join(parent, 'node_modules/peer');
    json(path.join(parent, 'package.json'), { name: consumer, version: '1.0.0', dependencies: { plugin: '1.0.0', peer: version } });
    json(path.join(plugin, 'package.json'), { name: 'plugin', version: '1.0.0', peerDependencies: { peer: '*' } });
    json(path.join(peer, 'package.json'), { name: 'peer', version });
    dependencies[consumer] = { specifier: '1.0.0', version: '1.0.0' };
    packages[`${consumer}@1.0.0`] = { resolution: { integrity: 'synthetic' } };
    packages['plugin@1.0.0'] = { resolution: { integrity: 'synthetic' } };
    packages[`peer@${version}`] = { resolution: { integrity: 'synthetic' } };
    snapshots[`${consumer}@1.0.0`] = { dependencies: { plugin: `1.0.0(peer@${version})`, peer: version } };
    snapshots[`plugin@1.0.0(peer@${version})`] = { dependencies: { peer: version } };
    snapshots[`peer@${version}`] = {};
    listDeps[consumer] = { path: parent, version: '1.0.0', dependencies: {
      plugin: { path: plugin, version: '1.0.0', dependencies: { peer: { path: peer, version } } }, peer: { path: peer, version },
    } };
  }
  json(path.join(profile, 'package.json'), { dependencies: { a: '1.0.0', b: '1.0.0' } });
  write(path.join(profile, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies } }, packages, snapshots }));
  write(path.join(profile, 'node_modules/.modules.yaml'), stringify({ nodeLinker: 'hoisted' }));
  return { profile, listJson: [{ path: profile, dependencies: listDeps }] };
}

test('QA-GRAPH01 different peer contexts preserve consumer bindings and reject peer substitution', t => {
  const f = graphFixture(t); const inspector = new GraphInspector(f.profile);
  const original = payloadManifest(f.profile, { links: true });
  const state = inspector.capture({ listJson: f.listJson });
  const plugins = Object.values(state.nodes).filter(n => n.name === 'plugin');
  assert.equal(plugins.length, 2); assert.equal(plugins[0].payload.digest, plugins[1].payload.digest);
  assert.notEqual(plugins[0].locator, plugins[1].locator);
  assert.deepEqual(payloadManifest(f.profile, { links: true }), original, 'capture is read-only');
  const a = f.listJson[0].dependencies.a.dependencies;
  const b = f.listJson[0].dependencies.b.dependencies;
  fs.rmSync(a.peer.path, { recursive: true }); fs.symlinkSync(b.peer.path, a.peer.path);
  assert.throws(() => inspector.capture({ listJson: f.listJson }), /mismatch|conflicting/);
});

test('QA-GRAPH02 missing controlled list, missing disk package and unlisted native payload fail closed', t => {
  const f = graphFixture(t); const inspector = new GraphInspector(f.profile);
  assert.throws(() => inspector.capture(), /list JSON required/);
  const omit = structuredClone(f.listJson); delete omit[0].dependencies.b;
  assert.throws(() => inspector.capture({ listJson: omit }), /missing from pnpm list/);
  const approval = payloadManifest(f.listJson[0].dependencies.a.dependencies.plugin.path);
  write(path.join(f.listJson[0].dependencies.a.dependencies.plugin.path, 'new.node'), 'unexpected prebuilt bytes');
  assert.throws(() => inspector.capture({ listJson: f.listJson, approvedPayloads: { plugin: approval } }), /payload drift/);
});

test('QA-GRAPH03 identical same-locator occurrences retain different hoisted ghost edges', t => {
  const f = graphFixture(t); const lockFile = path.join(f.profile, 'pnpm-lock.yaml'); const lock = readYaml(lockFile);
  for (const consumer of ['a', 'b']) {
    const plugin = f.listJson[0].dependencies[consumer].dependencies.plugin;
    json(path.join(plugin.path, 'package.json'), { name: 'plugin', version: '1.0.0' });
    delete plugin.dependencies;
    lock.snapshots[`${consumer}@1.0.0`].dependencies.plugin = '1.0.0';
  }
  delete lock.snapshots['plugin@1.0.0(peer@1.0.0)']; delete lock.snapshots['plugin@1.0.0(peer@2.0.0)'];
  lock.snapshots['plugin@1.0.0'] = {}; write(lockFile, stringify(lock));
  const state = new GraphInspector(f.profile).capture({ listJson: f.listJson });
  const keys = Object.keys(state.nodes).filter(key => state.nodes[key].name === 'plugin');
  assert.equal(keys.length, 2); assert.notEqual(keys[0], keys[1]);
  assert.equal(state.nodes[keys[0]].locator, state.nodes[keys[1]].locator);
  assert.equal(state.nodes[keys[0]].payload.digest, state.nodes[keys[1]].payload.digest);
  const visible = key => state.resolutionGraph.map(JSON.parse).find(edge => edge[0] === key && edge[1] === 'peer' && edge[3] === 'visible')[2];
  assert.notEqual(state.nodes[visible(keys[0])].version, state.nodes[visible(keys[1])].version);
});

function candidateFixture(t, workspaceExtra = {}) {
  const root = makeRoot(t); const profile = path.join(root, 'before'); const candidate = path.join(root, 'candidate');
  const privateRoot = path.join(root, 'private'); fs.mkdirSync(privateRoot);
  const tarball = path.join(root, 'viewer.tgz'); const request = { profile, tarball, name: 'viewer', version: '1.0.0' };
  const old = `file:${tarball}`; const target = managedSpec('viewer');
  const beforeLock = { lockfileVersion: '9.0', importers: { '.': { dependencies: { viewer: { specifier: old, version: old } } } },
    packages: { [`viewer@${old}`]: { resolution: { tarball: old }, version: '1.0.0' } }, snapshots: { [`viewer@${old}`]: {} } };
  json(path.join(profile, 'sentinel.json'), { unchanged: true });
  json(path.join(candidate, 'package.json'), { private: true, dependencies: { viewer: target } });
  json(path.join(candidate, target.slice(5), 'package.json'), { name: 'viewer', version: '1.0.0' });
  write(path.join(candidate, 'pnpm-lock.yaml'), stringify(beforeLock));
  write(path.join(candidate, 'pnpm-workspace.yaml'), stringify({ packages: ['.'], ...workspaceExtra }));
  return { root, profile, candidate, privateRoot, beforeLock, request };
}

test('QA-CACHE01 executable hooks and npmrc registry/auth are rejected before runner', async t => {
  for (const value of ['registry=https://unknown.invalid/\n', '//registry.npmjs.org/:_authToken=synthetic-not-a-secret\n', 'node-options=--require=fixture\n']) {
    const f = candidateFixture(t); write(path.join(f.candidate, '.npmrc'), value);
    let calls = 0;
    await assert.rejects(prepareCandidateDependencies({ ...f, config: { workspace: { packages: ['.'] }, config: {} }, runPnpm: async () => { calls++; return { code: 0, stdout: '11.7.0' }; } }), { code: 5 });
    assert.equal(calls, 0);
  }
});

for (const [label, override] of [['local', 'file:../unapproved'], ['remote', 'https://unknown.invalid/payload.tgz']]) {
  test(`QA-CACHE02-${label} source-redirection overrides are rejected before pnpm install`, async t => {
    const f = candidateFixture(t, { overrides: { viewer: override } });
    const before = payloadManifest(f.profile);
    let calls = 0;
    await assert.rejects(prepareCandidateDependencies({ ...f, config: candidateConfig(f.candidate), runPnpm: async argv => {
      if (argv[0] === '--version') return { code: 0, signal: null, stdout: '11.7.0' };
      calls++; return { code: 9, signal: null, stdout: '' };
    } }), { code: 5 });
    assert.deepEqual(payloadManifest(f.profile), before);
    assert.equal(calls, 0, 'unapproved dependency source must be refused before pnpm install executes');
  });
}

test('QA-CACHE06 real pnpm never consumes an override outside approved candidate sources', async t => {
  const f = candidateFixture(t);
  const input = archive(f.root); fs.copyFileSync(input.tarball, f.request.tarball);
  const alternate = path.join(f.root, 'unapproved-local');
  json(path.join(alternate, 'package.json'), { name: 'viewer', version: '9.9.9' });
  write(path.join(alternate, 'index.js'), 'synthetic unapproved source');
  write(path.join(f.candidate, 'pnpm-workspace.yaml'), stringify({ packages: ['.'], overrides: { viewer: `file:${alternate}` } }));
  const before = payloadManifest(f.profile); const sourceBefore = payloadManifest(alternate);
  const pnpm = path.join(taskRoot, '.workbuddy/managed-778-t01/bin/pnpm');
  let installCalls = 0; let lockExit = null;
  const runPnpm = (argv, options) => new Promise((resolve, reject) => {
    if (argv[0] === 'install') installCalls++;
    const child = spawn(pnpm, argv, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 1 << 20) child.kill('SIGKILL'); });
    child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 1 << 20) child.kill('SIGKILL'); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => { clearTimeout(timer); if (argv[0] === 'install') lockExit = code; resolve({ code, signal, stdout }); });
  });
  await assert.rejects(prepareCandidateDependencies({ ...f, config: candidateConfig(f.candidate), runPnpm }), { code: 5 });
  assert.deepEqual(payloadManifest(f.profile), before); assert.deepEqual(payloadManifest(alternate), sourceBefore);
  const generated = fs.readFileSync(path.join(f.candidate, 'pnpm-lock.yaml'), 'utf8');
  console.log(JSON.stringify({ evidence: 'qa-local-override', installCalls, lockExit,
    unapprovedSourceInGeneratedLock: generated.includes('unapproved-local'), alternateVersionInGeneratedLock: generated.includes('9.9.9'), liveUnchanged: true }));
  assert.equal(installCalls, 0, 'reject unapproved source configuration before real pnpm reads it');
});

test('QA-CACHE03 environment does not inherit config/proxy/Node hooks or shared store', t => {
  const root = makeRoot(t); const previous = { ...process.env };
  const keys = ['NODE_OPTIONS', 'NODE_PATH', 'npm_config_registry', 'npm_config_store_dir', 'HTTP_PROXY', 'HTTPS_PROXY', 'NPM_CONFIG_USERCONFIG'];
  try {
    for (const key of keys) process.env[key] = 'synthetic-injection';
    const env = privatePnpmEnvironment(root);
    assert.equal(env.NODE_OPTIONS, undefined); assert.equal(env.NODE_PATH, undefined);
    assert.equal(env.HTTP_PROXY, undefined); assert.equal(env.HTTPS_PROXY, undefined);
    assert.equal(env.npm_config_registry, 'https://registry.npmjs.org/');
    assert.ok(env.npm_config_store_dir.startsWith(root + '/')); assert.ok(env.HOME.startsWith(root + '/'));
    assert.equal(fs.readFileSync(env.npm_config_userconfig, 'utf8'), '');
  } finally { for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
});

test('QA-CACHE04 offline CONNECT gate refuses even approved registry and unknown redirects', async () => {
  const gate = await registryGate({ online: false });
  try {
    for (const destination of ['registry.npmjs.org:443', 'unknown.invalid:443', '127.0.0.1:443']) {
      const endpoint = new URL(gate.url);
      const response = await new Promise((resolve, reject) => {
        const socket = net.connect(Number(endpoint.port), endpoint.hostname); let bytes = '';
        socket.setTimeout(2000, () => { socket.destroy(); reject(new Error('gate timeout')); });
        socket.once('connect', () => socket.write(`CONNECT ${destination} HTTP/1.1\r\nHost: ${destination}\r\n\r\n`));
        socket.on('data', chunk => { bytes += chunk; }); socket.once('end', () => resolve(bytes)); socket.once('error', reject);
      });
      assert.match(response, /403 Forbidden/);
    }
  } finally { await gate.close(); }
});

test('QA-CACHE05 unknown/authenticated sources and malformed integrity reject with code5', t => {
  const f = candidateFixture(t);
  for (const resolution of [
    { integrity: 'sha1-no' },
    { integrity: `sha512-${Buffer.alloc(64).toString('base64')}`, tarball: 'https://unknown.invalid/a.tgz' },
    { integrity: `sha512-${Buffer.alloc(64).toString('base64')}`, tarball: 'https://synthetic:fake@registry.npmjs.org/a.tgz' },
  ]) {
    const lock = structuredClone(f.beforeLock); lock.packages['other@1.0.0'] = { resolution };
    assert.throws(() => validateAcquisitionLock(lock, f.request, { before: true }), { code: 5 });
  }
});

test('QA-FS01 pending corrupt active state and invalid recovery paths map to 7 and 5', t => {
  const root = makeRoot(t); const id = '33333333-3333-3333-3333-333333333333';
  const txn = path.join(root, '.materialize-transactions', id); fs.mkdirSync(txn, { recursive: true });
  const pending = () => spawnSync('python3', ['-B', helper, 'pending', root], { encoding: 'utf8' });
  assert.equal(pending().status, 7);
  write(path.join(txn, 'journal.json'), '{'); assert.equal(pending().status, 7);
  json(path.join(txn, 'journal.json'), { schemaVersion: 1, id, profile: root, name: 'viewer', phase: 'PREPARING', moves: [] });
  assert.equal(pending().status, 7);
  assert.equal(action('probeRecovery', { paths: [root] }).status, 5);
  assert.equal(action('safeMove', { profile: root, txnId: id, from: 'settings.json', to: 'package.json', expected: { from: null, to: null } }).status, 7);
});
