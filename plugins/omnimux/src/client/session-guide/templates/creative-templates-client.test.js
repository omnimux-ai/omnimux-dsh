import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  CREATIVE_TEMPLATES_SNAPSHOT_PATH,
  getFeaturedAppsList,
  loadCreativeTemplates,
  resetCreativeTemplates,
} from './creative-templates-client.js';
import { FEATURED_APPS_CARDS } from './featured-apps-data.js';

/* ---------------- 测试工具 ---------------- */

const VALID_VERSION = 'a'.repeat(64);
const VALID_VERSION_B = 'b'.repeat(64);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function templateRecord(id, extra = {}) {
  return { id, title: `模板-${id}`, ...extra };
}

function envelope(items, overrides = {}) {
  return {
    schemaVersion: 1,
    dataVersion: VALID_VERSION,
    items,
    ...overrides,
  };
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      if (body instanceof Error) throw body;
      return body;
    },
  };
}

function okEnvelope(items, overrides) {
  return jsonResponse(envelope(items, overrides));
}

/**
 * 受控 fetch：记录请求 URL 与中止状态，返回由测试手动结算的 deferred。
 */
function controlledFetch() {
  const calls = [];
  const fetchImpl = (url, opts = {}) => {
    const call = { url, opts, deferred: deferred(), abortCount: 0 };
    if (opts.signal && typeof opts.signal.addEventListener === 'function') {
      opts.signal.addEventListener('abort', () => {
        call.abortCount += 1;
      });
    }
    calls.push(call);
    return call.deferred.promise;
  };
  return { calls, fetchImpl };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function assertAbortError(err) {
  assert.equal(err && err.name, 'AbortError');
}

async function rejectInfo(promise) {
  try {
    await promise;
  } catch (err) {
    return { ok: false, err };
  }
  return { ok: true };
}

test.beforeEach(() => {
  resetCreativeTemplates();
});
test.after(() => {
  resetCreativeTemplates();
});

/* ---------------- 首次请求 / 合同 ---------------- */

test('首次请求：同域相对路径、featured-first 合并、记录规范化、数组只读', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const promise = loadCreativeTemplates({ fetchImpl });
  assert.equal(calls.length, 1, '应只发一次请求');
  assert.equal(calls[0].url, CREATIVE_TEMPLATES_SNAPSHOT_PATH);
  assert.equal(calls[0].url, '/omnimux/templates/creative');

  const items = [
    templateRecord('tpl-1'),
    templateRecord('tpl-2', { type: 'app', customField: { nested: 1 } }),
  ];
  calls[0].deferred.resolve(okEnvelope(items));

  const list = await promise;
  assert.ok(Object.isFrozen(list), '返回数组必须为只读');
  assert.equal(list.length, FEATURED_APPS_CARDS.length + 2);

  // featured-first：featured 应用在最前且携带 app 语义
  const featured = getFeaturedAppsList();
  assert.equal(featured.length, FEATURED_APPS_CARDS.length);
  for (let i = 0; i < featured.length; i += 1) {
    assert.equal(list[i].isApp, true);
    assert.equal(list[i].type, 'app');
    assert.equal(list[i].id, FEATURED_APPS_CARDS[i].appId);
    assert.equal(list[i].title, FEATURED_APPS_CARDS[i].titleZh);
    assert.equal(list[i].categorySlug, FEATURED_APPS_CARDS[i].categoryKey);
  }

  // 快照记录规范化：未知业务字段原样保留，type 缺省回退 'template'
  const tpl1 = list[FEATURED_APPS_CARDS.length];
  assert.equal(tpl1.id, 'tpl-1');
  assert.equal(tpl1.isApp, false);
  assert.equal(tpl1.type, 'template');
  const tpl2 = list[FEATURED_APPS_CARDS.length + 1];
  assert.equal(tpl2.type, 'app', '原始 type 保留，不覆盖');
  assert.equal(tpl2.isApp, false);
  assert.deepEqual(tpl2.customField, { nested: 1 }, '未知业务字段原样保留');
});

test('成功缓存：第二次调用命中缓存，不再发请求', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const first = loadCreativeTemplates({ fetchImpl });
  calls[0].deferred.resolve(okEnvelope([templateRecord('a')]));
  const list1 = await first;

  const list2 = await loadCreativeTemplates({ fetchImpl });
  assert.equal(calls.length, 1, '缓存命中不得再发请求');
  assert.equal(list2, list1, '应返回同一冻结数组引用');
});

/* ---------------- 并发共享 / 显式重试 ---------------- */

test('并发调用共享同一个 in-flight 请求', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const p1 = loadCreativeTemplates({ fetchImpl });
  const p2 = loadCreativeTemplates({ fetchImpl });
  const p3 = loadCreativeTemplates({ fetchImpl });
  assert.equal(calls.length, 1, '并发调用必须共享底层请求');

  calls[0].deferred.resolve(okEnvelope([templateRecord('x')]));
  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  assert.equal(r1, r2);
  assert.equal(r2, r3);
  assert.equal(r1.length, FEATURED_APPS_CARDS.length + 1);
});

test('失败不缓存：显式再次调用发起新请求并可成功', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const p1 = loadCreativeTemplates({ fetchImpl });
  calls[0].deferred.reject(new Error('network down'));
  await assert.rejects(p1, /network down/);

  const p2 = loadCreativeTemplates({ fetchImpl });
  assert.equal(calls.length, 2, '失败后显式调用必须允许重试');
  calls[1].deferred.resolve(okEnvelope([templateRecord('retry-ok')]));
  const list = await p2;
  assert.equal(list[FEATURED_APPS_CARDS.length].id, 'retry-ok');
});

/* ---------------- 取消语义 ---------------- */

test('单调用者取消：仅自身 AbortError，不取消其他调用者与底层请求', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const c1 = new AbortController();
  const p1 = loadCreativeTemplates({ signal: c1.signal, fetchImpl });
  const p2 = loadCreativeTemplates({ fetchImpl });
  assert.equal(calls.length, 1);

  c1.abort();
  const r1 = await rejectInfo(p1);
  assert.equal(r1.ok, false);
  assertAbortError(r1.err);
  assert.equal(calls[0].opts.signal.aborted, false, '底层请求不得被中止');

  calls[0].deferred.resolve(okEnvelope([templateRecord('shared')]));
  const list = await p2;
  assert.equal(list[FEATURED_APPS_CARDS.length].id, 'shared');
  // 底层请求最终成功：成功结果仍可写缓存（旧调用者已取消但请求未中止）
  const cached = await loadCreativeTemplates({ fetchImpl });
  assert.equal(calls.length, 1, '共享请求成功后应写入缓存');
  assert.equal(cached[FEATURED_APPS_CARDS.length].id, 'shared');
});

test('预取消 signal：立即 AbortError 且不发请求', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const controller = new AbortController();
  controller.abort();
  const r = await rejectInfo(loadCreativeTemplates({ signal: controller.signal, fetchImpl }));
  await flush();
  assert.equal(r.ok, false);
  assertAbortError(r.err);
  assert.equal(calls.length, 0, '预取消不得发出请求');
});

test('预取消不占用后续成功缓存调用', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const p1 = loadCreativeTemplates({ fetchImpl });
  calls[0].deferred.resolve(okEnvelope([]));
  await p1;

  const controller = new AbortController();
  controller.abort();
  const r = await rejectInfo(loadCreativeTemplates({ signal: controller.signal, fetchImpl }));
  assert.equal(r.ok, false);
  assertAbortError(r.err);
  assert.equal(calls.length, 1, '命中缓存的预取消调用不得发请求');
});

test('全部调用者取消：中止底层请求且不再接纳新调用者', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const c1 = new AbortController();
  const c2 = new AbortController();
  const p1 = loadCreativeTemplates({ signal: c1.signal, fetchImpl });
  const p2 = loadCreativeTemplates({ signal: c2.signal, fetchImpl });
  assert.equal(calls.length, 1);

  c1.abort();
  const r1 = await rejectInfo(p1);
  assertAbortError(r1.err);
  assert.equal(calls[0].opts.signal.aborted, false, '还有调用者时不中止');

  c2.abort();
  const r2 = await rejectInfo(p2);
  assertAbortError(r2.err);
  assert.equal(calls[0].opts.signal.aborted, true, '全部取消后必须中止底层请求');
});

test('代次交错：取消后重入是新请求，旧响应/失败/finally 不污染新代次', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const c1 = new AbortController();
  const p1 = loadCreativeTemplates({ signal: c1.signal, fetchImpl });
  c1.abort();
  const r1 = await rejectInfo(p1);
  assertAbortError(r1.err);
  assert.equal(calls[0].opts.signal.aborted, true);

  // 立即重入属于新代次
  const p2 = loadCreativeTemplates({ fetchImpl });
  assert.equal(calls.length, 2, '重入必须发起新请求');

  // 旧代次迟到的成功响应不得写回缓存或影响新调用者
  calls[0].deferred.resolve(okEnvelope([templateRecord('stale')], { dataVersion: VALID_VERSION_B }));
  await flush();
  calls[1].deferred.resolve(okEnvelope([templateRecord('fresh')], { dataVersion: VALID_VERSION_B }));

  const list = await p2;
  assert.equal(list[FEATURED_APPS_CARDS.length].id, 'fresh');

  // 旧请求的迟到失败也不污染新代次缓存
  const cached = await loadCreativeTemplates({ fetchImpl });
  assert.equal(calls.length, 2, '新代次成功后应命中缓存');
  assert.equal(cached[FEATURED_APPS_CARDS.length].id, 'fresh');
});

test('旧代次迟到失败不变成新调用者的错误', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const c1 = new AbortController();
  const p1 = loadCreativeTemplates({ signal: c1.signal, fetchImpl });
  c1.abort();
  const r1 = await rejectInfo(p1);
  assertAbortError(r1.err);

  const p2 = loadCreativeTemplates({ fetchImpl });
  assert.equal(calls.length, 2);
  calls[0].deferred.reject(new Error('late failure'));
  await flush();
  calls[1].deferred.resolve(okEnvelope([templateRecord('ok2')]));
  const list = await p2;
  assert.equal(list[FEATURED_APPS_CARDS.length].id, 'ok2');
});

/* ---------------- 卸载 / 重置 ---------------- */

test('卸载：中止 in-flight、清空缓存、旧响应不写回', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const p1 = loadCreativeTemplates({ fetchImpl });
  assert.equal(calls.length, 1);
  void p1; // 卸载后旧调用者 Promise 无人消费，保持 pending 不产生未处理拒绝

  resetCreativeTemplates();
  assert.equal(calls[0].opts.signal.aborted, true, '卸载必须中止底层请求');

  // 卸载后迟到的旧响应不得写回缓存
  calls[0].deferred.resolve(okEnvelope([templateRecord('stale-after-unload')]));
  await flush();

  const p2 = loadCreativeTemplates({ fetchImpl });
  assert.equal(calls.length, 2, '重置后不得复用旧缓存或旧请求');
  calls[1].deferred.resolve(okEnvelope([templateRecord('after-reset')]));
  const list = await p2;
  assert.equal(list[FEATURED_APPS_CARDS.length].id, 'after-reset');
});

test('卸载清空已建立的成功缓存', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const p1 = loadCreativeTemplates({ fetchImpl });
  calls[0].deferred.resolve(okEnvelope([templateRecord('cached')]));
  await p1;

  resetCreativeTemplates();

  const p2 = loadCreativeTemplates({ fetchImpl });
  assert.equal(calls.length, 2, '卸载后必须重新请求');
  calls[1].deferred.resolve(okEnvelope([templateRecord('new-cache')]));
  const list = await p2;
  assert.equal(list[FEATURED_APPS_CARDS.length].id, 'new-cache');
});

test('取消只呈现 AbortError，不产生业务错误状态', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const c1 = new AbortController();
  const p1 = loadCreativeTemplates({ signal: c1.signal, fetchImpl });
  c1.abort();
  const r = await rejectInfo(p1);
  assert.equal(r.ok, false);
  assert.equal(r.err.name, 'AbortError');
  // DOMException 自带标准 ABORT_ERR=20；不得携带服务端业务错误码字符串
  assert.ok(r.err.code === undefined || r.err.code === 20, 'AbortError 不得携带业务错误码');
  assert.ok(!/HTTP|snapshot|失败|unavailable/i.test(String(r.err.message)));
});

/* ---------------- 失败路径（不缓存） ---------------- */

test('非 2xx：显式拒绝、携带服务端错误码、不缓存', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const p1 = loadCreativeTemplates({ fetchImpl });
  calls[0].deferred.resolve(jsonResponse({ error: 'templates-unavailable' }, { ok: false, status: 503 }));
  const r1 = await rejectInfo(p1);
  assert.equal(r1.ok, false);
  assert.equal(r1.err.code, 'templates-unavailable');

  const p2 = loadCreativeTemplates({ fetchImpl });
  assert.equal(calls.length, 2, '失败不得进入缓存');
  calls[1].deferred.resolve(okEnvelope([]));
  await p2;
});

test('非 2xx 且 body 非 JSON：仍显式拒绝', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const p1 = loadCreativeTemplates({ fetchImpl });
  calls[0].deferred.resolve(jsonResponse(new Error('not json'), { ok: false, status: 500 }));
  const r = await rejectInfo(p1);
  assert.equal(r.ok, false);
  assert.match(String(r.err.message), /HTTP 500/);
});

test('200 但 body 非合法 JSON：拒绝且不缓存', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const p1 = loadCreativeTemplates({ fetchImpl });
  calls[0].deferred.resolve(jsonResponse(new SyntaxError('bad json')));
  const r = await rejectInfo(p1);
  assert.equal(r.ok, false);
  const p2 = loadCreativeTemplates({ fetchImpl });
  assert.equal(calls.length, 2);
  calls[1].deferred.resolve(okEnvelope([]));
  await p2;
});

test('schema 校验：缺字段 / 坏 dataVersion / items 非数组 / 记录非对象 均拒绝且不缓存', async () => {
  const cases = [
    jsonResponse({ dataVersion: VALID_VERSION, items: [] }), // 缺 schemaVersion
    jsonResponse(envelope([], { dataVersion: 'ABC123' })), // 非 64 位 hex
    jsonResponse(envelope([], { dataVersion: 'A'.repeat(64) })), // 非小写
    jsonResponse({ schemaVersion: 1, dataVersion: VALID_VERSION, items: 'nope' }),
    jsonResponse({ schemaVersion: 1, dataVersion: VALID_VERSION, items: [null] }),
    jsonResponse({ schemaVersion: 1, dataVersion: VALID_VERSION, items: [[1, 2]] }),
    jsonResponse({ schemaVersion: 1, dataVersion: VALID_VERSION, items: [42] }),
    jsonResponse('just-a-string'),
    jsonResponse(null),
  ];
  for (const bad of cases) {
    resetCreativeTemplates();
    const { calls, fetchImpl } = controlledFetch();
    const p = loadCreativeTemplates({ fetchImpl });
    calls[0].deferred.resolve(bad);
    const r = await rejectInfo(p);
    assert.equal(r.ok, false, `应拒绝非法快照: ${JSON.stringify(bad)}`);
    assert.equal(r.err.name, 'Error');
    // 失败不缓存：下一次调用必须重新请求
    const p2 = loadCreativeTemplates({ fetchImpl });
    assert.equal(calls.length, 2, 'schema 失败不得缓存');
    calls[1].deferred.resolve(okEnvelope([]));
    await p2;
  }
});

test('未知 schemaVersion 显式拒绝，不静默转换', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const p = loadCreativeTemplates({ fetchImpl });
  calls[0].deferred.resolve(jsonResponse(envelope([], { schemaVersion: 2 })));
  const r = await rejectInfo(p);
  assert.equal(r.ok, false);
  assert.equal(r.err.code, 'templates-unsupported-schema');
  assert.match(String(r.err.message), /schemaVersion 2/);
});

test('空 items 合法：200 + items: [] 返回仅 featured 列表', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const p = loadCreativeTemplates({ fetchImpl });
  calls[0].deferred.resolve(okEnvelope([]));
  const list = await p;
  assert.equal(list.length, FEATURED_APPS_CARDS.length);
  assert.ok(list.every((item) => item.isApp === true));
});

/* ---------------- 补充合同 ---------------- */

test('getFeaturedAppsList 不发请求即可返回 featured 列表', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const list = getFeaturedAppsList();
  assert.equal(list.length, FEATURED_APPS_CARDS.length);
  assert.ok(Object.isFrozen(list));
  assert.equal(list[0].id, FEATURED_APPS_CARDS[0].appId);
  assert.equal(list[0].isApp, true);
  assert.equal(list[0].manifest, FEATURED_APPS_CARDS[0].manifest || null);
  // 不影响后续正常请求
  const p = loadCreativeTemplates({ fetchImpl });
  assert.equal(calls.length, 1);
  calls[0].deferred.resolve(okEnvelope([]));
  await p;
});

test('重复与顺序不变：items 原顺序与重复记录保留在 featured 之后', async () => {
  const { calls, fetchImpl } = controlledFetch();
  const items = [
    templateRecord('dup', { n: 1 }),
    templateRecord('other'),
    templateRecord('dup', { n: 2 }),
  ];
  const p = loadCreativeTemplates({ fetchImpl });
  calls[0].deferred.resolve(okEnvelope(items));
  const list = await p;
  const tail = list.slice(FEATURED_APPS_CARDS.length);
  assert.deepEqual(tail.map((t) => [t.id, t.n]), [
    ['dup', 1],
    ['other', undefined],
    ['dup', 2],
  ]);
});
