import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { GraphInspector, candidateConfig, hashFile, managedSpec, payloadManifest, readYaml, stable, validateConfigurationSources } from './materialize-graph.mjs';
import { prepareCandidateDependencies, privatePnpmEnvironment, registryGate } from './materialize-cache.mjs';

const scratch = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'managed-cache-')));
const helper = fileURLToPath(new URL('./managed-tarball-archive.py', import.meta.url));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };

/** Test-only bounded runner; production owns this lifecycle in T03. */
function runner(argv, { cwd, env, signal }) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', argv, { cwd, env, signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let overflow = false;
    const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 8 << 20) { overflow = true; child.kill('SIGKILL'); } });
    child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 8 << 20) { overflow = true; child.kill('SIGKILL'); } });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => { clearTimeout(timer); if (overflow) reject(new Error('test runner output limit')); else resolve({ code, signal, stdout, stderr }); });
  });
}
async function invoke(argv, cwd, env) {
  const result = await runner(argv, { cwd, env });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  return result.stdout;
}

async function fixture(label, { registry = true, embedded = false, linker = 'isolated', workspaceExtra = {} } = {}) {
  const root = path.join(scratch, label);
  const profile = path.join(root, 'before');
  const candidate = path.join(root, 'candidate');
  const privateRoot = path.join(root, 'private');
  fs.mkdirSync(profile, { recursive: true }); fs.mkdirSync(privateRoot, { recursive: true });
  const source = path.join(root, 'source');
  const pkg = { name: '@fixture/viewer', version: '0.1.0', main: 'index.js',
    scripts: { install: 'node -e "require(\'fs\').writeFileSync(\'SCRIPT-RAN\',\'bad\')"' },
    ...(embedded ? { bundledDependencies: ['embedded'] } : {}) };
  write(path.join(source, 'package.json'), JSON.stringify(pkg));
  write(path.join(source, 'index.js'), 'module.exports = 778;\n');
  write(path.join(source, 'prebuilt.node'), 'synthetic native bytes\0unchanged');
  fs.chmodSync(path.join(source, 'prebuilt.node'), 0o755);
  if (embedded) {
    write(path.join(source, 'node_modules/embedded/package.json'), JSON.stringify({ name: 'embedded', version: '1.0.0' }));
    write(path.join(source, 'node_modules/embedded/index.js'), 'embedded bytes');
  }
  const tarball = path.join(root, 'viewer.tgz');
  const packed = spawnSync('python3', ['-c', "import tarfile,sys\nwith tarfile.open(sys.argv[1],'w:gz') as t:t.add(sys.argv[2],arcname='package')", tarball, source], { encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr);
  const request = { profile, name: pkg.name, version: pkg.version, tarball, sha256: hashFile(tarball) };
  write(path.join(profile, 'package.json'), JSON.stringify({ private: true, dependencies: { [pkg.name]: `file:${tarball}`, ...(registry ? { 'is-number': '7.0.0' } : {}) } }));
  write(path.join(profile, 'pnpm-workspace.yaml'), stringify({ packages: ['.'], nodeLinker: linker, ignoredBuiltDependencies: [pkg.name], ...workspaceExtra }));
  const seedEnv = privatePnpmEnvironment(privateRoot);
  await invoke(['install', '--ignore-scripts', '--ignore-pnpmfile', '--package-import-method=copy', '--config.fetch-retries=0'], profile, seedEnv);
  const beforeLock = readYaml(path.join(profile, 'pnpm-lock.yaml'));
  const list = JSON.parse(await invoke(['list', '--json', '--depth', 'Infinity'], profile, seedEnv));
  const approval = payloadManifest(source);
  const before = new GraphInspector(profile).capture({ listJson: list, approvedPayloads: { [pkg.name]: approval } });
  fs.mkdirSync(candidate);
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) fs.copyFileSync(path.join(profile, file), path.join(candidate, file));
  const manifest = JSON.parse(fs.readFileSync(path.join(candidate, 'package.json')));
  manifest.dependencies[pkg.name] = managedSpec(pkg.name);
  write(path.join(candidate, 'package.json'), JSON.stringify(manifest));
  const dest = path.join(candidate, managedSpec(pkg.name).slice(5));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const extracted = spawnSync('python3', [helper, 'extract'], { input: JSON.stringify({ ...request, destination: dest }), encoding: 'utf8' });
  assert.equal(extracted.status, 0, extracted.stderr);
  return { root, profile, candidate, privateRoot, beforeLock, before, request, approval, seedEnv };
}

test('real public locked package enters fresh private store, then relocates offline without old input', async () => {
  const f = await fixture('public');
  const acquisitionRoot = path.join(f.root, 'acquisition'); fs.mkdirSync(acquisitionRoot);
  const calls = [];
  const runPnpm = async (argv, options) => { calls.push({ argv, env: { ...options.env } }); const result = await runner(argv[0] === 'install' ? [...argv, '--reporter=ndjson'] : argv, options); if (result.code !== 0) console.log(JSON.stringify({ stage: argv.slice(0, 3), diagnostic: result.stderr || result.stdout, signal: result.signal })); return result; };
  const receipt = await prepareCandidateDependencies({ ...f, privateRoot: acquisitionRoot, config: candidateConfig(f.candidate), runPnpm });
  assert.equal(receipt.acquisition.mode, 'public-registry');
  assert.deepEqual(receipt.acquisition.packages, ['is-number@7.0.0']);
  assert.equal(receipt.acquisition.frozenOffline, true);
  const env = privatePnpmEnvironment(acquisitionRoot);
  const listJson = JSON.parse(await invoke(['list', '--json', '--depth', 'Infinity'], f.candidate, env));
  const inspector = new GraphInspector(f.candidate);
  const after = inspector.capture({ listJson });
  inspector.compare(f.before, after, f.request); inspector.assertRelocatable(after);
  assert.equal(Object.values(after.nodes).find(node => node.name === 'is-number').version, '7.0.0');
  assert.equal(fs.existsSync(path.join(f.candidate, 'SCRIPT-RAN')), false);
  assert.equal(fs.existsSync(path.join(f.candidate, 'node_modules/@fixture/viewer/SCRIPT-RAN')), false);
  for (const { env, argv } of calls) {
    assert.equal(env.NODE_OPTIONS, undefined); assert.equal(env.NODE_PATH, undefined);
    assert.ok(env.HOME.startsWith(acquisitionRoot)); assert.ok(env.XDG_CACHE_HOME.startsWith(acquisitionRoot));
    if (argv[0] === 'install') assert.ok(argv.includes('--ignore-scripts') && argv.includes('--ignore-pnpmfile'));
  }
  const moved = path.join(f.root, 'relocated'); fs.renameSync(f.candidate, moved);
  fs.rmSync(f.profile, { recursive: true }); fs.rmSync(f.request.tarball);
  fs.rmSync(path.join(moved, 'node_modules'), { recursive: true });
  const denied = await registryGate({ online: false });
  try {
    await invoke(['install', '--frozen-lockfile', '--offline', '--ignore-scripts', '--ignore-pnpmfile', '--package-import-method=copy', `--store-dir=${receipt.storeRef}`,
      `--https-proxy=${denied.url}`, `--proxy=${denied.url}`, '--fetch-retries=1', '--fetch-retry-mintimeout=100', '--fetch-retry-maxtimeout=100'], moved,
    { ...env, HTTPS_PROXY: denied.url, HTTP_PROXY: denied.url, NO_PROXY: 'invalid.invalid' });
  } finally { await denied.close(); }
  const relocated = new GraphInspector(moved).capture({ listJson: JSON.parse(await invoke(['list', '--json', '--depth', 'Infinity'], moved, env)) });
  assert.equal(stable(relocated.nodes), stable(after.nodes));
  console.log(JSON.stringify({ evidence: 'public-private-offline', package: 'is-number@7.0.0', lockDigest: receipt.lockDigest, nodeCount: Object.keys(after.nodes).length, relocated: true }));
});

test('native bytes survive without builds; generated-only native drift is rejected', async () => {
  const f = await fixture('native', { registry: false });
  await prepareCandidateDependencies({ ...f, config: candidateConfig(f.candidate), runPnpm: runner });
  const listJson = JSON.parse(await invoke(['list', '--json', '--depth', 'Infinity'], f.candidate, f.seedEnv));
  const inspector = new GraphInspector(f.candidate); const after = inspector.capture({ listJson });
  inspector.compare(f.before, after, f.request);
  write(path.join(f.candidate, 'node_modules/.bin/phantom'), '#!/bin/sh\nexit 0\n');
  assert.throws(() => inspector.compare(f.before, inspector.capture({ listJson }), f.request), /graph drift/);
  fs.rmSync(path.join(f.candidate, 'node_modules/.bin'), { recursive: true });
  const installed = fs.realpathSync(path.join(f.candidate, 'node_modules/@fixture/viewer'));
  fs.writeFileSync(path.join(installed, 'generated.node'), 'generated by forbidden lifecycle');
  assert.throws(() => inspector.capture({ listJson }), /payload drift/);
});

test('embedded tarball node_modules is payload, not an unlisted pnpm occurrence', async () => {
  const f = await fixture('embedded', { registry: false, embedded: true });
  const node = f.before.nodes[f.before.roots[f.request.name]];
  assert.ok(node.payload.entries.some(entry => entry.path === 'node_modules/embedded/index.js'));
  assert.equal(Object.keys(f.before.nodes).length, 1);
  await prepareCandidateDependencies({ ...f, config: candidateConfig(f.candidate), runPnpm: runner });
  const inspector = new GraphInspector(f.candidate);
  const listJson = JSON.parse(await invoke(['list', '--json', '--depth', 'Infinity'], f.candidate, f.seedEnv));
  inspector.compare(f.before, inspector.capture({ listJson }), f.request);
});

test('real hoisted installation keeps visible ghost resolution and native payload', async () => {
  const f = await fixture('hoisted', { linker: 'hoisted' });
  const privateRoot = path.join(f.root, 'fresh'); fs.mkdirSync(privateRoot);
  await prepareCandidateDependencies({ ...f, privateRoot, config: candidateConfig(f.candidate), runPnpm: runner });
  const env = privatePnpmEnvironment(privateRoot);
  const inspector = new GraphInspector(f.candidate);
  const after = inspector.capture({ listJson: JSON.parse(await invoke(['list', '--json', '--depth', 'Infinity'], f.candidate, env)) });
  inspector.compare(f.before, after, f.request);
  assert.ok(after.resolutionGraph.map(JSON.parse).some(edge => edge[0].startsWith('@fixture/viewer@') && edge[1] === 'is-number' && edge[3] === 'visible'));
});

test('same bytes in different peer contexts retain distinct occurrences and edges', () => {
  const profile = path.join(scratch, 'peer-occurrences');
  const packages = {}; const snapshots = {}; const dependencies = {}; const listDeps = {};
  for (const [consumer, version] of [['a', '1.0.0'], ['b', '2.0.0']]) {
    const root = path.join(profile, 'node_modules', consumer);
    const plugin = path.join(root, 'node_modules', 'plugin');
    const peer = path.join(root, 'node_modules', 'peer');
    write(path.join(root, 'package.json'), JSON.stringify({ name: consumer, version: '1.0.0', dependencies: { plugin: '1.0.0', peer: version } }));
    write(path.join(plugin, 'package.json'), JSON.stringify({ name: 'plugin', version: '1.0.0', peerDependencies: { peer: '*' } }));
    write(path.join(plugin, 'index.js'), 'identical');
    write(path.join(peer, 'package.json'), JSON.stringify({ name: 'peer', version }));
    dependencies[consumer] = { specifier: '1.0.0', version: '1.0.0' };
    packages[`${consumer}@1.0.0`] = { resolution: { integrity: 'fixture' } };
    packages['plugin@1.0.0'] = { resolution: { integrity: 'fixture' } };
    packages[`peer@${version}`] = { resolution: { integrity: 'fixture' } };
    snapshots[`${consumer}@1.0.0`] = { dependencies: { plugin: `1.0.0(peer@${version})`, peer: version } };
    snapshots[`plugin@1.0.0(peer@${version})`] = { dependencies: { peer: version } };
    snapshots[`peer@${version}`] = {};
    listDeps[consumer] = { path: root, version: '1.0.0', dependencies: {
      plugin: { path: plugin, version: '1.0.0', dependencies: { peer: { path: peer, version } } },
      peer: { path: peer, version } } };
  }
  write(path.join(profile, 'package.json'), JSON.stringify({ dependencies: { a: '1.0.0', b: '1.0.0' } }));
  write(path.join(profile, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies } }, packages, snapshots }));
  write(path.join(profile, 'node_modules/.modules.yaml'), stringify({ nodeLinker: 'hoisted' }));
  const listJson = [{ path: profile, dependencies: listDeps }];
  const state = new GraphInspector(profile).capture({ listJson });
  const plugins = Object.values(state.nodes).filter(node => node.name === 'plugin');
  assert.equal(plugins.length, 2); assert.notEqual(plugins[0].locator, plugins[1].locator);
  assert.equal(plugins[0].payload.digest, plugins[1].payload.digest);
  const corrupt = structuredClone(listJson); corrupt[0].dependencies.a.dependencies.plugin.path = listDeps.b.dependencies.plugin.path;
  assert.throws(() => new GraphInspector(profile).capture({ listJson: corrupt }), /resolution mismatch/);
});

test('registry gate rejects redirect destinations and closes every owned socket', async () => {
  const gate = await registryGate();
  const endpoint = new URL(gate.url);
  for (const destination of ['evil.example:443', 'registry.npmjs.org:80', '127.0.0.1:443', 'registry.npmjs.org.evil.example:443']) {
    const response = await new Promise((resolve, reject) => {
      const socket = net.connect(Number(endpoint.port), endpoint.hostname);
      let bytes = '';
      socket.setTimeout(2000, () => { socket.destroy(); reject(new Error('gate test timeout')); });
      socket.once('connect', () => socket.write(`CONNECT ${destination} HTTP/1.1\r\nHost: ${destination}\r\n\r\n`));
      socket.on('data', chunk => { bytes += chunk; }); socket.once('end', () => resolve(bytes)); socket.once('error', reject);
    });
    assert.match(response, /403 Forbidden/);
  }
  await gate.close();
});

test('valid-shaped wrong integrity and network failure never publish or write shared sentinels', async () => {
  const f = await fixture('integrity-network');
  const shared = path.join(f.root, 'shared'); fs.mkdirSync(shared); write(path.join(shared, 'sentinel'), 'unchanged');
  const sharedBefore = payloadManifest(shared);
  const liveBefore = payloadManifest(f.profile, { links: true });
  const broken = structuredClone(f.beforeLock);
  broken.packages['is-number@7.0.0'].resolution.integrity = `sha512-${Buffer.alloc(64).toString('base64')}`;
  write(path.join(f.candidate, 'pnpm-lock.yaml'), stringify(broken));
  const privateRoot = path.join(f.root, 'bad-integrity'); fs.mkdirSync(privateRoot);
  const previous = { NODE_OPTIONS: process.env.NODE_OPTIONS, npm_config_store_dir: process.env.npm_config_store_dir };
  process.env.NODE_OPTIONS = '--require=/forbidden-config-execution'; process.env.npm_config_store_dir = shared;
  let frozen = false;
  try {
    await assert.rejects(prepareCandidateDependencies({ ...f, beforeLock: broken, privateRoot, config: candidateConfig(f.candidate), runPnpm: async (argv, options) => {
      assert.equal(options.env.NODE_OPTIONS, undefined);
      assert.ok(options.env.npm_config_store_dir.startsWith(privateRoot));
      if (argv.includes('--frozen-lockfile')) frozen = true;
      return runner(argv, options);
    } }), { code: 5 });
  } finally {
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  assert.equal(frozen, false, 'pnpm corrected the bad integrity during lock generation; comparison must refuse it before acquisition');
  assert.deepEqual(payloadManifest(shared), sharedBefore); assert.deepEqual(payloadManifest(f.profile, { links: true }), liveBefore);
  write(path.join(f.candidate, 'pnpm-lock.yaml'), stringify(f.beforeLock));
  const networkRoot = path.join(f.root, 'network-denied'); fs.mkdirSync(networkRoot);
  await assert.rejects(prepareCandidateDependencies({ ...f, privateRoot: networkRoot, config: candidateConfig(f.candidate), runPnpm: (argv, options) => runner(
    argv[0] === 'install' ? [...argv.filter(arg => !arg.includes('proxy=')), '--https-proxy=http://127.0.0.1:1', '--proxy=http://127.0.0.1:1'] : argv,
    { ...options, env: { ...options.env, HTTPS_PROXY: 'http://127.0.0.1:1', HTTP_PROXY: 'http://127.0.0.1:1', https_proxy: 'http://127.0.0.1:1', http_proxy: 'http://127.0.0.1:1' } }) }), { code: 5 });
  assert.deepEqual(payloadManifest(f.profile, { links: true }), liveBefore);
});

test('configuration source preflight recursively rejects redirects before any runner call', async () => {
  const f = await fixture('override-preflight', { registry: false });
  const workspaceFile = path.join(f.candidate, 'pnpm-workspace.yaml');
  const original = readYaml(workspaceFile);
  const before = payloadManifest(f.profile, { links: true });
  for (const source of ['file:../unapproved', 'link:../unapproved', 'git+ssh://host/repo', 'git://host/repo',
    'git@host:repo', 'github:owner/repo', 'owner/repo', 'https://registry.npmjs.org/a.tgz',
    'https://unknown.invalid/a.tgz', 'ftp://unknown.invalid/a.tgz', '../local', '/absolute', 'C:\\local', '$@fixture/viewer']) {
    for (const patch of [{ overrides: { viewer: source } }, { overrides: { parent: { viewer: source } } },
      { peerDependencyRules: { allowedVersions: { viewer: source } } }]) {
      write(workspaceFile, stringify({ ...original, ...patch }));
      let calls = 0;
      await assert.rejects(prepareCandidateDependencies({ ...f, config: candidateConfig(f.candidate), runPnpm: async () => { calls++; return { code: 9, stdout: '' }; } }), { code: 5, message: 'candidate dependency preparation rejected' });
      assert.equal(calls, 0, source);
    }
  }
  write(workspaceFile, stringify(original));
  assert.deepEqual(payloadManifest(f.profile, { links: true }), before);
});

test('configuration preflight preserves semver overrides and scoped peer rules', async () => {
  const f = await fixture('override-semver');
  const workspaceFile = path.join(f.candidate, 'pnpm-workspace.yaml');
  const original = readYaml(workspaceFile);
  const rules = { allowedVersions: { '@scope/peer': '^1.0.0 || ~2.0.0' }, ignoreMissing: ['@scope/peer'], allowAny: ['@scope/*'] };
  for (const range of ['1.2.3', '^1.0.0', '~1.2', '~*', '>=1 <3', '1.0.0 - 2.0.0', '*', '1.x', '1.2.3-beta.1+build', '$is-number', '-']) {
    const workspace = { ...original, overrides: { 'parent@^1>child': range }, peerDependencyRules: rules };
    write(workspaceFile, stringify(workspace));
    let installs = 0;
    await assert.rejects(prepareCandidateDependencies({ ...f, config: candidateConfig(f.candidate), runPnpm: async argv => {
      if (argv[0] === '--version') return { code: 0, signal: null, stdout: '11.7.0' };
      installs++; return { code: 9, signal: null, stdout: '' };
    } }), /candidate pnpm install failed/);
    assert.equal(installs, 1, range);
    assert.deepEqual(readYaml(workspaceFile), workspace);
  }
  assert.doesNotThrow(() => validateConfigurationSources({ overrides: { peer: '$@scope/peer' } }, { dependencies: { '@scope/peer': '^1.0.0' } }));
  assert.throws(() => validateConfigurationSources({ overrides: { peer: '$peer' } }, { dependencies: { peer: '$peer' } }), /dependency reference/);
  assert.throws(() => validateConfigurationSources({ overrides: { peer: '$missing' } }, {}), /dependency reference/);
  const real = await fixture('override-semver-real', { workspaceExtra: { overrides: { 'is-number': '^7.0.0' } } });
  const receipt = await prepareCandidateDependencies({ ...real, config: candidateConfig(real.candidate), runPnpm: runner });
  assert.equal(receipt.acquisition.frozenOffline, true);
  assert.deepEqual(readYaml(path.join(real.candidate, 'pnpm-lock.yaml')).overrides, { 'is-number': '^7.0.0' });
  const inspector = new GraphInspector(real.candidate);
  const listJson = JSON.parse(await invoke(['list', '--json', '--depth', 'Infinity'], real.candidate, real.seedEnv));
  inspector.compare(real.before, inspector.capture({ listJson }), real.request);
});

test('candidate refuses unknown registries, authentication and wrong integrity before runner', async () => {
  const f = await fixture('invalid');
  for (const patch of [{ tarball: 'https://evil.example/a.tgz' }, { tarball: 'https://user:secret@registry.npmjs.org/a.tgz' }, { integrity: 'sha1-bad' }]) {
    const lock = structuredClone(f.beforeLock); Object.assign(lock.packages['is-number@7.0.0'].resolution, patch);
    let called = false;
    await assert.rejects(prepareCandidateDependencies({ ...f, beforeLock: lock, config: candidateConfig(f.candidate), runPnpm: async () => { called = true; } }), { code: 5 });
    assert.equal(called, false);
  }
  const targetLock = structuredClone(f.beforeLock);
  targetLock.packages['@fixture/viewer@9.0.0'] = { resolution: { integrity: `sha512-${Buffer.alloc(64).toString('base64')}` } };
  await assert.rejects(prepareCandidateDependencies({ ...f, beforeLock: targetLock, config: candidateConfig(f.candidate), runPnpm: runner }), /remote target substitution/);
  const sourceManifest = path.join(f.candidate, managedSpec(f.request.name).slice(5), 'package.json');
  const originalManifest = fs.readFileSync(sourceManifest);
  const hostile = JSON.parse(originalManifest); hostile.dependencies = { '@fixture/viewer': '9.0.0' };
  fs.writeFileSync(sourceManifest, JSON.stringify(hostile));
  await assert.rejects(prepareCandidateDependencies({ ...f, config: candidateConfig(f.candidate), runPnpm: runner }), /nested target/);
  fs.writeFileSync(sourceManifest, originalManifest);
  const missingRoot = path.join(f.root, 'missing-cache'); fs.mkdirSync(missingRoot);
  await assert.rejects(prepareCandidateDependencies({ ...f, privateRoot: missingRoot, config: { ...candidateConfig(f.candidate), offlineOnly: true }, runPnpm: runner }), /pnpm install failed/);
});
