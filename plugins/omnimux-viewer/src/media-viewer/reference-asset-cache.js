/**
 * 选择素材弹层 · 模块级参考素材缓存（Issue #3012 追加需求）
 *
 * - key 为 Tab，跨弹层开关复用；「只看我的」是前端过滤，缓存只存未过滤原始列表。
 * - stale-while-revalidate：有缓存的 Tab 立刻可读，同时后台静默刷新；
 *   数据未变（按 id 列表比较）不通知订阅者，已有缓存时刷新失败不降级。
 * - 同一 Tab 并发请求去重：复用同一个 in-flight Promise。
 * - 状态按 Tab 记录（status 字段），不存在单一 loading 布尔卡死问题。
 */

const tabStates = new Map();
const listeners = new Set();

function getTabState(tab) {
  let state = tabStates.get(tab);
  if (!state) {
    state = { items: null, status: 'idle', inflight: null };
    tabStates.set(tab, state);
  }
  return state;
}

function notify(tab) {
  for (const fn of listeners) {
    try {
      fn(tab);
    } catch (err) {
      console.warn?.('[reference-asset-cache] listener failed:', err);
    }
  }
}

function sameIdList(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}

/**
 * 同步读取某个 Tab 的缓存快照：{ items, status }
 * status: 'idle' | 'loading' | 'ready' | 'error'
 * 'error' 仅表示「无缓存且请求失败」；有缓存时刷新失败仍保持 'ready'。
 */
export function peekReferenceTab(tab) {
  const state = getTabState(tab);
  return { items: state.items, status: state.status };
}

/** 订阅缓存变化，返回取消订阅函数。回调参数为发生变化的 Tab id。 */
export function subscribeReferenceAssets(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * 确保某个 Tab 的数据已请求：
 * - 已有 in-flight 请求时直接复用（并发去重）；
 * - 有缓存时后台静默刷新（SWR），无缓存时进入 loading；
 * - fetcher 约定：resolve 为素材数组表示成功，resolve 为 null 表示失败。
 */
export function ensureReferenceTab(tab, fetcher) {
  const state = getTabState(tab);
  if (state.inflight) return state.inflight;

  if (state.items === null || state.items === undefined) {
    state.status = 'loading';
  }

  const inflight = Promise.resolve()
    .then(() => fetcher(tab))
    .then((items) => {
      if (items === null || items === undefined) {
        // 失败：无缓存 → error（交给调用方退回离线占位）；有缓存 → 静默保留 ready
        if (state.items === null || state.items === undefined) {
          state.status = 'error';
          notify(tab);
        }
        return;
      }
      const unchanged = state.items !== null && state.items !== undefined && sameIdList(state.items, items);
      const wasReady = state.status === 'ready';
      state.items = items;
      state.status = 'ready';
      if (!unchanged || !wasReady) {
        notify(tab);
      }
      // 刷新且数据未变：不通知，避免触发重渲染
    })
    .catch((err) => {
      console.warn?.('[reference-asset-cache] fetch failed:', tab, err);
      if (state.items === null || state.items === undefined) {
        state.status = 'error';
        notify(tab);
      }
    })
    .finally(() => {
      if (state.inflight === inflight) {
        state.inflight = null;
      }
    });

  state.inflight = inflight;
  return inflight;
}

/** 仅供测试与调试：清空全部 Tab 缓存与订阅。 */
export function resetReferenceAssetCache() {
  tabStates.clear();
  listeners.clear();
}
