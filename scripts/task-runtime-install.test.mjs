import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { assertPreparedTaskArchives, preparePrivateTaskPackages, taskPackagePayload } from './task-runtime-install.mjs';
import { runPnpm } from './managed-tarball.mjs';
import { privatePnpmEnvironment } from './materialize-cache.mjs';
import { hashFile } from './materialize-graph.mjs';

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
