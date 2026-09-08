import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { ManagedSync, runPnpm, pnpmEnvironment } from './managed-tarball.mjs';
import { payloadManifest, hashFile } from './materialize-graph.mjs';

const scratch = fs.mkdtempSync(path.join(tmpdir(), 'managed-recovery-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const helper = new URL('./managed-tarball-archive.py', import.meta.url).pathname;
const moduleUrl = new URL('./managed-tarball.mjs', import.meta.url).href;
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
function identity(file) {
  const s = fs.statSync(file, { bigint: true });
  return [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].map(String);
}
function stamp(file) { return { identity: identity(file), digest: fs.statSync(file).isDirectory() ? payloadManifest(file, { links: true }).digest : hashFile(file) }; }
function pending(profile) { return spawnSync('python3', ['-B', helper, 'pending', profile]).status; }
function interruptedFixture(label) {
  const profile = path.join(scratch, label), id = randomUUID();
  const dir = path.join(profile, '.materialize-transactions', id);
  write(path.join(profile, 'package.json'), '{"old":true}');
  write(path.join(profile, 'pnpm-lock.yaml'), 'old-lock');
  write(path.join(profile, 'node_modules/pkg/index.js'), 'old installed bytes');
  write(path.join(profile, 'settings.json'), 'protected');
  const diskBefore = { manifest: stamp(path.join(profile, 'package.json')), lock: stamp(path.join(profile, 'pnpm-lock.yaml')),
    modules: stamp(path.join(profile, 'node_modules')), protected: payloadManifest(profile, { exclude: ['node_modules', 'package.json', 'pnpm-lock.yaml', '.materialize-transactions', '.materialize.lock'], links: true }) };
  fs.mkdirSync(path.join(dir, 'old-generation'), { recursive: true });
  write(path.join(dir, 'candidate/node_modules/pkg/index.js'), 'candidate bytes');
  const from = 'node_modules', to = `.materialize-transactions/${id}/old-generation/node_modules`;
  const journal = { schemaVersion: 1, id, profile, phase: 'COMMITTING', pid: 2147483647, name: '@fixture/viewer',
    owner: identity(dir).slice(0, 2), request: { name: '@fixture/viewer', version: '0.1.0', sha256: 'a'.repeat(64) },
    before: { captured: true }, diskBefore, moves: [{ from, to, stamp: stamp(path.join(profile, from)), done: false }], createdParents: [] };
  write(path.join(dir, 'journal.json'), JSON.stringify(journal));
  const moved = spawnSync('python3', ['-B', helper, 'safeMove'], { input: JSON.stringify({ profile, txnId: id, from, to, expected: { from: journal.moves[0].stamp.identity, to: null } }), encoding: 'utf8' });
  assert.equal(moved.status, 0, moved.stderr);
  return { profile, id, dir, journal, request: { profile, target: profile, recover: id } };
}

for (const phase of ['before-reverse-1', 'after-reverse-1']) test(`recovery KILL at ${phase} is restartable without pnpm or input`, async () => {
  const f = interruptedFixture(phase);
  const source = `import {ManagedSync} from ${JSON.stringify(moduleUrl)};await new ManagedSync(JSON.parse(process.argv[1]),{checkpoint(p){if(p===${JSON.stringify(phase)})process.kill(process.pid,'SIGKILL')}}).run();`;
  const killed = spawnSync(process.execPath, ['--input-type=module', '-e', source, JSON.stringify(f.request)], { encoding: 'utf8' });
  assert.equal(killed.signal, 'SIGKILL');
  assert.equal(pending(f.profile), 7);
  const restored = await new ManagedSync(f.request).run();
  assert.equal(restored.code, 0, JSON.stringify(restored));
  assert.equal(fs.readFileSync(path.join(f.profile, 'node_modules/pkg/index.js'), 'utf8'), 'old installed bytes');
  assert.equal(pending(f.profile), 0);
});

for (const kind of ['missing', 'truncated', 'schema', 'moves', 'old-drift', 'protected-drift']) test(`${kind} preserves recovery material and pending gate`, async () => {
  const f = interruptedFixture(kind), file = path.join(f.dir, 'journal.json');
  if (kind === 'missing') fs.rmSync(file);
  if (kind === 'truncated') fs.writeFileSync(file, '{');
  if (kind === 'schema') { f.journal.schemaVersion = 9; fs.writeFileSync(file, JSON.stringify(f.journal)); }
  if (kind === 'moves') { f.journal.moves[0].from = '../escape'; fs.writeFileSync(file, JSON.stringify(f.journal)); }
  if (kind === 'old-drift') write(path.join(f.dir, 'old-generation/node_modules/pkg/index.js'), 'external bytes');
  if (kind === 'protected-drift') write(path.join(f.profile, 'settings.json'), 'external settings');
  const result = await new ManagedSync(f.request).run();
  assert.equal(result.code, 7, JSON.stringify(result));
  assert.equal(pending(f.profile), 7);
  assert.ok(fs.existsSync(f.dir));
});

test('unknown live PID is rejected without signalling it', async () => {
  const f = interruptedFixture('pid-reuse');
  f.journal.pid = process.ppid;
  fs.writeFileSync(path.join(f.dir, 'journal.json'), JSON.stringify(f.journal));
  assert.equal((await new ManagedSync(f.request).run()).code, 7);
  assert.equal(pending(f.profile), 7);
});

test('terminal cleanup failure is resumable from compact receipt', async () => {
  const f = interruptedFixture('cleanup');
  let once = true;
  const result = await new ManagedSync(f.request, { io(phase) { if (phase === 'cleanup' && once) { once = false; throw new Error('ENOSPC'); } } }).run();
  assert.equal(result.code, 7);
  const receipt = JSON.parse(fs.readFileSync(path.join(f.dir, 'journal.json')));
  assert.equal(receipt.phase, 'ROLLED_BACK');
  assert.equal(receipt.before, undefined);
  assert.equal((await new ManagedSync(f.request).run()).code, 0);
  assert.deepEqual(fs.readdirSync(f.dir), ['journal.json']);
});

for (const point of ['intent', 'result', 'terminal']) test(`recovery journal ENOSPC at ${point} retains material for explicit retry`, async () => {
  const f = interruptedFixture(`io-${point}`);
  let hit = false;
  const result = await new ManagedSync(f.request, { io(operation, sync) {
    const journal = sync.journal;
    const selected = point === 'intent' ? journal.phase === 'RECOVERING' && journal.moves?.[0]?.reverseIntent && !journal.moves[0].reversed
      : point === 'result' ? journal.phase === 'RECOVERING' && journal.moves?.[0]?.reversed : journal.phase === 'ROLLED_BACK';
    if (operation === 'journal' && selected && !hit) { hit = true; throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }); }
  } }).run();
  assert.equal(hit, true);
  assert.equal(result.code, 7);
  assert.equal(pending(f.profile), 7);
  assert.equal((await new ManagedSync(f.request).run()).code, 0);
  assert.equal(fs.readFileSync(path.join(f.profile, 'node_modules/pkg/index.js'), 'utf8'), 'old installed bytes');
});

test('runner bounds logs and waits on timeout and abort', async () => {
  const home = path.join(scratch, 'runner'); fs.mkdirSync(home);
  const env = pnpmEnvironment(home);
  const bounded = await runPnpm(['--help'], { cwd: home, env, maxOutput: 10 });
  assert.equal(bounded.code, 5); assert.equal(bounded.stdout, '');
  const timeout = await runPnpm(['--version'], { cwd: home, env, timeoutMs: 1 });
  assert.equal(timeout.code, 5); assert.equal(timeout.signal, 'timeout');
  const controller = new AbortController();
  const running = runPnpm(['--version'], { cwd: home, env, signal: controller.signal });
  controller.abort();
  const aborted = await running;
  assert.equal(aborted.code, 5); assert.equal(aborted.signal, 'aborted');
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL']) test(`active real pnpm worker is reaped after coordinator ${signal}`, async () => {
  const home = path.join(scratch, `active-${signal}`);
  fs.mkdirSync(home);
  const marker = path.join(home, 'ready');
  const lease = path.join(home, 'home', 'pnpm-worker.lock');
  const payload = `require('fs').writeFileSync(${JSON.stringify(marker)},'ready');setInterval(()=>{},1000)`;
  const source = `import {runPnpm,pnpmEnvironment} from ${JSON.stringify(moduleUrl)};const c=new AbortController();process.on('SIGINT',()=>c.abort());process.on('SIGTERM',()=>c.abort());const r=await runPnpm(['exec',process.execPath,'-e',${JSON.stringify(payload)}],{cwd:process.argv[1],env:pnpmEnvironment(process.argv[1]),signal:c.signal,timeoutMs:10000});console.log(JSON.stringify(r));`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source, home], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  child.stdout.on('data', bytes => { stdout += bytes; });
  const closed = new Promise(resolve => child.once('close', (code, exitSignal) => resolve({ code, exitSignal })));
  try {
    for (let attempt = 0; attempt < 100 && !fs.existsSync(marker); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(fs.existsSync(marker), 'real pnpm exec child reached ready marker');
    child.kill(signal);
    const exit = await closed;
    if (signal === 'SIGKILL') assert.equal(exit.exitSignal, signal);
    else { assert.equal(exit.code, 0); assert.equal(JSON.parse(stdout).signal, 'aborted'); }
    const probe = spawnSync('python3', ['-c', 'import os,fcntl,sys,time\nfor i in range(30):\n try:\n  f=os.open(sys.argv[1],os.O_RDWR);fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB);os.close(f);sys.exit(0)\n except BlockingIOError:time.sleep(.1)\nsys.exit(1)', lease], { encoding: 'utf8' });
    assert.equal(probe.status, 0, probe.stderr);
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await closed; }
  }
});

test('anchored journal write rejects a replaced transaction ancestor without escaping', async () => {
  const f = interruptedFixture('journal-ancestor');
  const outside = path.join(scratch, 'outside-journal');
  fs.mkdirSync(outside);
  write(path.join(outside, 'sentinel'), 'outside intact');
  const sync = new ManagedSync(f.request);
  sync.directory = f.dir;
  sync.journal = f.journal;
  fs.renameSync(f.dir, f.dir + '-detached');
  fs.symlinkSync(outside, f.dir);
  assert.throws(() => sync.save(), /anchored write failed/);
  assert.deepEqual(fs.readdirSync(outside), ['sentinel']);
  assert.equal(fs.readFileSync(path.join(outside, 'sentinel'), 'utf8'), 'outside intact');
});

test('coordinator KILL closes lifetime pipe and releases worker lease', async () => {
  const home = path.join(scratch, 'lifetime'); fs.mkdirSync(home);
  const lease = path.join(home, 'home', 'pnpm-worker.lock');
  const source = `import {runPnpm,pnpmEnvironment} from ${JSON.stringify(moduleUrl)};await runPnpm(['--version'],{cwd:process.argv[1],env:pnpmEnvironment(process.argv[1]),timeoutMs:30000});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source, home], { stdio: 'ignore' });
  await new Promise(resolve => setTimeout(resolve, 200));
  child.kill('SIGKILL');
  await new Promise(resolve => child.once('close', resolve));
  const probe = spawnSync('python3', ['-c', 'import os,fcntl,sys,time\np=sys.argv[1]\nfor i in range(30):\n try:\n  f=os.open(p,os.O_RDWR);fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB);os.close(f);sys.exit(0)\n except (BlockingIOError,FileNotFoundError):time.sleep(.1)\nsys.exit(1)', lease], { encoding: 'utf8' });
  assert.equal(probe.status, 0, probe.stderr);
});
