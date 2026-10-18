/**
 * Native composer files bridge.
 *
 * The official composer owns draft file attachments. Its
 * `conversation.input.attachments` slot hands `AttachmentTray`:
 *
 * - `attachments`: the native draft attachments currently in the composer;
 * - `onAddFiles`: the official intake. The authoritative host contract types it
 *   `(files: readonly File[]) => void` — it shows its own toast for a rejected
 *   batch and then returns nothing. It is NOT a success receipt.
 * - `canAcceptDrop`: whether the composer is currently accepting files.
 *
 * Because the intake is void, "the call returned" proves nothing. This bridge
 * therefore confirms the add by observing the attachment list for the new file
 * name (bounded poll), and only then reports success. It also keeps the file
 * name in a session-local pending set until confirmation, so a rapid second
 * click is deduplicated before React re-renders with the new attachment.
 *
 * The tray publishes a session-scoped entry while it is mounted:
 *
 *   window.__omnimuxComposerFiles[sessionId] = {
 *     add(files): Promise<{ ok: boolean, message?: string }>,
 *     list(): string[],
 *   }
 */

/** Global registry key: `Record<sessionId, NativeFilesBridgeEntry>`. */
export const COMPOSER_FILES_GLOBAL = '__omnimuxComposerFiles'

const CONFIRM_TIMEOUT_MS = 1500
const CONFIRM_POLL_MS = 50
/** Keep an unconfirmed file name visible for dedupe after a timeout, so a retry
 * cannot upload a second copy if the composer mounts it late. */
const UNCONFIRMED_TTL_MS = 3000

/** @param {any} windowObject @param {boolean} create */
function registry(windowObject, create) {
  if (!windowObject || typeof windowObject !== 'object') return null
  const existing = windowObject[COMPOSER_FILES_GLOBAL]
  if (existing && typeof existing === 'object') return existing
  if (!create) return null
  const table = {}
  windowObject[COMPOSER_FILES_GLOBAL] = table
  return table
}

/**
 * Display names of the native file attachments currently in a composer.
 * @param {readonly any[] | undefined | null} attachments
 * @returns {string[]}
 */
export function listNativeFileNames(attachments) {
  if (!Array.isArray(attachments)) return []
  const names = []
  for (const attachment of attachments) {
    const fileName = attachment?.file && typeof attachment.file.name === 'string' ? attachment.file.name : ''
    const title = typeof attachment?.title === 'string' ? attachment.title : ''
    const name = fileName || title
    if (name) names.push(name)
  }
  return names
}

function displayName(file) {
  return file && typeof file.name === 'string' ? file.name : ''
}

function readAttachments(getAttachments) {
  if (typeof getAttachments !== 'function') return []
  return listNativeFileNames(getAttachments())
}

/**
 * Bounded confirmation that every requested file name is now in the composer's
 * attachment list. A void intake that rejected the batch (or silently did
 * nothing) never confirms, so the caller gets an explicit failure instead of a
 * fabricated success.
 *
 * @param {() => readonly any[] | undefined} getAttachments
 * @param {readonly string[]} names
 * @param {{ timeout?: number, interval?: number }} [options]
 * @returns {Promise<boolean>}
 */
export function confirmNativeFileNames(getAttachments, names, options = {}) {
  const wanted = Array.isArray(names) ? names.filter(Boolean) : []
  const check = () => {
    try {
      const current = new Set(readAttachments(getAttachments))
      return wanted.length > 0 && wanted.every(name => current.has(name))
    } catch (error) {
      // A getter failure cannot confirm anything; keep the caller bounded
      // instead of leaving the operation unresolved during a host teardown.
      console.error('[native-files-bridge] failed to read composer attachments', error)
      return false
    }
  }
  if (check()) return Promise.resolve(true)
  const timeout = Number.isFinite(options.timeout) ? Math.max(0, options.timeout) : CONFIRM_TIMEOUT_MS
  const interval = Number.isFinite(options.interval) ? Math.max(5, options.interval) : CONFIRM_POLL_MS
  if (typeof setTimeout !== 'function' || timeout <= 0) return Promise.resolve(false)
  return new Promise(resolve => {
    const startedAt = Date.now()
    const tick = () => {
      if (check()) {
        resolve(true)
        return
      }
      if (Date.now() - startedAt >= timeout) {
        resolve(false)
        return
      }
      setTimeout(tick, interval)
    }
    setTimeout(tick, interval)
  })
}

/**
 * Install (or replace) this session's bridge entry. Returns a cleanup that only
 * removes the entry it installed, so a remount cannot delete a newer one.
 *
 * @param {any} windowObject
 * @param {{
 *   sessionId?: string,
 *   canAcceptDrop?: boolean | (() => boolean),
 *   getAttachments?: () => readonly any[] | undefined,
 *   addFiles?: (files: readonly File[]) => void,
 *   confirmTimeout?: number,
 *   confirmInterval?: number,
 * }} [options]
 * @returns {() => void}
 */
export function installNativeFilesBridge(windowObject, options = {}) {
  const sessionId = typeof options.sessionId === 'string' ? options.sessionId.trim() : ''
  if (!sessionId) return () => {}
  const table = registry(windowObject, true)
  if (!table) return () => {}

  // name → TTL deadline. Present while the official intake is propagating and,
  // after a timeout, briefly afterwards so a retry is still deduplicated.
  const pending = new Map()
  const unconfirmedTtl = Number.isFinite(options.unconfirmedTtl) ? Math.max(0, options.unconfirmedTtl) : UNCONFIRMED_TTL_MS
  const prunePending = () => {
    const now = Date.now()
    for (const [name, deadline] of pending) {
      if (deadline <= now) pending.delete(name)
    }
  }
  const readCanAccept = () => (
    typeof options.canAcceptDrop === 'function' ? Boolean(options.canAcceptDrop()) : Boolean(options.canAcceptDrop)
  )

  const entry = {
    async add(files) {
      const batch = Array.isArray(files) ? files : []
      if (batch.length === 0) return { ok: false, message: '' }
      if (!readCanAccept()) return { ok: false, message: '' }
      const addFiles = options.addFiles
      if (typeof addFiles !== 'function') return { ok: false, message: '' }
      const names = batch.map(displayName).filter(Boolean)
      const pendingDeadline = Date.now() + Math.max(0, options.confirmTimeout || 0) + unconfirmedTtl
      for (const name of names) pending.set(name, pendingDeadline)
      try {
        // Void by contract: the official composer shows its own rejection toast.
        addFiles(batch)
      } catch (error) {
        for (const name of names) pending.delete(name)
        // Deliberately re-thrown: a crashing intake must reach the caller, never
        // become a success receipt.
        throw error
      }
      const confirmed = await confirmNativeFileNames(options.getAttachments, names, {
        timeout: options.confirmTimeout,
        interval: options.confirmInterval,
      })
      if (confirmed) {
        for (const name of names) pending.delete(name)
        return { ok: true }
      }
      // Keep the name deduplicated for a short window: a late mount must not
      // let an immediate retry upload a second copy of the same file.
      const retryDeadline = Date.now() + unconfirmedTtl
      for (const name of names) pending.set(name, retryDeadline)
      return { ok: false, message: '' }
    },
    list() {
      prunePending()
      const actual = readAttachments(options.getAttachments)
      for (const name of pending.keys()) {
        if (!actual.includes(name)) actual.push(name)
      }
      return actual
    },
  }

  table[sessionId] = entry
  return () => {
    pending.clear()
    if (table[sessionId] === entry) delete table[sessionId]
    if (Object.keys(table).length === 0 && windowObject[COMPOSER_FILES_GLOBAL] === table) {
      delete windowObject[COMPOSER_FILES_GLOBAL]
    }
  }
}

/**
 * Look up a session's bridge entry; `null` when the tray is not mounted.
 * @param {any} windowObject
 * @param {string} sessionId
 * @returns {null | { add: (files: readonly File[]) => Promise<{ ok: boolean, message?: string }>, list: () => string[] }}
 */
export function resolveNativeFilesBridge(windowObject, sessionId) {
  const table = registry(windowObject, false)
  if (!table || typeof sessionId !== 'string' || !sessionId) return null
  const entry = table[sessionId]
  return entry && typeof entry.add === 'function' ? entry : null
}
