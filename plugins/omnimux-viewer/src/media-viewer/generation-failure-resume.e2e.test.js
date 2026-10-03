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
import { runGenerationTask } from './generation-runner.js';


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
  assert.deepEqual(item.failure, { reason: '生成服务暂时不可用，请稍后重试', retryable: true, code: 'upstream' });
  assert.equal(snap.activeId, 'gen_1', '失败后不得切走 activeId');
  assert.ok(snap.mediaList.find((m) => m.id === ok1.id), '其它素材不受影响');
});

test('取回失败 code=omnimux-task-interrupted 未声明上游终态 → 保留原因且只收取原任务', async () => {
  const store = createMediaViewerStore();
  store.addMedia({
    id: 'm_int', status: 'generating', type: 'image', taskRef: 'task_dead', requestKey: 'm_int',
    request: { prompt: 'p', kind: 'image', model: 'm', channel: 'c', sessionId: 's' },
  });
  const { calls, impl } = makeFetch([
    failResp(500, { ok: false, error: 'task record gone', code: 'omnimux-task-interrupted', recoverable: false }),
    okResp({ ok: true, mode: 'live', url: 'https://cdn/interrupted.png', taskRef: 'task_dead' }),
  ]);
  await runGenerationTask('m_int', { store, fetchImpl: impl });
  assert.equal(calls.length, 1, '有 taskRef 时直接取回不提交');
  const item = store.getSnapshot().mediaList.find((m) => m.id === 'm_int');
  assert.equal(item.status, 'failed');
  assert.deepEqual(item.failure, { reason: '任务已中断，请重新提交', retryable: true, code: 'omnimux-task-interrupted' });
  assert.equal(item.taskRef, 'task_dead');
  assert.equal(item.requestKey, 'm_int');
  assert.equal(item.resuming, false, '续传结束必须清除 resuming 标记');
  await runGenerationTask('m_int', { store, fetchImpl: impl });
  assert.deepEqual(calls.map(({ body }) => body), Array(2).fill({
    kind: 'image', model: 'm', channel: 'c', requestKey: 'm_int', taskRef: 'task_dead', wait: true,
  }));
  assert.equal(calls.filter(({ body }) => body.wait === false).length, 0, '禁止新付费提交');
  assert.equal(store.getSnapshot().mediaList.find((m) => m.id === 'm_int').status, 'completed');
});

test('取回失败 code=omnimux-task-not-found 未声明上游终态 → 保留原身份仅收取', async () => {
  const store = createMediaViewerStore();
  store.addMedia({
    id: 'm_nf', status: 'generating', type: 'image', taskRef: 'task_gone', requestKey: 'm_nf',
    request: { prompt: 'p', kind: 'image', model: 'm', channel: 'c', sessionId: 's' },
  });
  const { calls, impl } = makeFetch([
    failResp(500, { ok: false, error: 'task not exist', code: 'omnimux-task-not-found', recoverable: false }),
    okResp({ ok: true, mode: 'live', url: 'https://cdn/not-found.png', taskRef: 'task_gone' }),
  ]);
  await runGenerationTask('m_nf', { store, fetchImpl: impl });
  const item = store.getSnapshot().mediaList.find((m) => m.id === 'm_nf');
  assert.equal(item.status, 'failed');
  assert.deepEqual(item.failure, { reason: '任务已中断，请重新提交', retryable: true, code: 'omnimux-task-not-found' });
  assert.equal(item.taskRef, 'task_gone');
  assert.equal(item.requestKey, 'm_nf');
  await runGenerationTask('m_nf', { store, fetchImpl: impl });
  assert.deepEqual(calls.map(({ body }) => body), Array(2).fill({
    kind: 'image', model: 'm', channel: 'c', requestKey: 'm_nf', taskRef: 'task_gone', wait: true,
  }));
  assert.equal(calls.filter(({ body }) => body.wait === false).length, 0);
  assert.equal(store.getSnapshot().mediaList.find((m) => m.id === 'm_nf').status, 'completed');
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
  const { resumePendingGenerations } = await import('./generation-runner.js');
  const store = createMediaViewerStore();
  store.addMedia({ id: 'm_orphan', status: 'generating', type: 'image', requestKey: 'm_orphan' });
  const orphan = store.getSnapshot().mediaList.find((m) => m.id === 'm_orphan');
  assert.equal(orphan.taskRef, undefined);
  const { calls, impl } = makeFetch([okResp({ mode: 'live', url: 'https://cdn/unexpected.png' })]);
  resumePendingGenerations({ store, fetchImpl: impl });
  const item = store.getSnapshot().mediaList.find((m) => m.id === 'm_orphan');
  assert.equal(item.status, 'failed');
  assert.equal(item.resuming, false);
  assert.deepEqual(item.failure, { reason: '任务已中断，请重新提交', retryable: false });
  assert.equal(calls.length, 0, '真实挂载恢复不得为无 taskRef 项提交新任务');
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
  const failureCard = tabSource.slice(tabSource.indexOf('function FailureCard('), tabSource.indexOf('export function MediaViewerTab('));
  assert.equal(failureCard.startsWith('function FailureCard('), true, '必须定位真实失败卡');
  assert.match(failureCard, /const retryable = canRetryGeneration\(item\);/, '资格必须消费真实恢复策略');
  assert.match(failureCard, /\{retryable \? \([\s\S]*<button[\s\S]*\) : null\}/, '只有有资格时渲染按钮');
  assert.equal((failureCard.match(/<button\b/g) || []).length, 1, '只能存在唯一重试按钮');
  assert.equal((failureCard.match(/<p\b/g) || []).length, 1, '只保留一段原因');
  assert.equal((failureCard.match(/<div\b/g) || []).length, 1, '不得新增包装卡片');
  assert.equal(/<(?:h[1-6]|svg|img|i|a|span)\b/.test(failureCard), false, '无额外标题、图标、链接或错误码节点');
  assert.equal(/failure\?\.code|item\?\.code|错误码|errorCode/.test(failureCard), false, '错误码不得出现在失败卡');
  assert.match(failureCard, /<p[^>]*title=\{reason\}>\{reason\}<\/p>/, '原因正文和全文 title 必须完全一致');
  assert.match(failureCard, />\s*重试\s*<\/button>/, '唯一按钮只能显示重试');
});

test('缩略图栏过滤契约：generating 与 failed 均保留', async () => {
  const tabSource = await readFile(resolve(here, './MediaViewerTab.jsx'), 'utf8');
  assert.ok(
    tabSource.includes("item.status === 'failed'"),
    '缩略图过滤必须包含 failed 项'
  );
});

test('A5 提交体契约复查：源码级 wait:false + requestKey:taskId + 无 taskId/taskRef', async () => {
  const runnerSource = await readFile(resolve(here, './generation-runner.js'), 'utf8');
  const submitBody = runnerSource.match(/\{[^\}]*requestKey:\s*taskId[^\}]*\}/); // assert.equal 语义：仅含单行字段的对象字面量
  assert.notEqual(submitBody, null, '必须能定位直连提交请求体');
  assert.match(submitBody[0], /wait:\s*false/, '提交体必须 wait:false');
  assert.match(submitBody[0], /requestKey:\s*taskId/, 'requestKey 使用本地任务 id');
  assert.deepEqual(submitBody[0].match(/^\s*task(Id|_id|Ref|_ref)\b/gm), null,
    '提交体不得携带 taskId/taskRef');
});

test('取回体契约：wait:true + taskRef 逐项校验', async () => {
  const runnerSource = await readFile(resolve(here, './generation-runner.js'), 'utf8');
  assert.match(runnerSource, /wait:\s*true/, '取回必须 wait:true');
  assert.match(runnerSource, /taskRef:\s*item\.taskRef/, '取回必须携带 taskRef');
  assert.match(runnerSource, /requestKey:/, '取回必须携带 requestKey');
});

// ── 主理人核验补测（Issue #3011）──────────────────────────────────────────

test('持久化：内联参考仅剥字节，保留模型渠道操作及参数；HTTPS 与内存不变', () => {
  const storage = new Map();
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) } };
  try {
    const store = createMediaViewerStore();
    const dataUrl = 'data:image/png;base64,' + 'A'.repeat(1024 * 1024);
    const request = {
      prompt: 'p', kind: 'image', model: 'original-model', channel: 'original-channel', operation: 'edit',
      aspectRatio: '16:9', sessionId: 's', params: { strength: 0.7 },
      references: [
        { url: dataUrl, data: dataUrl, role: 'reference', slot: 'first', mimeType: 'image/png' },
        { url: 'https://cdn.example.com/second.png', role: 'last-frame', slot: 'last' },
      ],
    };
    store.addMedia({ id: 'm_big', status: 'generating', type: 'image', requestKey: 'm_big', taskRef: 'task_big', request });
    const smallRequest = { prompt: 'q', kind: 'image', references: [{ url: 'https://cdn.example.com/a.png' }] };
    store.addMedia({
      id: 'm_small', status: 'failed', type: 'image', requestKey: 'm_small', request: smallRequest,
      failure: { reason: '生成失败，请稍后重试', retryable: true },
    });
    const raw = storage.get('omnimux:media-viewer:store:v1');
    const parsed = JSON.parse(raw);
    const big = parsed.mediaList.find((m) => m.id === 'm_big');
    assert.equal(big.taskRef, 'task_big');
    assert.equal(big.requestKey, 'm_big');
    assert.equal(big.requestReplayable, false, '已剥字节不可发起新提交');
    assert.deepEqual(big.request, {
      ...request,
      references: [
        { role: 'reference', slot: 'first', mimeType: 'image/png' },
        { url: 'https://cdn.example.com/second.png', role: 'last-frame', slot: 'last' },
      ],
    });
    assert.equal(raw.includes('data:'), false, '大载荷不得落盘');
    assert.equal(raw.length < 4096, true, '大载荷不得撑满持久化');
    const small = parsed.mediaList.find((m) => m.id === 'm_small');
    assert.deepEqual(small.request, smallRequest);
    assert.equal(small.requestReplayable, undefined);
    assert.deepEqual(store.getSnapshot().mediaList.find((m) => m.id === 'm_big').request, request, '内存原载荷完全不变');
    const restored = createMediaViewerStore().getSnapshot().mediaList.find((m) => m.id === 'm_big');
    assert.deepEqual(restored.request, big.request, '新实例保留实际路由与操作身份');
    assert.equal(restored.requestReplayable, false);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('在途登记：runGenerationTask 执行期间 isGenerationInFlight 为 true，结束后为 false', async () => {
  const { isGenerationInFlight } = await import('./generation-runner.js');
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
  const { resumePendingGenerations } = await import('./generation-runner.js');
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

test('重试：明确 omnimux-failed + recoverable=false 才产生新 requestKey 并写回', async () => {
  const store = createMediaViewerStore();
  const request = { prompt: 'p', kind: 'image', model: 'original-model', channel: 'original-channel', operation: 'edit' };
  store.addMedia({
    id: 'm_rk', status: 'failed', type: 'image', requestKey: 'm_rk', taskRef: 'old-terminal-ref', recoverable: false,
    request, failure: { reason: '生成失败，请稍后重试', retryable: true, code: 'omnimux-failed' },
  });
  const { calls, impl } = makeFetch([okResp({ ok: true, mode: 'live', url: 'https://x/r.png', taskRef: 'mtask_r' })]);
  await runGenerationTask('m_rk', { store, fetchImpl: impl });
  const item = store.getSnapshot().mediaList.find((m) => m.id === 'm_rk');
  assert.equal(item.status, 'completed');
  assert.equal(calls.length, 1);
  assert.equal(item.requestKey, calls[0].body.requestKey);
  assert.notEqual(item.requestKey, 'm_rk');
  assert.deepEqual(calls[0].body, { ...request, requestKey: item.requestKey, wait: false });
  assert.equal(calls[0].body.taskRef, undefined, '新意图不得重用旧终态句柄');
  assert.equal(item.taskRef, 'mtask_r');
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

test('持久化含内联参考的 failed 项：无原任务句柄不可重交，但路由及原因保留', async () => {
  const { canRetryGeneration } = await import('./generation-runner.js');
  const storage = new Map();
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) } };
  try {
    const store = createMediaViewerStore();
    store.addMedia({
      id: 'm_df', status: 'failed', type: 'image', requestKey: 'm_df',
      request: { prompt: 'p', kind: 'image', model: 'original-model', channel: 'original-channel', operation: 'edit', references: [{ url: 'data:image/png;base64,AAAA', role: 'reference', slot: 'first' }] },
      failure: { reason: '生成服务暂时不可用，请稍后重试', retryable: true, code: 'download-error' },
    });
    const store2 = createMediaViewerStore();
    const restored = store2.getSnapshot().mediaList.find((m) => m.id === 'm_df');
    assert.deepEqual(restored.request, { prompt: 'p', kind: 'image', model: 'original-model', channel: 'original-channel', operation: 'edit', references: [{ role: 'reference', slot: 'first' }] });
    assert.equal(restored.requestReplayable, false);
    assert.deepEqual(restored.failure, { reason: '生成服务暂时不可用，请稍后重试', retryable: false, code: 'download-error' });
    assert.equal(canRetryGeneration(restored), false);
    const { calls, impl } = makeFetch([okResp({ ok: true, mode: 'live', url: 'https://cdn/unexpected.png' })]);
    await runGenerationTask('m_df', { store: store2, fetchImpl: impl });
    assert.equal(calls.length, 0, '不可重放且无 taskRef 必须零请求');
    assert.equal(store2.getSnapshot().mediaList.find((m) => m.id === 'm_df').status, 'failed');
  } finally {
    globalThis.window = originalWindow;
  }
});

// #3054：临时失败与明确终态成对验证，执行生产 runner/store 而非副本逻辑。
test('已有 taskRef 的认证、下载、HTTP500、网络失败：原因与列表保留且重试只收取原任务', async () => {
  const cases = [
    { id: 'auth', response: failResp(401, { code: 'upstream-auth', recoverable: true, error: '上游认证暂时失败，请重试' }), reason: '上游认证暂时失败，请重试', code: 'upstream-auth' },
    { id: 'download', response: failResp(502, { code: 'download-error', recoverable: true, error: '产物下载中断，请重试' }), reason: '产物下载中断，请重试', code: 'download-error' },
    { id: 'http500', response: failResp(500, { code: 'omnimux-failed', error: 'internal error' }), reason: '生成服务暂时不可用，请稍后重试', code: 'omnimux-failed' },
    { id: 'network', response: new Error('fetch failed'), reason: '生成服务暂时不可用，请稍后重试', code: undefined },
  ];
  for (const scenario of cases) {
    const store = createMediaViewerStore();
    const id = `m_temporary_${scenario.id}`;
    store.addMedia({ id: `${id}_keep`, status: 'completed', url: 'https://cdn/keep.png' });
    store.addMedia({ id, status: 'generating', type: 'image', taskRef: 'original-ref', requestKey: 'original-key', request: { prompt: 'p', kind: 'image', model: 'original-model', channel: 'original-channel' } });
    store.setActiveId(id);
    const { calls, impl } = makeFetch([scenario.response, okResp({ ok: true, mode: 'live', url: 'https://cdn/recovered.png', taskRef: 'original-ref' })]);
    await runGenerationTask(id, { store, fetchImpl: impl });
    const snapshot = store.getSnapshot();
    const failed = snapshot.mediaList.find((m) => m.id === id);
    assert.equal(failed.status, 'failed', scenario.id);
    assert.deepEqual(failed.failure, { reason: scenario.reason, retryable: true, code: scenario.code }, scenario.id);
    assert.equal(snapshot.activeId, id);
    assert.equal(snapshot.mediaList.length, 2);
    assert.equal(snapshot.mediaList.find((m) => m.id === `${id}_keep`).url, 'https://cdn/keep.png');
    await runGenerationTask(id, { store, fetchImpl: impl });
    assert.deepEqual(calls.map(({ body }) => body), Array(2).fill({ kind: 'image', model: 'original-model', channel: 'original-channel', taskRef: 'original-ref', requestKey: 'original-key', wait: true }), scenario.id);
    assert.equal(calls.filter(({ body }) => body.wait === false).length, 0, scenario.id);
    const completed = store.getSnapshot().mediaList.find((m) => m.id === id);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.requestKey, 'original-key');
    assert.equal(completed.taskRef, 'original-ref');
    assert.equal(store.getSnapshot().activeId, id);
  }
});

test('无 taskRef 且没有明确终态：HTTP500 或网络异常重试不得换 requestKey', async () => {
  const cases = [failResp(500, { code: 'omnimux-failed', error: 'internal error' }), new Error('fetch failed')];
  for (const [index, response] of cases.entries()) {
    const store = createMediaViewerStore();
    const id = `m_unknown_${index}`;
    const request = { prompt: 'p', kind: 'image', model: 'm', channel: 'c' };
    store.addMedia({ id, status: 'generating', type: 'image', requestKey: 'original-key', request });
    const { calls, impl } = makeFetch([response, okResp({ ok: true, mode: 'live', url: 'https://cdn/same-key.png' })]);
    await runGenerationTask(id, { store, fetchImpl: impl });
    assert.equal(store.getSnapshot().mediaList.find((m) => m.id === id).status, 'failed');
    await runGenerationTask(id, { store, fetchImpl: impl });
    assert.deepEqual(calls.map(({ body }) => body), Array(2).fill({ ...request, requestKey: 'original-key', wait: false }));
    assert.equal(store.getSnapshot().mediaList.find((m) => m.id === id).requestKey, 'original-key');
    assert.equal(store.getSnapshot().mediaList.find((m) => m.id === id).status, 'completed');
  }
});

test('真实收取明确终态后新意图换 key；新提交响应丢失再重试仍沿用已写回的新 key', async () => {
  const store = createMediaViewerStore();
  const request = { prompt: 'p', kind: 'image', model: 'original-model', channel: 'original-channel', operation: 'edit' };
  store.addMedia({ id: 'm_terminal', status: 'generating', type: 'image', requestKey: 'old-key', taskRef: 'old-ref', request });
  const { calls, impl } = makeFetch([
    failResp(500, { code: 'omnimux-failed', recoverable: false, error: '上游已明确生成失败' }),
    failResp(502, { code: 'upstream', error: 'Bad Gateway' }),
    okResp({ ok: true, mode: 'live', url: 'https://cdn/new-intent.png', taskRef: 'new-ref' }),
  ]);
  await runGenerationTask('m_terminal', { store, fetchImpl: impl });
  const terminal = store.getSnapshot().mediaList.find((m) => m.id === 'm_terminal');
  assert.deepEqual(terminal.failure, { reason: '上游已明确生成失败', retryable: true, code: 'omnimux-failed' });
  assert.equal(terminal.recoverable, false);
  assert.equal(terminal.taskRef, 'old-ref');
  await runGenerationTask('m_terminal', { store, fetchImpl: impl });
  const rejected = store.getSnapshot().mediaList.find((m) => m.id === 'm_terminal');
  const newKey = rejected.requestKey;
  assert.notEqual(newKey, 'old-key');
  assert.equal(rejected.status, 'failed');
  assert.equal(rejected.taskRef, null);
  assert.deepEqual(rejected.failure, { reason: '生成服务暂时不可用，请稍后重试', retryable: true, code: 'upstream' });
  await runGenerationTask('m_terminal', { store, fetchImpl: impl });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].body, { kind: 'image', model: 'original-model', channel: 'original-channel', requestKey: 'old-key', taskRef: 'old-ref', wait: true });
  assert.deepEqual(calls.slice(1).map(({ body }) => body), Array(2).fill({ ...request, requestKey: newKey, wait: false }));
  const completed = store.getSnapshot().mediaList.find((m) => m.id === 'm_terminal');
  assert.equal(completed.status, 'completed');
  assert.equal(completed.requestKey, newKey);
  assert.equal(completed.taskRef, 'new-ref');
});

test('刷新恢复真实 resumePendingGenerations：内联字节已剥仍按原路由收取；明确终态禁止重交', async () => {
  const { resumePendingGenerations, canRetryGeneration, isGenerationInFlight } = await import('./generation-runner.js');
  const storage = new Map();
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) } };
  try {
    const store = createMediaViewerStore();
    store.addMedia({
      id: 'm_reload_inline', status: 'generating', type: 'image', requestKey: 'original-key', taskRef: 'original-ref',
      request: { prompt: 'p', kind: 'image', model: 'original-model', channel: 'original-channel', operation: 'edit', references: [{ url: 'data:image/png;base64,AAAA', role: 'reference', slot: 'first' }] },
    });
    const restored = createMediaViewerStore();
    const before = restored.getSnapshot().mediaList.find((m) => m.id === 'm_reload_inline');
    assert.equal(before.requestReplayable, false);
    assert.equal(canRetryGeneration(before), true, '原任务收取不依赖可重放输入');
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { calls, impl } = makeFetch([failResp(502, { code: 'download-error', recoverable: true, error: '产物下载中断，请重试' }), failResp(500, { code: 'omnimux-failed', recoverable: false, error: '上游已明确生成失败' })]);
    restored.setGenerating(true);
    let settled;
    const finished = new Promise((resolve) => { settled = resolve; });
    const unsubscribe = restored.subscribe((snapshot) => {
      if (!snapshot.isGenerating && snapshot.mediaList.find((m) => m.id === 'm_reload_inline')?.status === 'failed') settled();
    });
    try {
      resumePendingGenerations({ store: restored, fetchImpl: async (...args) => { await gate; return impl(...args); } });
      const resuming = restored.getSnapshot().mediaList.find((m) => m.id === 'm_reload_inline');
      assert.equal(resuming.resuming, true);
      assert.equal(isGenerationInFlight('m_reload_inline'), true);
      release();
      await finished;
      await Promise.resolve();
      assert.equal(isGenerationInFlight('m_reload_inline'), false, '真实挂载恢复必须释放在途登记');
      assert.equal(calls.length, 1, '挂载只发出一次原任务收取');
    } finally {
      unsubscribe();
    }
    const temporary = restored.getSnapshot().mediaList.find((m) => m.id === 'm_reload_inline');
    assert.deepEqual(temporary.failure, { reason: '产物下载中断，请重试', retryable: true, code: 'download-error' });
    assert.equal(temporary.requestKey, 'original-key');
    assert.equal(temporary.taskRef, 'original-ref');
    assert.equal(canRetryGeneration(temporary), true);
    const reloadedFailure = createMediaViewerStore().getSnapshot().mediaList.find((m) => m.id === 'm_reload_inline');
    assert.deepEqual(reloadedFailure.failure, temporary.failure, '暂时失败刷新后原因与恢复资格不丢');
    assert.deepEqual(reloadedFailure.request, temporary.request);
    assert.equal(reloadedFailure.requestReplayable, false);
    assert.equal(reloadedFailure.taskRef, 'original-ref');
    assert.equal(reloadedFailure.requestKey, 'original-key');
    assert.equal(canRetryGeneration(reloadedFailure), true);
    await runGenerationTask('m_reload_inline', { store: restored, fetchImpl: impl });
    const terminal = restored.getSnapshot().mediaList.find((m) => m.id === 'm_reload_inline');
    assert.deepEqual(terminal.failure, { reason: '上游已明确生成失败', retryable: false, code: 'omnimux-failed' });
    assert.equal(terminal.recoverable, false);
    assert.equal(canRetryGeneration(terminal), false, '明确终态加不可重放才禁止重交');
    await runGenerationTask('m_reload_inline', { store: restored, fetchImpl: impl });
    assert.deepEqual(calls.map(({ body }) => body), Array(2).fill({ kind: 'image', model: 'original-model', channel: 'original-channel', requestKey: 'original-key', taskRef: 'original-ref', wait: true }));
    assert.equal(calls.filter(({ body }) => body.wait === false).length, 0);
    assert.equal(restored.getSnapshot().mediaList.find((m) => m.id === 'm_reload_inline').status, 'failed');
  } finally {
    globalThis.window = originalWindow;
  }
});

test('失败卡恢复资格：原任务句柄优先；新提交必须有可重放请求与重试资格', async () => {
  const { canRetryGeneration } = await import('./generation-runner.js');
  const item = { taskRef: 'original-ref', requestReplayable: false, failure: { retryable: false, code: 'omnimux-task-not-found' }, recoverable: false };
  assert.equal(canRetryGeneration(item), true);
  assert.equal(canRetryGeneration({ ...item, failure: { retryable: true, code: 'omnimux-failed' } }), false);
  assert.equal(canRetryGeneration({ ...item, recoverable: true, failure: { retryable: false, code: 'omnimux-failed' } }), true);
  assert.equal(canRetryGeneration({ request: { kind: 'image' }, failure: { retryable: true } }), true);
  assert.equal(canRetryGeneration({ request: { kind: 'image' }, requestReplayable: false, failure: { retryable: true } }), false);
  assert.equal(canRetryGeneration({ request: { kind: 'image' }, failure: { retryable: false } }), false);
  assert.equal(canRetryGeneration({ failure: { retryable: true } }), false);
});
