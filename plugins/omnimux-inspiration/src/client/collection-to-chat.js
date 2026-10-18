/**
 * Collection → current session prefill.
 *
 * A local collection card can hand its whole membership to the conversation the
 * user is already in. The module owns exactly one side effect: it writes a
 * sourced prompt through the official prefill seam and lets the user finish the
 * question. It never sends, never starts a session, never closes the library
 * tab, and never writes collection data.
 *
 * Four red lines (same family as `rival-add-to-chat.js`):
 *
 * 1. Nothing is sent — no `setDraft`/send call exists here; the seam writes the
 *    draft and the user submits it.
 * 2. The collection is read-only — the local list endpoint is the only read and
 *    no collection mutation route is imported.
 * 3. Failure is explicit — every abort returns an `errorKey` the view turns into
 *    a toast; the user's existing draft is never silently overwritten.
 * 4. One operation at a time — a module-level lock refuses concurrent adds.
 */

import { listLocalInspirations } from './api.js'
import { queueSessionPrefill } from './session-prefill.js'
import { collectionEn, collectionZh } from './collection-locales.js'

/** Members requested in one read; the prompt always reports the true total. */
const MEMBER_PAGE_SIZE = 100

/** Module-level inflight lock: a second add while the first runs is refused. */
let addInflight = null

export function isCollectionAddBusy() {
  return addInflight !== null
}

/** Test-only: drop the inflight handle so cases start from idle. */
export function resetCollectionAddLock() {
  addInflight = null
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T | { ok: false, errorKey: string, code: 'busy' }>}
 */
export function runExclusive(fn) {
  if (addInflight) return Promise.resolve({ ok: false, errorKey: 'collection.sessionBusy', code: 'busy' })
  const work = Promise.resolve().then(fn).finally(() => {
    if (addInflight === work) addInflight = null
  })
  addInflight = work
  return work
}

/** Host-language dictionary fallback for callers that cannot pass the host `t`. */
function translator(windowObject) {
  const language = String(windowObject?.navigator?.language || '').toLowerCase()
  const table = language.startsWith('zh') ? collectionZh : collectionEn
  return key => (typeof table[key] === 'string' ? table[key] : collectionEn[key] || key)
}

/** Optional non-fatal error sink; keeps a failed reveal visible instead of swallowed. */
function reportError(io, error) {
  if (typeof io?.onError === 'function') io.onError(error)
}

function fill(template, tokens) {
  let text = String(template ?? '')
  for (const key of Object.keys(tokens)) text = text.split(`{${key}}`).join(String(tokens[key]))
  return text
}

function memberName(row) {
  return String(row?.title || row?.source_url || row?.id || '').trim()
}

/**
 * The sourced prompt the user's question is appended to.
 *
 * Pure: no window, no fetch, no state. Locale text comes exclusively from `t`,
 * so zh/en stay in `collection-locales.js` and nowhere else.
 *
 * @param {{ collection?: Record<string, any>, items?: Record<string, any>[], total?: number, t: (key: string) => string }} input
 * @returns {string}
 */
export function buildCollectionPrompt({ collection, items, total, t }) {
  const translate = typeof t === 'function' ? t : key => collectionEn[key] || key
  const rows = Array.isArray(items) ? items : []
  const collectionId = String(collection?.id ?? '').trim()
  const name = String(collection?.title ?? '').trim() || collectionId
  const listed = rows.length
  const totalCount = Number.isFinite(Number(total)) && Number(total) > 0 ? Number(total) : listed

  const lines = [
    translate('collection.prompt.sourceLine'),
    fill(translate('collection.prompt.collectionLine'), { name }),
    fill(translate('collection.prompt.collectionIdLine'), { id: collectionId }),
    fill(translate('collection.prompt.memberCountLine'), { count: totalCount }),
    translate('collection.prompt.memberListHeader'),
  ]

  rows.forEach((row, index) => {
    const platform = String(row?.source_platform ?? '').trim()
    const type = String(row?.type ?? '').trim()
    let extra = ''
    if (platform) extra += fill(translate('collection.prompt.memberPlatform'), { platform })
    if (type) extra += fill(translate('collection.prompt.memberType'), { type })
    lines.push(fill(translate('collection.prompt.memberLine'), {
      index: index + 1,
      title: memberName(row),
      id: String(row?.id ?? ''),
      extra,
    }))
  })

  if (totalCount > listed) {
    lines.push(fill(translate('collection.prompt.memberMore'), { listed, total: totalCount }))
  }

  lines.push(translate('collection.prompt.readInstruction'))
  lines.push(translate('collection.prompt.question'))
  return lines.join('\n')
}

function normalizeSessionId(value) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/**
 * The session the user is looking at: workbench snapshot first, then the
 * attachment store's active session. Read lazily on every call — the shell's
 * session can change between clicks.
 * @param {Window | undefined} windowObject
 * @returns {string}
 */
export function resolveActiveSessionId(windowObject) {
  const snapshot = windowObject?.__omnimuxWorkbench?.getSnapshot?.()
  const fromWorkbench = normalizeSessionId(snapshot?.sessionId)
  if (fromWorkbench) return fromWorkbench
  return normalizeSessionId(windowObject?.__omnimuxAttachments?.getActiveSessionId?.())
}

/**
 * Reveal the conversation column: uncollapse + split focus. A failure here must
 * not abort the prefill, so it is reported to the caller's error sink instead.
 * @param {Window | undefined} windowObject
 * @param {(error: unknown) => void} [onError]
 */
export function revealConversation(windowObject, onError) {
  const workbench = windowObject?.__omnimuxWorkbench
  if (!workbench) return
  if (typeof workbench.setConversationCollapsed === 'function') {
    try {
      workbench.setConversationCollapsed(false)
    } catch (error) {
      if (typeof onError === 'function') onError(error)
    }
  }
  if (typeof workbench.setFocus === 'function') {
    try {
      workbench.setFocus('split')
    } catch (error) {
      if (typeof onError === 'function') onError(error)
    }
  }
}

/**
 * Hand a collection to the current session.
 *
 * @param {{ id?: unknown, title?: unknown } | null | undefined} collection
 * @param {{
 *   window?: Window,
 *   sessionId?: string,
 *   fetchCollectionItems?: (filters: Record<string, unknown>) => Promise<{ ok: boolean, status?: number, body?: any }>,
 *   prefill?: (request: { targetSessionId: string, prompt: string, attach: () => { ok: boolean } }) => Promise<any>,
 *   reveal?: () => void,
 *   t?: (key: string) => string,
 *   onError?: (error: unknown) => void,
 * }} [io]
 * @returns {Promise<{ ok: true } | { ok: false, errorKey: string, code: string }>}
 */
export async function addCollectionToSession(collection, io = {}) {
  if (isCollectionAddBusy()) return { ok: false, errorKey: 'collection.sessionBusy', code: 'busy' }

  return runExclusive(async () => {
    const windowObject = io.window ?? (typeof window !== 'undefined' ? window : undefined)
    const t = typeof io.t === 'function' ? io.t : translator(windowObject)
    const collectionId = String(collection?.id ?? '').trim()

    // 1. Full membership, read-only, lean projection: the prompt needs ids,
    //    names, platform and type, not the stored breakdown payload.
    const readMembers = typeof io.fetchCollectionItems === 'function'
      ? io.fetchCollectionItems
      : filters => listLocalInspirations(filters)
    let loaded
    let loadFailed = false
    try {
      loaded = await readMembers({ collection_id: collectionId, page: 1, page_size: MEMBER_PAGE_SIZE, projection: 'lean' })
    } catch (error) {
      loadFailed = true
      reportError(io, error)
    }
    if (loadFailed || !loaded || loaded.ok !== true) {
      return { ok: false, errorKey: 'collection.sessionFetchFailed', code: 'fetch-failed' }
    }

    const data = loaded.body?.data ?? {}
    const items = Array.isArray(data.items) ? data.items : []
    const total = Number(data.total) > 0 ? Number(data.total) : items.length
    if (items.length === 0) return { ok: false, errorKey: 'collection.sessionEmpty', code: 'empty' }

    // 2. Target session: current conversation, never a new one.
    const sessionId = Object.hasOwn(io, 'sessionId')
      ? normalizeSessionId(io.sessionId)
      : resolveActiveSessionId(windowObject)
    if (!sessionId) return { ok: false, errorKey: 'collection.sessionNoSession', code: 'no-session' }

    // 3. Reveal the column only once the operation can actually complete.
    const reveal = typeof io.reveal === 'function'
      ? io.reveal
      : () => revealConversation(windowObject, error => reportError(io, error))
    reveal()

    // 4. Official prefill seam; never sends and never touches collection data.
    const prompt = buildCollectionPrompt({ collection, items, total, t })
    const prefill = typeof io.prefill === 'function' ? io.prefill : queueSessionPrefill
    let prefilled
    let prefillFailed = false
    try {
      prefilled = await prefill({ targetSessionId: sessionId, prompt, attach: () => ({ ok: true }) })
    } catch (error) {
      prefillFailed = true
      reportError(io, error)
    }
    if (prefillFailed) return { ok: false, errorKey: 'collection.sessionFailed', code: 'prefill-failed' }
    if (!prefilled || prefilled.ok !== true) {
      const reason = String(prefilled?.error ?? '')
      if (reason === 'draft-protected') {
        return { ok: false, errorKey: 'collection.sessionDraftProtected', code: 'draft-protected' }
      }
      return { ok: false, errorKey: 'collection.sessionFailed', code: reason || 'prefill-failed' }
    }

    return { ok: true }
  })
}
