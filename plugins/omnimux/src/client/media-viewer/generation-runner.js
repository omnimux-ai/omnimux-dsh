/**
 * 媒体生成提交/续传纯函数（Issue #3011）
 * 被 MediaViewerTab 的首次提交、失败重试、刷新续传共用。
 * 后端契约（/omnimux/api/media/generate）：
 *   - 提交：wait:false + requestKey（不得带 taskId/taskRef）→ { ok, mode:'submitted'|'live', taskRef, url|null, dest }
 *   - 取回：{ kind, model, channel, requestKey, taskRef, wait:true } → { ok, mode:'live', url, dest, taskRef }
 */

import { describeGenerationFailure, INTERRUPTED_REASON } from '../../../../omnimux-viewer/src/media-viewer/generation-failure.js';

const RETRIEVE_MAX_ATTEMPTS = 200;
// 服务端取回本身会阻塞轮询直至终态；仍回 submitted 时退避，避免紧循环打满路由。
const RETRIEVE_BACKOFF_MS = 2000;
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 本页内正在执行的任务：挂载续传据此跳过，避免同一任务重复取回或被误标中断。
const inFlight = new Set();

export function isGenerationInFlight(mediaId) {
  return inFlight.has(mediaId);
}

/**
 * 挂载时续传生成中任务：有 taskRef 走取回；无 taskRef 且不在途则标「任务已中断」。
 * @param {{ store: object, fetchImpl?: Function, sleep?: Function }} deps
 */
export function resumePendingGenerations(deps) {
  const { store } = deps;
  for (const item of store.getSnapshot().mediaList || []) {
    if (item?.status !== 'generating' || inFlight.has(item.id)) continue;
    if (item.taskRef) {
      store.updateMedia(item.id, { resuming: true });
      runGenerationTask(item.id, deps);
    } else {
      store.updateMedia(item.id, {
        status: 'failed',
        resuming: false,
        failure: { reason: INTERRUPTED_REASON, retryable: false },
      });
    }
  }
}

async function postGenerate(body, fetchImpl) {
  // fetch 连接层 reject 直接上抛，由调用方统一映射为网关类失败文案
  const resp = await fetchImpl('/omnimux/api/media/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await resp.json();
  } catch (parseErr) {
    // 响应非 JSON（典型为网关 HTML 错误页）：记日志后按网关失败文案处理
    console.warn('[generation-runner] 响应非 JSON（网关/HTML 类失败）:', parseErr?.message || parseErr);
  }
  return { ok: resp.ok, status: resp.status, json };
}

function resultUrl(data) {
  if (!data) return '';
  return data.url || (data.dest ? `file://${data.dest}` : '');
}

/**
 * 对单个 media 项执行生成：无 taskRef 走提交（wait:false），有 taskRef 直接取回。
 * 全程通过 store.updateMedia 原位更新；失败不写 toast、不改 activeId。
 * @param {string} mediaId
 * @param {{ store: object, fetchImpl?: Function }} deps
 */
export async function runGenerationTask(mediaId, deps = {}) {
  if (inFlight.has(mediaId)) return;
  inFlight.add(mediaId);
  try {
    await runGenerationTaskOnce(mediaId, deps);
  } finally {
    inFlight.delete(mediaId);
  }
}

async function runGenerationTaskOnce(mediaId, { store, fetchImpl = fetch, sleep = defaultSleep } = {}) {
  const lookup = () => (store.getSnapshot().mediaList || []).find((m) => m.id === mediaId);
  let item = lookup();
  if (!item) return;

  const markFailed = (patch, failure) => {
    store.updateMedia(mediaId, {
      ...patch,
      status: 'failed',
      resuming: false,
      failure: failure || { reason: '任务已中断，请重新提交', retryable: false },
    });
  };

  const failureOf = (res) => res?.failure || describeGenerationFailure({
    status: res?.status,
    code: res?.json?.code,
    error: res?.json?.error,
  });

  try {
    if (item.status === 'failed') {
      // 重试路径：用保存的 request 与新 requestKey 重新提交，提交被接受前保持 failed
      const req = item.request;
      if (!req) {
        markFailed({}, { reason: INTERRUPTED_REASON, retryable: false });
        return;
      }
      const retryKey = `${mediaId}:retry-${Date.now()}`;
      const res = await postGenerate({
        ...req,
        requestKey: retryKey,
        wait: false,
      }, fetchImpl);
      if (!res.ok) {
        markFailed({}, failureOf(res));
        return;
      }
      // 提交被接受：回到生成中并写回 taskRef 与本次 requestKey，取回与刷新续传都按新任务走
      store.updateMedia(mediaId, { status: 'generating', resuming: false, failure: null, requestKey: retryKey, taskRef: res.json?.taskRef || null });
      if (res.json?.mode !== 'submitted' && resultUrl(res.json)) {
        store.updateMedia(mediaId, {
          status: 'completed',
          url: resultUrl(res.json),
          timestamp: Date.now(),
          resuming: false,
          failure: null,
          taskRef: res.json?.taskRef || null,
        });
        return;
      }
      item = lookup();
    }

    if (!item.taskRef) {
      // 提交路径：requestKey = 本地任务 id；不得携带 taskId/taskRef
      const taskId = item.requestKey || item.id;
      const res = await postGenerate({ ...item.request, requestKey: taskId, wait: false }, fetchImpl);
      if (!res.ok) {
        markFailed({}, failureOf(res));
        return;
      }
      const data = res.json;
      store.updateMedia(mediaId, { taskRef: data?.taskRef || null });
      if (data?.mode !== 'submitted' && resultUrl(data)) {
        store.updateMedia(mediaId, {
          status: 'completed',
          url: resultUrl(data),
          timestamp: Date.now(),
          resuming: false,
          failure: null,
        });
        return;
      }
      if (!data?.taskRef) {
        // submitted 模式却无 taskRef：无法续传，按任务中断处理
        markFailed({}, { reason: INTERRUPTED_REASON, retryable: false });
        return;
      }
    }

    // 取回循环：wait:true + taskRef，直至 live 完成或失败
    for (let attempt = 0; attempt < RETRIEVE_MAX_ATTEMPTS; attempt += 1) {
      item = lookup();
      if (!item?.taskRef) return;
      const res = await postGenerate({
        kind: item.request?.kind ?? item.type,
        model: item.request?.model,
        channel: item.request?.channel,
        requestKey: item.requestKey || item.id,
        taskRef: item.taskRef,
        wait: true,
      }, fetchImpl);
      if (!res.ok) {
        markFailed({}, failureOf(res));
        return;
      }
      const data = res.json;
      if (data?.mode === 'live' && resultUrl(data)) {
        store.updateMedia(mediaId, {
          status: 'completed',
          url: resultUrl(data),
          timestamp: Date.now(),
          resuming: false,
          failure: null,
          taskRef: data?.taskRef || item.taskRef,
        });
        return;
      }
      if (data?.mode === 'submitted') {
        await sleep(RETRIEVE_BACKOFF_MS);
        continue;
      }
      markFailed({}, describeGenerationFailure({ error: data?.error }));
      return;
    }
    // 取回次数穷尽仍未终态：标失败（可重试），不得永久停在 generating
    markFailed({}, describeGenerationFailure({ status: 504 }));
  } catch (err) {
    // fetch 连接层 reject 或其它异常：映射为失败卡文案（连接失败 → 网关/网络类）
    console.warn('[generation-runner] 生成请求异常:', err?.message || err);
    const current = lookup();
    if (current && current.status !== 'completed') {
      markFailed({}, describeGenerationFailure({ error: err?.message || String(err) }));
    }
  } finally {
    const list = store.getSnapshot().mediaList || [];
    if (!list.some((m) => m.status === 'generating')) {
      store.setGenerating(false);
    }
  }
}
