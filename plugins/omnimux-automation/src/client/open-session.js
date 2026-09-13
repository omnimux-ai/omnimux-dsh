/**
 * 安全打开执行会话：会话 id 只来自 run 记录，绝不拼接或猜测。
 *
 * 顺序固定为「先挂回工作区 → 查宿主会话簿 → 缺席则刷新并重试 → 打开」，
 * 避免侧栏看得见、点下去却 unknown session。
 */

/**
 * @typedef {object} EnsureOpenScheduledSessionInput
 * @property {string} id
 * @property {(sessionId: string) => Promise<void>} [adopt]
 * @property {(sessionId: string) => boolean} [listed]
 * @property {() => Promise<void>} [refresh]
 * @property {(sessionId: string) => void} [open]
 */

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000]

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

/**
 * @param {string} id
 * @param {(sessionId: string) => void} [open]
 * @returns {boolean}
 */
function tryOpen(id, open) {
  if (typeof open !== 'function') return false
  try {
    open(id)
    return true
  } catch {
    // 宿主会话簿还没收录时打开会抛错；交给调用方决定是否重试。
    return false
  }
}

/**
 * @param {EnsureOpenScheduledSessionInput} input
 * @returns {Promise<boolean>}
 */
export async function ensureOpenScheduledSession(input) {
  const id = input.id.trim()
  if (id === '') return false
  await input.adopt?.(id).catch(() => undefined)
  const listed = () => input.listed?.(id) === true
  if (!listed() && input.refresh !== undefined) {
    await input.refresh().catch(() => undefined)
  }
  if (tryOpen(id, input.open)) return true
  if (input.refresh === undefined) return false
  for (const wait of RETRY_DELAYS_MS) {
    await delay(wait)
    await input.refresh().catch(() => undefined)
    if (listed() && tryOpen(id, input.open)) return true
  }
  return tryOpen(id, input.open)
}

/**
 * 造一个绑定宿主 ctx 与 runtime 的打开器。
 *
 * @param {import('./contracts.js').ClientContext} ctx
 * @param {{ adoptSession(sessionId: string): Promise<void> }} runtime
 * @returns {(sessionId: string) => void}
 */
export function createScheduledSessionOpener(ctx, runtime) {
  return (sessionId) => {
    void ensureOpenScheduledSession({
      id: sessionId,
      adopt: id => runtime.adoptSession(id),
      listed: (id) => {
        const snap = ctx.sessions?.list?.getSnapshot()
        return snap?.byId?.[id] !== undefined || (snap?.ids ?? []).some(item => item === id)
      },
      ...(ctx.sessions?.refresh === undefined ? {} : { refresh: () => ctx.sessions.refresh() }),
      ...(ctx.sessions === undefined ? {} : { open: (id) => { ctx.sessions.open(id) } }),
    })
  }
}
