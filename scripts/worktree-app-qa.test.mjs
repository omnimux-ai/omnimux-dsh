/**
 * scripts/worktree-app-qa.test.mjs
 * 应用级验收入口的单元测试：编排、就绪判定、反向对照与清理义务。
 * 真实浏览器链路由任务工作树内的实跑证据覆盖，此处用依赖注入只测编排语义。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestEnvironmentStarter } from './test-env-bootstrap.mjs';
import { validateEvidence } from './evidence-contract.mjs';
import { createAppQaRunner, resolveWorktreeRoot, isAppReady, assertBlankSessionHubPath } from './worktree-app-qa.mjs';

const publicRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRepository = resolve(publicRoot, '../..');
const publicExpectedAssertions = {
  'app-environment': ['app-runtime-ready', 'same-origin-login'],
  'app-browser': ['chrome-cdp-listen', 'auth-cookie-applied', 'app-dom-mounted', 'visible-geometry-positive', 'runtime-modal-bypassed', 'blank-session-guide-visible', 'explore-section-visible', 'explore-cards-present', 'asset-hub-reachable-via-library', 'screenshot-png-verified'],
};
const publicEnvironmentResources = ['app-child', 'mock-server', 'app-private-directory'].map(name => ({ name, owner: 'app-environment', status: 'not-applicable', reason: 'not-created' }));
const publicBrowserResources = ['browser-child', 'cdp-transport', 'browser-private-directory'].map(name => ({ name, owner: 'app-browser', status: 'not-applicable', reason: 'not-created' }));

// These smoke doubles do not establish browser execution, fresh installation or task loading.
test('公共应用入口用真实登记根封存依赖桩冒烟成功，原件保持未封存状态', async t => {
  assert.deepEqual(resolveWorktreeRoot(publicRoot, fs, publicRepository), { ok: true, root: publicRoot });
  const runId = randomUUID();
  const prefix = `.workbuddy/evidence/contract/3335/${runId}/`;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4o6EBAAMQAS0ujiXaAAAAAElFTkSuQmCC', 'base64');
  let cleaned = 0;
  const run = createAppQaRunner({
    uuid: () => runId,
    startEnv: async () => ({
      origin: 'http://127.0.0.1:15000',
      loginUrl: 'http://127.0.0.1:15000/?token=synthetic-public-only',
      summary: { mode: 'ui', evidenceLevel: 'core-only', taskPluginsInstalled: false },
      cleanup: async () => { cleaned += 1; return { cleaned: true, resources: publicEnvironmentResources }; },
    }),
    fetchImpl: async () => ({ status: 303, headers: { getSetCookie: () => ['dsh-auth-unit=synthetic-public-cookie; Path=/; HttpOnly'] } }),
    driveBrowser: async ({ evidenceDir }) => {
      assert.equal(evidenceDir, join(publicRoot, prefix));
      fs.writeFileSync(join(evidenceDir, 'app-home.png'), png, { flag: 'wx' });
      return {
        assertions: publicExpectedAssertions['app-browser'].map(name => ({ name, pass: true })),
        cleanup: publicBrowserResources,
        screenshot: { width: 1, height: 1, bytes: png.length },
      };
    },
  });
  const report = await run({ root: publicRoot, repo: publicRepository, taskId: '3335', base: 'HEAD', head: 'HEAD', scope: 'smoke',
    requiredChecks: ['app-environment', 'app-browser'], expectedAssertions: publicExpectedAssertions });
  assert.equal(report.pass, true);
  assert.equal(report.evidence.valid, true);
  assert.equal(report.evidence.pass, true);
  assert.equal(cleaned, 1);
  const rawText = fs.readFileSync(join(publicRoot, prefix, 'raw-run.json'), 'utf8');
  const raw = JSON.parse(rawText);
  const envelope = JSON.parse(fs.readFileSync(join(publicRoot, prefix, 'evidence.json'), 'utf8'));
  const validation = validateEvidence(envelope, { purpose: 'history', root: publicRoot, taskId: '3335', runId, scope: 'smoke',
    requiredChecks: ['app-environment', 'app-browser'], expectedAssertions: publicExpectedAssertions });
  assert.equal(validation.valid, true);
  assert.equal(validation.pass, true);
  assert.equal(validation.provenance, 'self-reported');
  assert.equal(validation.authorization, 'not-granted');
  assert.equal(raw.pass, false);
  assert.equal(raw.executionPassed, true);
  assert.equal(raw.evidenceStatus, 'unsealed');
  assert.equal(raw.evidence, undefined);
  assert.equal(raw.producer, 'dependency-stub');
  assert.equal(raw.scope, 'smoke');
  assert.equal(raw.taskBinding, 'unknown');
  assert.equal(raw.userFresh, 'unknown');
  assert.deepEqual(raw.checks.map(item => item.tests), [2, 10]);
  assert.deepEqual(raw.cleanup.resources, publicEnvironmentResources.concat(publicBrowserResources));
  assert.deepEqual(envelope.cleanup, raw.cleanup.resources);
  assert.deepEqual(envelope.candidate.exclusions.outputPaths, [prefix + 'app-home.png', prefix + 'evidence.json', prefix + 'hub-business-path.png', prefix + 'raw-run.json']);
  assert.deepEqual(envelope.artifacts.map(item => item.path), [prefix + 'raw-run.json', prefix + 'app-home.png']);
  assert.equal(envelope.candidate.repo.realRoot, publicRoot);
  assert.equal(envelope.candidate.base.resolvedSha, envelope.candidate.head.resolvedSha);
  assert.match(envelope.candidate.head.resolvedSha, /^[a-f0-9]{40}$/);
  assert.deepEqual(fs.readFileSync(join(publicRoot, prefix, 'app-home.png')), png);
  assert.doesNotMatch(rawText, /synthetic-public-cookie|synthetic-public-only|loginUrl|token=/);
  assert.deepEqual(raw.errors, []);
  assert.ok(Number.isSafeInteger(report.evidence.beforeCaptureMs));
  assert.ok(Number.isSafeInteger(report.evidence.afterCaptureMs));
  t.diagnostic(JSON.stringify({ runId, head: envelope.candidate.head.resolvedSha, beforeCaptureMs: report.evidence.beforeCaptureMs,
    afterCaptureMs: report.evidence.afterCaptureMs, reportDigest: envelope.reportDigest, rawPath: report.evidence.rawPath, reportPath: report.evidence.reportPath }));
});

test('公共应用入口真实准备器前置拒绝仍封存有效失败，不启动运行环境', async t => {
  assert.deepEqual(resolveWorktreeRoot(publicRoot, fs, publicRepository), { ok: true, root: publicRoot });
  const runId = randomUUID();
  const prefix = `.workbuddy/evidence/contract/3335/${runId}/`;
  const run = createAppQaRunner({ uuid: () => runId, startEnv: createTestEnvironmentStarter({ repositoryRoot: publicRepository }) });
  const report = await run({ root: publicRoot, repo: publicRepository, taskId: '3335', base: 'HEAD', head: 'HEAD', scope: 'smoke',
    requiredChecks: ['app-environment', 'app-browser'], expectedAssertions: publicExpectedAssertions });
  assert.equal(report.pass, false);
  assert.equal(report.evidence.valid, true);
  assert.equal(report.evidence.pass, false);
  assert.deepEqual(report.errors, ['TEST_ENV_NOT_USER_FRESH_TASK_UNKNOWN']);
  const rawText = fs.readFileSync(join(publicRoot, prefix, 'raw-run.json'), 'utf8');
  const raw = JSON.parse(rawText);
  const envelope = JSON.parse(fs.readFileSync(join(publicRoot, prefix, 'evidence.json'), 'utf8'));
  const validation = validateEvidence(envelope, { purpose: 'history', root: publicRoot, taskId: '3335', runId, scope: 'smoke',
    requiredChecks: ['app-environment', 'app-browser'], expectedAssertions: publicExpectedAssertions });
  assert.equal(validation.valid, true);
  assert.equal(validation.pass, false);
  assert.equal(validation.provenance, 'self-reported');
  assert.equal(validation.authorization, 'not-granted');
  assert.equal(raw.pass, false);
  assert.equal(raw.executionPassed, false);
  assert.equal(raw.evidenceStatus, 'unsealed');
  assert.equal(raw.producer, 'dependency-stub', 'repositoryRoot/uuid seam is not a default controlled-runner claim');
  assert.equal(raw.userFresh, false);
  assert.equal(raw.taskBinding, 'unknown');
  assert.equal(raw.origin, null);
  assert.equal(raw.appPort, null);
  assert.equal(raw.cdpPort, null);
  assert.deepEqual(raw.assertions, []);
  assert.deepEqual(raw.checks.map(item => item.tests), [0, 0]);
  assert.ok(raw.checks.every(item => item.status === 'not-run' && item.exitCode === null && item.assertions.every(assertion => assertion.pass === false)));
  assert.equal(raw.cleanup.cleaned, true);
  assert.deepEqual(raw.cleanup.resources, publicEnvironmentResources.concat(publicBrowserResources));
  assert.deepEqual(envelope.cleanup, raw.cleanup.resources);
  assert.deepEqual(envelope.artifacts.map(item => item.path), [prefix + 'raw-run.json']);
  assert.deepEqual(raw.errors, ['TEST_ENV_NOT_USER_FRESH_TASK_UNKNOWN']);
  assert.deepEqual(raw.observations.appEvents, []);
  assert.deepEqual(raw.observations.browserEvents, []);
  assert.equal(raw.screenshot, null);
  assert.doesNotMatch(rawText, /loginUrl|token=/);
  t.diagnostic(JSON.stringify({ runId, head: envelope.candidate.head.resolvedSha, beforeCaptureMs: report.evidence.beforeCaptureMs,
    afterCaptureMs: report.evidence.afterCaptureMs, reportDigest: envelope.reportDigest, rawPath: report.evidence.rawPath, reportPath: report.evidence.reportPath }));
});

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
  let cleanupBehavior = 'success';
  const browserReceipt = {};
  const browserAssertions = [
    { name: 'app-dom-mounted', pass: true },
    { name: 'visible-geometry-positive', pass: true, largest: { width: 900, height: 600 } },
  ];
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
      cleanup: async () => {
        cleanupCount += 1;
        if (cleanupBehavior === 'throw') throw new Error('unit-secret-never-log');
        return { cleaned: cleanupBehavior !== 'false' };
      },
    }),
    driveBrowser: async () => ({
      cdpPort: 15001,
      assertions: browserAssertions,
      cleanup: browserReceipt.cleanup,
      observations: browserReceipt.observations,
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
  assert.equal(report.scope, 'smoke');
  assert.equal(report.contract, 'none');
  assert.equal(report.producer, 'dependency-stub');
  assert.equal(report.taskBinding, 'unknown');
  assert.equal(report.userFresh, 'unknown');
  assert.equal(report.evidence, undefined, 'legacy output is not a validated envelope');

  for (const behavior of ['false', 'throw']) {
    cleanupBehavior = behavior;
    const failed = await run({ root, repo: '/repo' });
    assert.equal(failed.pass, false, `cleanup ${behavior} cannot pass`);
    assert.equal(failed.cleanup.cleaned, false);
    assert.ok(failed.errors.includes('TEST_APP_QA_CLEANUP_INCOMPLETE'));
    if (behavior === 'throw') assert.ok(failed.errors.includes('TEST_APP_QA_CLEANUP'));
    assert.equal(cleanupCount, behavior === 'false' ? 2 : 3, 'each attempted run cleans exactly once');
  }
  cleanupBehavior = 'success';
  browserAssertions.push({ name: 'cookie=unit-secret-never-log', pass: false });
  const unexpectedName = await run({ root, repo: '/repo' });
  assert.equal(unexpectedName.pass, false);
  assert.ok(unexpectedName.errors.includes('TEST_APP_QA_ASSERTION_SET_MISMATCH'));
  assert.equal(unexpectedName.assertions.some(item => item.name.includes('unit-secret-never-log')), false);
  browserAssertions.pop();
  browserReceipt.cleanup = {};
  browserReceipt.observations = { events: [null] };
  const malformedReceipt = await run({ root, repo: '/repo' });
  assert.equal(malformedReceipt.pass, false);
  assert.ok(malformedReceipt.errors.includes('TEST_APP_QA_BROWSER_CLEANUP'));
  assert.ok(malformedReceipt.errors.includes('TEST_APP_QA_EVENTS_INVALID'));
  assert.ok(written.some(item => item.value.includes('TEST_APP_QA_EVENTS_INVALID')));
  delete browserReceipt.cleanup;
  delete browserReceipt.observations;

  const request = {
    root, repo: '/repo', taskId: 'task', base: 'HEAD', head: 'HEAD', scope: 'smoke',
    requiredChecks: ['app-environment', 'app-browser'],
    expectedAssertions: {
      'app-environment': ['app-runtime-ready', 'same-origin-login'],
      'app-browser': ['chrome-cdp-listen', 'auth-cookie-applied', 'app-dom-mounted', 'visible-geometry-positive', 'runtime-modal-bypassed', 'blank-session-guide-visible', 'explore-section-visible', 'explore-cards-present', 'asset-hub-reachable-via-library', 'screenshot-png-verified'],
    },
  };
  const beforeWrites = written.length;
  await assert.rejects(run(Object.assign({}, request, { base: undefined })), { code: 'TEST_APP_QA_CONTRACT_REQUEST' });
  await assert.rejects(run(Object.assign({}, request, { requiredChecks: [] })), { code: 'TEST_APP_QA_EXPECTED_POLICY' });
  await assert.rejects(run(Object.assign({}, request, { expectedAssertions: { 'app-environment': ['app-runtime-ready', 'same-origin-login'], 'app-browser': ['app-dom-mounted', 'visible-geometry-positive'] } })), { code: 'TEST_APP_QA_EXPECTED_POLICY' });
  assert.equal(cleanupCount, 5, 'preflight failures never prepare or clean an environment');
  assert.equal(written.length, beforeWrites, 'preflight failures never create a report');

  // 报告不得携带登录能力或清理异常原文
  for (const item of written) {
    assert.equal(/token=/.test(item.value), false, '报告不得包含 token');
    assert.equal(/loginUrl/.test(item.value), false, '报告不得包含 loginUrl');
    assert.doesNotMatch(item.value, /unit-cookie-value|unit-secret-never-log/, '报告只保留分类码，不含 cookie 或清理异常原文');
  }
});

test('assertBlankSessionHubPath 进入空白会话并断言 Explore / asset-hub', async () => {
  let guideStep = 0;
  let libraryPoll = 0;
  const pointerEvents = [];
  const send = async (method, params = {}) => {
    if (method === 'Input.dispatchMouseEvent') pointerEvents.push(params.type);
    if (method === 'Runtime.evaluate') {
      const expr = params.expression || '';
      if (expr.includes('data-omnimux-starter-guide') && expr.includes('exploreCardCount')) {
        guideStep += 1;
        if (guideStep === 1) {
          return { result: { value: { guideVisible: false, exploreVisible: false, exploreCardCount: 0, compact: false, hubPanel: false } } };
        }
        return { result: { value: { guideVisible: true, exploreVisible: true, exploreCardCount: 7, compact: false, hubPanel: false } } };
      }
      if (expr.includes('data-omnimux-topbar-new-session') || expr.includes('新对话')) {
        return { result: { value: { clicked: true, via: '[data-omnimux-topbar-new-session]' } } };
      }
      if (expr.includes('button[aria-label="添加附件"]') || expr.includes('Add attachment')) {
        return { result: { value: { openedMenu: true } } };
      }
      if (expr.includes('const library =') && expr.includes('从资产库选择')) {
        libraryPoll += 1;
        if (libraryPoll < 2) return { result: { value: { found: false } } };
        return { result: { value: { found: true, actionable: true, x: 20, y: 30 } } };
      }
      if (expr.includes('__omnimuxWorkbench') && expr.includes('openWorkbench')) {
        return { result: { value: { ok: true, thenable: true, sessionId: 'sess_qa' } } };
      }
      if (expr.includes('omx-hub-panel') || expr.includes('素材工作台顶栏')) {
        return { result: { value: true } };
      }
      return { result: { value: null } };
    }
    if (method === 'Page.captureScreenshot') {
      return { data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' };
    }
    return {};
  };
  const evidenceDir = '/tmp/hub-path-qa-unit';
  const { mkdirSync, rmSync } = await import('node:fs');
  mkdirSync(evidenceDir, { recursive: true });
  try {
    const result = await assertBlankSessionHubPath({
      send,
      sleep: async () => {},
      evidenceDir,
      menuTimeoutMs: 10,
      hubTimeoutMs: 10,
      blankTimeoutMs: 10,
    });
    assert.equal(result.detail.clickedNewSession, true);
    assert.equal(result.detail.exploreVisible, true);
    assert.equal(result.detail.exploreCardCount, 7);
    assert.equal(result.detail.assetHubOpened, true);
    const hubAssertion = result.assertions.find(a => a.name === 'asset-hub-reachable-via-library');
    assert.equal(hubAssertion.pass, true);
    assert.equal(hubAssertion.clickedLibrary, true);
    // 全屏 Explore 下菜单只滚 Tab；验收路径始终再走 openWorkbench(split)
    assert.equal(hubAssertion.usedWorkbenchFallback, true);
    assert.deepEqual(pointerEvents, ['mousePressed', 'mouseReleased']);
    assert.equal(result.assertions.every(a => a.pass), true);
  } finally {
    rmSync(evidenceDir, { recursive: true, force: true });
  }
});

test('assertBlankSessionHubPath 菜单未命中即使 workbench 可见仍不能证明资产库选择路径通过', async () => {
  const send = async (method, params = {}) => {
    if (method === 'Runtime.evaluate') {
      const expr = params.expression || '';
      if (expr.includes('data-omnimux-starter-guide') && expr.includes('exploreCardCount')) {
        return { result: { value: { guideVisible: true, exploreVisible: true, exploreCardCount: 3, compact: false, hubPanel: false } } };
      }
      if (expr.includes('button[aria-label="添加附件"]') || expr.includes('Add attachment')) {
        return { result: { value: { openedMenu: true } } };
      }
      if (expr.includes('const library =') && expr.includes('从资产库选择')) {
        return { result: { value: { found: false } } };
      }
      if (expr.includes('__omnimuxWorkbench') && expr.includes('openWorkbench')) {
        return { result: { value: { ok: true, thenable: true, sessionId: 'sess_qa' } } };
      }
      if (expr.includes('omx-hub-panel') || expr.includes('素材工作台顶栏')) {
        return { result: { value: true } };
      }
      return { result: { value: null } };
    }
    if (method === 'Page.captureScreenshot') {
      return { data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' };
    }
    return {};
  };
  const evidenceDir = '/tmp/hub-path-qa-fallback';
  const { mkdirSync, rmSync } = await import('node:fs');
  mkdirSync(evidenceDir, { recursive: true });
  try {
    const result = await assertBlankSessionHubPath({
      send,
      sleep: async () => {},
      evidenceDir,
      menuTimeoutMs: 10,
      hubTimeoutMs: 10,
      blankTimeoutMs: 10,
    });
    const hubAssertion = result.assertions.find(a => a.name === 'asset-hub-reachable-via-library');
    assert.equal(hubAssertion.pass, false);
    assert.equal(hubAssertion.clickedLibrary, false);
    assert.equal(hubAssertion.usedWorkbenchFallback, true);
    assert.equal(result.detail.assetHubOpened, true);
  } finally {
    rmSync(evidenceDir, { recursive: true, force: true });
  }
});

test('assertLiveImageGeneration 校验真实生图 HTTP 200、磁盘文件非空与 DOM 图片无裂图', async () => {
  const { assertLiveImageGeneration } = await import('./worktree-app-qa.mjs');
  const { mkdirSync, rmSync, writeFileSync } = await import('node:fs');
  const evidenceDir = '/tmp/live-image-qa-unit';
  mkdirSync(evidenceDir, { recursive: true });
  const fakeDest = evidenceDir + '/generated.png';
  writeFileSync(fakeDest, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const send = async (method, params = {}) => {
    if (method === 'Runtime.evaluate') {
      const expr = params.expression || '';
      if (expr.includes('/omnimux/model-catalog')) {
        return { result: { value: { httpCode: 200, imageCount: 12, videoCount: 8 } } };
      }
      if (expr.includes('/omnimux/api/media/generate')) {
        return {
          result: {
            value: {
              httpCode: 200,
              body: { ok: true, mode: 'live', url: 'https://files.omnimux.ai/test.png', dest: fakeDest },
              imgProbe: { loaded: true, width: 1024, height: 1024 },
              brokenCount: 0,
              hasViewer: true,
            },
          },
        };
      }
      return { result: { value: { clickedTab: true } } };
    }
    if (method === 'Page.captureScreenshot') {
      return { data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' };
    }
    return {};
  };
  try {
    const res = await assertLiveImageGeneration({
      send,
      sleep: async () => {},
      evidenceDir,
    });
    assert.equal(res.assertions.every(a => a.pass), true);
    assert.equal(res.detail.httpStatus, 200);
    assert.equal(res.detail.generationMode, 'live');
    assert.ok(res.detail.destBytes > 0);
    assert.equal(res.detail.naturalWidth, 1024);
    assert.equal(res.detail.brokenImageCount, 0);
  } finally {
    rmSync(evidenceDir, { recursive: true, force: true });
  }
});
