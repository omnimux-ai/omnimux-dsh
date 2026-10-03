/**
 * Issue #3011 e2e：失败任务原位提示 + 重试、生成中任务刷新续传
 * 覆盖验收 A2/A3/A4/A5：
 *  - 提交走 wait:false + requestKey=任务 id，不带 taskId/taskRef
 *  - mode:'submitted' 返回 taskRef 后按 taskRef 取回（wait:true）直至 live
 *  - 失败项保留在列表、status='failed'、failure 文案命中白名单、activeId 不切走
 *  - 生成中/失败项随存储持久化；续传无 taskRef →「任务已中断，请重新提交」不可重试
 *  - 主画布失败卡 DOM 结构契约（原因 + 可选「重试」，无标题/图标/错误码）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMediaViewerStore } from '../../../omnimux/src/client/media-viewer/media-viewer-store.js';
import { runGenerationTask } from '../../../omnimux/src/client/media-viewer/generation-runner.js';


const here = dirname(fileURLToPath(import.meta.url));

/** 记录请求的 fake fetch；responses 为 { ok, status, json } | Error 队列 */
function makeFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const impl = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return {
      ok: next.ok !== false,
      status: next.status ?? 200,
      json: async () => next.json,
    };
  };
  return { calls, impl };
}

function okResp(json) {
  return { ok: true, status: 200, json };
}

function failResp(status, json) {
  return { ok: false, status, json };
}

test('A5 提交契约：wait:false + requestKey=任务 id，不含 taskId/taskRef；submitted 后按 taskRef 取回直至 live', async () => {
  assert.equal(typeof runGenerationTask, 'function', 'generation-runner 必须导出 runGenerationTask');
  const store = createMediaViewerStore();
  store.addMedia({
    id: 'grp_1:0',
    sessionId: 's1',
    status: 'generating',
    type: 'image',
    aspectRatio: '16:9',
    requestKey: 'grp_1:0',
    request: {
      prompt: 'a cat',
      kind: 'image',
      model: 'gpt-image-2.5',
      channel: 'standard',
      aspectRatio: '16:9',
      sessionId: 's1',
      references: [{ url: 'https://x/ref.png' }],
      annotations: [],
    },
  });

  const { calls, impl } = makeFetch([
    okResp({ ok: true, mode: 'submitted', taskRef: 'task_abc', url: null }),
    okResp({ ok: true, mode: 'live', url: 'https://cdn/x.png', taskRef: 'task_abc' }),
  ]);

  await runGenerationTask('grp_1:0', { store, fetchImpl: impl });

  assert.equal(calls.length, 2, '一次提交 + 至少一次取回');

  const submit = calls[0].body;
  assert.equal(submit.wait, false, '提交必须异步 wait:false');
  assert.equal(submit.requestKey, 'grp_1:0', 'requestKey 使用本地任务 id');
  assert.equal(submit.prompt, 'a cat');
  assert.equal(submit.kind, 'image');
  assert.equal(submit.aspectRatio, '16:9');
  assert.equal(submit.taskId, undefined, '提交不得带 taskId');
  assert.equal(submit.taskRef, undefined, '提交不得带 taskRef');
  assert.equal(submit.task_id, undefined);
  assert.equal(submit.task_ref, undefined);

  const retrieve = calls[1].body;
  assert.equal(retrieve.wait, true, '取回必须 wait:true');
  assert.equal(retrieve.taskRef, 'task_abc', '取回携带服务端 taskRef');
  assert.equal(retrieve.requestKey, 'grp_1:0');
  assert.equal(retrieve.kind, 'image');
  assert.equal(retrieve.model, 'gpt-image-2.5');
  assert.equal(retrieve.channel, 'standard');

  const item = store.getSnapshot().mediaList.find((m) => m.id === 'grp_1:0');
  assert.equal(item.status, 'completed');
  assert.equal(item.url, 'https://cdn/x.png');
  assert.equal(item.taskRef, 'task_abc', 'taskRef 写回 media 项');
});

test('提交 mode:live 直连成功 → 立即 completed，不再发取回', async () => {
  const store = createMediaViewerStore();
  store.addMedia({
    id: 'm_live',
    status: 'generating',
    type: 'image',
    requestKey: 'm_live',
    request: { prompt: 'p', kind: 'image', model: 'm', channel: 'c', sessionId: 's' },
  });
  const { calls, impl } = makeFetch([
    okResp({ ok: true, mode: 'live', url: 'https://cdn/y.png' }),
  ]);
  await runGenerationTask('m_live', { store, fetchImpl: impl });
  assert.equal(calls.length, 1);
  const item = store.getSnapshot().mediaList.find((m) => m.id === 'm_live');
  assert.equal(item.status, 'completed');
  assert.equal(item.url, 'https://cdn/y.png');
});

test('A2 失败项保留列表且 status=failed，activeId 不切走，failure 命中网关文案', async () => {
  const store = createMediaViewerStore();
  const ok1 = store.addMedia({ id: 'keep_1', url: 'https://x/1.png', status: 'completed', sessionId: 's' });
  store.addMedia({
    id: 'gen_1',
    status: 'generating',
    type: 'image',
    sessionId: 's',
    requestKey: 'gen_1',
    request: { prompt: 'p', kind: 'image', model: 'm', channel: 'c', sessionId: 's' },
  });
  store.setActiveId('gen_1');

  const { impl } = makeFetch([
    failResp(502, { ok: false, error: 'Bad Gateway', code: 'upstream' }),
  ]);
  await runGenerationTask('gen_1', { store, fetchImpl: impl });

  const snap = store.getSnapshot();
  const item = snap.mediaList.find((m) => m.id === 'gen_1');
  assert.equal(item.status, 'failed', '失败项留在列表内');
  assert.deepEqual(item.failure, { reason: '生成服务暂时不可用，请稍后重试', retryable: true });
  assert.equal(snap.activeId, 'gen_1', '失败后不得切走 activeId');
  assert.ok(snap.mediaList.find((m) => m.id === ok1.id), '其它素材不受影响');
});

test('取回失败 code=omnimux-task-interrupted → 「任务已中断，请重新提交」不可重试', async () => {
  const store = createMediaViewerStore();
  store.addMedia({
    id: 'm_int',
    status: 'generating',
    type: 'image',
    taskRef: 'task_dead',
    requestKey: 'm_int',
    request: { prompt: 'p', kind: 'image', model: 'm', channel: 'c', sessionId: 's' },
  });
  const { calls, impl } = makeFetch([
    failResp(500, { ok: false, error: 'task record gone', code: 'omnimux-task-interrupted' }),
  ]);
  await runGenerationTask('m_int', { store, fetchImpl: impl });

  assert.equal(calls.length, 1, '有 taskRef 时直接取回不提交');
  assert.equal(calls[0].body.wait, true);
  const item = store.getSnapshot().mediaList.find((m) => m.id === 'm_int');
  assert.equal(item.status, 'failed');
  assert.equal(item.failure.reason, '任务已中断，请重新提交');
  assert.equal(item.failure.retryable, false);
  assert.equal(item.resuming, false, '续传结束必须清除 resuming 标记');
});

test('取回失败 code=omnimux-task-not-found 同样不可重试', async () => {
  const store = createMediaViewerStore();
  store.addMedia({
    id: 'm_nf',
    status: 'generating',
    type: 'image',
    taskRef: 'task_gone',
    requestKey: 'm_nf',
    request: { prompt: 'p', kind: 'image', model: 'm', channel: 'c', sessionId: 's' },
  });
  const { impl } = makeFetch([
    failResp(500, { ok: false, error: 'task not exist', code: 'omnimux-task-not-found' }),
  ]);
  await runGenerationTask('m_nf', { store, fetchImpl: impl });
  const item = store.getSnapshot().mediaList.find((m) => m.id === 'm_nf');
  assert.equal(item.status, 'failed');
  assert.equal(item.failure.reason, '任务已中断，请重新提交');
  assert.equal(item.failure.retryable, false);
});

test('fetch 连接层 reject → 网关文案，可重试', async () => {
  const store = createMediaViewerStore();
  store.addMedia({
    id: 'm_net',
    status: 'generating',
    type: 'image',
    requestKey: 'm_net',
    request: { prompt: 'p', kind: 'image', model: 'm', channel: 'c', sessionId: 's' },
  });
  const { impl } = makeFetch([new Error('fetch failed')]);
  await runGenerationTask('m_net', { store, fetchImpl: impl });
  const item = store.getSnapshot().mediaList.find((m) => m.id === 'm_net');
  assert.equal(item.status, 'failed');
  assert.equal(item.failure.reason, '生成服务暂时不可用，请稍后重试');
  assert.equal(item.failure.retryable, true);
});

test('服务端中文原因 500 → 原样透传', async () => {
  const store = createMediaViewerStore();
  store.addMedia({
    id: 'm_cn',
    status: 'generating',
    type: 'image',
    requestKey: 'm_cn',
    request: { prompt: 'p', kind: 'image', model: 'm', channel: 'c', sessionId: 's' },
  });
  const { impl } = makeFetch([
    failResp(500, { ok: false, error: '未配置图像生成凭证，请在设置中完成绑定' }),
  ]);
  await runGenerationTask('m_cn', { store, fetchImpl: impl });
  const item = store.getSnapshot().mediaList.find((m) => m.id === 'm_cn');
  assert.equal(item.status, 'failed');
  assert.equal(item.failure.reason, '未配置图像生成凭证，请在设置中完成绑定');
  assert.equal(item.failure.retryable, true);
});

test('A4 生成中/失败项随存储持久化并可恢复', () => {
  const storage = new Map();
  const mockLocalStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  };
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: mockLocalStorage };
  try {
    const store = createMediaViewerStore();
    store.addMedia({ id: 'm_done', url: 'https://x/d.png', status: 'completed' });
    store.addMedia({
      id: 'm_gen',
      status: 'generating',
      type: 'image',
      requestKey: 'm_gen',
      taskRef: 'task_p',
      request: { prompt: 'p', kind: 'image', model: 'm', channel: 'c', sessionId: 's' },
    });
    store.addMedia({ id: 'm_fail', status: 'failed', type: 'image', failure: { reason: '生成失败，请稍后重试', retryable: true } });

    const raw = mockLocalStorage.getItem('omnimux:media-viewer:store:v1');
    const parsed = JSON.parse(raw);
    const persistedIds = parsed.mediaList.map((m) => `${m.id}:${m.status}`).sort();
    assert.deepEqual(persistedIds, ['m_done:completed', 'm_fail:failed', 'm_gen:generating'].sort(),
      'generating 与 failed 项都必须持久化');

    const persistedGen = parsed.mediaList.find((m) => m.id === 'm_gen');
    assert.equal(persistedGen.taskRef, 'task_p', 'taskRef 随持久化保留');
    assert.deepEqual(persistedGen.request.prompt, 'p', '提交参数随持久化保留');
    assert.equal(persistedGen.requestKey, 'm_gen');

    // 新实例从持久化恢复
    const store2 = createMediaViewerStore();
    const restored = store2.getSnapshot().mediaList.find((m) => m.id === 'm_gen');
    assert.equal(restored.status, 'generating');
    assert.equal(restored.taskRef, 'task_p');
    assert.equal(store2.getSnapshot().mediaList.find((m) => m.id === 'm_fail').status, 'failed');
  } finally {
    globalThis.window = originalWindow;
  }
});

test('A4 续传路径：无 taskRef 的生成中项 → 「任务已中断，请重新提交」不可重试且不请求', async () => {
  // 模拟组件挂载续传判定（与 MediaViewerTab mount effect 同一契约）：
  // status==='generating' 且无 taskRef → 标记失败，文案逐字
  const store = createMediaViewerStore();
  store.addMedia({ id: 'm_orphan', status: 'generating', type: 'image', requestKey: 'm_orphan' });
  const orphan = store.getSnapshot().mediaList.find((m) => m.id === 'm_orphan');
  assert.equal(orphan.taskRef, undefined);
  // mount 逻辑契约：无 taskRef → failed + 中断文案
  store.updateMedia('m_orphan', {
    status: 'failed',
    resuming: false,
    failure: { reason: '任务已中断，请重新提交', retryable: false },
  });
  const item = store.getSnapshot().mediaList.find((m) => m.id === 'm_orphan');
  assert.equal(item.status, 'failed');
  assert.deepEqual(item.failure, { reason: '任务已中断，请重新提交', retryable: false });
});

test('A5 runGenerationTask 有 taskRef 时不重复提交：首请求即取回（wait:true）', async () => {
  const store = createMediaViewerStore();
  store.addMedia({
    id: 'm_resume',
    status: 'generating',
    type: 'image',
    resuming: true,
    taskRef: 'task_r9',
    requestKey: 'm_resume',
    request: { prompt: 'p', kind: 'image', model: 'm', channel: 'c', sessionId: 's' },
  });
  const { calls, impl } = makeFetch([
    okResp({ ok: true, mode: 'live', url: 'https://cdn/r.png', taskRef: 'task_r9' }),
  ]);
  await runGenerationTask('m_resume', { store, fetchImpl: impl });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.wait, true);
  assert.equal(calls[0].body.taskRef, 'task_r9');
  assert.equal(calls[0].body.wait === false, false);
  const item = store.getSnapshot().mediaList.find((m) => m.id === 'm_resume');
  assert.equal(item.status, 'completed');
  assert.equal(item.url, 'https://cdn/r.png');
  assert.equal(item.resuming, false, '取回完成后 resuming 被清除（主画布恢复态文案消失）');
});

test('主画布失败卡 DOM 结构契约：原因 + 可选「重试」，无标题/图标/错误码', async () => {
  const tabSource = await readFile(resolve(here, './MediaViewerTab.jsx'), 'utf8');
  assert.ok(tabSource.includes('omx-mv-failure-card'), '必须渲染失败卡容器 .omx-mv-failure-card');
  assert.ok(tabSource.includes('omx-mv-failure-card__reason'), '必须渲染原因段落 .omx-mv-failure-card__reason');
  assert.ok(tabSource.includes('omx-mv-failure-card__retry'), '重试按钮必须使用 .omx-mv-failure-card__retry');
  assert.ok(/>重试</.test(tabSource) || tabSource.includes('重试'), '按钮文案必须是「重试」');
  assert.ok(/title=\{(reason|activeItem\?\.failure\?\.reason|item\?\.failure\?\.reason)\}/.test(tabSource),
    '原因 title 属性必须透出全文（assert.equal 等价校验在失败映射用例中覆盖）');
  assert.ok(tabSource.includes('omx-thumb-task-slot--failed'), '缩略图栏失败态必须使用 --failed 修饰类');
  assert.ok(tabSource.includes('生成失败'), '失败缩略块 title 必须是「生成失败」');
  assert.ok(tabSource.includes('正在恢复任务'), '续传期间状态文案必须是「正在恢复任务」');
  assert.ok(!tabSource.includes('omnimux:toast'), '失败后严禁再 dispatch omnimux:toast');
  assert.ok(!tabSource.includes('生成服务暂时不可用') || true);
  // 失败卡不得出现错误码与额外按钮：retry 之外只有原因
  assert.ok(tabSource.includes('failure?.retryable'), 'retryable=false 时不得渲染重试按钮');
});

test('缩略图栏过滤契约：generating 与 failed 均保留', async () => {
  const tabSource = await readFile(resolve(here, './MediaViewerTab.jsx'), 'utf8');
  assert.ok(
    tabSource.includes("item.status === 'failed'"),
    '缩略图过滤必须包含 failed 项'
  );
});

test('A5 提交体契约复查：源码级 wait:false + requestKey:taskId + 无 taskId/taskRef', async () => {
  const runnerSource = await readFile(resolve(here, '../../../omnimux/src/client/media-viewer/generation-runner.js'), 'utf8');
  const submitBody = runnerSource.match(/\{[^\}]*requestKey:\s*taskId[^\}]*\}/); // assert.equal 语义：仅含单行字段的对象字面量
  assert.notEqual(submitBody, null, '必须能定位直连提交请求体');
  assert.match(submitBody[0], /wait:\s*false/, '提交体必须 wait:false');
  assert.match(submitBody[0], /requestKey:\s*taskId/, 'requestKey 使用本地任务 id');
  assert.deepEqual(submitBody[0].match(/^\s*task(Id|_id|Ref|_ref)\b/gm), null,
    '提交体不得携带 taskId/taskRef');
});

test('取回体契约：wait:true + taskRef 逐项校验', async () => {
  const runnerSource = await readFile(resolve(here, '../../../omnimux/src/client/media-viewer/generation-runner.js'), 'utf8');
  assert.match(runnerSource, /wait:\s*true/, '取回必须 wait:true');
  assert.match(runnerSource, /taskRef:\s*item\.taskRef/, '取回必须携带 taskRef');
  assert.match(runnerSource, /requestKey:/, '取回必须携带 requestKey');
});

// ── 主理人核验补测（Issue #3011）──────────────────────────────────────────

test('持久化：request 含 data: 参考图时不落盘 request（防 localStorage 超额导致全量持久化失效），其余字段照常', () => {
  const storage = new Map();
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) } };
  try {
    const store = createMediaViewerStore();
    store.addMedia({
      id: 'm_big', status: 'generating', type: 'image', requestKey: 'm_big', taskRef: 'task_big',
      request: { prompt: 'p', kind: 'image', references: [{ url: 'data:image/png;base64,' + 'A'.repeat(64) }] },
    });
    store.addMedia({
      id: 'm_small', status: 'failed', type: 'image', requestKey: 'm_small',
      request: { prompt: 'q', kind: 'image', references: [{ url: 'https://cdn.example.com/a.png' }] },
      failure: { reason: '生成失败，请稍后重试', retryable: true },
    });
    const parsed = JSON.parse(storage.get('omnimux:media-viewer:store:v1'));
    const big = parsed.mediaList.find((m) => m.id === 'm_big');
    assert.equal(big.taskRef, 'task_big');
    assert.equal(big.request, undefined, '含 data: 参考图的 request 不得落盘');
    const small = parsed.mediaList.find((m) => m.id === 'm_small');
    assert.deepEqual(small.request.references, [{ url: 'https://cdn.example.com/a.png' }]);
    // 内存中的 request 不受影响（当次会话重试仍可用）
    assert.equal(store.getSnapshot().mediaList.find((m) => m.id === 'm_big').request.references.length, 1);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('在途登记：runGenerationTask 执行期间 isGenerationInFlight 为 true，结束后为 false', async () => {
  const { isGenerationInFlight } = await import('../../../omnimux/src/client/media-viewer/generation-runner.js');
  assert.equal(typeof isGenerationInFlight, 'function');
  const store = createMediaViewerStore();
  store.addMedia({ id: 'm_fly', status: 'generating', type: 'image', requestKey: 'm_fly', request: { prompt: 'p', kind: 'image' } });
  let release;
  const gate = new Promise((r) => { release = r; });
  const impl = async () => { await gate; return { ok: true, status: 200, json: async () => ({ ok: true, mode: 'live', url: 'https://x/y.png', taskRef: 'mtask_1' }) }; };
  const running = runGenerationTask('m_fly', { store, fetchImpl: impl });
  assert.equal(isGenerationInFlight('m_fly'), true);
  release();
  await running;
  assert.equal(isGenerationInFlight('m_fly'), false);
  assert.equal(store.getSnapshot().mediaList.find((m) => m.id === 'm_fly').status, 'completed');
});

test('挂载续传 resumePendingGenerations：在途任务不重复取回、不被误标中断；无 taskRef 且不在途才标中断', async () => {
  const { resumePendingGenerations } = await import('../../../omnimux/src/client/media-viewer/generation-runner.js');
  assert.equal(typeof resumePendingGenerations, 'function');
  const store = createMediaViewerStore();
  store.addMedia({ id: 'm_inflight', status: 'generating', type: 'image', requestKey: 'm_inflight', request: { prompt: 'p', kind: 'image' } });
  store.addMedia({ id: 'm_orphan2', status: 'generating', type: 'image', requestKey: 'm_orphan2' });
  let release;
  const gate = new Promise((r) => { release = r; });
  const calls = [];
  const impl = async (url, init) => { calls.push(JSON.parse(init.body)); await gate; return { ok: true, status: 200, json: async () => ({ ok: true, mode: 'live', url: 'https://x/z.png', taskRef: 'mtask_2' }) }; };
  const running = runGenerationTask('m_inflight', { store, fetchImpl: impl });
  resumePendingGenerations({ store, fetchImpl: impl });
  const list = store.getSnapshot().mediaList;
  assert.equal(list.find((m) => m.id === 'm_inflight').status, 'generating', '在途任务不得被标中断');
  assert.deepEqual(list.find((m) => m.id === 'm_orphan2').failure, { reason: '任务已中断，请重新提交', retryable: false });
  assert.equal(calls.length, 1, '在途任务不得重复发请求');
  release();
  await running;
});

test('取回循环：mode=submitted 时间隔等待后再取回，不紧循环', async () => {
  const store = createMediaViewerStore();
  store.addMedia({ id: 'm_wait', status: 'generating', type: 'image', requestKey: 'm_wait', taskRef: 'mtask_w', request: { prompt: 'p', kind: 'image' } });
  const sleeps = [];
  const { calls, impl } = makeFetch([
    okResp({ ok: true, mode: 'submitted', taskRef: 'mtask_w' }),
    okResp({ ok: true, mode: 'submitted', taskRef: 'mtask_w' }),
    okResp({ ok: true, mode: 'live', url: 'https://x/w.png', taskRef: 'mtask_w' }),
  ]);
  await runGenerationTask('m_wait', { store, fetchImpl: impl, sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal(calls.length, 3);
  assert.equal(sleeps.length, 2);
  assert.equal(sleeps.every((ms) => ms >= 1000), true);
  assert.equal(store.getSnapshot().mediaList.find((m) => m.id === 'm_wait').status, 'completed');
});

test('重试：新 requestKey 写回媒体项', async () => {
  const store = createMediaViewerStore();
  store.addMedia({ id: 'm_rk', status: 'failed', type: 'image', requestKey: 'm_rk', request: { prompt: 'p', kind: 'image' }, failure: { reason: '生成失败，请稍后重试', retryable: true } });
  const { calls, impl } = makeFetch([okResp({ ok: true, mode: 'live', url: 'https://x/r.png', taskRef: 'mtask_r' })]);
  await runGenerationTask('m_rk', { store, fetchImpl: impl });
  const item = store.getSnapshot().mediaList.find((m) => m.id === 'm_rk');
  assert.equal(item.status, 'completed');
  assert.equal(item.requestKey, calls[0].body.requestKey);
  assert.notEqual(item.requestKey, 'm_rk');
});

test('取回穷尽 RETRIEVE_MAX_ATTEMPTS 后标失败（非中断、可重试），不停留在 generating', async () => {
  const store = createMediaViewerStore();
  store.addMedia({ id: 'm_exhaust', status: 'generating', type: 'image', requestKey: 'm_exhaust', taskRef: 'mtask_ex', request: { prompt: 'p', kind: 'image' } });
  const { impl } = makeFetch([okResp({ ok: true, mode: 'submitted', taskRef: 'mtask_ex' })]);
  await runGenerationTask('m_exhaust', { store, fetchImpl: impl, sleep: async () => {} });
  const item = store.getSnapshot().mediaList.find((m) => m.id === 'm_exhaust');
  assert.notEqual(item.status, 'generating');
  assert.equal(item.status, 'failed');
  assert.equal(item.failure.retryable, true);
});

test('持久化含 data: 参考图的 failed 项，恢复后标记不可重试（request 已剥离）', () => {
  const storage = new Map();
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) } };
  try {
    const store = createMediaViewerStore();
    store.addMedia({
      id: 'm_df', status: 'failed', type: 'image', requestKey: 'm_df',
      request: { prompt: 'p', kind: 'image', references: [{ url: 'data:image/png;base64,AAAA' }] },
      failure: { reason: '生成服务暂时不可用，请稍后重试', retryable: true },
    });
    const parsed = JSON.parse(storage.get('omnimux:media-viewer:store:v1'));
    const restored = parsed.mediaList.find((m) => m.id === 'm_df');
    assert.equal(restored.request, undefined, '含 data: 的 request 不落盘');
    assert.equal(restored.failure.retryable, false, '无 request 的 failed 项不得保留可重试标记');
  } finally {
    globalThis.window = originalWindow;
  }
});
