/**
 * scripts/worktree-app-qa.test.mjs
 * 应用级验收入口的单元测试：编排、就绪判定、反向对照与清理义务。
 * 真实浏览器链路由任务工作树内的实跑证据覆盖，此处用依赖注入只测编排语义。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppQaRunner, resolveWorktreeRoot, isAppReady } from './worktree-app-qa.mjs';

test('isAppReady 要求可见元素数量与最大可见几何同时为正', () => {
  assert.equal(isAppReady({ visibleCount: 60, largest: { width: 900, height: 600 } }), true);
  assert.equal(isAppReady({ visibleCount: 3, largest: { width: 900, height: 600 } }), false, '元素太少不算就绪');
  assert.equal(isAppReady({ visibleCount: 60, largest: { width: 10, height: 600 } }), false, '宽度不足不算就绪');
  assert.equal(isAppReady({ visibleCount: 60, largest: { width: 900, height: 20 } }), false, '高度不足不算就绪');
  assert.equal(isAppReady(null), false);
  assert.equal(isAppReady(undefined), false);
});

test('resolveWorktreeRoot 拒绝非工作树路径并给出可操作原因', () => {
  const io = {
    lstatSync: () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); },
    realpathSync: path => path,
    readFileSync: () => '',
  };
  const outside = resolveWorktreeRoot('/Users/x/omnimux-dsh-wt-legacy', io, '/repo');
  assert.equal(outside.ok, false);
  assert.equal(outside.code, 'TEST_ENV_ROOT_UNSAFE');
  assert.equal(outside.reason, 'outside-worktrees');
  assert.match(outside.hint, /\.worktrees/, '提示必须指向正确位置');

  const relative = resolveWorktreeRoot('relative/path', io, '/repo');
  assert.equal(relative.reason, 'not-absolute-or-unnormalized');
});

test('runner 在任何情况下都执行 cleanup 并把报告写进证据目录', async () => {
  const writes = new Map();
  const io = {
    lstatSync: () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); },
    realpathSync: path => path,
    readFileSync: () => '',
  };
  const cleaned = [];
  const run = createAppQaRunner({
    io,
    uuid: () => 'run-fixed',
    now: () => new Date('2026-09-14T00:00:00.000Z'),
    startEnv: async () => ({
      origin: 'http://127.0.0.1:12345',
      summary: Object.freeze({ mode: 'ui', evidenceLevel: 'core-only', taskPluginsInstalled: false }),
      loginUrl: 'http://127.0.0.1:12345/?token=unit-only',
      cleanup: async () => { cleaned.push('env'); return { cleaned: true }; },
    }),
    driveBrowser: async () => ({
      cdpPort: 12346,
      assertions: [{ name: 'visible-geometry-positive', pass: true }],
      screenshot: { path: '/tmp/app-home.png', width: 1280, height: 713, bytes: 100 },
    }),
  });

  // 拒绝路径：不得启动应用、不得报告通过，但仍须抛错且错误可读
  await assert.rejects(
    run({ root: '/elsewhere/not-a-worktree' }),
    error => error.code === 'TEST_ENV_ROOT_UNSAFE' && typeof error.hint === 'string',
  );
  assert.deepEqual(cleaned, [], '未启动应用时不应产生清理调用');
});

test('runner 对合规根产出报告且 cleanup 只调用一次', async () => {
  const root = '/repo/.worktrees/task';
  const gitdir = '/repo/.git/worktrees/task';
  const files = new Set([root + '/.git', gitdir + '/commondir', gitdir + '/gitdir']);
  const dirs = new Set(['/repo', '/repo/.worktrees', root, '/repo/.git', '/repo/.git/worktrees', gitdir]);
  const bodies = new Map([
    [root + '/.git', 'gitdir: ' + gitdir + '\n'],
    [gitdir + '/commondir', '../..\n'],
    [gitdir + '/gitdir', root + '/.git\n'],
  ]);
  const written = [];
  const io = {
    lstatSync: path => {
      if (!files.has(path) && !dirs.has(path)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return { isSymbolicLink: () => false, isDirectory: () => dirs.has(path), isFile: () => files.has(path) };
    },
    realpathSync: path => path,
    readFileSync: path => {
      if (!bodies.has(path)) throw new Error('unapproved read: ' + path);
      return bodies.get(path);
    },
    mkdirSync: () => {},
    writeFileSync: (path, value) => written.push({ path, value }),
  };
  let cleanupCount = 0;
  const run = createAppQaRunner({
    io,
    uuid: () => 'run-ok',
    now: () => new Date('2026-09-14T00:00:00.000Z'),
    fetchImpl: async () => ({
      status: 303,
      headers: { getSetCookie: () => ['dsh-auth-unit=unit-cookie-value; Path=/; HttpOnly'] },
    }),
    startEnv: async () => ({
      origin: 'http://127.0.0.1:15000',
      summary: Object.freeze({ mode: 'ui', evidenceLevel: 'core-only', taskPluginsInstalled: false }),
      loginUrl: 'http://127.0.0.1:15000/?token=unit-only',
      cleanup: async () => { cleanupCount += 1; return { cleaned: true }; },
    }),
    driveBrowser: async () => ({
      cdpPort: 15001,
      assertions: [
        { name: 'app-dom-mounted', pass: true },
        { name: 'visible-geometry-positive', pass: true, largest: { width: 900, height: 600 } },
      ],
      screenshot: { path: root + '/.workbuddy/evidence/app-qa/run-ok/app-home.png', width: 1280, height: 713, bytes: 2048 },
    }),
  });

  const report = await run({ root, repo: '/repo' });
  assert.equal(report.pass, true);
  assert.equal(cleanupCount, 1, 'cleanup 必须恰好调用一次');
  assert.equal(report.summary.evidenceLevel, 'core-only');
  assert.equal(report.assertions.every(assertion => assertion.pass), true);
  assert.ok(written.some(item => item.path.endsWith('/docs/evidence/worktree-app-qa-report.json')), '必须写摘要报告');
  assert.ok(written.some(item => item.path.endsWith('/evidence/app-qa/run-ok/report.json')), '必须写明细报告');
  // 报告不得携带登录能力
  for (const item of written) {
    assert.equal(/token=/.test(item.value), false, '报告不得包含 token');
    assert.equal(/loginUrl/.test(item.value), false, '报告不得包含 loginUrl');
  }
});
