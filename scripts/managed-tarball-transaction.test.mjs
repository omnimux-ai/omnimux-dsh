import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ManagedSync, pnpmEnvironment, runPnpm, captureRecoveryInput } from './managed-tarball.mjs';
import { GraphInspector, hash, payloadManifest, stable } from './materialize-graph.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(tmpdir(), 'managed-transaction-'));
after(() => { if (!process.env.MANAGED_TEST_RETAIN) fs.rmSync(scratch, { recursive: true, force: true }); });

function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
export async function fixture(label, { nodeLinker = 'hoisted', filtered = false } = {}) {
  const home = path.join(scratch, label);
  const task = path.join(home, '.dsh-dev/tasks/synthetic-seed');
  const profile = path.join(task, 'profiles/omnimux-dev-synthetic-seed');
  const source = path.join(home, 'input');
  const metadata = { name: '@fixture/viewer', version: '0.1.0', main: 'index.js',
    dsh: { bundle: { patch: './patch.yml', client: './client.js' } },
    peerDependencies: { peer: '1.0.0' }, scripts: { install: 'node -e "require(\'fs\').writeFileSync(\'SCRIPT-RAN\',\'bad\')"' },
    ...(filtered ? { files: ['index.js', 'client.js', 'patch.yml'] } : {}) };
  if (process.env.MANAGED_TEST_HOST_FIXTURE) delete metadata.scripts;
  write(path.join(source, 'package.json'), JSON.stringify(metadata));
  write(path.join(source, 'index.js'), 'module.exports = 778;\n');
  write(path.join(source, 'client.js'), '/* synthetic client */\n');
  write(path.join(source, 'patch.yml'), '[]\n');
  write(path.join(source, '.hidden'), 'hidden\n');
  write(path.join(source, 'test/example.js'), '// synthetic test\n');
  const tarball = path.join(home, 'viewer.tgz');
  const result = spawnSync('python3', ['-c', 'import sys,tarfile\nwith tarfile.open(sys.argv[2],"w:gz") as t:t.add(sys.argv[1],arcname="package")', source, tarball], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const deps = { '@fixture/viewer': `file:${tarball}` };
  for (const name of ['peer', 'consumer']) {
    const directory = path.join(profile, '.materialize-snapshots/plugins', name);
    write(path.join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js', ...(name === 'consumer' ? { peerDependencies: { peer: '1.0.0' } } : {}) }));
    write(path.join(directory, 'index.js'), `module.exports = '${name}';\n`);
    deps[name] = `file:.materialize-snapshots/plugins/${name}`;
  }
  write(path.join(profile, 'package.json'), JSON.stringify({ name: 'synthetic-profile', private: true, packageManager: 'pnpm@11.7.0', dependencies: deps,
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@fixture/viewer'] } } }));
  write(path.join(profile, 'pnpm-workspace.yaml'), `packages:\n  - .\nnodeLinker: ${nodeLinker}\nignoredBuiltDependencies:\n  - '@fixture/viewer'\n`);
  write(path.join(profile, 'cordis.patch.yml'), process.env.MANAGED_TEST_HOST_FIXTURE ? '# synthetic Host overlay\n' : '[]\n');
  write(path.join(profile, 'settings.json'), '{"synthetic":true}\n');
  write(path.join(profile, 'presets/sentinel'), 'unchanged');
  const env = pnpmEnvironment(home);
  const install = await runPnpm(['install', '--offline', '--ignore-scripts', '--ignore-pnpmfile', '--package-import-method=copy', `--store-dir=${home}/initial-store`], { cwd: profile, env });
  assert.equal(install.code, 0, JSON.stringify(install));
  return { home, task, profile, tarball, request: { target: task, profile, tarball, name: '@fixture/viewer', version: '0.1.0', sha256: hash(fs.readFileSync(tarball)) } };
}

export async function transitionFixture(label = 'transition') {
  const f = await fixture(label);
  const adopted = await new ManagedSync(f.request, { error(error) { console.error(error.stack); } }).run();
  assert.equal(adopted.code, 0, JSON.stringify(adopted));
  const source = path.join(f.home, 'input');
  const metadata = JSON.parse(fs.readFileSync(path.join(source, 'package.json')));
  metadata.version = '0.1.1-omnimux.765.1';
  metadata.peerDependencies.peer = '^1.0.0';
  write(path.join(source, 'package.json'), JSON.stringify(metadata));
  write(path.join(source, 'index.js'), 'module.exports = 839;\n');
  const tarball = path.join(f.home, 'new-viewer.tgz');
  const packed = spawnSync('python3', ['-c', 'import sys,tarfile\nwith tarfile.open(sys.argv[2],"w:gz") as t:t.add(sys.argv[1],arcname="package")', source, tarball], { encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr);
  const request = { ...f.request, tarball, version: metadata.version, sha256: hash(fs.readFileSync(tarball)),
    transition: { before: { tarball: f.tarball, version: f.request.version, sha256: f.request.sha256, receiptId: adopted.transactionId },
      after: { sourceRepo: 'https://github.com/Crosery/dsh-viewer.git', sourceCommit: 'ccfc0a7c6cfa692aa737f48d9e8c97c41db82950', qaReceiptDigest: 'a'.repeat(64) }, reverseReceiptId: null } };
  request.transition.after.qaReceipt = path.join(f.home, 'release-qa.md');
  write(request.transition.after.qaReceipt, `IS_PASS: YES; NoOne; ${request.version}; ${request.sha256}; ${request.transition.after.sourceCommit}`);
  request.transition.after.qaReceiptDigest = hash(fs.readFileSync(request.transition.after.qaReceipt));
  return { f, request, metadata, tarball };
}

test('receipt-bound transition exchanges managed source and preserves peers', async () => {
  const { f, request, metadata, tarball } = await transitionFixture();
  let competingWriterRejected = false;
  const result = await new ManagedSync(request, { error(error) { console.error(error.stack); }, async checkpoint(phase, sync) {
    if (phase === 'lock-generated') {
      const competing = await new ManagedSync(structuredClone(request)).run();
      assert.notEqual(competing.code, 0, 'concurrent transition must not publish');
      competingWriterRejected = true;
    }
    if (phase === 'lock-generated' && process.env.MANAGED_TEST_EVIDENCE) {
      write(path.join(process.env.MANAGED_TEST_EVIDENCE, 'transition-before.yaml'), fs.readFileSync(path.join(f.profile, 'pnpm-lock.yaml')));
      write(path.join(process.env.MANAGED_TEST_EVIDENCE, 'transition-after.yaml'), fs.readFileSync(path.join(sync.candidate, 'pnpm-lock.yaml')));
    }
  } }).run();
  assert.equal(result.code, 0, JSON.stringify(result));
  assert.equal(result.status, 'committed');
  assert.equal(competingWriterRejected, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.profile, '.materialize-snapshots/plugins/@fixture/viewer/package.json'))).version, metadata.version);
  const unchanged = await new ManagedSync(structuredClone(request), { checkpoint() { assert.fail('unchanged transition must not run candidate'); }, error(error) { console.error(error.stack); } }).run();
  assert.equal(unchanged.status, 'unchanged', JSON.stringify(unchanged));
  const reverse = { ...f.request, transition: { before: { tarball, version: metadata.version, sha256: request.sha256, receiptId: result.transactionId },
    after: { ...request.transition.after }, reverseReceiptId: result.transactionId } };
  const restored = await new ManagedSync(reverse, { error(error) { console.error(error.stack); } }).run();
  assert.equal(restored.status, 'committed', JSON.stringify(restored));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.profile, '.materialize-snapshots/plugins/@fixture/viewer/package.json'))).version, '0.1.0');
});

test('transition rejects identity tampering and non-target candidate mutation before publication', async () => {
  const { f, request } = await transitionFixture('transition-rejections');
  const before = payloadManifest(f.profile, { exclude: ['.materialize-transactions', '.materialize.lock'], links: true }).digest;
  for (const mutate of [r => { r.transition.before.sha256 = '0'.repeat(64); },
    r => { r.transition.before.version = '0.0.9'; }, r => { r.transition.before.receiptId = '0'.repeat(36); },
    r => { r.transition.after.qaReceiptDigest = '0'.repeat(64); }, r => { r.transition.after.sourceCommit = '0'.repeat(40); },
    r => { r.transition.reverseReceiptId = r.transition.before.receiptId; }, r => { r.sha256 = '0'.repeat(64); }]) {
    const changed = structuredClone(request); mutate(changed);
    const result = await new ManagedSync(changed).run();
    assert.notEqual(result.code, 0, JSON.stringify(result));
    assert.equal(payloadManifest(f.profile, { exclude: ['.materialize-transactions', '.materialize.lock'], links: true }).digest, before);
  }
  const result = await new ManagedSync(structuredClone(request), { checkpoint(phase, sync) {
    if (phase === 'source-prepare') return;
    if (phase === 'lock-generated') write(path.join(sync.candidate, '.materialize-snapshots/plugins/consumer/index.js'), 'unapproved');
  } }).run();
  assert.notEqual(result.code, 0, JSON.stringify(result));
  assert.equal(payloadManifest(f.profile, { exclude: ['.materialize-transactions', '.materialize.lock'], links: true }).digest, before);
});

for (const phase of [...Array.from({ length: 8 }, (_, i) => [`before-rename-${i + 1}`, `after-rename-${i + 1}`]).flat(), 'live-verify']) {
  test(`transition fault ${phase} restores source and complete old generation`, async () => {
    const { f, request } = await transitionFixture(`transition-${phase}`);
    const before = payloadManifest(f.profile, { exclude: ['.materialize-transactions', '.materialize.lock'], links: true });
    let hit = false;
    const result = await new ManagedSync(request, { checkpoint(point) {
      if (point === phase) { hit = true; throw new Error('injected transition fault'); }
    } }).run();
    assert.equal(hit, true, JSON.stringify(result));
    assert.equal(result.code, 6, JSON.stringify(result));
    assert.equal(stable(payloadManifest(f.profile, { exclude: ['.materialize-transactions', '.materialize.lock'], links: true })), stable(before));
  });
}

async function capture(f) {
  const result = await runPnpm(['list', '--json', '--depth', 'Infinity'], { cwd: f.profile, env: pnpmEnvironment(path.join(f.home, 'inspect-runtime')) });
  assert.equal(result.code, 0, JSON.stringify(result));
  const approval = fs.existsSync(f.tarball) ? JSON.parse(spawnSync('python3', [path.join(here, 'managed-tarball-archive.py'), 'inspect'], { input: JSON.stringify(f.request), encoding: 'utf8' }).stdout) : null;
  return new GraphInspector(f.profile).capture({ listJson: JSON.parse(result.stdout), approvedPayloads: approval ? { '@fixture/viewer': approval } : {} });
}

for (const nodeLinker of ['hoisted', 'isolated']) test(`real pnpm ${nodeLinker} adopts full payload and preserves peer closure`, async () => {
  const f = await fixture(nodeLinker, { nodeLinker });
  const before = await capture(f);
  const result = await new ManagedSync(f.request, { error(error) { console.error(error.stack); }, checkpoint(phase, sync) {
    if (phase === 'lock-generated' && process.env.MANAGED_TEST_EVIDENCE) {
      write(path.join(process.env.MANAGED_TEST_EVIDENCE, nodeLinker + '-before.yaml'), fs.readFileSync(path.join(f.profile, 'pnpm-lock.yaml')));
      write(path.join(process.env.MANAGED_TEST_EVIDENCE, nodeLinker + '-candidate.yaml'), fs.readFileSync(path.join(sync.candidate, 'pnpm-lock.yaml')));
    }
  } }).run();
  assert.equal(result.code, 0, JSON.stringify(result));
  assert.equal(result.status, 'committed');
  const after = await capture(f);
  new GraphInspector(f.profile).compare(before, after, f.request);
  const receipt = JSON.parse(fs.readFileSync(path.join(f.profile, '.materialize-transactions', result.transactionId, 'journal.json')));
  assert.ok(receipt.backup.verified);
  assert.ok(Buffer.byteLength(JSON.stringify(receipt)) < 65536);
  assert.equal(receipt.before, undefined);
  assert.ok(fs.existsSync(receipt.cache.storeRef));
  assert.equal(fs.existsSync(path.join(f.profile, 'SCRIPT-RAN')), false);
  const unchanged = await new ManagedSync(f.request, { checkpoint() { assert.fail('no pnpm or candidate for no-op'); } }).run();
  assert.equal(unchanged.status, 'unchanged', JSON.stringify(unchanged));
  if (process.env.MANAGED_TEST_RETAIN) write(path.join(process.env.MANAGED_TEST_RETAIN, nodeLinker + '-seed.json'), JSON.stringify(f));
});

test('real pnpm directory files filtering rejects without modifying live graph', async () => {
  const f = await fixture('filtered', { filtered: true });
  const before = await capture(f);
  const result = await new ManagedSync(f.request).run();
  assert.notEqual(result.code, 0);
  assert.equal(stable(await capture(f)), stable(before));
});

for (const phase of ['source-prepare', 'lock-generation', 'install', 'prepared', ...Array.from({ length: 7 }, (_, i) => [`before-rename-${i + 1}`, `after-rename-${i + 1}`]).flat(), 'live-verify']) {
  test(`injected ${phase} restores the entire previous graph`, async () => {
    const f = await fixture('failure-' + phase);
    const before = await capture(f);
    let hit = false;
    const result = await new ManagedSync(f.request, { checkpoint(current) { if (current === phase) { hit = true; throw new Error('injected failure'); } } }).run();
    assert.equal(hit, true, JSON.stringify(result));
    assert.notEqual(result.code, 0);
    assert.notEqual(result.status, 'recovery-required', JSON.stringify(result));
    assert.equal(stable(await capture(f)), stable(before));
  });
}

test('forged backup receipt cannot reach PREPARED', async () => {
  const f = await fixture('forged-backup');
  let prepared = false;
  const before = await capture(f);
  const result = await new ManagedSync(f.request, { recoveryReceipt: async () => ({ batchId: 'fake', verified: true, digest: 'fake' }),
    checkpoint(phase) { if (phase === 'prepared') prepared = true; } }).run();
  assert.equal(result.code, 5);
  assert.equal(prepared, false);
  assert.equal(stable(await capture(f)), stable(before));
});

test('PREPARING external settings drift is rejected without overwriting or blocking an unchanged live graph', async () => {
  const f = await fixture('preparing-drift');
  const before = payloadManifest(path.join(f.profile, 'node_modules'), { links: true }).digest;
  const result = await new ManagedSync(f.request, { checkpoint(phase) {
    if (phase === 'source-prepare') { write(path.join(f.profile, 'settings.json'), 'external writer'); throw new Error('drift'); }
  } }).run();
  assert.equal(result.code, 5);
  assert.equal(result.status, 'rejected');
  assert.equal(payloadManifest(path.join(f.profile, 'node_modules'), { links: true }).digest, before);
  assert.equal(fs.readFileSync(path.join(f.profile, 'settings.json'), 'utf8'), 'external writer');
});

test('input or protected data drift before publication rejects without overwriting it', async () => {
  const f = await fixture('protected-drift');
  const installed = payloadManifest(path.join(f.profile, 'node_modules'), { links: true }).digest;
  const result = await new ManagedSync(f.request, { checkpoint(phase) { if (phase === 'prepared') write(path.join(f.profile, 'settings.json'), '{"changedByOtherWriter":true}'); } }).run();
  assert.notEqual(result.code, 0);
  assert.equal(payloadManifest(path.join(f.profile, 'node_modules'), { links: true }).digest, installed);
  assert.match(fs.readFileSync(path.join(f.profile, 'settings.json'), 'utf8'), /changedByOtherWriter/);
});

test('rebuilds relocated candidate with original tarball and installation removed', async () => {
  const f = await fixture('relocation');
  const result = await new ManagedSync(f.request).run();
  assert.equal(result.code, 0, JSON.stringify(result));
  const before = await capture(f);
  const relocated = path.join(f.home, 'relocated');
  fs.mkdirSync(relocated);
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) fs.copyFileSync(path.join(f.profile, file), path.join(relocated, file));
  fs.cpSync(path.join(f.profile, '.materialize-snapshots'), path.join(relocated, '.materialize-snapshots'), { recursive: true });
  fs.rmSync(f.tarball);
  fs.rmSync(f.profile, { recursive: true });
  const installed = await runPnpm(['install', '--frozen-lockfile', '--ignore-scripts', '--ignore-pnpmfile', '--offline', '--package-import-method=copy', `--store-dir=${f.home}/relocated-store`], { cwd: relocated, env: pnpmEnvironment(f.home) });
  assert.equal(installed.code, 0, JSON.stringify(installed));
  const after = await capture({ ...f, profile: relocated });
  assert.equal(stable(before.nodes), stable(after.nodes));
  assert.equal(stable(before.resolutionGraph), stable(after.resolutionGraph));
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL']) test(`${signal} after rename recovers from persisted intent without original input`, async () => {
  const f = await fixture(`signal-${signal}`);
  const before = await capture(f);
  const runner = `import {ManagedSync} from ${JSON.stringify(new URL('./managed-tarball.mjs', import.meta.url).href)};const r=await new ManagedSync(JSON.parse(process.argv[1]),{async checkpoint(p){if(p==='after-rename-2'){process.kill(process.pid,${JSON.stringify(signal)});await new Promise(r=>setTimeout(r,30));}}}).run();console.log(JSON.stringify(r));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', runner, JSON.stringify(f.request)], { encoding: 'utf8', timeout: 60000 });
  if (signal === 'SIGKILL') assert.equal(result.signal, signal);
  else assert.equal(JSON.parse(result.stdout).code, 6, result.stdout);
  fs.rmSync(f.tarball);
  const id = fs.readdirSync(path.join(f.profile, '.materialize-transactions'))[0];
  const pending = spawnSync('python3', [path.join(here, 'managed-tarball-archive.py'), 'pending', f.profile], { encoding: 'utf8' });
  assert.equal(pending.status, signal === 'SIGKILL' ? 7 : 0);
  const recovered = await new ManagedSync({ ...f.request, recover: id }).run();
  assert.equal(recovered.status, 'recovered', JSON.stringify(recovered));
  assert.equal(payloadManifest(path.join(f.profile, 'node_modules'), { links: true }).digest, before.fullInstall);
  assert.equal(hash(fs.readFileSync(path.join(f.profile, 'package.json'))), before.raw.manifest);
  assert.equal(hash(fs.readFileSync(path.join(f.profile, 'pnpm-lock.yaml'))), before.raw.lock);
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL']) test(`${signal} during preparation leaves live state intact and permits explicit recovery`, async () => {
  const f = await fixture(`preparation-${signal}`);
  const before = await capture(f);
  const runner = `import {ManagedSync} from ${JSON.stringify(new URL('./managed-tarball.mjs', import.meta.url).href)};const r=await new ManagedSync(JSON.parse(process.argv[1]),{async checkpoint(p){if(p==='lock-generated'){process.kill(process.pid,${JSON.stringify(signal)});await new Promise(r=>setTimeout(r,30));}}}).run();console.log(JSON.stringify(r));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', runner, JSON.stringify(f.request)], { encoding: 'utf8', timeout: 60000 });
  if (signal === 'SIGKILL') assert.equal(result.signal, signal);
  else assert.equal(JSON.parse(result.stdout).code, 5, result.stdout);
  const id = fs.readdirSync(path.join(f.profile, '.materialize-transactions'))[0];
  const pending = () => spawnSync('python3', [path.join(here, 'managed-tarball-archive.py'), 'pending', f.profile]).status;
  assert.equal(pending(), signal === 'SIGKILL' ? 7 : 0);
  fs.rmSync(f.tarball);
  const restored = await new ManagedSync({ ...f.request, recover: id }).run();
  assert.equal(restored.code, 0, JSON.stringify(restored));
  assert.equal(payloadManifest(path.join(f.profile, 'node_modules'), { links: true }).digest, before.fullInstall);
  assert.equal(hash(fs.readFileSync(path.join(f.profile, 'package.json'))), before.raw.manifest);
  assert.equal(hash(fs.readFileSync(path.join(f.profile, 'pnpm-lock.yaml'))), before.raw.lock);
  assert.equal(pending(), 0);
});

for (const phase of ['before-reverse-7', 'after-reverse-7', 'before-reverse-4', 'after-reverse-4', 'before-reverse-1', 'after-reverse-1']) {
  test(`seven-move transaction recovery survives second KILL at ${phase}`, async () => {
    const f = await fixture(`multi-${phase}`);
    const before = await capture(f);
    const moduleUrl = JSON.stringify(new URL('./managed-tarball.mjs', import.meta.url).href);
    const killAt = checkpoint => `import {ManagedSync} from ${moduleUrl};await new ManagedSync(JSON.parse(process.argv[1]),{checkpoint(p){if(p===${JSON.stringify(checkpoint)})process.kill(process.pid,'SIGKILL')}}).run();`;
    const killed = spawnSync(process.execPath, ['--input-type=module', '-e', killAt('after-rename-7'), JSON.stringify(f.request)], { encoding: 'utf8', timeout: 60000 });
    assert.equal(killed.signal, 'SIGKILL', killed.stdout);
    const id = fs.readdirSync(path.join(f.profile, '.materialize-transactions'))[0];
    const request = { ...f.request, recover: id };
    fs.rmSync(f.tarball);
    const second = spawnSync(process.execPath, ['--input-type=module', '-e', killAt(phase), JSON.stringify(request)], { encoding: 'utf8', timeout: 30000 });
    assert.equal(second.signal, 'SIGKILL', second.stdout);
    assert.equal(spawnSync('python3', [path.join(here, 'managed-tarball-archive.py'), 'pending', f.profile]).status, 7);
    const restored = await new ManagedSync(request).run();
    assert.equal(restored.code, 0, JSON.stringify(restored));
    assert.equal(payloadManifest(path.join(f.profile, 'node_modules'), { links: true }).digest, before.fullInstall);
    assert.equal(hash(fs.readFileSync(path.join(f.profile, 'package.json'))), before.raw.manifest);
    assert.equal(hash(fs.readFileSync(path.join(f.profile, 'pnpm-lock.yaml'))), before.raw.lock);
    assert.equal(stable(payloadManifest(f.profile, { exclude: ['node_modules', 'package.json', 'pnpm-lock.yaml', '.materialize-transactions', '.materialize.lock'], links: true })), stable(before.protectedDigests));
  });
}

for (const point of ['fsync', 'rename', 'intent', 'result', 'terminal', 'cleanup']) test(`publication IO failure at ${point} reports exact terminal state`, async () => {
  const f = await fixture(`publication-io-${point}`);
  const before = await capture(f);
  let hit = false;
  const result = await new ManagedSync(f.request, { io(operation, sync) {
    const journal = sync.journal;
    const selected = point === 'intent' ? operation === 'journal' && journal.phase === 'COMMITTING' && journal.moves.length === 1 && !journal.moves[0].done
      : point === 'result' ? operation === 'journal' && journal.phase === 'COMMITTING' && journal.moves.length === 2 && journal.moves[1].done
        : point === 'terminal' ? operation === 'journal' && journal.phase === 'COMMITTED' : operation === point;
    if (selected && !hit) { hit = true; throw Object.assign(new Error(point === 'fsync' ? 'EIO' : 'ENOSPC'), { code: point === 'fsync' ? 'EIO' : 'ENOSPC' }); }
  } }).run();
  assert.equal(hit, true, JSON.stringify(result));
  const id = result.transactionId;
  const journal = JSON.parse(fs.readFileSync(path.join(f.profile, '.materialize-transactions', id, 'journal.json')));
  if (point === 'cleanup') {
    assert.equal(result.code, 7);
    assert.equal(journal.phase, 'COMMITTED');
    assert.equal((await new ManagedSync({ ...f.request, recover: id }).run()).status, 'committed');
    new GraphInspector(f.profile).compare(before, await capture(f), f.request);
  } else {
    assert.equal(result.code, ['fsync', 'intent'].includes(point) ? 5 : 6, JSON.stringify(result));
    assert.equal(stable(await capture(f)), stable(before));
    assert.ok(['REJECTED', 'ROLLED_BACK'].includes(journal.phase));
  }
});

test('durable COMMITTED receipt is never reported as rolled back after a save error', async () => {
  const f = await fixture('durable-terminal');
  class InterruptedTerminalSync extends ManagedSync {
    save() {
      super.save();
      if (this.journal.phase === 'COMMITTED') throw Object.assign(new Error('post-fsync EIO'), { code: 'EIO' });
    }
  }
  const result = await new InterruptedTerminalSync(f.request).run();
  assert.equal(result.code, 7, JSON.stringify(result));
  assert.equal(result.phase, 'COMMITTED');
  const restored = await new ManagedSync({ ...f.request, recover: result.transactionId }).run();
  assert.equal(restored.status, 'committed', JSON.stringify(restored));
});

test('public sync entry rejects mixed managed flags without profile writes', async () => {
  const f = await fixture('public-entry');
  const before = payloadManifest(f.profile, { links: true }).digest;
  const result = spawnSync('bash', [path.join(here, 'sync-to-app.sh'), `--managed-tarball=${f.tarball}`, '--expect-name=@fixture/viewer', '--expect-version=0.1.0', `--expect-sha256=${f.request.sha256}`, `--target=${f.task}`, '--skip-build'], {
    env: { ...process.env, HOME: f.home, OMNIMUX_ALLOW_UNMERGED_TARGET: f.task }, encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.equal(payloadManifest(f.profile, { links: true }).digest, before);
});
