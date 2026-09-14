import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

const moduleUrl = new URL('./test-env-bootstrap.mjs', import.meta.url);
const repo = '/repo';
const root = '/repo/.worktrees/task';
function fixture(behavior = 'ready') {
  const files = new Map([[root + '/.git', 'gitdir: /repo/.git/worktrees/task\n'], ['/repo/.git/worktrees/task/commondir', '../..\n'], ['/repo/.git/worktrees/task/gitdir', root + '/.git\n']]);
  const removed = []; const spawned = []; let count = 0; let reads = 0;
  const fs = {
    realpathSync: p => p,
    lstatSync: p => ({ isSymbolicLink: () => false, isDirectory: () => !files.has(p), isFile: () => files.has(p) }),
    readFileSync: p => { if (!files.has(p)) throw new Error('unapproved read'); return files.get(p); },
    mkdirSync() {}, chmodSync() {},
    mkdtempSync: p => p + (++count),
    writeFileSync: (p, value) => files.set(p, value),
    rmSync: p => removed.push(p),
    accessSync() {},
  };
  const signals = new EventEmitter();
  const deps = { fs, repositoryRoot: repo, signals, startupTimeoutMs: 35, shutdownTimeoutMs: 20,
    readCredential: () => { reads++; return 'unit-secret-never-log'; },
    spawn: (exe, args, options) => {
      const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.pid = 123;
      child.exitCode = null; child.signalCode = null;
      child.kill = signal => { setTimeout(() => { child.signalCode = signal; child.emit('exit', null, signal); child.emit('close', null, signal); }, 2); return true; };
      spawned.push({ exe, args, options, child });
      setImmediate(() => {
        if (behavior === 'ready') { child.stdout.write('dsh web: http://127.0.0.1:32123/?tok'); child.stdout.write('en=unit-login-token\n'); }
        if (behavior === 'error') child.emit('error', new Error('unit-secret-never-log'));
        if (behavior === 'exit') { child.exitCode = 1; child.emit('exit', 1); child.emit('close', 1); }
        if (behavior === 'unsafe') child.stdout.write('dsh web: https://evil.example/?token=unit-login-token\n');
        child.stderr.write('raw unit-secret-never-log diagnostic\n');
      });
      return child;
    },
  };
  return { deps, files, removed, spawned, signals, reads: () => reads };
}
async function load() { return import(moduleUrl); }

test('default ui isolates environment, fixed config, login capability and cleanup', async () => {
  const { createTestEnvironmentStarter } = await load(); const f = fixture();
  const run = await createTestEnvironmentStarter(f.deps)({ root });
  try {
    const { exe, args, options } = f.spawned[0];
    assert.match(exe, /OmniMux Dev.app\/Contents\/MacOS\/OmniMux$/);
    assert.deepEqual(args.slice(-7), ['--profile', 'web', '--port', '0', '--host', '127.0.0.1', '--no-open']);
    assert.equal(options.env.ELECTRON_RUN_AS_NODE, '1');
    assert.equal(options.env.DEEPSEEK_API_KEY, 'QA-SYNTHETIC-NOT-A-REAL-KEY');
    assert.match(options.env.DEEPSEEK_BASE_URL, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(f.reads(), 0);
    assert.equal(options.env.OPENAI_API_KEY, undefined); assert.equal(options.env.NODE_OPTIONS, undefined);
    for (const key of ['HOME', 'DSH_HOME', 'DSH_AGENTS_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'XDG_DATA_HOME', 'TMPDIR', 'TMP', 'TEMP']) assert.ok(options.env[key].startsWith(root + '/.test-env-'));
    assert.ok(options.cwd.startsWith(root + '/.test-env-'));
    const settings = JSON.parse(f.files.get(options.env.DSH_HOME + '/settings.yaml'));
    assert.deepEqual(settings['llm-deepseek'], { apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: options.env.DEEPSEEK_BASE_URL });
    assert.equal(run.origin, 'http://127.0.0.1:32123');
    assert.match(run.loginUrl, /unit-login-token/);
    assert.equal(Object.getOwnPropertyDescriptor(run, 'loginUrl').enumerable, false);
    assert.doesNotMatch(JSON.stringify(run), /unit-login-token|unit-secret|QA-SYNTHETIC/);
    assert.equal(run.summary.evidenceLevel, 'core-only');
    assert.equal(run.summary.realModelRequest, false);
  } finally { await run.cleanup(); }
  assert.equal(f.spawned[0].child.signalCode, 'SIGTERM'); assert.equal(f.removed.length, 1);
  await run.cleanup(); assert.equal(f.removed.length, 1); assert.equal(f.signals.listenerCount('SIGTERM'), 0);
});

test('ui mock implements marked JSON and SSE without proxying unknown routes', async () => {
  const { createTestEnvironmentStarter } = await load(); const f = fixture(); const run = await createTestEnvironmentStarter(f.deps)({ root });
  const base = f.spawned[0].options.env.DEEPSEEK_BASE_URL;
  try {
    const post = stream => fetch(base + '/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'deepseek-chat', messages: [], stream }) });
    const body = await (await post(false)).json(); assert.match(body.choices[0].message.content, /QA模拟/); assert.equal(body.choices[0].finish_reason, 'stop');
    const response = await post(true); assert.match(response.headers.get('content-type'), /text\/event-stream/);
    const sse = await response.text(); assert.match(sse, /QA模拟/); assert.match(sse, /"delta"/); assert.match(sse, /data: \[DONE\]/);
    assert.equal((await fetch(base + '/proxy?url=https://evil.example')).status, 404);
    assert.equal((await fetch(base + '/chat/completions')).status, 405);
    assert.equal((await fetch(base + '/chat/completions', { method: 'POST', body: '{' })).status, 400);
  } finally { await run.cleanup(); }
  await assert.rejects(fetch(base));
});

test('onboarding does not read credentials or inject a configured key', async () => {
  const { createTestEnvironmentStarter } = await load(); const f = fixture(); const run = await createTestEnvironmentStarter(f.deps)({ root, mode: 'onboarding' });
  try { assert.equal(f.reads(), 0); assert.equal(f.spawned[0].options.env.DEEPSEEK_API_KEY, undefined); assert.equal(f.spawned[0].options.env.DEEPSEEK_BASE_URL, undefined); } finally { await run.cleanup(); }
});

test('live alone reads credential into child env, never config or arguments', async () => {
  const { createTestEnvironmentStarter } = await load(); const f = fixture(); const run = await createTestEnvironmentStarter(f.deps)({ root, mode: 'live' });
  try {
    assert.equal(f.reads(), 1); assert.equal(f.spawned[0].options.env.DEEPSEEK_API_KEY, 'unit-secret-never-log');
    assert.equal(f.spawned[0].options.env.DEEPSEEK_BASE_URL, 'https://api.deepseek.com');
    assert.doesNotMatch(JSON.stringify([...f.files]), /unit-secret-never-log/); assert.doesNotMatch(JSON.stringify(f.spawned[0].args), /unit-secret-never-log/);
  } finally { await run.cleanup(); }
});

for (const [behavior, code] of [['timeout', 'START_TIMEOUT'], ['error', 'RUNTIME_START'], ['exit', 'RUNTIME_EXIT'], ['unsafe', 'UNSAFE_LOGIN_URL']]) {
  test(`${behavior} is classified, redacted and cleaned`, async () => {
    const { createTestEnvironmentStarter } = await load(); const f = fixture(behavior);
    await assert.rejects(createTestEnvironmentStarter(f.deps)({ root }), e => e.code === 'TEST_ENV_' + code && !/secret|token|evil/.test(e.message));
    assert.equal(f.removed.length, 1); assert.equal(f.signals.listenerCount('SIGINT'), 0);
  });
}

test('credential failure stays classified and no runtime starts', async () => {
  const { createTestEnvironmentStarter } = await load(); const f = fixture();
  f.deps.readCredential = () => { throw Object.assign(new Error('unsafe secret'), { code: 'TEST_ENV_CREDENTIAL_MISSING' }); };
  await assert.rejects(createTestEnvironmentStarter(f.deps)({ root, mode: 'live' }), { code: 'TEST_ENV_CREDENTIAL_MISSING', message: 'TEST_ENV_CREDENTIAL_MISSING' });
  assert.equal(f.spawned.length, 0);
});

for (const violation of ['outside', 'root-symlink', 'git-symlink', 'foreign-common', 'wrong-backlink']) {
  test(`reject worktree ${violation} before writes or credential read`, async () => {
    const { createTestEnvironmentStarter } = await load(); const f = fixture(); let candidate = root;
    if (violation === 'outside') candidate = '/repo/main';
    if (violation === 'root-symlink') f.deps.fs.realpathSync = p => p === root ? '/escape' : p;
    if (violation === 'git-symlink') f.deps.fs.lstatSync = p => ({ isSymbolicLink: () => p === root + '/.git', isFile: () => true, isDirectory: () => true });
    if (violation === 'foreign-common') f.files.set('/repo/.git/worktrees/task/commondir', '/foreign/.git');
    if (violation === 'wrong-backlink') f.files.set('/repo/.git/worktrees/task/gitdir', '/other/.git');
    await assert.rejects(createTestEnvironmentStarter(f.deps)({ root: candidate, mode: 'live' }), { code: 'TEST_ENV_ROOT_UNSAFE' });
    assert.equal(f.spawned.length, 0); assert.equal(f.reads(), 0); assert.equal(f.removed.length, 0);
  });
}

test('invalid mode and arbitrary command options are rejected', async () => {
  const { createTestEnvironmentStarter } = await load(); const f = fixture(); const start = createTestEnvironmentStarter(f.deps);
  await assert.rejects(start({ root, mode: 'anything' }), { code: 'TEST_ENV_OPTIONS' });
  await assert.rejects(start({ root, command: ['env'] }), { code: 'TEST_ENV_OPTIONS' });
});

test('unexpected runtime exit after readiness cleans its directory and mock', async () => {
  const { createTestEnvironmentStarter } = await load(); const f = fixture(); const run = await createTestEnvironmentStarter(f.deps)({ root });
  const base = f.spawned[0].options.env.DEEPSEEK_BASE_URL;
  const child = f.spawned[0].child; child.exitCode = 1; child.emit('exit', 1); child.emit('close', 1);
  await new Promise(resolve => setTimeout(resolve, 10));
  try { assert.equal(f.removed.length, 1); await assert.rejects(fetch(base)); } finally { await run.cleanup(); }
});

test('cleanup escalates only owned child and awaits confirmed exit', async () => {
  const { createTestEnvironmentStarter } = await load(); const f = fixture(); const run = await createTestEnvironmentStarter(f.deps)({ root });
  const child = f.spawned[0].child; const sent = [];
  child.kill = signal => { sent.push(signal); if (signal === 'SIGKILL') setTimeout(() => { child.signalCode = signal; child.emit('exit', null, signal); }, 2); return true; };
  await run.cleanup(); assert.deepEqual(sent, ['SIGTERM', 'SIGKILL']); assert.equal(f.removed.length, 1);
});

test('live rejects empty credential rather than falling back to unconfigured mode', async () => {
  const { createTestEnvironmentStarter } = await load(); const f = fixture(); f.deps.readCredential = () => '';
  await assert.rejects(createTestEnvironmentStarter(f.deps)({ root, mode: 'live' }).then(async run => { await run.cleanup(); return run; }), { code: 'TEST_ENV_CREDENTIAL_INVALID' });
  assert.equal(f.spawned.length, 0);
});

test('concurrent runs own disjoint dirs and ports; signal cleans all owned resources', async () => {
  const { createTestEnvironmentStarter } = await load(); const f = fixture(); const start = createTestEnvironmentStarter(f.deps);
  const [a, b] = await Promise.all([start({ root }), start({ root })]);
  assert.notEqual(f.spawned[0].options.env.HOME, f.spawned[1].options.env.HOME);
  assert.notEqual(f.spawned[0].options.env.DEEPSEEK_BASE_URL, f.spawned[1].options.env.DEEPSEEK_BASE_URL);
  f.signals.emit('SIGTERM'); await Promise.all([a.cleanup(), b.cleanup()]); assert.equal(f.removed.length, 2);
});

test('immediate exit right after stdout login URL rejects and cleans up', async () => {
  const { createTestEnvironmentStarter } = await load(); const f = fixture();
  f.deps.spawn = (exe, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => true;
    child.exitCode = null;
    child.signalCode = null;
    f.spawned.push({ exe, args, options, child });
    setImmediate(() => {
      child.stdout.write('dsh web: http://127.0.0.1:45120/?token=abc-123\n');
      child.exitCode = 1;
      child.emit('exit', 1);
    });
    return child;
  };
  await assert.rejects(createTestEnvironmentStarter(f.deps)({ root }), { code: 'TEST_ENV_RUNTIME_EXIT' });
  assert.equal(f.removed.length, 1);
});
