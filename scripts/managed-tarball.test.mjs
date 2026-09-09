import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hash, payloadManifest, stable, compareLocks, GraphInspector } from './materialize-graph.mjs';
import { parseRequest } from './managed-tarball.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(tmpdir(), 'managed-archive-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

export function makeArchive(file, entries = [], metadata = {}) {
  const script = `import io,json,sys,tarfile\nr=json.load(sys.stdin)\nwith tarfile.open(r['file'],'w:gz',format=tarfile.PAX_FORMAT) as t:\n for e in r['entries']:\n  i=tarfile.TarInfo(e['name']); i.mode=e.get('mode',420); i.type=e.get('type','0').encode(); i.linkname=e.get('linkname',''); i.pax_headers=e.get('pax',{})\n  b=e.get('data','').encode(); i.size=len(b); t.addfile(i,io.BytesIO(b))\n`;
  const manifest = JSON.stringify({ name: '@fixture/viewer', version: '0.1.0', main: 'index.js', ...metadata });
  const result = spawnSync('python3', ['-c', script], { input: JSON.stringify({ file, entries: [{ name: 'package/package.json', data: manifest }, { name: 'package/index.js', data: 'module.exports = 778;\n' }, ...entries] }), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return { tarball: file, name: '@fixture/viewer', version: '0.1.0', sha256: hash(fs.readFileSync(file)) };
}

test('transition lock exception preserves every non-target field and peer provider', () => {
  const name = '@fixture/viewer', spec = `file:.materialize-snapshots/plugins/${name}`;
  const before = { importers: { '.': { dependencies: { [name]: { specifier: spec, version: spec } } } },
    packages: { [`${name}@${spec}`]: { resolution: { type: 'directory', directory: spec.slice(5) }, peerDependencies: { peer: '1.0.0' } },
      'peer@1.0.0': { resolution: { integrity: 'sha512-old' } } },
    snapshots: { [`${name}@${spec}`]: { dependencies: { peer: '1.0.0' } }, 'peer@1.0.0': {} } };
  const after = structuredClone(before);
  after.packages[`${name}@${spec}`].peerDependencies.peer = '^1.0.0';
  const request = { name, transition: { before: { version: '0.1.0', peerDependencies: { peer: '1.0.0' } },
    after: { version: '0.1.1-omnimux.765.1', peerDependencies: { peer: '^1.0.0' } } } };
  assert.doesNotThrow(() => compareLocks(before, after, request));
  for (const mutate of [lock => { lock.packages['peer@1.0.0'].resolution.integrity = 'changed'; },
    lock => { lock.snapshots[`${name}@${spec}`].dependencies.peer = '2.0.0'; },
    lock => { lock.packages[`${name}@${spec}`].version = '9.0.0'; },
    lock => { lock.packages[`${name}@${spec}`].peerDependencies.peer = '*'; },
    lock => { lock.packages[`${name}@${spec}(peer@2.0.0)`] = {}; }]) {
    const changed = structuredClone(after); mutate(changed);
    assert.throws(() => compareLocks(before, changed, request));
  }
});

test('transition graph rejects duplicate target, non-target bytes, bins and visibility changes', () => {
  const name = '@fixture/viewer';
  const manifest = { dependencies: { [name]: `file:.materialize-snapshots/plugins/${name}` } };
  const before = { manifest, roots: { [name]: 'target#0' }, nodes: {
    'target#0': { name, locator: 'target', version: '0.1.0', payload: { digest: 'old' } },
    'peer#0': { name: 'peer', locator: 'peer', version: '1.0.0', payload: { digest: 'peer' } } },
    resolutionGraph: [JSON.stringify(['target#0', 'peer', 'peer#0', 'peer'])], absent: [], bins: [] };
  const after = structuredClone(before);
  after.nodes['target#0'].version = '0.1.1-omnimux.765.1'; after.nodes['target#0'].payload.digest = 'new';
  const request = { name, transition: { before: { version: '0.1.0', payloadDigest: 'old' }, after: { version: '0.1.1-omnimux.765.1', payloadDigest: 'new' } } };
  for (const mutate of [state => { state.nodes['duplicate'] = state.nodes['target#0']; },
    state => { state.nodes['peer#0'].payload.digest = 'drift'; }, state => { state.bins.push({ path: 'unexpected' }); },
    state => { state.resolutionGraph = []; }]) {
    const changed = structuredClone(after); mutate(changed);
    assert.throws(() => new GraphInspector(scratch).compare(before, changed, request), /transition/);
  }
});

function guard(request, action = 'inspect') {
  return spawnSync('python3', [path.join(here, 'managed-tarball-archive.py'), action], { input: JSON.stringify(request), encoding: 'utf8' });
}

test('archive full manifest preserves hidden/test bytes and executable modes', () => {
  const request = makeArchive(path.join(scratch, 'valid.tgz'), [{ name: 'package/.hidden', data: 'hidden' }, { name: 'package/test/spec.js', data: 'test', mode: 0o755 }]);
  const destination = path.join(scratch, 'extracted');
  const result = guard({ ...request, destination }, 'extract');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(stable(JSON.parse(result.stdout).entries), stable(payloadManifest(destination).entries));
});

for (const [label, entry] of [
  ['traversal', { name: 'package/../escape' }], ['absolute', { name: '/package/escape' }],
  ['empty segment', { name: 'package//escape' }], ['dot segment', { name: 'package/./escape' }],
  ['backslash', { name: 'package/..\\escape' }], ['drive', { name: 'C:/package/escape' }],
  ['control', { name: 'package/a\nb' }], ['symlink', { name: 'package/link', type: '2', linkname: '../escape' }],
  ['hardlink', { name: 'package/link', type: '1', linkname: 'package/index.js' }],
  ['FIFO', { name: 'package/fifo', type: '6' }], ['device', { name: 'package/device', type: '3' }],
  ['unknown type', { name: 'package/unknown', type: 'Z' }], ['setuid', { name: 'package/suid', mode: 0o4755 }],
  ['unreadable', { name: 'package/unreadable', mode: 0 }], ['duplicate', { name: 'package/index.js' }],
  ['case collision', { name: 'package/INDEX.js' }], ['file parent', { name: 'package/index.js/sub' }],
  ['PAX linkpath', { name: 'package/pax', pax: { linkpath: '/escape' } }],
  ['path length', { name: 'package/' + 'a'.repeat(1025) }], ['depth', { name: 'package/' + 'a/'.repeat(33) + 'x' }],
]) {
  test(`archive rejects ${label} before creating destination`, () => {
    const request = makeArchive(path.join(scratch, label.replaceAll(' ', '-') + '.tgz'), [entry]);
    const destination = path.join(scratch, label.replaceAll(' ', '-') + '-out');
    assert.equal(guard({ ...request, destination }, 'extract').status, 3);
    assert.equal(fs.existsSync(destination), false);
  });
}

test('archive rejects NFC collisions', () => {
  const request = makeArchive(path.join(scratch, 'nfc.tgz'), [{ name: 'package/é' }, { name: 'package/é' }]);
  assert.equal(guard(request).status, 3);
});
for (const field of ['sha256', 'name', 'version']) test(`archive rejects wrong ${field}`, () => {
  const request = makeArchive(path.join(scratch, `wrong-${field}.tgz`));
  request[field] = field === 'sha256' ? '0'.repeat(64) : 'wrong';
  assert.equal(guard(request).status, 3);
});

test('strict package JSON rejects duplicate nested key and non-finite number', () => {
  for (const raw of ['{"name":"@fixture/viewer","version":"0.1.0","x":{"a":1,"a":2}}', '{"name":"@fixture/viewer","version":"0.1.0","x":NaN}']) {
    const file = path.join(scratch, 'ambiguous.json');
    fs.writeFileSync(file, raw);
    const result = spawnSync('python3', [path.join(here, 'managed-tarball-archive.py'), 'json'], { input: JSON.stringify({ path: file }), encoding: 'utf8' });
    assert.equal(result.status, 3);
  }
});

test('gzip truncation and trailing garbage are rejected', () => {
  for (const kind of ['truncated', 'trailing']) {
    const request = makeArchive(path.join(scratch, kind + '.tgz'));
    const data = fs.readFileSync(request.tarball);
    fs.writeFileSync(request.tarball, kind === 'truncated' ? data.subarray(0, data.length - 8) : Buffer.concat([data, Buffer.from('garbage')]));
    request.sha256 = hash(fs.readFileSync(request.tarball));
    assert.equal(guard(request).status, 3);
  }
});

test('tar requires two complete zero end blocks inside valid gzip', () => {
  for (const [label, tail, accepted] of [
    ['none', 0, false], ['partial', 511, false], ['one', 512, false],
    ['short-second', 1023, false], ['two', 1024, true],
  ]) {
    const request = makeArchive(path.join(scratch, `tar-end-${label}.tgz`));
    const script = `import gzip,sys\np=sys.argv[1];raw=gzip.decompress(open(p,'rb').read());open(p,'wb').write(gzip.compress(raw[:2048]+bytes(int(sys.argv[2]))))\n`;
    const result = spawnSync('python3', ['-B', '-c', script, request.tarball, String(tail)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    request.sha256 = hash(fs.readFileSync(request.tarball));
    assert.equal(guard(request).status, accepted ? 0 : 3, label);
  }
});

for (const kind of ['directory', 'leaf', 'extra']) test(`extraction rejects ${kind} replacement after output FD opens`, () => {
  const request = makeArchive(path.join(scratch, `extract-race-${kind}.tgz`), [{ name: 'package/sub/data.txt', data: 'approved payload' }]);
  const destination = path.join(scratch, `extract-race-${kind}`);
  const script = `import importlib.util,json,sys,os\ns=importlib.util.spec_from_file_location('a',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nr=json.load(sys.stdin);g=m.ArchiveGuard();g.freeze(r);original=m.os.open;swapped=False\ndef opened(name,flags,*args,**kwargs):\n global swapped\n fd=original(name,flags,*args,**kwargs)\n if name=='data.txt' and flags & os.O_CREAT and not swapped:\n  swapped=True;p=r['destination']+'/sub'\n  if r['kind']=='directory':os.rename(p,p+'-detached');os.mkdir(p)\n  elif r['kind']=='leaf':os.unlink(p+'/data.txt');open(p+'/data.txt','w').write('replacement')\n  else:open(p+'/unexpected','w').write('extra')\n return fd\nm.os.open=opened\ntry:g.extractVerified(r['destination'])\nexcept (ValueError,OSError):\n assert swapped;sys.exit(3)\n`;
  const result = spawnSync('python3', ['-B', '-c', script, path.join(here, 'managed-tarball-archive.py')], { input: JSON.stringify({ ...request, destination, kind }), encoding: 'utf8' });
  assert.equal(result.status, 3, result.stderr);
});

test('symlink input and extraction ancestor are rejected', () => {
  const request = makeArchive(path.join(scratch, 'link-target.tgz'));
  fs.symlinkSync(request.tarball, path.join(scratch, 'alias.tgz'));
  assert.equal(guard({ ...request, tarball: path.join(scratch, 'alias.tgz') }).status, 3);
  fs.symlinkSync(scratch, path.join(scratch, 'parent-alias'));
  assert.equal(guard({ ...request, destination: path.join(scratch, 'parent-alias', 'out') }, 'extract').status, 3);
});

test('all fixed archive budgets reject with bounded small injected limits', () => {
  const request = makeArchive(path.join(scratch, 'limits.tgz'));
  for (const key of ['compressed', 'decoded', 'payload', 'file', 'members', 'path', 'depth', 'json']) {
    const script = `import importlib.util,json,sys\ns=importlib.util.spec_from_file_location('archive',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nl=dict(m.LIMITS);l[sys.argv[2]]=1\ntry:m.ArchiveGuard(l).freeze(json.load(sys.stdin))\nexcept (ValueError, OSError):sys.exit(3)\n`;
    const result = spawnSync('python3', ['-B', '-c', script, path.join(here, 'managed-tarball-archive.py'), key], { input: JSON.stringify(request), encoding: 'utf8' });
    assert.equal(result.status, 3, key + result.stderr);
  }
});

test('same bytes with a new input inode fail recheck', () => {
  const request = makeArchive(path.join(scratch, 'drift.tgz'));
  const script = `import importlib.util,json,sys,os\ns=importlib.util.spec_from_file_location('archive',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nr=json.load(sys.stdin);g=m.ArchiveGuard();g.freeze(r)\np=r['tarball'];b=open(p,'rb').read();os.unlink(p);open(p,'wb').write(b)\ntry:g.recheckInput()\nexcept ValueError:sys.exit(3)\n`;
  const result = spawnSync('python3', ['-B', '-c', script, path.join(here, 'managed-tarball-archive.py')], { input: JSON.stringify(request), encoding: 'utf8' });
  assert.equal(result.status, 3, result.stderr);
});

test('profile flock excludes a second writer and rejects forged inherited descriptors', () => {
  const profile = path.join(scratch, 'locked-profile');
  fs.mkdirSync(profile);
  const helper = path.join(here, 'managed-tarball-archive.py');
  const runner = `import subprocess,sys\na=subprocess.run([sys.executable,sys.argv[1],'check-locks',sys.argv[2]],close_fds=False)\nb=subprocess.run([sys.executable,sys.argv[1],'lock',sys.argv[2],'--',sys.executable,'-c','pass'],env={})\nsys.exit(0 if a.returncode==0 and b.returncode!=0 else 1)\n`;
  const result = spawnSync('python3', [helper, 'lock', profile, '--', 'python3', '-c', runner, helper, profile], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const forged = spawnSync('python3', [helper, 'check-locks', profile], { encoding: 'utf8', env: { ...process.env, OMNIMUX_PROFILE_LOCKS: JSON.stringify({ [profile]: 99 }) } });
  assert.equal(forged.status, 3);
});

test('streamed archive memory remains bounded for a large compressible payload and CRC corruption fails', () => {
  const file = path.join(scratch, 'streamed.tgz');
  const script = `import tarfile,io,json,hashlib,sys,importlib.util,tracemalloc\np=sys.argv[2]\nclass Z:\n def read(self,n):return b'x'*n\nwith tarfile.open(p,'w:gz') as t:\n b=b'{"name":"@fixture/viewer","version":"0.1.0"}';i=tarfile.TarInfo('package/package.json');i.size=len(b);t.addfile(i,io.BytesIO(b));i=tarfile.TarInfo('package/large');i.size=48<<20;t.addfile(i,Z())\ns=importlib.util.spec_from_file_location('a',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nr={'tarball':p,'name':'@fixture/viewer','version':'0.1.0','sha256':hashlib.sha256(open(p,'rb').read()).hexdigest()}\ntracemalloc.start();m.ArchiveGuard().freeze(r);peak=tracemalloc.get_traced_memory()[1];print(peak);assert peak<12<<20\n`;
  const result = spawnSync('python3', ['-B', '-c', script, path.join(here, 'managed-tarball-archive.py'), file], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  const bytes = fs.readFileSync(file); bytes[bytes.length - 8] ^= 1; fs.writeFileSync(file, bytes);
  assert.equal(guard({ tarball: file, name: '@fixture/viewer', version: '0.1.0', sha256: hash(bytes) }).status, 3);
});

test('freeze writes bounded immutable bytes and decimal identities', () => {
  const request = makeArchive(path.join(scratch, 'freeze.tgz'));
  const destination = path.join(scratch, 'frozen.tgz');
  const result = guard({ ...request, destination }, 'freeze');
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.ok(value.identity.every(item => typeof item === 'string' && /^\d+$/.test(item)));
  assert.equal(hash(fs.readFileSync(destination)), request.sha256);
  assert.equal(fs.statSync(destination).mode & 0o777, 0o400);
  assert.equal(guard({ ...request, destination }, 'freeze').status, 3);
});

test('pending rejects missing/corrupt/schema/path journals and accepts valid terminal receipt', () => {
  const profile = path.join(scratch, 'pending');
  const id = '11111111-1111-1111-1111-111111111111';
  const directory = path.join(profile, '.materialize-transactions', id);
  fs.mkdirSync(directory, { recursive: true });
  const pending = () => spawnSync('python3', [path.join(here, 'managed-tarball-archive.py'), 'pending', profile], { encoding: 'utf8' });
  assert.equal(pending().status, 7);
  const valid = { schemaVersion: 1, id, profile, phase: 'COMMITTED', name: '@fixture/viewer', moves: [] };
  for (const value of ['{', JSON.stringify({ ...valid, schemaVersion: 2 }), JSON.stringify({ ...valid, moves: [{ from: '../escape', to: 'package.json' }] })]) {
    fs.writeFileSync(path.join(directory, 'journal.json'), value);
    assert.equal(pending().status, 7);
  }
  fs.writeFileSync(path.join(directory, 'journal.json'), JSON.stringify(valid));
  assert.equal(pending().status, 0);
});

test('safeMove roundtrip uses exact journal intent and rejects ancestor substitution', () => {
  const profile = path.join(scratch, 'moves');
  const id = '22222222-2222-2222-2222-222222222222';
  const prefix = `.materialize-transactions/${id}`;
  const candidate = path.join(profile, prefix, 'candidate');
  const old = path.join(profile, prefix, 'old-generation');
  fs.mkdirSync(candidate, { recursive: true }); fs.mkdirSync(old);
  fs.writeFileSync(path.join(profile, 'package.json'), '{}');
  const to = `${prefix}/old-generation/package.json`;
  const journal = { schemaVersion: 1, id, profile, phase: 'COMMITTING', name: '@fixture/viewer', moves: [{ from: 'package.json', to }] };
  fs.writeFileSync(path.join(profile, prefix, 'journal.json'), JSON.stringify(journal));
  const stamp = file => { const s = fs.statSync(file, { bigint: true }); return [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].map(String); };
  const request = { profile, txnId: id, from: 'package.json', to, expected: { from: stamp(path.join(profile, 'package.json')), to: null } };
  const result = guard(request, 'safeMove');
  assert.equal(result.status, 0, result.stderr);
  const moved = JSON.parse(result.stdout);
  assert.equal(guard({ ...request, from: to, to: 'package.json', expected: { from: moved.after.to, to: null } }, 'safeMove').status, 0);
  const probe = guard({ paths: [profile, candidate, old] }, 'probeRecovery');
  assert.equal(probe.status, 0, probe.stderr); assert.equal(JSON.parse(probe.stdout).verified, true);
  const script = `import importlib.util,json,sys,os\ns=importlib.util.spec_from_file_location('a',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nr=json.load(sys.stdin);original=m.DirectoryAnchor.verify;swapped=False\ndef verify(self):\n global swapped\n if not swapped and len(self.bindings)>0 and self.bindings[-1][1]=='old-generation':\n  swapped=True;os.rename(r['old'],r['old']+'-moved');os.symlink(r['outside'],r['old'])\n original(self)\nm.DirectoryAnchor.verify=verify\ntry:m.safeMove(r['profile'],r['txnId'],r['from'],r['to'],r['expected'])\nexcept (ValueError,OSError):sys.exit(7)\n`;
  const outside = path.join(scratch, 'outside-move'); fs.mkdirSync(outside);
  request.expected.from = stamp(path.join(profile, 'package.json'));
  const race = spawnSync('python3', ['-B', '-c', script, path.join(here, 'managed-tarball-archive.py')], { input: JSON.stringify({ ...request, old, outside }), encoding: 'utf8' });
  assert.equal(race.status, 7, race.stderr);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.ok(fs.existsSync(path.join(profile, 'package.json')));
});

test('managed request rejects every missing identity and mixed target before writes', () => {
  const args = ['--managed-tarball=/fixture.tgz', '--expect-name=@fixture/viewer', '--expect-version=0.1.0', '--expect-sha256=' + 'a'.repeat(64)];
  for (let index = 0; index < args.length; index++) assert.throws(() => parseRequest(args.filter((_, i) => i !== index)), /required/);
  for (const extra of ['--all', '--prod', '--dsh', '--skip-build', 'omnimux', '--target=dev,prod', '--target=prod', '--profile=dev']) {
    assert.throws(() => parseRequest([...args, extra]));
  }
  assert.throws(() => parseRequest([...args, args[0]]), /duplicate/);
  assert.throws(() => parseRequest(args, { ...process.env, OMNIMUX_SYNC_TARGETS: 'dev' }), /conflicts/);
});
