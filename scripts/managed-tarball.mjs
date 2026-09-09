import * as fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { prepareCandidateDependencies, privatePnpmEnvironment } from './materialize-cache.mjs';
import { fileURLToPath } from 'node:url';
import { userInfo } from 'node:os';
import { GraphInspector, assertPath, candidateConfig, digest, inside,
  managedSpec, payloadManifest, prepareFiles, readJson, stable, hashFile } from './materialize-graph.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const archive = path.join(here, 'managed-tarball-archive.py');
const terminal = new Set(['COMMITTED', 'ROLLED_BACK', 'REJECTED']);
const viewerRelease = Object.freeze({ name: '@crosery/dsh-viewer', version: '0.1.1-omnimux.765.1',
  sha256: '555346d3469bd7e11b9453f8beaa0c09de28d695dd6ed2cddbdc875952264a31',
  sourceRepo: 'https://github.com/Crosery/dsh-viewer.git', sourceCommit: 'ccfc0a7c6cfa692aa737f48d9e8c97c41db82950' });
const namePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;

function fail(message, code) { throw Object.assign(new Error(message), { code }); }
function syncTree(directory) { prepareFiles({ operation: 'sync', path: directory }); }
function identity(entry) {
  const info = fs.lstatSync(entry, { bigint: true, throwIfNoEntry: false });
  if (!info) return null;
  if (!info.isDirectory() && !info.isFile()) fail('unsafe transaction leaf', 7);
  return [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].map(String);
}
function stamp(entry) {
  const id = identity(entry);
  if (!id) return null;
  return { identity: id, digest: fs.lstatSync(entry).isDirectory()
    ? payloadManifest(entry, { links: true }).digest : hashFile(entry) };
}
function matches(actual, expected) {
  return actual && expected && stable(actual.identity.slice(0, 2)) === stable(expected.identity.slice(0, 2)) && actual.digest === expected.digest;
}
export function slimResolution(state) {
  if (!state) return null;
  const { resolutionGraph, ...rest } = state;
  return { ...rest, resolutionGraphDigest: digest(resolutionGraph) };
}
function invokeArchive(action, request) {
  const result = spawnSync('python3', ['-B', archive, action], { input: JSON.stringify(request), encoding: 'utf8', maxBuffer: 16 << 20 });
  if (result.status !== 0) fail(`${action} rejected`, action === 'safeMove' ? 7 : action === 'probeRecovery' ? 5 : 3);
  return JSON.parse(result.stdout);
}

// Reuse the helper's held-ancestor primitive for journal and owned scratch writes.
const anchoredScript = String.raw`import importlib.util,json,os,sys,shutil,fcntl
s=importlib.util.spec_from_file_location('guard',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
r=json.load(sys.stdin)
with m.DirectoryAnchor(r['parent']) as a:
 a.verify();n=r['name']
 if '/' in n or n in ('','.','..'):raise ValueError('invalid leaf')
 if r['action']=='write':
  temp=n+'.next'
  fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600,dir_fd=a.fd)
  with os.fdopen(fd,'w') as f:f.write(r['text']);f.flush();os.fsync(f.fileno())
  a.verify();os.rename(temp,n,src_dir_fd=a.fd,dst_dir_fd=a.fd)
 elif r['action']=='mkdir':os.mkdir(n,r.get('mode',448),dir_fd=a.fd)
 elif r['action']=='rmdir':os.rmdir(n,dir_fd=a.fd)
 elif r['action']=='remove':
  try:
   st=os.stat(n,dir_fd=a.fd,follow_symlinks=False)
   import stat
   if stat.S_ISDIR(st.st_mode):shutil.rmtree(n,dir_fd=a.fd)
   elif stat.S_ISREG(st.st_mode):os.unlink(n,dir_fd=a.fd)
   else:raise ValueError('unsafe cleanup leaf')
  except FileNotFoundError:pass
 elif r['action']=='lease':
  fd=os.open(n,os.O_RDWR|os.O_NOFOLLOW,dir_fd=a.fd)
  fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);os.close(fd)
 os.fsync(a.fd);a.verify()
`;
function anchored(action, entry, extra = {}) {
  const result = spawnSync('python3', ['-B', '-c', anchoredScript, archive], {
    input: JSON.stringify({ action, parent: path.dirname(entry), name: path.basename(entry), ...extra }), encoding: 'utf8', maxBuffer: 1 << 20,
  });
  if (result.status !== 0) fail(`anchored ${action} failed`, 7);
}
function makeDirectory(entry, mode = 0o700) {
  if (fs.existsSync(entry)) { assertPath(entry); return; }
  makeDirectory(path.dirname(entry), mode);
  anchored('mkdir', entry, { mode });
}

/** Worker supervisor is the process-group leader and never signals a recycled PID.
 * Its stdin is a lifetime pipe: coordinator death triggers TERM then group KILL.
 * A kernel lease stays held until the supervisor and inherited worker FDs close.
 */
const workerScript = String.raw`import os,sys,json,subprocess,signal,fcntl,selectors,time,contextlib,importlib.util
r=json.loads(sys.argv[1])
spec=importlib.util.spec_from_file_location('guard',r['archive']);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
stack=contextlib.ExitStack();anchors={p:stack.enter_context(m.DirectoryAnchor(p)) for p,_ in r['identities']}
def verify():
 for p,expected in r['identities']:
  anchors[p].verify()
  if m.identity(os.fstat(anchors[p].fd))[:2]!=expected:raise ValueError('worker directory identity drift')
verify()
leaseParent=anchors[os.path.dirname(r['lease'])]
lease=os.open(os.path.basename(r['lease']),os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600,dir_fd=leaseParent.fd);fcntl.flock(lease,fcntl.LOCK_EX)
signal.signal(signal.SIGTERM,signal.SIG_IGN);signal.signal(signal.SIGINT,signal.SIG_IGN)
def defaults():
 os.fchdir(anchors[r['cwd']].fd)
 signal.signal(signal.SIGTERM,signal.SIG_DFL);signal.signal(signal.SIGINT,signal.SIG_DFL)
verify()
p=subprocess.Popen(r['command'],env=r['env'],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,pass_fds=(lease,anchors[r['cwd']].fd),preexec_fn=defaults)
s=selectors.DefaultSelector();s.register(sys.stdin,selectors.EVENT_READ);s.register(p.stdout,selectors.EVENT_READ)
chunks=[];size=0;deadline=time.monotonic()+r['timeout']/1000;stopping=None;reason=None;eof=False
while True:
 for key,_ in s.select(.05):
  if key.fileobj is sys.stdin:
   os.read(sys.stdin.fileno(),4096);s.unregister(sys.stdin);reason='aborted'
  else:
   b=os.read(p.stdout.fileno(),65536)
   if not b:s.unregister(p.stdout);eof=True
   elif size+len(b)>r['limit']:reason='output-limit'
   else:chunks.append(b);size+=len(b)
 if time.monotonic()>deadline:reason='timeout'
 if reason and stopping is None:
  stopping=time.monotonic();os.killpg(os.getpgrp(),signal.SIGTERM)
 if eof and p.poll() is not None or stopping is not None and time.monotonic()-stopping>.5:break
code=p.poll()
try:verify()
except (ValueError,OSError):reason='directory-drift'
stack.close()
result={'code':code if code is not None and not reason else 5,'signal':reason,'stdout':b''.join(chunks).decode('utf-8','replace') if not reason else ''}
try:sys.stdout.write(json.dumps(result));sys.stdout.flush()
finally:
 # The supervisor owns this group ID even when the coordinator's pipe is gone.
 os.killpg(os.getpgrp(),signal.SIGKILL)
`;

/** Run fixed pnpm with bounded output, a timeout, and an owned lifetime pipe. */
export async function runPnpm(argv, { cwd, env, signal, lease, directoryIdentities = [], timeoutMs = 120000, maxOutput = 8 << 20 } = {}) {
  if (signal?.aborted) return { code: 5, signal: 'aborted', stdout: '' };
  const privateHome = env.HOME;
  makeDirectory(privateHome);
  const leasePath = lease || path.join(privateHome, 'pnpm-worker.lock');
  const environmentDirectories = Object.entries(env).filter(([key]) => /^(HOME|XDG_.*|COREPACK_HOME|PNPM_HOME|TMPDIR|TMP|TEMP|npm_config_(cache|store_dir|global_dir|state_dir|cache_dir))$/.test(key)).map(([, value]) => value);
  const paths = [...new Set([cwd, path.dirname(leasePath), ...environmentDirectories, ...directoryIdentities.map(([entry]) => entry)])];
  const identities = prepareFiles({ operation: 'identities', paths }).identities;
  for (const [entry, expected] of directoryIdentities) if (stable(identities.find(([name]) => name === entry)?.[1]) !== stable(expected)) fail('pnpm directory identity drift', 5);
  const executable = (process.env.PATH || '').split(path.delimiter).map(dir => path.join(dir, 'pnpm')).find(file => fs.existsSync(file));
  if (!executable) fail('pnpm 11.7.0 executable unavailable', 5);
  return await new Promise((resolve, reject) => {
    const child = spawn('python3', ['-B', '-c', workerScript, JSON.stringify({ command: [executable, ...argv], cwd, env,
      lease: leasePath, archive, identities, timeout: timeoutMs, limit: maxOutput })], { detached: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '';
    const abort = () => child.stdin.end();
    child.stdin.on('error', () => {});
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', bytes => { output += bytes; if (output.length > maxOutput * 7 + 4096) abort(); });
    child.on('error', error => { signal?.removeEventListener('abort', abort); reject(error); });
    child.on('close', () => {
      signal?.removeEventListener('abort', abort);
      try { const result = JSON.parse(output); resolve(result); }
      catch { resolve({ code: 5, signal: 'worker-failed', stdout: '' }); }
    });
  });
}

/** Use the shared tool's registry override only for explicitly isolated tests. */
function backupEnvironment() {
  const env = { PATH: process.env.PATH, HOME: userInfo().homedir };
  if (process.env.AGENT_BACKUP_STATE_DIR) {
    const home = assertPath(process.env.HOME);
    const registry = process.env.AGENT_BACKUP_STATE_DIR;
    if (home === userInfo().homedir || !path.isAbsolute(registry) || !inside(home, registry)) fail('backup test registry must be inside a private HOME', 5);
    env.HOME = home;
    env.AGENT_BACKUP_STATE_DIR = registry;
  }
  return env;
}

/** Capture two non-secret staged inputs using the shared tool, then restore them. */
export async function captureRecoveryInput(input) {
  const tool = path.join(userInfo().homedir, '.agents/skills/agent-backup/scripts/backup.py');
  const execute = args => {
    const result = spawnSync('python3', ['-B', tool, ...args], { env: backupEnvironment(), encoding: 'utf8', maxBuffer: 1 << 20 });
    let value;
    try { value = JSON.parse(result.stdout); } catch { fail('shared agent-backup returned no receipt', 5); }
    if (result.status !== 0) throw Object.assign(new Error('shared agent-backup failed; retain staged recovery inputs'), {
      code: 5, backupFailure: { batchId: value.batch || null, backupOk: value.backup_ok === true, failedPhase: value.failed_phase || 'capture' },
    });
    if (!value.ok) fail('shared backup did not verify', 5);
    return value;
  };
  const captured = execute(['capture', '--root', root, '--task', `778-${input.transactionId}`, '--reason', 'two-file managed transaction recovery point', '--', ...input.paths]);
  if (!captured.batch) fail('backup batch receipt required', 5);
  return await verifyRecoveryReceipt(input, { batchId: captured.batch, verified: true, digest: digest(input) }, execute);
}
async function verifyRecoveryReceipt(input, receipt, executeOverride) {
  if (!receipt?.verified || receipt.digest !== digest(input) || !/^[0-9TZ]+-[a-f0-9]{12}$/.test(receipt.batchId || '')) fail('invalid backup receipt', 5);
  const destination = path.join(root, '.workbuddy', `managed-778-restore-${input.transactionId}`);
  const execute = executeOverride || (args => {
    const result = spawnSync('python3', ['-B', path.join(userInfo().homedir, '.agents/skills/agent-backup/scripts/backup.py'), ...args], {
      env: backupEnvironment(), encoding: 'utf8', maxBuffer: 1 << 20 });
    if (result.status !== 0) fail('backup restore verification failed', 5);
    return JSON.parse(result.stdout);
  });
  if (fs.existsSync(destination)) fail('restore verification destination is occupied', 5);
  makeDirectory(path.dirname(destination));
  const restored = execute(['restore', '--root', root, '--batch', receipt.batchId, '--to', destination]);
  if (!restored.ok || restored.verified_files !== 2) fail('backup restore count mismatch', 5);
  for (let i = 0; i < 2; i++) {
    const file = path.join(destination, input.paths[i]);
    if (hashFile(file) !== input.sha256[i] || (fs.statSync(file).mode & 0o777) !== input.mode[i]) fail('backup bytes or mode mismatch', 5);
  }
  anchored('remove', destination);
  return receipt;
}

/** Parse only the explicit, mutually exclusive managed mode. No writes. */
export function parseRequest(argv, env = process.env) {
  if (env.OMNIMUX_SYNC_TARGETS) fail('OMNIMUX_SYNC_TARGETS conflicts with managed mode', 2);
  const allowed = new Set(['managed-tarball', 'expect-name', 'expect-version', 'expect-sha256', 'target', 'recover-managed-tarball',
    'expect-before-tarball', 'expect-before-version', 'expect-before-sha256', 'expect-before-receipt',
    'expect-source-repo', 'expect-source-commit', 'expect-qa-sha256', 'expect-qa-receipt', 'expect-reverse-receipt']);
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(argv[index]);
    if (!match || !allowed.has(match[1]) || Object.hasOwn(options, match[1])) fail('invalid, duplicate or conflicting argument', 2);
    const value = match[2] ?? argv[++index];
    if (!value || value.startsWith('--')) fail('missing managed argument', 2);
    options[match[1]] = value;
  }
  const recover = options['recover-managed-tarball'];
  if (recover) {
    if (!/^[0-9a-f-]{36}$/.test(recover) || Object.keys(options).some(key => !['target', 'recover-managed-tarball'].includes(key))) fail('invalid recovery request', 2);
  } else if (!options['managed-tarball'] || !namePattern.test(options['expect-name'] || '')
      || options['expect-name'].length > 214 || !versionPattern.test(options['expect-version'] || '')
      || !/^[0-9a-fA-F]{64}$/.test(options['expect-sha256'] || '')) fail('complete exact identity and SHA256 required', 2);
  const transitionKeys = ['expect-before-tarball', 'expect-before-version', 'expect-before-sha256', 'expect-before-receipt',
    'expect-source-repo', 'expect-source-commit', 'expect-qa-sha256', 'expect-qa-receipt'];
  let transition = null;
  if (transitionKeys.some(key => options[key]) || options['expect-reverse-receipt']) {
    if (recover || transitionKeys.some(key => !options[key])
        || !versionPattern.test(options['expect-before-version'])
        || !/^[a-f0-9]{64}$/.test(options['expect-before-sha256'])
        || !/^[a-f0-9-]{36}$/.test(options['expect-before-receipt'])
        || !/^[a-f0-9]{40}$/.test(options['expect-source-commit'])
        || !/^[a-f0-9]{64}$/.test(options['expect-qa-sha256'])
        || options['expect-reverse-receipt'] && !/^[a-f0-9-]{36}$/.test(options['expect-reverse-receipt'])) fail('complete transition identity required', 2);
    transition = { before: { tarball: options['expect-before-tarball'], version: options['expect-before-version'],
      sha256: options['expect-before-sha256'], receiptId: options['expect-before-receipt'] },
      after: { sourceRepo: options['expect-source-repo'], sourceCommit: options['expect-source-commit'], qaReceiptDigest: options['expect-qa-sha256'], qaReceipt: options['expect-qa-receipt'] },
      reverseReceiptId: options['expect-reverse-receipt'] || null };
  }
  const target = options.target || 'dev';
  if (target !== 'dev') fail('managed target must be dev', 2);
  const home = path.join(env.HOME, '.omnimux-dev');
  const alignment = spawnSync('bash', [path.join(here, 'sync-main.sh'), root], { env, encoding: 'utf8' });
  if (alignment.status !== 0) fail('managed Dev requires clean aligned main', 4);
  if (!recover && !transition && (options['expect-name'] !== '@crosery/dsh-viewer' || options['expect-version'] !== '0.1.0')) fail('Dev authorization is viewer 0.1.0 only', 2);
  if (transition && (options['expect-name'] !== viewerRelease.name
      || !transition.reverseReceiptId && (transition.before.version !== '0.1.0'
        || options['expect-version'] !== viewerRelease.version || options['expect-sha256'] !== viewerRelease.sha256
        || transition.after.sourceRepo !== viewerRelease.sourceRepo || transition.after.sourceCommit !== viewerRelease.sourceCommit)
      || transition.reverseReceiptId && (transition.before.version !== viewerRelease.version
        || transition.before.sha256 !== viewerRelease.sha256 || options['expect-version'] !== '0.1.0'))) fail('unauthorized viewer transition', 2);
  assertPath(home);
  const resolver = spawnSync('bash', ['-c', 'source "$1"; resolve_omnimux_profile_dir "$2"', 'resolver', path.join(here, 'resolve-omnimux-profile.sh'), home], { env, encoding: 'utf8' });
  if (resolver.status !== 0) fail('profile resolver rejected target', 2);
  const profile = assertPath(resolver.stdout.trim());
  const request = { profile, target: home, recover: recover || null, tarball: options['managed-tarball'] || null,
    name: options['expect-name'] || null, version: options['expect-version'] || null, sha256: options['expect-sha256']?.toLowerCase() || null,
    ...(transition ? { transition } : {}) };
  if (!recover) {
    assertPath(request.tarball);
    if (inside(home, request.tarball) || !fs.lstatSync(request.tarball).isFile() || !/\.(tgz|tar\.gz)$/.test(request.tarball)) fail('input must be an external local regular gzip archive', 3);
  }
  return request;
}

/** Private test/setup environment; pnpm itself is resolved from the fixed task PATH. */
export function pnpmEnvironment(home) {
  makeDirectory(home);
  return { ...privatePnpmEnvironment(home), COREPACK_HOME: process.env.COREPACK_HOME || path.join(home, 'corepack') };
}

/** One profile-local candidate and a recoverable four-path publication journal. */
export class ManagedSync {
  constructor(request, hooks = {}) {
    this.request = request;
    this.hooks = hooks;
    this.id = randomUUID();
    this.directory = path.join(request.profile, '.materialize-transactions', this.id);
    this.candidate = path.join(this.directory, 'candidate');
    this.journal = null;
    this.before = null;
    this.payload = null;
    this.controller = new AbortController();
  }

  save() {
    this.hooks.io?.('journal', this);
    anchored('write', path.join(this.directory, 'journal.json'), { text: JSON.stringify(this.journal) });
  }
  async checkpoint(phase) {
    await this.hooks.checkpoint?.(phase, this);
    if (this.controller.signal.aborted && this.journal?.phase !== 'RECOVERING') fail('operation interrupted', 5);
  }
  async pnpm(argv, options) {
    if (argv[0] !== '--version' && !this.pnpmVerified) {
      const version = await this.pnpm(['--version'], options);
      if (version.code !== 0 || version.signal || version.stdout.trim() !== '11.7.0') fail('pnpm 11.7.0 required', 5);
      this.pnpmVerified = true;
    }
    this.journal.worker = { lease: 'worker.lock', state: 'starting' };
    this.save();
    const result = await runPnpm(argv, { ...options, signal: this.controller.signal, lease: path.join(this.directory, 'worker.lock') });
    anchored('lease', path.join(this.directory, 'worker.lock'));
    this.journal.worker.state = 'reaped';
    this.save();
    return result;
  }
  async capture(profile, withoutPnpm = false, payload = this.payload) {
    if (withoutPnpm || this.request.target === 'dev' || path.basename(this.request.target) === '.omnimux-dev') return new GraphInspector(profile).capture({ withoutPnpm: true, approvedPayloads: { [this.request.name]: payload } });
    makeDirectory(path.join(this.directory, 'runtime'));
    const result = await this.pnpm(['list', '--json', '--depth', 'Infinity'], { cwd: profile, env: privatePnpmEnvironment(path.join(this.directory, 'runtime')) });
    if (result.code !== 0 || result.signal) fail('controlled pnpm list failed', 5);
    return new GraphInspector(profile).capture({ listJson: JSON.parse(result.stdout), approvedPayloads: { [this.request.name]: payload } });
  }
  diskState() {
    const profile = this.request.profile;
    return {
      manifest: stamp(path.join(profile, 'package.json')), lock: stamp(path.join(profile, 'pnpm-lock.yaml')),
      modules: stamp(path.join(profile, 'node_modules')),
      protected: payloadManifest(profile, { exclude: ['node_modules', 'package.json', 'pnpm-lock.yaml', '.materialize-transactions', '.materialize.lock'], links: true }),
    };
  }
  async transitionUnchanged() {
    const request = this.request;
    const source = path.join(request.profile, managedSpec(request.name).slice(5));
    if (!fs.existsSync(source) || readJson(path.join(source, 'package.json')).version !== request.version) return false;
    if (payloadManifest(source).digest !== this.payload.digest) fail('same version with different source payload', 4);
    const state = await this.capture(request.profile, true);
    new GraphInspector(request.profile).assertRelocatable(state);
    const summary = value => ({ before: { version: value.before.version, sha256: value.before.sha256,
      payloadDigest: value.before.payloadDigest, receiptId: value.before.receiptId, receiptDigest: value.before.receiptDigest },
      after: { version: value.after.version, sha256: value.after.sha256, payloadDigest: value.after.payloadDigest,
        sourceRepo: value.after.sourceRepo, sourceCommit: value.after.sourceCommit, qaReceiptDigest: value.after.qaReceiptDigest },
      reverseReceiptId: value.reverseReceiptId });
    const ids = fs.readdirSync(path.join(request.profile, '.materialize-transactions')).filter(id => id !== this.id);
    let matched = false;
    for (const id of ids) {
      const value = readJson(assertPath(path.join(request.profile, '.materialize-transactions', id, 'journal.json')));
      if (value.phase !== 'COMMITTED' || !value.transition) continue;
      const receipt = this.readReceipt(id);
      if (stable(summary(receipt.transition)) === stable(summary(request.transition)) && receipt.afterDigest === digest(state)) matched = true;
    }
    if (!matched) fail('current target lacks matching committed transition receipt', 4);
    if (stable(invokeArchive('inspect', request).identity) !== stable(this.payload.identity)) fail('no-op input drift', 3);
    const old = request.transition.before;
    if (stable(invokeArchive('inspect', { ...request, ...old }).identity) !== stable(this.beforePayload.identity)
        || digest(this.readReceipt(old.receiptId)) !== old.receiptDigest
        || stable(await this.capture(request.profile, true)) !== stable(state)) fail('no-op transition identity or graph drift', 4);
    if (!request.transition.reverseReceiptId && hashFile(assertPath(request.transition.after.qaReceipt)) !== request.transition.after.qaReceiptDigest) fail('no-op QA receipt drift', 4);
    this.before = state;
    this.finish('REJECTED');
    return true;
  }

  readReceipt(id) {
    if (!/^[a-f0-9-]{36}$/.test(id || '')) fail('invalid transition receipt', 4);
    const directory = assertPath(path.join(this.request.profile, '.materialize-transactions', id));
    const receipt = readJson(assertPath(path.join(directory, 'journal.json')));
    if (receipt.id !== id || receipt.profile !== this.request.profile || receipt.phase !== 'COMMITTED'
        || receipt.name !== this.request.name || ![1, 2].includes(receipt.schemaVersion)
        || stable(receipt.owner) !== stable(identity(directory).slice(0, 2))) fail('transition receipt identity mismatch', 4);
    return receipt;
  }

  prepareTransition() {
    const request = this.request;
    const transition = request.transition;
    if (!transition) return;
    const old = transition.before;
    const dev = path.basename(request.target) === '.omnimux-dev' || request.target === 'dev';
    if (!old || !transition.after || !versionPattern.test(old.version || '') || !/^[a-f0-9]{64}$/.test(old.sha256 || '')
        || !/^[a-f0-9]{40}$/.test(transition.after.sourceCommit || '')
        || !/^[a-f0-9]{64}$/.test(transition.after.qaReceiptDigest || '')
        || transition.after.sourceRepo !== viewerRelease.sourceRepo) fail('invalid transition identity', 2);
    if ((dev || request.name === viewerRelease.name) && (request.name !== viewerRelease.name
        || !transition.reverseReceiptId && (old.version !== '0.1.0' || request.version !== viewerRelease.version
          || request.sha256 !== viewerRelease.sha256 || transition.after.sourceCommit !== viewerRelease.sourceCommit)
        || transition.reverseReceiptId && (old.version !== viewerRelease.version || old.sha256 !== viewerRelease.sha256 || request.version !== '0.1.0'))) fail('unauthorized viewer transition', 2);
    if (!dev && (![viewerRelease.name, '@fixture/viewer'].includes(request.name) || !inside(path.join(request.target, 'profiles'), request.profile))) fail('transition is restricted to viewer or isolated synthetic fixture', 2);
    if (!transition.reverseReceiptId) {
      const qa = assertPath(transition.after.qaReceipt);
      if (!fs.lstatSync(qa).isFile() || fs.statSync(qa).size > 1 << 20 || inside(request.target, qa)
          || hashFile(qa) !== transition.after.qaReceiptDigest) fail('QA receipt hash or path mismatch', 3);
      const text = fs.readFileSync(qa, 'utf8');
      if (![request.sha256, request.version, transition.after.sourceCommit].every(value => text.includes(value))
          || !text.includes('IS_PASS: YES') || !text.includes('NoOne')) fail('QA receipt does not bind release identity', 3);
    }
    assertPath(old.tarball);
    if (inside(request.target, old.tarball) || !fs.lstatSync(old.tarball).isFile()
        || !/\.(tgz|tar\.gz)$/.test(old.tarball) || old.version === request.version) fail('invalid previous archive', 3);
    const oldRequest = { ...request, tarball: old.tarball, version: old.version, sha256: old.sha256 };
    this.beforePayload = invokeArchive('freeze', { ...oldRequest, destination: path.join(this.directory, 'before-input.tgz') });
    const receipt = this.readReceipt(old.receiptId);
    if (receipt.request.version !== old.version || receipt.request.sha256 !== old.sha256) fail('previous archive not bound to receipt', 4);
    transition.before = { ...old, payloadDigest: this.beforePayload.digest, sourceSpec: managedSpec(request.name) };
    transition.after = { ...transition.after, version: request.version, sha256: request.sha256, payloadDigest: this.payload.digest,
      sourceSpec: managedSpec(request.name) };
    if (transition.reverseReceiptId) {
      const forward = this.readReceipt(transition.reverseReceiptId).transition;
      if (!forward || forward.reverseReceiptId || transition.reverseReceiptId !== old.receiptId
          || forward.after.sha256 !== old.sha256 || forward.after.version !== old.version
          || forward.before.sha256 !== request.sha256 || forward.before.version !== request.version
          || forward.before.payloadDigest !== this.payload.digest || forward.after.payloadDigest !== this.beforePayload.digest
          || transition.after.sourceRepo !== forward.after.sourceRepo || transition.after.sourceCommit !== forward.after.sourceCommit
          || transition.after.qaReceiptDigest !== forward.after.qaReceiptDigest) fail('reverse transition must bind committed forward receipt', 4);
    }
    transition.before.receiptDigest = digest(receipt);
    this.journal.schemaVersion = 2;
    this.journal.transition = transition;
    this.journal.beforePayload = this.beforePayload;
    this.save();
  }

  async prepare() {
    const request = this.request;
    const pending = spawnSync('python3', [archive, 'pending', request.profile], { encoding: 'utf8' });
    if (pending.status !== 0) fail('unfinished managed transaction; explicit recovery required', 7);
    makeDirectory(this.directory);
    makeDirectory(this.candidate);
    makeDirectory(path.join(this.directory, 'old-generation'));
    this.journal = { schemaVersion: 1, id: this.id, profile: request.profile, phase: 'PREPARING',
      pid: process.pid, name: request.name, request: { name: request.name, version: request.version, sha256: request.sha256 },
      moves: [], createdParents: [], owner: identity(this.directory).slice(0, 2) };
    this.save();
    this.payload = invokeArchive('freeze', { ...request, destination: path.join(this.directory, 'input.tgz') });
    this.prepareTransition();
    if (request.transition && await this.transitionUnchanged()) return null;
    const alreadyManaged = readJson(path.join(request.profile, 'package.json')).dependencies?.[request.name] === managedSpec(request.name);
    if (request.transition && !alreadyManaged) fail('transition requires managed previous source', 4);
    this.before = await this.capture(request.profile, alreadyManaged, this.beforePayload || this.payload);
    if (request.transition && this.readReceipt(request.transition.before.receiptId).afterDigest !== digest(this.before)) fail('live previous graph not bound to receipt', 4);
    this.journal.before = slimResolution(this.before);
    this.journal.diskBefore = this.diskState();
    this.journal.payload = this.payload;
    this.save();
    const spec = this.before.manifest.dependencies?.[request.name];
    if (![managedSpec(request.name), `file:${request.tarball}`].includes(spec)) fail('target is not the exact authorized tarball or managed source', 4);
    const targetNode = this.before.nodes[this.before.roots[request.name]];
    const beforePayload = this.beforePayload || this.payload;
    if (!targetNode || targetNode.version !== (request.transition?.before.version || request.version)
        || stable(targetNode.payload.entries) !== stable(beforePayload.entries)) fail('installed target does not match complete archive', 4);
    if (this.before.manifest.pnpm || this.before.manifest.workspaces || this.before.manifest.devEngines
        || this.before.manifest.scripts && Object.keys(this.before.manifest.scripts).length) fail('unsupported profile execution configuration', 4);
    this.config = candidateConfig(request.profile);
    for (const [name, value] of Object.entries(this.before.manifest.dependencies || {})) {
      if (name === request.name) continue;
      if (value.startsWith('link:') || value.startsWith('file:') && value !== managedSpec(name)) fail('non-target unmanaged dependency', 4);
      if (value.startsWith('file:')) {
        const source = path.join(request.profile, value.slice(5));
        const sourceManifest = payloadManifest(source, { exclude: ['node_modules'] });
        let pkgJson;
        try { pkgJson = readJson(path.join(source, 'package.json')); } catch {}
        if (!pkgJson?.files) {
          if (sourceManifest.digest !== this.before.nodes[this.before.roots[name]]?.payload.digest) fail('non-target source or installed payload drift', 4);
        } else {
          const installedPayload = this.before.nodes[this.before.roots[name]]?.payload;
          const sourceMap = new Map(sourceManifest.entries.map(e => [e.path, e.sha256]));
          for (const entry of installedPayload?.entries || []) {
            if (entry.type === 'file' && sourceMap.get(entry.path) !== entry.sha256) fail('non-target source or installed payload drift', 4);
          }
        }
      }
    }
    const source = path.join(request.profile, managedSpec(request.name).slice(5));
    assertPath(source, true);
    const sourceExists = fs.existsSync(source);
    if (request.transition && !sourceExists) fail('previous managed source missing', 4);
    if (sourceExists && stable(payloadManifest(source).entries) !== stable(beforePayload.entries)) fail('conflicting managed source', 4);
    const kit = path.join(request.profile, '.materialize-snapshots/plugins/dsh-ui-kit');
    if (fs.existsSync(kit)) {
      const authority = process.env.OMNIMUX_DSH_UI_KIT_DIR;
      if (!authority || payloadManifest(assertPath(authority), { exclude: ['node_modules'] }).digest !== payloadManifest(kit).digest) fail('authoritative kit unavailable or drifting', 4);
    }
    if (!request.transition && spec === managedSpec(request.name) && sourceExists) {
      new GraphInspector(request.profile).assertRelocatable(this.before);
      const current = invokeArchive('inspect', request);
      if (stable(current.identity) !== stable(this.payload.identity) || stable(await this.capture(request.profile, true)) !== stable(this.before)) fail('no-op input or profile drift', 4);
      this.finish('REJECTED');
      return null;
    }
    this.journal.sourceExisted = sourceExists;
    this.probeSpace();
    this.save();
    const input = path.join(this.directory, 'input.tgz');
    const preparationPaths = [request.profile, this.directory, this.candidate];
    const preparationIdentities = prepareFiles({ operation: 'identities', paths: preparationPaths }).identities;
    await this.checkpoint('source-prepare');
    prepareFiles({ operation: 'identities', paths: preparationPaths, expected: preparationIdentities });
    const snapshots = path.join(request.profile, '.materialize-snapshots');
    if (fs.existsSync(snapshots)) {
      payloadManifest(snapshots);
      prepareFiles({ operation: 'copy', source: snapshots, destination: path.join(this.candidate, '.materialize-snapshots') });
    }
    const candidateSource = path.join(this.candidate, managedSpec(request.name).slice(5));
    prepareFiles({ operation: 'mkdir', path: path.dirname(candidateSource) });
    if (request.transition) anchored('remove', candidateSource);
    if (!sourceExists || request.transition) invokeArchive('extract', { ...request, tarball: input, destination: candidateSource });
    if (request.transition) {
      request.transition.before.peerDependencies = readJson(path.join(source, 'package.json')).peerDependencies || {};
      request.transition.after.peerDependencies = readJson(path.join(candidateSource, 'package.json')).peerDependencies || {};
      this.save();
    }
    for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) prepareFiles({ operation: 'copy', source: path.join(request.profile, file), destination: path.join(this.candidate, file) });
    const manifest = structuredClone(this.before.manifest);
    manifest.dependencies[request.name] = managedSpec(request.name);
    prepareFiles({ operation: 'write', path: path.join(this.candidate, 'package.json'), text: JSON.stringify(manifest, null, 2) + '\n' });
    prepareFiles({ operation: 'write', path: path.join(this.candidate, '.npmrc'), text: Object.entries(this.config.config).map(([key, value]) => `${key}=${value}`).join('\n') + '\n' });
    return this.journal;
  }

  probeSpace() {
    const profile = this.request.profile;
    const paths = [profile, path.join(profile, 'node_modules'), this.candidate, path.join(this.directory, 'old-generation')];
    let sourceParent = path.dirname(path.join(profile, managedSpec(this.request.name).slice(5)));
    while (!fs.existsSync(sourceParent)) sourceParent = path.dirname(sourceParent);
    paths.push(sourceParent);
    const probe = invokeArchive('probeRecovery', { paths });
    for (const entry of paths) fs.accessSync(entry, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
    for (const name of ['package.json', 'pnpm-lock.yaml', 'node_modules']) {
      if (identity(path.join(profile, name))[0] !== probe.device) fail('live item on different filesystem', 5);
    }
    const bytes = manifest => manifest.entries.reduce((sum, item) => sum + BigInt(item.size || 0), 0n);
    const installed = bytes(payloadManifest(path.join(profile, 'node_modules'), { links: true }));
    const sources = fs.existsSync(path.join(profile, '.materialize-snapshots')) ? bytes(payloadManifest(path.join(profile, '.materialize-snapshots'))) : 0n;
    const previous = this.beforePayload ? bytes(this.beforePayload) + BigInt(this.beforePayload.identity[2]) : 0n;
    const required = installed * 3n + sources + bytes(this.payload) * 2n + previous + BigInt(this.payload.identity[2]) + 64n * 1024n * 1024n;
    if (BigInt(probe.availableBytes) < required) fail('insufficient full candidate/store/recovery space', 5);
    this.journal.feasibility = { requiredBytes: String(required), availableBytes: probe.availableBytes, device: probe.device };
  }

  async backup() {
    const stage = path.join(root, '.workbuddy', `managed-778-backup-${this.id}`);
    makeDirectory(stage);
    const input = { transactionId: this.id, sourceProfileDigest: digest(this.before), paths: [], sha256: [], mode: [] };
    for (const name of ['package.json', 'pnpm-lock.yaml']) {
      const source = path.join(this.request.profile, name);
      if (fs.statSync(source).size > 16 << 20) fail('recovery input exceeds limit', 5);
      const text = fs.readFileSync(source, 'utf8');
      if (/(?:_auth|token|password|secret|credential|authorization)\s*["']?\s*[:=]|https?:\/\/[^\s/]+@/i.test(text)) fail('secret-like recovery input rejected', 5);
      const destination = path.join(stage, name);
      const mode = fs.statSync(source).mode & 0o777;
      prepareFiles({ operation: 'write', path: destination, text, mode });
      input.paths.push(path.relative(root, destination)); input.sha256.push(hashFile(destination)); input.mode.push(mode);
    }
    if (input.sha256[0] !== this.before.raw.manifest || input.sha256[1] !== this.before.raw.lock) fail('recovery inputs differ from captured before state', 4);
    this.journal.recoveryInput = input;
    this.save();
    const receipt = await (this.hooks.recoveryReceipt || captureRecoveryInput)(input);
    // Even injected receipts must resolve to a real shared-tool batch and restore.
    this.journal.backup = this.hooks.recoveryReceipt ? await verifyRecoveryReceipt(input, receipt) : receipt;
    this.save();
    anchored('remove', stage);
  }

  async installCandidate() {
    const privateRoot = path.join(this.directory, 'dependencies');
    makeDirectory(privateRoot);
    this.journal.cache = await prepareCandidateDependencies({ candidate: this.candidate, privateRoot,
      beforeLock: this.before.lock, request: this.request, config: { ...this.config, signal: this.controller.signal },
      runPnpm: async (argv, options) => {
        if (argv.includes('--lockfile-only')) await this.checkpoint('lock-generation');
        else if (argv[0] === 'install') await this.checkpoint('install');
        const result = await this.pnpm(this.request.transition && argv[0] === 'install'
          ? [...argv, '--strict-peer-dependencies'] : argv, options);
        if (argv.includes('--lockfile-only')) await this.checkpoint('lock-generated');
        return result;
      } });
    const inspector = new GraphInspector(this.candidate);
    const after = await this.capture(this.candidate);
    inspector.compare(this.before, after, this.request);
    inspector.assertRelocatable(after);
    this.journal.candidate = slimResolution(after);
    this.probeSpace();
    await this.backup();
    this.journal.phase = 'PREPARED';
    this.save();
    await this.checkpoint('prepared');
    return after;
  }

  async move(from, to) {
    assertPath(from); assertPath(to, true);
    if (fs.existsSync(to)) fail('transaction destination occupied', 7);
    const record = { from: path.relative(this.request.profile, from), to: path.relative(this.request.profile, to), stamp: stamp(from), done: false };
    this.journal.moves.push(record);
    this.save();
    await this.checkpoint(`before-rename-${this.journal.moves.length}`);
    this.hooks.io?.('rename', this);
    const result = invokeArchive('safeMove', { profile: this.request.profile, txnId: this.id, from: record.from, to: record.to,
      expected: { from: record.stamp.identity, to: null } });
    record.after = result.after.to;
    await this.checkpoint(`after-rename-${this.journal.moves.length}`);
    record.done = true;
    this.save();
  }

  async commit() {
    const profile = this.request.profile;
    const currentInput = invokeArchive('inspect', this.request);
    if (stable(currentInput.identity) !== stable(this.payload.identity)) fail('input identity changed after freeze', 3);
    if (this.request.transition) {
      const old = this.request.transition.before;
      const currentOld = invokeArchive('inspect', { ...this.request, ...old });
      if (stable(currentOld.identity) !== stable(this.beforePayload.identity)) fail('previous input changed after freeze', 3);
      if (digest(this.readReceipt(old.receiptId)) !== old.receiptDigest) fail('previous receipt changed during preparation', 4);
      if (!this.request.transition.reverseReceiptId && hashFile(assertPath(this.request.transition.after.qaReceipt)) !== this.request.transition.after.qaReceiptDigest) fail('QA receipt changed during preparation', 4);
    }
    if (stable(slimResolution(await this.capture(profile, false, this.beforePayload || this.payload))) !== stable(this.journal.before)) fail('live profile changed during preparation', 4);
    if (stable(slimResolution(await this.capture(this.candidate))) !== stable(this.journal.candidate)) fail('candidate changed before publication', 5);
    this.hooks.io?.('fsync', this);
    syncTree(this.directory);
    if (stable(this.diskState()) !== stable(this.journal.diskBefore)) fail('live identity changed before publication', 4);
    this.journal.phase = 'COMMITTING';
    this.save();
    if (this.request.transition) {
      const relative = managedSpec(this.request.name).slice(5);
      const oldSource = path.join(this.directory, 'old-generation', relative);
      makeDirectory(path.dirname(oldSource));
      await this.move(path.join(profile, relative), oldSource);
      await this.move(path.join(this.candidate, relative), path.join(profile, relative));
    }
    for (const file of ['node_modules', 'package.json', 'pnpm-lock.yaml']) {
      await this.move(path.join(profile, file), path.join(this.directory, 'old-generation', file));
      await this.move(path.join(this.candidate, file), path.join(profile, file));
    }
    if (!this.journal.sourceExisted) {
      const source = path.join(profile, managedSpec(this.request.name).slice(5));
      let parent = path.dirname(source);
      const missing = [];
      while (!fs.existsSync(parent)) { missing.unshift(parent); parent = path.dirname(parent); }
      for (const directory of missing) {
        this.journal.createdParents.push(path.relative(profile, directory));
        this.save();
        anchored('mkdir', directory, { mode: 0o755 });
        this.journal.parentIdentities ||= {};
        this.journal.parentIdentities[path.relative(profile, directory)] = identity(directory).slice(0, 2);
        this.save();
      }
      await this.move(path.join(this.candidate, managedSpec(this.request.name).slice(5)), source);
    }
    await this.checkpoint('live-verify');
    const inspector = new GraphInspector(profile);
    const after = await this.capture(profile);
    inspector.compare(this.before, after, this.request);
    inspector.assertRelocatable(after);
    const targetSource = '.materialize-snapshots/plugins/' + this.request.name;
    const isTargetSource = entry => entry.path === targetSource || entry.path.startsWith(targetSource + '/');
    const expectedProtected = this.before.protectedDigests.entries.filter(entry => !isTargetSource(entry));
    const actualProtected = after.protectedDigests.entries.filter(entry => !isTargetSource(entry)
      && !this.journal.createdParents.includes(entry.path));
    if (stable(expectedProtected) !== stable(actualProtected)) fail('protected profile surface changed', 7);
    const source = path.join(profile, managedSpec(this.request.name).slice(5));
    if (stable(payloadManifest(source).entries) !== stable(this.payload.entries)) fail('published source differs from approved archive', 7);
    this.journal.afterDigest = digest(after);
    this.hooks.io?.('terminal', this);
    this.finish('COMMITTED');
    return this.result('committed', 0);
  }

  async recover(id, internal = false) {
    if (!/^[0-9a-f-]{36}$/.test(id)) fail('invalid transaction id', 2);
    this.id = id;
    this.directory = assertPath(path.join(this.request.profile, '.materialize-transactions', id));
    this.candidate = path.join(this.directory, 'candidate');
    let journal;
    try { journal = readJson(path.join(this.directory, 'journal.json')); } catch { fail('missing or damaged journal', 7); }
    const validate = spawnSync('python3', ['-B', '-c',
      "import importlib.util,json,sys;s=importlib.util.spec_from_file_location('g',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);r=json.load(sys.stdin);m.validate_journal(r,sys.argv[2],sys.argv[3])",
      archive, this.request.profile, id], { input: JSON.stringify(journal), encoding: 'utf8' });
    if (validate.status !== 0 || stable(identity(this.directory).slice(0, 2)) !== stable(journal.owner)) fail('journal identity mismatch', 7);
    this.journal = journal;
    this.request = { ...this.request, ...journal.request };
    this.before = journal.before;
    if (terminal.has(journal.phase)) { this.removeOwnedScratch(); return this.result(journal.phase === 'COMMITTED' ? 'committed' : 'recovered', 0); }
    if (!internal && journal.pid !== process.pid) {
      try { process.kill(journal.pid, 0); fail('original worker alive or PID reused; no signal sent', 7); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    if (journal.worker) {
      if (journal.worker.lease !== 'worker.lock' || !fs.existsSync(path.join(this.directory, 'worker.lock'))) fail('worker ownership uncertain', 7);
      anchored('lease', path.join(this.directory, 'worker.lock'));
    }
    if (!journal.moves.length) {
      this.finish('REJECTED');
      return this.result('recovered', 0);
    }
    if (!journal.diskBefore || !journal.before) fail('recovery baseline missing', 7);
    journal.phase = 'RECOVERING';
    this.save();
    for (let i = journal.moves.length - 1; i >= 0; i--) {
      const record = journal.moves[i];
      const from = path.join(this.request.profile, record.from);
      const to = path.join(this.request.profile, record.to);
      assertPath(from, true); assertPath(to, true);
      const a = stamp(from), b = stamp(to);
      // Once reversed, earlier moves can restore a different generation at `to`.
      if (record.reversed) {
        if (!matches(a, record.stamp)) fail('reversed item drift', 7);
        continue;
      }
      if (matches(a, record.stamp) && !b) { record.reversed = true; this.save(); continue; }
      if (a || !matches(b, record.stamp)) fail('ambiguous recovery paths or external drift', 7);
      record.reverseIntent = { identity: b.identity };
      this.save();
      await this.checkpoint(`before-reverse-${i + 1}`);
      const result = invokeArchive('safeMove', { profile: this.request.profile, txnId: id, from: record.to, to: record.from,
        expected: { from: b.identity, to: null } });
      record.reverseAfter = result.after.to;
      await this.checkpoint(`after-reverse-${i + 1}`);
      record.reversed = true;
      this.save();
    }
    for (const relative of [...journal.createdParents].reverse()) {
      const directory = path.join(this.request.profile, relative);
      const target = path.dirname(path.join(this.request.profile, managedSpec(journal.name).slice(5)));
      if (!inside(directory, target) || !inside(path.join(this.request.profile, '.materialize-snapshots'), directory)) fail('invalid recovery parent', 7);
      if (fs.existsSync(directory)) {
        if (stable(identity(directory).slice(0, 2)) !== stable(journal.parentIdentities?.[relative])) fail('recovery parent ownership uncertain', 7);
        anchored('rmdir', directory);
      }
    }
    const actual = this.diskState(), before = journal.diskBefore;
    for (const key of ['manifest', 'lock', 'modules']) if (!matches(actual[key], before[key])) fail('restored item differs from before state', 7);
    if (stable(actual.protected) !== stable(before.protected)) fail('protected surface drift; recovery requires owner', 7);
    // Exact lock/manifest and whole installation bytes, links and modes prove the
    // previously captured resolution graph without invoking pnpm or original tgz.
    this.finish('ROLLED_BACK');
    return this.result('recovered', 0);
  }

  finish(phase) {
    const active = this.journal;
    const receipt = { schemaVersion: active.schemaVersion, ...(active.transition ? { transition: active.transition } : {}),
      id: this.id, profile: this.request.profile, owner: active.owner,
      phase, name: this.request.name, request: active.request, beforeDigest: this.before ? digest(this.before) : null,
      afterDigest: active.afterDigest || null, backup: active.backup || null, backupFailure: active.backupFailure || null,
      cache: phase === 'COMMITTED' ? { storeRef: active.cache?.storeRef || null } : null,
      changedPaths: phase === 'COMMITTED' ? [managedSpec(this.request.name).slice(5), 'package.json', 'pnpm-lock.yaml', 'node_modules'] : [],
      recovery: phase === 'ROLLED_BACK' ? 'exact-before-restored' : phase === 'REJECTED' ? 'no-publication' : null };
    if (Buffer.byteLength(JSON.stringify(receipt)) > 65536) fail('terminal receipt exceeds limit', 7);
    this.journal = receipt;
    try { this.save(); } catch (error) { this.journal = active; throw error; }
    this.removeOwnedScratch();
  }

  removeOwnedScratch() {
    if (!terminal.has(this.journal.phase) || stable(identity(this.directory).slice(0, 2)) !== stable(this.journal.owner)) fail('refusing unowned cleanup', 7);
    this.hooks.io?.('cleanup', this);
    for (const name of fs.readdirSync(this.directory)) {
      if (name === 'journal.json' || name === 'dependencies' && this.journal.phase === 'COMMITTED') continue;
      if (!['candidate', 'old-generation', 'input.tgz', 'before-input.tgz', 'runtime', 'dependencies', 'worker.lock', 'empty.npmrc', 'empty-global.npmrc', 'journal.json.next'].includes(name)) fail('unknown transaction cleanup item', 7);
      anchored('remove', path.join(this.directory, name));
    }
  }

  result(status, code, message = '') {
    return { schemaVersion: 1, status, phase: this.journal?.phase || 'VALIDATED', transactionId: this.journal ? this.id : null,
      target: this.request.target, name: this.request.name, version: this.request.version, sha256: this.request.sha256,
      beforeDigest: this.before ? digest(this.before) : null, afterDigest: this.journal?.afterDigest || null,
      changedPaths: status === 'committed' ? [managedSpec(this.request.name).slice(5), 'package.json', 'pnpm-lock.yaml', 'node_modules'] : [],
      code, message, recovery: status === 'recovery-required' ? this.id : null };
  }

  async run() {
    const interrupt = () => this.controller.abort();
    process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
    try {
      if (this.request.recover) return await this.recover(this.request.recover);
      if (!await this.prepare()) return this.result('unchanged', 0);
      await this.installCandidate();
      return await this.commit();
    } catch (error) {
      this.hooks.error?.(error);
      if (error.backupFailure && this.journal) {
        this.journal.backupFailure = error.backupFailure;
        try { this.save(); } catch { return this.result('recovery-required', 7, 'backup failure receipt could not be persisted'); }
      }
      const code = Number.isInteger(error.code) ? error.code : 5;
      if (this.request.recover) return this.result('recovery-required', 7, 'explicit recovery incomplete; retain materials');
      if (this.journal && !terminal.has(this.journal.phase)) {
        let published = this.journal.moves.length > 0;
        try {
          const durable = readJson(path.join(this.directory, 'journal.json'));
          published = (durable.moves?.length || 0) > 0;
          if (durable.phase === 'COMMITTED') {
            this.journal = durable;
            return this.result('recovery-required', 7, 'commit receipt persisted; explicit terminal verification required');
          }
          await this.recover(this.id, true);
          return this.result('rejected', published ? 6 : code, `transaction rejected (${code})`);
        } catch {
          return this.result('recovery-required', 7, 'recovery incomplete; preserve transaction and coordinate explicit recovery');
        }
      }
      if (this.journal && terminal.has(this.journal.phase)) return this.result('recovery-required', 7, 'terminal cleanup incomplete; retry explicit recovery');
      return this.result(code === 7 ? 'recovery-required' : 'rejected', code, 'managed operation rejected');
    } finally {
      process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const mode = process.argv[2];
    if (mode === 'request') console.log(JSON.stringify(parseRequest(process.argv.slice(3))));
    else if (mode === 'run') {
      const request = parseRequest(process.argv.slice(3));
      const result = await new ManagedSync(request).run();
      console.log(JSON.stringify(result));
      process.exitCode = result.code;
    } else fail('internal managed helper mode required', 2);
  } catch (error) {
    const code = Number.isInteger(error.code) ? error.code : 2;
    console.log(JSON.stringify({ schemaVersion: 1, status: 'rejected', phase: 'request', code, message: error.message }));
    process.exitCode = code;
  }
}
