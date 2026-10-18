/**
 * Collection → current session, as one native Markdown attachment.
 *
 * A local collection card hands its whole membership to the conversation the
 * user is already in. The module owns exactly two side effects: it reveals the
 * conversation (same entry as the replicate CTA), and it mounts one generated
 * Markdown file through the official composer's native file intake
 * (`window.__omnimuxComposerFiles`, published by the hub's attachment tray).
 * It never writes the collection body into the draft, never sends, never starts
 * a session, never closes the library tab, and never writes collection data.
 *
 * Red lines (same family as `rival-add-to-chat.js`):
 *
 * 1. Nothing is sent — no send call exists here; the user submits the message.
 * 2. The collection is read-only — the local list endpoint is the only read.
 * 3. Failure is explicit — every abort returns an `errorKey` the view turns into
 *    a toast; the user's existing draft and attachments are never overwritten.
 * 4. One operation at a time — a module-level lock refuses concurrent adds.
 */

import { listLocalInspirations } from './api.js'
import { collectionEn, collectionZh } from './collection-locales.js'

/** Members requested per page; the local list endpoint clamps this to 100. */
const MEMBER_PAGE_SIZE = 100
/** Upper bound of pages read into the document; extra members stay resolvable by id. */
const MAX_MEMBER_PAGES = 5
/** How long to wait for the tray to publish its native file intake after reveal. */
const BRIDGE_WAIT_MS = 1200
const BRIDGE_POLL_MS = 50

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
  // Single pass: tokens substituted into the template are never re-scanned, so
  // a user-owned title containing `{id}` cannot corrupt the rest of the line.
  return String(template ?? '').replace(/\{(\w+)\}/g, (match, key) => (
    Object.hasOwn(tokens, key) ? String(tokens[key]) : match
  ))
}

/** One-line user text: control characters and line breaks would break the list. */
function plainText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function memberName(row) {
  return plainText(row?.title || row?.source_url || row?.id || '')
}

/** Host sentinels for "no session bound yet"; never a valid attachment target. */
const UNBOUND_SESSION_IDS = new Set(['default', '__none__', 'undefined', 'null'])

function normalizeSessionId(value) {
  let id = ''
  if (typeof value === 'string') id = value.trim()
  else if (typeof value === 'number' && Number.isFinite(value)) id = String(value)
  return UNBOUND_SESSION_IDS.has(id) ? '' : id
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
 * Reveal the conversation column the same way the "replicate" CTA does.
 *
 * The official workbench entry `ensureConversationVisible` is the only path that
 * also exits a host right-sidebar fullscreen panel (the plugin collapse key and
 * the host layout mode are independent, so clearing the key alone leaves the
 * conversation behind the fullscreen stage — the exact "clicked, nothing
 * happened" symptom). Fall back to the collapse/focus pair used by
 * `replicate-to-chat`, and replay it like that path does so a layout that
 * settles after the click still lands on the revealed conversation.
 *
 * A failure here must not abort the attachment, so it is reported to the
 * caller's error sink instead.
 * @param {Window | undefined} windowObject
 * @param {string} [sessionId]
 * @param {(error: unknown) => void} [onError]
 */
export function revealConversation(windowObject, sessionId = '', onError) {
  const workbench = windowObject?.__omnimuxWorkbench
  if (!workbench) return
  const report = error => { if (typeof onError === 'function') onError(error) }
  const revealOnce = () => {
    if (typeof workbench.ensureConversationVisible === 'function') {
      try {
        // No options: exit a host right-sidebar fullscreen and clear the
        // collapse key while keeping the current surface in a split layout, so
        // the library stage (and its toast) stays visible next to the session.
        workbench.ensureConversationVisible()
        return
      } catch (error) {
        report(error)
      }
    }
    if (typeof workbench.setConversationCollapsed === 'function') {
      try {
        workbench.setConversationCollapsed(false)
      } catch (error) {
        report(error)
      }
    }
    if (typeof workbench.setFocus === 'function') {
      try {
        workbench.setFocus('split')
      } catch (error) {
        report(error)
      }
    }
  }
  revealOnce()
  if (typeof setTimeout === 'function') {
    setTimeout(revealOnce, 0)
    setTimeout(revealOnce, 50)
  }
}

const INVALID_FILE_NAME = /[\\/:*?"<>|\u0000-\u001f]/g

/**
 * `{collection title} · 灵感库合集.md`, safe for a native composer upload.
 * @param {{ id?: unknown, title?: unknown } | null | undefined} collection
 * @returns {string}
 */
export function collectionFileName(collection) {
  const raw = plainText(collection?.title)
    .replace(INVALID_FILE_NAME, '-')
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
  if (!raw) {
    const idPart = String(collection?.id ?? '').replace(/[^\w-]/g, '').slice(0, 8)
    return `灵感库合集-${idPart || 'collection'}.md`
  }
  const safe = raw.slice(0, 60).trim() || '灵感库合集'
  return `${safe} · 灵感库合集.md`
}

/**
 * The Markdown document itself. It carries the sourced collection facts and the
 * read instruction; the user's own question stays in the composer.
 *
 * @param {{ collection?: Record<string, any>, items?: Record<string, any>[], total?: number, t: (key: string) => string }} input
 * @returns {string}
 */
export function buildCollectionDocument({ collection, items, total, t }) {
  const translate = typeof t === 'function' ? t : key => collectionEn[key] || key
  const rows = Array.isArray(items) ? items : []
  const collectionId = String(collection?.id ?? '').trim()
  const name = plainText(collection?.title) || collectionId
  const listed = rows.length
  const totalCount = Number.isFinite(Number(total)) && Number(total) > 0 ? Number(total) : listed

  const lines = [
    `# ${fill(translate('collection.file.heading'), { name })}`,
    '',
    translate('collection.prompt.sourceLine'),
    fill(translate('collection.prompt.collectionIdLine'), { id: collectionId }),
    fill(translate('collection.prompt.memberCountLine'), { count: totalCount }),
    '',
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
    lines.push('', fill(translate('collection.prompt.memberMore'), { listed, total: totalCount }))
  }

  lines.push('', translate('collection.prompt.readInstruction'))
  return `${lines.join('\n')}\n`
}

function createFile(content, name, io) {
  if (typeof io?.makeFile === 'function') return io.makeFile(content, name)
  return new File([content], name, { type: 'text/markdown' })
}

/**
 * Read the whole membership in bounded pages. The document lists what was read
 * and keeps the true total so the agent can page the remainder through
 * `inspiration_get`.
 * @param {(filters: Record<string, unknown>) => Promise<{ ok: boolean, body?: any }>} read
 * @param {string} collectionId
 */
async function readMembers(read, collectionId) {
  const items = []
  let total = 0
  for (let page = 1; page <= MAX_MEMBER_PAGES; page += 1) {
    const loaded = await read({
      collection_id: collectionId,
      page,
      page_size: MEMBER_PAGE_SIZE,
      projection: 'lean',
    })
    if (!loaded || loaded.ok !== true) return { ok: false }
    const data = loaded.body?.data ?? {}
    const pageItems = Array.isArray(data.items) ? data.items : []
    const reportedTotal = Number(data.total)
    if (Number.isFinite(reportedTotal) && reportedTotal > total) total = reportedTotal
    items.push(...pageItems)
    if (pageItems.length < MEMBER_PAGE_SIZE || items.length >= total) break
  }
  return { ok: true, items, total: total || items.length }
}

/**
 * The native composer file intake published by the hub's attachment tray.
 * @param {Window | undefined} windowObject
 * @param {string} sessionId
 */
export function resolveComposerFiles(windowObject, sessionId) {
  if (!sessionId) return null
  const table = windowObject?.__omnimuxComposerFiles
  const entry = table && typeof table === 'object' ? table[sessionId] : null
  return entry && typeof entry.add === 'function' ? entry : null
}

/**
 * Wait (bounded) for the tray to mount after the conversation is revealed. The
 * slot normally stays mounted while collapsed; this covers the cold/slow mount
 * window instead of failing the click on the first frame.
 * @param {Window | undefined} windowObject
 * @param {string} sessionId
 * @param {{ timeout?: number, interval?: number }} [options]
 * @returns {Promise<{ add: Function, list: Function } | null>}
 */
export function waitForComposerFiles(windowObject, sessionId, options = {}) {
  const found = resolveComposerFiles(windowObject, sessionId)
  if (found) return Promise.resolve(found)
  if (typeof setTimeout !== 'function') return Promise.resolve(null)
  const timeout = Number.isFinite(options.timeout) ? Math.max(0, options.timeout) : BRIDGE_WAIT_MS
  const interval = Number.isFinite(options.interval) ? Math.max(10, options.interval) : BRIDGE_POLL_MS
  if (timeout <= 0) return Promise.resolve(null)
  return new Promise(resolve => {
    const startedAt = Date.now()
    const tick = () => {
      const entry = resolveComposerFiles(windowObject, sessionId)
      if (entry) {
        resolve(entry)
        return
      }
      if (Date.now() - startedAt >= timeout) {
        resolve(null)
        return
      }
      setTimeout(tick, interval)
    }
    setTimeout(tick, interval)
  })
}

/**
 * Mount a collection into the current session as one native Markdown file.
 *
 * @param {{ id?: unknown, title?: unknown } | null | undefined} collection
 * @param {{
 *   window?: Window,
 *   sessionId?: string,
 *   fetchCollectionItems?: (filters: Record<string, unknown>) => Promise<{ ok: boolean, status?: number, body?: any }>,
 *   nativeFiles?: { add: (files: readonly File[]) => Promise<{ ok: boolean, message?: string }>, list: () => readonly string[] },
 *   waitForFiles?: (windowObject: Window | undefined, sessionId: string) => Promise<any>,
 *   makeFile?: (content: string, name: string) => File,
 *   reveal?: () => void,
 *   t?: (key: string) => string,
 *   onError?: (error: unknown) => void,
 * }} [io]
 * @returns {Promise<{ ok: true, duplicate?: true } | { ok: false, errorKey: string, code: string, detail?: string }>}
 */
export async function addCollectionToSession(collection, io = {}) {
  if (isCollectionAddBusy()) return { ok: false, errorKey: 'collection.sessionBusy', code: 'busy' }

  return runExclusive(async () => {
    const windowObject = io.window ?? (typeof window !== 'undefined' ? window : undefined)
    const t = typeof io.t === 'function' ? io.t : translator(windowObject)
    const collectionId = String(collection?.id ?? '').trim()
    if (!collectionId) return { ok: false, errorKey: 'collection.sessionFailed', code: 'invalid-collection' }

    // 1. Target session: current conversation, never a new one.
    const sessionId = Object.hasOwn(io, 'sessionId')
      ? normalizeSessionId(io.sessionId)
      : resolveActiveSessionId(windowObject)
    if (!sessionId) return { ok: false, errorKey: 'collection.sessionNoSession', code: 'no-session' }

    // 2. Reveal immediately — before waiting for anything else — exactly like
    //    the replicate CTA: a slow read or a missing tray must never be why the
    //    session bar stays closed.
    const reveal = typeof io.reveal === 'function'
      ? io.reveal
      : () => revealConversation(windowObject, sessionId, error => reportError(io, error))
    reveal()

    // 3. The tray publishes the official native file intake per session. Wait
    //    for it (bounded) instead of racing the cold mount.
    const waitForFiles = typeof io.waitForFiles === 'function'
      ? io.waitForFiles
      : (win, session) => waitForComposerFiles(win, session)
    const composerFiles = io.nativeFiles ?? await waitForFiles(windowObject, sessionId)
    if (!composerFiles || typeof composerFiles.add !== 'function') {
      return { ok: false, errorKey: 'collection.attachmentUnavailable', code: 'no-native-files' }
    }

    // 4. One collection → one file. A second click must not upload a duplicate.
    const fileName = collectionFileName(collection)
    let existing = []
    try {
      existing = composerFiles.list()
    } catch (error) {
      reportError(io, error)
    }
    if (Array.isArray(existing) && existing.includes(fileName)) return { ok: true, duplicate: true }

    // 5. Full membership, read-only, lean projection: the document needs ids,
    //    titles, platform and type, not the stored breakdown payload.
    const read = typeof io.fetchCollectionItems === 'function'
      ? io.fetchCollectionItems
      : filters => listLocalInspirations(filters)
    let members
    let readFailed = false
    try {
      members = await readMembers(read, collectionId)
    } catch (error) {
      readFailed = true
      reportError(io, error)
    }
    if (readFailed || !members || members.ok !== true) {
      return { ok: false, errorKey: 'collection.sessionFetchFailed', code: 'fetch-failed' }
    }
    if (members.items.length === 0) return { ok: false, errorKey: 'collection.sessionEmpty', code: 'empty' }

    // 6. Build the document and hand the File to the official native intake.
    const content = buildCollectionDocument({ collection, items: members.items, total: members.total, t })
    const file = createFile(content, fileName, io)
    let added
    let addFailed = false
    try {
      // The bridge confirms by observing the official attachment list; a void
      // intake that rejected or silently dropped the file resolves `ok:false`.
      added = await composerFiles.add([file])
    } catch (error) {
      addFailed = true
      reportError(io, error)
    }
    if (addFailed) return { ok: false, errorKey: 'collection.attachmentFailed', code: 'add-failed' }
    if (!added || added.ok !== true) {
      const detail = typeof added?.message === 'string' ? added.message : ''
      return { ok: false, errorKey: 'collection.attachmentFailed', code: 'add-failed', detail }
    }

    // 7. Bring the user's eye to the attachment rail (existing hub bridge).
    try {
      windowObject?.__omnimuxComposerActions?.revealAttachments?.()
    } catch (error) {
      reportError(io, error)
    }
    return { ok: true }
  })
}
