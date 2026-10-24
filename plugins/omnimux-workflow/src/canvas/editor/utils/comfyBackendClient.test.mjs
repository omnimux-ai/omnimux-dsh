/**
 * 托管后端客户端 + 状态映射单测（Issue 3701 M2c）。
 *
 * 覆盖：
 *  1. fetch 桩下的成功 / HTTP 失败 / 传输异常 / 已 abort 四种结果，且永不抛出；
 *  2. 动作方法打到正确路径与方法；
 *  3. 日志解析；
 *  4. 状态 → 界面映射六个状态 + 失败重试分流 + 阶段/错误文案 key；
 *  5. 与宿主 plan.ts 的常量一致性（状态集合、体积格式化）。
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  COMFY_BACKEND_LOG_LINES,
  COMFY_BACKEND_STATES,
  COMFY_BACKEND_TRANSPORT_STATUS,
  fetchComfyBackendLog,
  fetchComfyBackendState,
  formatComfyBackendBytes,
  installComfyBackend,
  parseComfyBackendLog,
  parseComfyBackendStatus,
  resolveComfyBackendPanel,
  resolveComfyBackendView,
  shouldProbeComfyPage,
  resolveFailedRetry,
  startComfyBackend,
  stopComfyBackend,
} from './comfyBackendClient.ts';
import * as plan from '../../../workflow/comfyBackend/plan.ts';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** 记录请求的桩：handler 返回 Response，或抛出以模拟传输失败。 */
function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (path, init) => {
    calls.push({ path: path, method: init && init.method ? init.method : 'GET' });
    if (init && init.signal && init.signal.aborted) throw new Error('The operation was aborted.');
    return handler(path, init);
  };
  return calls;
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 显式字段的状态字面量（不依赖展开语法）。 */
function status(state, stage, percent, error) {
  return {
    state: state,
    stage: stage,
    percent: percent,
    message: 'msg',
    error: error,
    pid: null,
    updatedAt: 1,
    target: null,
  };
}

test('成功：返回 ok 且能解析出状态', async () => {
  stubFetch(() => jsonResponse({ status: { state: 'installed', stage: null, percent: 0 } }, 200));
  const result = await fetchComfyBackendState();
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  const parsed = parseComfyBackendStatus(result.body.status);
  assert.equal(parsed.state, 'installed');
});

test('HTTP 失败：ok 为 false 并带上状态码与错误体，不抛', async () => {
  stubFetch(() => jsonResponse({ error: 'boom' }, 500));
  const result = await fetchComfyBackendState();
  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
  assert.equal(result.body.error, 'boom');
  assert.equal(parseComfyBackendStatus(result.body.status), null);
});

test('传输异常：转成显式失败（状态码 0）而不是抛出', async () => {
  stubFetch(() => {
    throw new Error('network down');
  });
  const result = await fetchComfyBackendState();
  assert.equal(result.ok, false);
  assert.equal(result.status, COMFY_BACKEND_TRANSPORT_STATUS);
  assert.equal(result.body.error, 'network down');
});

test('已 abort 的请求：同样返回显式失败，不抛', async () => {
  stubFetch(() => jsonResponse({ status: { state: 'ready' } }, 200));
  const controller = new AbortController();
  controller.abort();
  const result = await fetchComfyBackendState(controller.signal);
  assert.equal(result.ok, false);
  assert.equal(result.status, COMFY_BACKEND_TRANSPORT_STATUS);
});

test('动作方法打到各自路径且用 POST', async () => {
  const calls = stubFetch(() => jsonResponse({ status: { state: 'installing' } }, 202));
  await installComfyBackend();
  await startComfyBackend();
  await stopComfyBackend();
  assert.equal(calls.length, 3);
  assert.match(calls[0].path, /comfy-backend\/install$/);
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[1].path, /comfy-backend\/start$/);
  assert.equal(calls[1].method, 'POST');
  assert.match(calls[2].path, /comfy-backend\/stop$/);
  assert.equal(calls[2].method, 'POST');
});

test('日志：路径带 lines 参数，解析只保留字符串行', async () => {
  const calls = stubFetch(() => jsonResponse({ lines: ['a', 2, 'b'] }, 200));
  const result = await fetchComfyBackendLog(50);
  assert.equal(result.ok, true);
  assert.match(calls[0].path, /comfy-backend\/log\?lines=50$/);
  assert.deepEqual(parseComfyBackendLog(result.body), ['a', 'b']);
  assert.equal(COMFY_BACKEND_LOG_LINES, 200);
});

test('日志缺字段/非法形状给空数组', () => {
  assert.deepEqual(parseComfyBackendLog({}), []);
  assert.deepEqual(parseComfyBackendLog({ lines: 'nope' }), []);
  assert.deepEqual(parseComfyBackendLog(null), []);
});

test('六个状态各自映射出唯一主行动与展示开关', () => {
  const notInstalled = resolveComfyBackendView(status('not-installed', null, 0, null));
  assert.equal(notInstalled.primaryAction, 'install');
  assert.equal(notInstalled.showFrame, false);

  const installing = resolveComfyBackendView(status('installing', 'torch', 57, null));
  assert.equal(installing.primaryAction, 'none');
  assert.equal(installing.showProgress, true);
  assert.equal(installing.showLog, true);
  assert.equal(installing.percent, 57);
  assert.equal(installing.stageKey, 'comfyPage.backend.stage.torch');

  const installed = resolveComfyBackendView(status('installed', null, 0, null));
  assert.equal(installed.primaryAction, 'start');

  const starting = resolveComfyBackendView(status('starting', null, 0, null));
  assert.equal(starting.primaryAction, 'none');
  assert.equal(starting.showStarting, true);

  const ready = resolveComfyBackendView(status('ready', null, 100, null));
  assert.equal(ready.showFrame, true);
  assert.equal(ready.primaryAction, 'none');
  assert.equal(ready.showProgress, false);

  const failed = resolveComfyBackendView(status('failed', null, 0, 'install-failed'));
  assert.equal(failed.primaryAction, 'retry-install');
  assert.equal(failed.errorKey, 'comfyPage.backend.error.installFailed');
  assert.equal(failed.showFrame, false);
});

test('失败重试按错误码分流，平台不支持不给重试', () => {
  assert.equal(resolveFailedRetry('install-failed'), 'retry-install');
  assert.equal(resolveFailedRetry('start-timeout'), 'retry-start');
  assert.equal(resolveFailedRetry('unsupported-platform'), 'none');
  assert.equal(resolveFailedRetry('something-new'), 'retry-install');
  assert.equal(resolveFailedRetry(null), 'retry-install');
});

test('未知阶段与未知错误码不会伪造文案 key', () => {
  const unknownStage = resolveComfyBackendView(status('installing', 'brand-new-stage', 10, null));
  assert.equal(unknownStage.stageKey, null);

  const unknownError = resolveComfyBackendView(status('failed', null, 0, 'brand-new-error'));
  assert.equal(unknownError.errorKey, 'comfyPage.backend.error.unknown');
});

test('状态集合与体积格式化与宿主 plan.ts 逐值一致', () => {
  assert.deepEqual(COMFY_BACKEND_STATES, plan.COMFY_BACKEND_STATES);
  assert.equal(formatComfyBackendBytes(0), plan.formatBytes(0));
  assert.equal(formatComfyBackendBytes(-1), plan.formatBytes(-1));
  assert.equal(formatComfyBackendBytes(12 * 1024 * 1024), plan.formatBytes(12 * 1024 * 1024));
  assert.equal(formatComfyBackendBytes(1536 * 1024 * 1024), plan.formatBytes(1536 * 1024 * 1024));
  assert.equal(formatComfyBackendBytes(3 * 1024 * 1024 * 1024), plan.formatBytes(3 * 1024 * 1024 * 1024));
});

test('installRoot 原样透出，缺省给空串（界面据此回落）', () => {
  const withRoot = parseComfyBackendStatus({
    state: 'not-installed',
    installRoot: '/Users/me/.omnimux/comfy-backend',
  });
  assert.equal(withRoot.installRoot, '/Users/me/.omnimux/comfy-backend');

  const withoutRoot = parseComfyBackendStatus({ state: 'not-installed' });
  assert.equal(withoutRoot.installRoot, '');

  const wrongType = parseComfyBackendStatus({ state: 'not-installed', installRoot: 42 });
  assert.equal(wrongType.installRoot, '');
});

test('取不到状态是 unavailable，不是 not-installed（不谎报「没装」）', async () => {
  // 真实复现：宿主路由不可用时返回的是 HTML（HTTP 200）→ request 的 json() 抛错，
  // 兜底成 {error:'HTTP 200'}；ok 仍是 true，但里面没有 status。
  stubFetch(() => new Response('<!doctype html><html><body>harness</body></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  }));
  const htmlResult = await fetchComfyBackendState();
  assert.equal(htmlResult.ok, true);
  const fromHtml = htmlResult.ok ? parseComfyBackendStatus(htmlResult.body.status) : null;
  assert.equal(fromHtml, null, 'HTML 响应不得被解析成任何状态');

  const unavailable = resolveComfyBackendPanel(fromHtml);
  assert.equal(unavailable.kind, 'unavailable');
  assert.equal(unavailable.state, 'unavailable');
  assert.equal(unavailable.stateKey, 'comfyPage.backend.stateUnavailable');
  assert.notEqual(unavailable.state, 'not-installed');

  // 传输失败与 HTTP 5xx 同样走 unavailable。
  assert.equal(resolveComfyBackendPanel(null).state, 'unavailable');

  stubFetch(() => jsonResponse({ error: 'boom' }, 500));
  const serverError = await fetchComfyBackendState();
  assert.equal(serverError.ok, false);
  assert.equal(resolveComfyBackendPanel(null).state, 'unavailable');

  // 只有真的拿到 not-installed 才显示「未安装 + 安装后端」。
  const realNotInstalled = resolveComfyBackendPanel(parseComfyBackendStatus({ state: 'not-installed' }));
  assert.equal(realNotInstalled.kind, 'state');
  assert.equal(realNotInstalled.state, 'not-installed');
  assert.equal(realNotInstalled.view.primaryAction, 'install');
});

test('读不到状态回落 M1 探测，而不是死胡同面板（页面能开就开）', () => {
  // 托管地址 + 状态读不到 → 回落探测：后端是独立进程，宿主路由挂了它也可能在跑。
  assert.equal(shouldProbeComfyPage(true, null), true);
  // 托管地址 + 拿到真状态 → 走状态机面板，不探测。
  assert.equal(shouldProbeComfyPage(true, parseComfyBackendStatus({ state: 'not-installed' })), false);
  assert.equal(shouldProbeComfyPage(true, parseComfyBackendStatus({ state: 'ready' })), false);
  // 用户手填地址 → 一直走 M1 探测。
  assert.equal(shouldProbeComfyPage(false, null), true);
  assert.equal(shouldProbeComfyPage(false, parseComfyBackendStatus({ state: 'ready' })), true);

  // 回落路径仍然不把「状态未知」说成「未安装」。
  assert.equal(resolveComfyBackendPanel(null).state, 'unavailable');
  assert.notEqual(resolveComfyBackendPanel(null).state, 'not-installed');
  assert.equal(resolveComfyBackendPanel(null).view, null, '没有状态就不该给出主行动');
});
