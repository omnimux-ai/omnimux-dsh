import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ManagedSync, pnpmEnvironment, runPnpm } from './managed-tarball.mjs';
import { GraphInspector, hashFile, managedSpec, payloadManifest, prepareFiles, resolvePackage, stable } from './materialize-graph.mjs';

const scratch = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'managed-preparation-')));
const helper = fileURLToPath(new URL('./managed-tarball-archive.py', import.meta.url));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const write = (file, bytes) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); };

async function fixture(linker, label) {
  const home = path.join(scratch, label);
  const profile = path.join(home, 'profile');
  for (const name of ['viewer', 'consumer', 'peer']) {
    const source = path.join(profile, managedSpec(name).slice(5));
    write(path.join(source, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js',
      ...(name === 'consumer' ? { peerDependencies: { peer: '1.0.0' } } : {}) }));
    write(path.join(source, 'index.js'), `module.exports = '${name}';\n`);
  }
  write(path.join(profile, 'package.json'), JSON.stringify({ private: true, dependencies: Object.fromEntries(['viewer', 'consumer', 'peer'].map(name => [name, managedSpec(name)])) }));
  write(path.join(profile, 'pnpm-workspace.yaml'), `packages: [.]\nnodeLinker: ${linker}\n`);
  const env = pnpmEnvironment(path.join(home, 'runtime'));
  const result = await runPnpm(['install', '--offline', '--ignore-scripts', '--ignore-pnpmfile', '--package-import-method=copy'], { cwd: profile, env });
  assert.equal(result.code, 0, JSON.stringify(result));
  const tarball = path.join(home, 'viewer.tgz');
  const packed = spawnSync('python3', ['-c', "import tarfile,sys\nwith tarfile.open(sys.argv[1],'w:gz') as t:t.add(sys.argv[2],arcname='package')", tarball, path.join(profile, managedSpec('viewer').slice(5))]);
  assert.equal(packed.status, 0, packed.stderr?.toString());
  return { profile, home, env, request: { profile, target: home, tarball, name: 'viewer', version: '1.0.0', sha256: hashFile(tarball) } };
}

for (const linker of ['hoisted', 'isolated']) test(`no-op ${linker} proves the same complete graph with zero pnpm spawns`, async () => {
  const f = await fixture(linker, `no-op-${linker}`);
  const list = await runPnpm(['list', '--json', '--depth', 'Infinity'], { cwd: f.profile, env: f.env });
  assert.equal(list.code, 0);
  const inspector = new GraphInspector(f.profile);
  const expected = inspector.capture({ listJson: JSON.parse(list.stdout) });
  const bin = path.join(f.home, 'spawn-denied');
  const log = path.join(f.home, 'pnpm-spawns');
  write(path.join(bin, 'pnpm'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nexit 97\n`);
  fs.chmodSync(path.join(bin, 'pnpm'), 0o755);
  const previous = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${previous}`;
  try {
    assert.equal(stable(inspector.capture({ withoutPnpm: true })), stable(expected));
    const before = payloadManifest(f.profile, { exclude: ['.materialize-transactions'], links: true });
    const result = await new ManagedSync(f.request).run();
    assert.equal(result.status, 'unchanged', JSON.stringify(result));
    assert.deepEqual(payloadManifest(f.profile, { exclude: ['.materialize-transactions'], links: true }), before);
    assert.equal(fs.existsSync(log), false, 'no pnpm process, including version/list, may start');
    console.log(JSON.stringify({ evidence: 'no-op-spawn-negative', linker, spawns: 0, nodes: Object.keys(expected.nodes).length, graphEquivalent: true }));
  } finally { process.env.PATH = previous; }
});

for (const mutation of ['payload', 'lock-edge', 'extra-occurrence']) test(`no-pnpm rejects old graph mutation: ${mutation}`, async () => {
  const f = await fixture('hoisted', `mutation-${mutation}`);
  if (mutation === 'payload') {
    const file = path.join(resolvePackage(f.profile, 'peer', path.join(f.profile, 'node_modules')), 'index.js');
    const source = path.join(f.profile, managedSpec('peer').slice(5), 'index.js');
    const original = hashFile(source);
    console.log(JSON.stringify({ evidence: 'mutation-file-identity', sharedInode: fs.statSync(file).ino === fs.statSync(source).ino }));
    fs.unlinkSync(file);
    write(file, 'drift');
    assert.equal(hashFile(source), original, 'mutate installed occurrence only, not a pnpm-linked source');
  }
  if (mutation === 'lock-edge') {
    const file = path.join(f.profile, 'pnpm-lock.yaml');
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.includes('peer:'));
    fs.writeFileSync(file, text.replaceAll('version: file:.materialize-snapshots/plugins/peer', 'version: file:.materialize-snapshots/plugins/consumer'));
  }
  if (mutation === 'extra-occurrence') write(path.join(f.profile, 'node_modules/phantom/package.json'), '{"name":"phantom","version":"1.0.0"}');
  const log = path.join(f.home, 'pnpm-spawns');
  const bin = path.join(f.home, 'deny');
  write(path.join(bin, 'pnpm'), `#!/bin/sh\necho spawned >> '${log}'\nexit 97\n`); fs.chmodSync(path.join(bin, 'pnpm'), 0o755);
  const previous = process.env.PATH; process.env.PATH = `${bin}:${previous}`;
  try {
    const result = await new ManagedSync(f.request).run();
    assert.notEqual(result.code, 0);
    assert.notEqual(result.status, 'unchanged');
    assert.equal(fs.existsSync(log), false, 'invalid no-op must reject without launching pnpm');
  } finally { process.env.PATH = previous; }
});

test('no-op rechecks the full graph instead of reusing its initial proof', async () => {
  const f = await fixture('isolated', 'second-proof');
  let captures = 0;
  class MutatedSecondProof extends ManagedSync {
    async capture(profile, withoutPnpm) {
      captures++;
      assert.equal(withoutPnpm, true);
      if (captures === 2) write(path.join(f.profile, 'node_modules/phantom/package.json'), '{"name":"phantom","version":"1.0.0"}');
      return super.capture(profile, withoutPnpm);
    }
    async pnpm() { assert.fail('no-op never invokes the pnpm runner'); }
  }
  const result = await new MutatedSecondProof(f.request).run();
  assert.equal(captures, 2);
  assert.notEqual(result.code, 0);
  assert.notEqual(result.status, 'unchanged');
});

test('anchored recursive copy and sync preserve ordinary bytes and modes', () => {
  const home = path.join(scratch, 'ordinary-copy');
  const source = path.join(home, 'source');
  write(path.join(source, '.hidden'), 'hidden');
  write(path.join(source, 'nested/run'), 'executable');
  fs.chmodSync(path.join(source, 'nested/run'), 0o751);
  fs.chmodSync(path.join(source, 'nested'), 0o750);
  const target = path.join(home, 'target');
  prepareFiles({ operation: 'copy', source, destination: target });
  assert.deepEqual(payloadManifest(target), payloadManifest(source));
  fs.symlinkSync('../.hidden', path.join(target, 'nested/link'));
  const before = payloadManifest(target, { links: true });
  prepareFiles({ operation: 'sync', path: target });
  assert.deepEqual(payloadManifest(target, { links: true }), before);
});

test('real pnpm rejects a replaced cwd before spawn and after worker exit', async () => {
  const f = await fixture('isolated', 'worker-binding');
  const expected = prepareFiles({ operation: 'identities', paths: [f.profile] }).identities;
  fs.renameSync(f.profile, `${f.profile}-held`);
  fs.mkdirSync(f.profile);
  await assert.rejects(runPnpm(['--version'], { cwd: f.profile, env: f.env, directoryIdentities: expected }), /identity drift/);
  fs.rmdirSync(f.profile); fs.renameSync(`${f.profile}-held`, f.profile);
  const script = path.join(f.home, 'replace-cwd.cjs');
  write(script, `const fs=require('fs');const p=process.cwd();fs.renameSync(p,p+'-held');fs.mkdirSync(p);`);
  const result = await runPnpm(['exec', process.execPath, script], { cwd: f.profile, env: f.env, directoryIdentities: expected });
  assert.notEqual(result.code, 0);
  assert.equal(result.signal, 'directory-drift');
  assert.ok(fs.existsSync(`${f.profile}-held/package.json`));
});

for (const operation of ['copy-source', 'copy-target', 'sync', 'write', 'mkdir', 'recursive-source', 'recursive-target', 'recursive-sync', 'copy-source-open', 'copy-target-open']) test(`held preparation descriptors reject ${operation} binding replacement`, () => {
  const directory = path.join(scratch, `race-${operation}`);
  fs.mkdirSync(directory);
  const program = String.raw`import importlib.util,os,pathlib,sys,json
s=importlib.util.spec_from_file_location('g',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
r=pathlib.Path(sys.argv[2]);op=sys.argv[3]
for n in ['source','target','outside']:(r/n).mkdir()
(r/'source'/'file').write_bytes(b'payload');(r/'outside'/'sentinel').write_bytes(b'unchanged')
hit=False
recursive=op.startswith('recursive-')
if recursive:
 (r/'source'/'nested').mkdir();(r/'source'/'nested'/'payload').write_bytes(b'copy')
 (r/'target'/'nested').mkdir();(r/'target'/'nested'/'payload').write_bytes(b'sync')
def checkpoint(stage):
 global hit
 wanted='copy-file' if op.endswith('-open') else 'sync-directory' if op=='recursive-sync' else 'copy-directory' if recursive else 'opened'
 if hit or stage!=wanted:return
 hit=True
 victim=r/('source' if op in ('copy-source','recursive-source','copy-source-open') else 'target')
 if recursive:victim=victim/('copied' if op=='recursive-target' else 'nested')
 victim.rename(str(victim)+'-held');os.symlink(r/'outside',victim)
m.preparation_checkpoint=checkpoint
request={'operation':'copy','source':str(r/'source'/'file'),'destination':str(r/'target'/'file')}
if op in ('recursive-source','recursive-target'):request={'operation':'copy','source':str(r/'source'/'nested'),'destination':str(r/'target'/'copied')}
if op in ('sync','recursive-sync'):request={'operation':'sync','path':str(r/'target')}
if op=='write':request={'operation':'write','path':str(r/'target'/'file'),'text':'new'}
if op=='mkdir':request={'operation':'mkdir','path':str(r/'target'/'nested')}
rejected=False
try:m.prepare_files(request)
except (ValueError,OSError):rejected=True
print(json.dumps({'hit':hit,'rejected':rejected,'outside':sorted(p.name for p in (r/'outside').iterdir()),'sentinel':(r/'outside'/'sentinel').read_text()}))
`;
  const result = spawnSync('python3', ['-B', '-c', program, helper, directory, operation], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { hit: true, rejected: true, outside: ['sentinel'], sentinel: 'unchanged' });
});
