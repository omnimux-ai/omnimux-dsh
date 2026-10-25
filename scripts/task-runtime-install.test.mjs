import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPreparedTaskArchives, assertSidebarSupportIdentity, assertTaskPeerSearchBoundary, matchesTaskPeerVersion, preparePrivateTaskPackages, readSidebarSupportIdentity, taskPackagePayload } from './task-runtime-install.mjs';
import { runPnpm } from './managed-tarball.mjs';
import { privatePnpmEnvironment } from './materialize-cache.mjs';
import { hashFile } from './materialize-graph.mjs';
import { spawnSync } from 'node:child_process';

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'omnimux-task-install-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const privateRoot = join(root, 'private');
  fs.mkdirSync(privateRoot);
  const preparation = { preparationPath: privateRoot, stageRoot: join(privateRoot, 'stage'), packages: [] };
  function pkg(name, { dependencies, peers, host = false } = {}) {
    const extractedRoot = join(privateRoot, 'archive-' + name.replaceAll('/', '-'));
    const sourcePath = 'plugins/' + name;
    for (const dir of [extractedRoot, join(preparation.stageRoot, sourcePath)]) fs.mkdirSync(dir, { recursive: true });
    const manifest = { name: host ? '@deepseek-ai/dsh-base' : name, version: '1.0.0', main: 'index.js', dependencies, peerDependencies: peers, scripts: { prepare: 'exit 42', postinstall: 'exit 42', test: 'node test.js' } };
    fs.writeFileSync(join(extractedRoot, 'package.json'), JSON.stringify(manifest));
    fs.writeFileSync(join(extractedRoot, 'index.js'), 'export const candidate = 1;\n');
    const result = { name, version: '1.0.0', extractedRoot, sourcePath, sha256: 'a'.repeat(64), archiveDigest: 'b'.repeat(64) };
    preparation.packages.push(result);
    return result;
  }
  function installed(name, dependencies) {
    const source = join(root, 'node_modules', name);
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(join(source, 'package.json'), JSON.stringify({ name, version: '1.0.0', dependencies }));
    fs.writeFileSync(join(source, 'index.js'), 'export const dependency = true;\n');
    return source;
  }
  return { root, privateRoot, preparation, pkg, installed, run: () => preparePrivateTaskPackages({ preparation, root, repository: root, privateRoot }) };
}

test('private graph preserves archive payload, binds recursive production dependencies and never acquires peers', t => {
  const f = fixture(t);
  const plugin = f.pkg('omnimux', { dependencies: { helper: '^1.0.0' }, peers: { '@deepseek-ai/dsh-client-ui-primitives': '*' } });
  f.installed('helper', { nested: '1.0.0' }); f.installed('nested');
  const graph = f.run();
  assert.deepEqual(graph.records.map(item => item.name), ['omnimux', 'helper', 'nested']);
  for (const item of graph.records) assert.ok(item.target.startsWith(f.privateRoot + '/task-packages/'));
  const manifest = JSON.parse(fs.readFileSync(join(graph.targets[0].target, 'package.json')));
  assert.match(manifest.dependencies.helper, /^file:/);
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-client-ui-primitives'], '*');
  assert.equal(manifest.scripts.prepare, undefined); assert.equal(manifest.scripts.postinstall, undefined);
  assert.equal(manifest.scripts.test, 'node test.js');
  assert.ok(fs.readFileSync(join(plugin.extractedRoot, 'index.js')).equals(fs.readFileSync(join(graph.targets[0].target, 'index.js'))));
  const files = taskPackagePayload(graph.targets[0].target);
  fs.writeFileSync(join(graph.targets[0].target, 'index.js'), 'export const candidate = 2;\n');
  assert.notDeepEqual(taskPackagePayload(graph.targets[0].target), files, 'same-length installation mutation changes the proof');
});

test('declared production dependencies must exist locally; no registry fallback', t => {
  const f = fixture(t); f.pkg('omnimux', { dependencies: { absent: '^1.0.0' } });
  assert.throws(f.run, { code: 'TEST_ENV_INSTALL_DEPENDENCY_REQUIRED' });
});

test('a dependency with the wrong package identity cannot satisfy the graph', t => {
  const f = fixture(t); f.pkg('omnimux', { dependencies: { helper: '^1.0.0' } });
  const source = f.installed('helper');
  fs.writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'substitute', version: '1.0.0' }));
  assert.throws(f.run, { code: 'TEST_ENV_INSTALL_DEPENDENCY_IDENTITY' });
});

test('payload symlinks and official host substitution are refused', t => {
  const f = fixture(t); const plugin = f.pkg('omnimux');
  fs.symlinkSync('/etc/hosts', join(plugin.extractedRoot, 'escape'));
  assert.throws(f.run, { code: 'TEST_ENV_INSTALL_PAYLOAD_UNSAFE' });
  fs.unlinkSync(join(plugin.extractedRoot, 'escape'));
  fs.rmSync(join(f.privateRoot, 'task-packages'), { recursive: true });
  fs.writeFileSync(join(plugin.extractedRoot, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-base', version: '1.0.0' }));
  assert.throws(f.run, { code: 'TEST_ENV_INSTALL_HOST_OVERRIDE' });
});

test('a local dependency link that leaves admitted repository dependencies is refused', t => {
  const f = fixture(t); f.pkg('omnimux', { dependencies: { helper: '*' } });
  const foreign = fs.mkdtempSync(join(tmpdir(), 'omnimux-unadmitted-'));
  t.after(() => fs.rmSync(foreign, { recursive: true, force: true }));
  fs.writeFileSync(join(foreign, 'package.json'), JSON.stringify({ name: 'helper', version: '1.0.0' }));
  const link = join(f.preparation.stageRoot, 'plugins/omnimux/node_modules/helper');
  fs.mkdirSync(dirname(link), { recursive: true }); fs.symlinkSync(foreign, link, 'dir');
  assert.throws(f.run, { code: 'TEST_ENV_INSTALL_DEPENDENCY_UNSAFE' });
});

test('private file rewrites cannot silently accept the wrong declared production version', t => {
  const f = fixture(t); f.pkg('omnimux', { dependencies: { helper: '^2.0.0' } }); f.installed('helper');
  assert.throws(f.run, { code: 'TEST_ENV_INSTALL_DEPENDENCY_SPEC_MISMATCH' });
});

test('unsupported dependency redirects cannot be converted into admitted private files', t => {
  const f = fixture(t); f.pkg('omnimux', { dependencies: { helper: 'npm:substitute@1.0.0' } }); f.installed('helper');
  assert.throws(f.run, { code: 'TEST_ENV_INSTALL_DEPENDENCY_SPEC_UNSUPPORTED' });
});

test('a file dependency must point to the exact admitted candidate package directory', t => {
  const f = fixture(t); f.pkg('dsh-ui-kit'); f.pkg('omnimux', { dependencies: { 'dsh-ui-kit': 'file:../different-kit' } });
  fs.mkdirSync(join(f.preparation.stageRoot, 'plugins/different-kit'));
  assert.throws(f.run, { code: 'TEST_ENV_INSTALL_DEPENDENCY_SPEC_MISMATCH' });
});

test('peer RC matching is limited to explicitly declared prerelease bounds', () => {
  assert.equal(matchesTaskPeerVersion('0.1.5-rc.3', '>=0.1.0-rc.6'), true);
  assert.equal(matchesTaskPeerVersion('0.1.0-rc.5', '>=0.1.0-rc.6'), false);
  assert.equal(matchesTaskPeerVersion('0.2.0-rc.1', '^0.1.2-rc.1'), false);
  assert.equal(matchesTaskPeerVersion('0.1.5-rc.3', '>=0.1.0'), false);
  assert.equal(matchesTaskPeerVersion('18.3.1', '^18.2.0'), true);
});

test('an ancestor fake peer is refused before the packaged runtime can resolve it', t => {
  const f = fixture(t); f.pkg('omnimux', { peers: { 'qa-host-peer': '^2.0.0' } }); f.installed('qa-host-peer');
  const graph = f.run();
  assert.throws(() => assertTaskPeerSearchBoundary({ installedRoot: graph.targets[0].target, privateRoot: f.privateRoot, name: 'qa-host-peer' }), { code: 'TEST_ENV_INSTALL_PEER_ANCESTOR_UNSAFE' });
  assert.doesNotThrow(() => assertTaskPeerSearchBoundary({ installedRoot: graph.targets[0].target, privateRoot: f.privateRoot, name: 'qa-absent-optional-peer' }));
});

test('fixed react-dom support stays private, preserves its own React peer and never becomes a bundle', t => {
  const f = fixture(t); f.pkg('omnimux', { peers: { 'react-dom': '>=18.2.0', react: '^18.2.0' } });
  const source = f.installed('react-dom', { helper: '^1.0.0' }); f.installed('helper');
  fs.writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'react-dom', version: '18.3.1', dependencies: { helper: '^1.0.0' }, peerDependencies: { react: '^18.3.1' } }));
  const graph = f.run();
  assert.deepEqual(graph.peerSupport.map(item => [item.name, item.version]), [['react-dom', '18.3.1']]);
  assert.equal(graph.support.length, 0); assert.equal(graph.targets.length, 1);
  assert.equal(graph.records.some(item => item.name === 'react'), false, 'React remains a packaged host peer');
  const copy = JSON.parse(fs.readFileSync(join(graph.peerSupport[0].target, 'package.json')));
  assert.equal(copy.peerDependencies.react, '^18.3.1'); assert.match(copy.dependencies.helper, /^file:/);
});

test('local peer support refuses an unreviewed react-dom version', t => {
  const f = fixture(t); f.pkg('omnimux', { peers: { 'react-dom': '>=18.2.0' } }); f.installed('react-dom');
  assert.throws(f.run, { code: 'TEST_ENV_INSTALL_PEER_SUPPORT_REQUIRED' });
});

test('ordinary transitive dependencies retain different versions in separate private instances', t => {
  const f = fixture(t); f.pkg('omnimux', { dependencies: { left: '*', right: '*' } });
  for (const [name, version] of [['left', '1.0.0'], ['right', '2.0.0']]) {
    const parent = f.installed(name, { helper: version });
    const nested = join(parent, 'node_modules/helper'); fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(join(nested, 'package.json'), JSON.stringify({ name: 'helper', version }));
    fs.writeFileSync(join(nested, 'index.js'), `export const version = '${version}';\n`);
  }
  const graph = f.run(), helpers = graph.records.filter(item => item.name === 'helper');
  assert.deepEqual(helpers.map(item => item.version), ['1.0.0', '2.0.0']);
  assert.notEqual(helpers[0].target, helpers[1].target);
  for (const parent of graph.records.filter(item => ['left', 'right'].includes(item.name))) {
    const manifest = JSON.parse(fs.readFileSync(join(parent.target, 'package.json')));
    const helper = helpers.find(item => item.version === (parent.name === 'left' ? '1.0.0' : '2.0.0'));
    assert.equal(manifest.dependencies.helper, 'file:' + helper.target);
  }
});

test('archive bytes and extracted published files are both rechecked before installation', t => {
  const f = fixture(t), plugin = f.pkg('omnimux');
  const tarball = join(f.privateRoot, 'candidate.tgz'); fs.writeFileSync(tarball, 'verified-archive');
  plugin.tarball = tarball; plugin.sha256 = hashFile(tarball);
  plugin.inspection = { entries: taskPackagePayload(plugin.extractedRoot).map(item => ({ ...item, type: 'file' })) };
  assertPreparedTaskArchives(f.preparation);
  fs.writeFileSync(join(plugin.extractedRoot, 'index.js'), 'substituted');
  assert.throws(() => assertPreparedTaskArchives(f.preparation), { code: 'TEST_ENV_INSTALL_ARCHIVE_CHANGED' });
  fs.writeFileSync(tarball, 'substituted-archive');
  assert.throws(() => assertPreparedTaskArchives(f.preparation), { code: 'TEST_ENV_INSTALL_ARCHIVE_CHANGED' });
});

test('supervised pnpm supports a caller-owned fixed executable without changing global PATH', async t => {
  const f = fixture(t), runtime = join(f.privateRoot, 'pnpm'); fs.mkdirSync(runtime);
  const tool = join(f.privateRoot, 'fixed-pnpm');
  fs.writeFileSync(tool, '#!/bin/sh\nprintf "owned-tool:%s" "$1"\n', { mode: 0o700 });
  const originalPath = process.env.PATH;
  const result = await runPnpm(['--version'], { cwd: f.privateRoot, env: privatePnpmEnvironment(runtime), executable: tool });
  assert.equal(result.code, 0); assert.equal(result.stdout, 'owned-tool:--version');
  assert.equal(process.env.PATH, originalPath);
});

test('installation supervision terminates an owned SIGTERM-resistant grandchild before returning', async t => {
  const f = fixture(t), runtime = join(f.privateRoot, 'installer'); fs.mkdirSync(runtime);
  const executable = join(f.privateRoot, 'official-cli-double'), pidFile = join(f.privateRoot, 'pnpm-child.pid');
  fs.writeFileSync(executable, `#!${process.execPath}\nconst {spawn}=require('node:child_process'),fs=require('node:fs');const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:['ignore','ignore','inherit']});fs.writeFileSync(${JSON.stringify(pidFile)},String(child.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);\n`, { mode: 0o700 });
  const result = await runPnpm(['plugin', 'add'], { cwd: f.privateRoot, env: privatePnpmEnvironment(runtime), executable, timeoutMs: 400 });
  assert.equal(result.signal, 'timeout');
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  t.after(() => { try { process.kill(pid, 'SIGKILL'); } catch {} });
  const state = spawnSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' }).stdout.trim();
  assert.ok(!state || /^Z/.test(state), 'pnpm grandchild must have terminated before owned directory cleanup');
});

test('sidebar support identity is the single source the studio peer must agree with', () => {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const identity = readSidebarSupportIdentity();
  assert.equal(identity.name, 'dsh-better-sidebar');
  assert.match(identity.version, /^\d+\.\d+\.\d+$/);
  const studio = JSON.parse(fs.readFileSync(join(repositoryRoot, 'plugins/omnimux-studio/package.json'), 'utf8'));
  assert.equal(studio.peerDependencies['dsh-better-sidebar'], identity.version,
    'omnimux-studio must declare the identity version; a version literal anywhere else drifts silently');
});

test('sidebar support gate rejects any package that drifts from the identity', () => {
  const identity = readSidebarSupportIdentity();
  assert.equal(assertSidebarSupportIdentity({ name: identity.name, version: identity.version }, identity).version, identity.version);
  assert.throws(() => assertSidebarSupportIdentity({ name: identity.name, version: '0.0.0' }, identity), /INSTALL_SUPPORT_REQUIRED/);
  assert.throws(() => assertSidebarSupportIdentity({ name: 'dsh-other-sidebar', version: identity.version }, identity), /INSTALL_SUPPORT_REQUIRED/);
  assert.throws(() => assertSidebarSupportIdentity(undefined, identity), /INSTALL_SUPPORT_REQUIRED/);
});
