/**
 * generation-failure.js 契约测试
 * Issue #3011 / specs/viewer-failed-card-resume-3011.spec.md
 * 失败原因映射四类全部命中 PM 白名单原文：
 *   网关/网络        →「生成服务暂时不可用，请稍后重试」
 *   服务端中文原因    → 原样透传
 *   其它未知         →「生成失败，请稍后重试」
 *   刷新后无法续上    →「任务已中断，请重新提交」（不可重试）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeGenerationFailure,
  INTERRUPTED_REASON,
  GATEWAY_REASON,
  UNKNOWN_REASON,
} from './generation-failure.js';

test('code 命中任务中断 → 「任务已中断，请重新提交」且不可重试', () => {
  for (const code of ['omnimux-task-not-found', 'omnimux-task-interrupted']) {
    const r = describeGenerationFailure({ status: 500, code, error: 'task record missing' });
    assert.equal(r.reason, '任务已中断，请重新提交');
    assert.equal(r.retryable, false);
    assert.equal(r.reason, INTERRUPTED_REASON);
  }
});

test('code 中断优先于中文透传与网关判断', () => {
  const r = describeGenerationFailure({
    status: 500,
    code: 'omnimux-task-interrupted',
    error: '任务记录不存在',
  });
  assert.deepEqual(r, { reason: '任务已中断，请重新提交', retryable: false });
});

test('服务端中文原因（含中文且无 HTML 标签）→ 原样透传，可重试', () => {
  const samples = [
    '未配置图像生成凭证，请在设置中完成绑定',
    '提示词命中内容安全拦截，请修改后重试',
  ];
  for (const error of samples) {
    const r = describeGenerationFailure({ status: 500, error });
    assert.equal(r.reason, error);
    assert.equal(r.retryable, true);
  }
});

test('HTTP 5xx 且 error 为英文 → 「生成服务暂时不可用，请稍后重试」', () => {
  const cases = [
    { status: 500, error: 'Internal Server Error' },
    { status: 502, error: 'Bad Gateway' },
    { status: 503, error: 'Service Unavailable' },
    { status: 500, error: '' },
  ];
  for (const input of cases) {
    const r = describeGenerationFailure(input);
    assert.equal(r.reason, '生成服务暂时不可用，请稍后重试', JSON.stringify(input));
    assert.equal(r.reason, GATEWAY_REASON);
    assert.equal(r.retryable, true);
  }
});

test('error 文本命中网关信号词 → 「生成服务暂时不可用，请稍后重试」', () => {
  const cases = [
    'cloudflare 522 origin connection timed out',
    '502 bad gateway',
    'upstream request timeout',
    'request timed out',
    'ECONNREFUSED 127.0.0.1:443',
    'fetch failed',
    'Failed to fetch',
    'GET request failed (HTTP 502)',
    'GET request failed (HTTP 522)',
  ];
  for (const error of cases) {
    const r = describeGenerationFailure({ error });
    assert.equal(r.reason, '生成服务暂时不可用，请稍后重试', error);
    assert.equal(r.retryable, true);
  }
});

test('error 含 HTML 标签 → 一律视为网关类，含中文也不例外', () => {
  const cases = [
    '<html><body>502 Bad Gateway</body></html>',
    '<!DOCTYPE html><html>error page</html>',
    '<html>服务器开小差了</html>',
    'upstream returned <b>522</b> 请稍后',
  ];
  for (const error of cases) {
    const r = describeGenerationFailure({ status: 502, error });
    assert.equal(r.reason, '生成服务暂时不可用，请稍后重试', error);
    assert.equal(r.retryable, true);
  }
});

test('fetch 连接层 reject（无 status）→ 网关/网络类', () => {
  const r = describeGenerationFailure({ error: 'fetch failed' });
  assert.equal(r.reason, '生成服务暂时不可用，请稍后重试');
  assert.equal(r.retryable, true);
  const r2 = describeGenerationFailure({ error: 'Failed to fetch' });
  assert.equal(r2.reason, GATEWAY_REASON);
});

test('其它未知错误 → 「生成失败，请稍后重试」', () => {
  const cases = [
    { error: 'model refused the request' },
    { status: 400, error: 'invalid aspect ratio' },
    { status: 401, error: 'unauthorized' },
    {},
    { error: '' },
  ];
  for (const input of cases) {
    const r = describeGenerationFailure(input);
    assert.equal(r.reason, '生成失败，请稍后重试', JSON.stringify(input));
    assert.equal(r.reason, UNKNOWN_REASON);
    assert.equal(r.retryable, true);
  }
});
