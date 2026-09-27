/**
 * @file creative-templates-client.js
 * 浏览器侧创意模板快照适配器（specs/hub-microkernelization.spec.md §3.3/§3.4）。
 *
 * 职责：按需向 Host 请求一次 `GET /omnimux/templates/creative` 快照，
 * 校验协议信封，按既有规则规范化并 featured-first 合并，向消费者返回
 * 合并后的只读数组。
 *
 * 生命周期合同（§3.4）：
 * - 单实例最多一个成功缓存、最多共享一个进行中请求；不引入 LRU、
 *   多版本缓存或自动重试队列。
 * - 并发调用共享同一底层请求；单个调用者取消只使自己的 Promise 以
 *   AbortError 拒绝，不取消其他调用者，也不呈现为业务错误。
 * - 所有调用者取消或插件卸载（resetCreativeTemplates）时中止底层请求，
 *   该请求不再接纳新调用者；立即重入属于新请求代次，旧请求的任何
 *   完成/失败/finally 都不得污染新代次的缓存与进行中状态。
 * - 网络、HTTP、JSON、schema 失败均拒绝 Promise 且不清缓存语义外的
 *   状态——失败不缓存，下一次显式调用允许重试。
 *
 * 本模块只含数据逻辑，不含 React/DOM；featured 数据源为纯数据模块，
 * 可安全进入浏览器包（不得引入 src/templates/data.js —— 它依赖 node:fs）。
 */

import { FEATURED_APPS_LIST } from '../../../templates/featured-apps-data.js';

/** Host 快照端点（协议标识，同域相对路径）。 */
export const CREATIVE_TEMPLATES_SNAPSHOT_PATH = '/omnimux/templates/creative';

/** 当前唯一接受的快照协议版本；未知版本显式拒绝，不静默转换。 */
const SNAPSHOT_SCHEMA_VERSION = 1;

/** dataVersion 合同：64 位小写十六进制 SHA-256 摘要。 */
const DATA_VERSION_PATTERN = /^[0-9a-f]{64}$/;

/* FEATURED_APPS_LIST 单一真源：src/templates/featured-apps-data.js（纯数据模块，无 Node 依赖）。 */

/**
 * 返回 featured-first 列表中常驻的 featured 应用列表。
 * 供只展示 featured apps 的路径使用，不触发任何网络请求。
 * @returns {ReadonlyArray<Record<string, unknown>>}
 */
export function getFeaturedAppsList() {
  return FEATURED_APPS_LIST;
}

/** 构造与 DOMException('...', 'AbortError') 等价语义的取消错误。 */
function createAbortError() {
  if (typeof DOMException === 'function') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

function isAbortError(err) {
  return Boolean(err) && (err.name === 'AbortError' || err.code === 20);
}

function isSignalAborted(signal) {
  return Boolean(signal) && signal.aborted === true;
}

function snapshotError(message, code) {
  const err = new Error(message);
  if (code) err.code = code;
  return err;
}

/**
 * §3.4 schema 校验：schemaVersion 精确匹配、dataVersion 为 64 位小写
 * hex、items 为数组且每条记录为非 null 对象；未知业务字段原样保留。
 * 校验失败一律显式拒绝，不静默转换。
 */
function assertSnapshotEnvelope(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw snapshotError('creative templates snapshot: invalid envelope');
  }
  if (body.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw snapshotError(
      `creative templates snapshot: unsupported schemaVersion ${String(body.schemaVersion)}`,
      'templates-unsupported-schema'
    );
  }
  if (typeof body.dataVersion !== 'string' || !DATA_VERSION_PATTERN.test(body.dataVersion)) {
    throw snapshotError('creative templates snapshot: invalid dataVersion');
  }
  if (!Array.isArray(body.items)) {
    throw snapshotError('creative templates snapshot: items must be an array');
  }
  for (const record of body.items) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw snapshotError('creative templates snapshot: item record must be an object');
    }
  }
  return body;
}

/**
 * 与 Host 一致的消费列表构造：原始记录逐条规范化
 * （{ ...tpl, isApp: false, type: tpl.type || 'template' }），
 * 再按 featured-first 合并；不改顺序、不去重。
 */
function buildMergedList(items) {
  const normalized = items.map((tpl) => ({
    ...tpl,
    isApp: false,
    type: tpl.type || 'template',
  }));
  return Object.freeze([...FEATURED_APPS_LIST, ...normalized]);
}

/* ------------------------------------------------------------------ */
/* 单实例适配器状态（一次成功缓存 + 一个共享 in-flight + 代次计数）        */
/* ------------------------------------------------------------------ */

let generation = 0;
/** @type {ReadonlyArray<Record<string, unknown>> | null} */
let cachedList = null;
/**
 * @type {null | {
 *   gen: number,
 *   controller: AbortController,
 *   promise: Promise<ReadonlyArray<Record<string, unknown>>>,
 *   waiters: Set<() => void>,
 *   closed: boolean,
 * }}
 */
let inFlight = null;

function resolveFetch(fetchImpl) {
  const fetchFn = fetchImpl ||
    (typeof window !== 'undefined' ? window.fetch : globalThis.fetch);
  if (typeof fetchFn !== 'function') {
    throw snapshotError('creative templates snapshot: fetch is unavailable');
  }
  return fetchFn;
}

function startFlight(fetchImpl) {
  const controller = new AbortController();
  const flight = {
    gen: generation,
    controller,
    promise: null,
    waiters: new Set(),
    closed: false,
  };
  flight.promise = (async () => {
    const fetchFn = resolveFetch(fetchImpl);
    const response = await fetchFn(CREATIVE_TEMPLATES_SNAPSHOT_PATH, {
      signal: controller.signal,
    });
    if (!response || response.ok !== true) {
      const status = Number(response?.status) || 0;
      let code;
      try {
        const body = await response.json();
        if (body && typeof body.error === 'string') code = body.error;
      } catch {
        /* 失败响应不要求 JSON body */
      }
      throw snapshotError(
        `creative templates snapshot: HTTP ${status || 'error'}`,
        code
      );
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw snapshotError('creative templates snapshot: invalid JSON body');
    }
    const envelope = assertSnapshotEnvelope(body);
    const merged = buildMergedList(envelope.items);
    // 卸载/代次切换后到达的旧响应不得写回缓存。
    if (!flight.closed && flight.gen === generation && inFlight === flight) {
      cachedList = merged;
    }
    return merged;
  })();
  flight.promise.finally(() => {
    // 仅清理属于自己的进行中状态；新代次的 flight 不受影响。
    if (inFlight === flight) inFlight = null;
  }).catch(() => {});
  return flight;
}

/**
 * 关闭当前 in-flight：中止底层请求、代次隔离、不再接纳新调用者。
 * 已绑定的调用者 Promise 由各自 signal 路径结算，本函数不负责拒绝它们。
 */
function closeFlight(flight) {
  if (!flight || flight.closed) return;
  flight.closed = true;
  flight.gen = -1;
  if (inFlight === flight) inFlight = null;
  try {
    flight.controller.abort();
  } catch {
    /* AbortController 不可用时中止为尽力而为 */
  }
}

/**
 * 将一个调用者绑定到共享请求。返回该调用者的 Promise；
 * 调用者 signal 取消时仅自身以 AbortError 结算，
 * 当最后一个调用者离开时中止底层请求。
 */
function joinFlight(flight, signal) {
  return new Promise((resolve, reject) => {
    const caller = { settled: false };
    const removeListener = () => {
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', onAbort);
      }
    };
    const settle = (fn, value) => {
      if (caller.settled) return;
      caller.settled = true;
      removeListener();
      flight.waiters.delete(caller);
      // 最后一个调用者离开：底层请求中止且不再接纳新调用者。
      if (flight.waiters.size === 0) closeFlight(flight);
      fn(value);
    };
    const onAbort = () => settle(reject, createAbortError());

    flight.waiters.add(caller);
    if (signal && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', onAbort, { once: true });
    }
    flight.promise.then(
      (list) => settle(resolve, list),
      (err) => settle(reject, err)
    );
  });
}

/**
 * 加载合并后的创意模板列表（featured 应用在前 + 快照模板在后）。
 *
 * @param {{ signal?: AbortSignal, fetchImpl?: typeof fetch }} [options]
 *   signal：调用者取消信号，只影响本调用者；
 *   fetchImpl：测试注入用 fetch，缺省取 window.fetch / globalThis.fetch。
 * @returns {Promise<ReadonlyArray<Record<string, unknown>>>}
 */
export function loadCreativeTemplates(options = {}) {
  const { signal, fetchImpl } = options;

  // 预取消：立即以 AbortError 拒绝，不发请求也不占用缓存。
  if (isSignalAborted(signal)) {
    return Promise.reject(createAbortError());
  }
  // 命中成功缓存：本次调用直接复用，不发请求。
  if (cachedList) {
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (signal && typeof signal.removeEventListener === 'function') {
          signal.removeEventListener('abort', onAbort);
        }
        reject(createAbortError());
      };
      if (signal && typeof signal.addEventListener === 'function') {
        signal.addEventListener('abort', onAbort, { once: true });
      }
      resolve(cachedList);
    });
  }
  // 并发共享：已有进行中请求时直接加入该代次（首个调用者的 fetchImpl 生效）。
  if (!inFlight) {
    inFlight = startFlight(fetchImpl);
  }
  return joinFlight(inFlight, signal);
}

/**
 * 重置适配器：清空成功缓存、中止当前 in-flight（不再接纳新调用者）、
 * 代次 +1。供插件卸载钩子和测试使用；重置后仍可正常发起新请求。
 */
export function resetCreativeTemplates() {
  generation += 1;
  cachedList = null;
  if (inFlight) closeFlight(inFlight);
}
