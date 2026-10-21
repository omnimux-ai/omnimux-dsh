/**
 * One library card → current session, as one native Markdown attachment.
 *
 * Same red lines as `collection-to-chat.js`:
 *
 * 1. Nothing is sent — no send call exists here; the user submits the message.
 * 2. The card is read-only — its row is already in memory; no extra request.
 * 3. Failure is explicit — every abort returns an `errorKey` the view turns into
 *    a toast; the user's existing draft and attachments are never overwritten.
 * 4. One operation at a time — a module-level lock refuses concurrent adds.
 *
 * The attachment is a Markdown card (title, platform, views, time, source link,
 * media route, id, read instruction), not a media file: a cloud row has no local
 * file yet and a local row may be a gallery, so one honest text artifact covers
 * both without a download or a schema change.
 */

import { resolveActiveSessionId, revealConversation, runExclusive, waitForComposerFiles } from './collection-to-chat.js'

/** Module-level inflight lock: a second add while the first runs is refused. */
let addInflight = null

export function isCardAddBusy() {
  return addInflight !== null
}

/** Test-only: drop the inflight handle so cases start from idle. */
export function resetCardAddLock() {
  addInflight = null
}

function plainText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => (Object.hasOwn(values, key) ? String(values[key]) : match))
}

const INVALID_FILE_NAME = /[\\/:*?"<>|\u0000-\u001f]/g

export function cardFileName(row) {
  const raw = plainText(row?.title || row?.content)
    .replace(INVALID_FILE_NAME, '-')
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
  const idPart = String(row?.id ?? '').replace(/[^\w-]/g, '').slice(0, 8)
  if (!raw) return `灵感卡片-${idPart || 'card'}.md`
  const safe = raw.slice(0, 60).trim() || '灵感卡片'
  return `${safe} · 灵感卡.md`
}

/**
 * The Markdown document itself. Only facts already present on the row are
 * written; missing fields are omitted instead of invented.
 *
 * @param {{ row?: Record<string, any>, t: (key: string) => string }} input
 * @returns {string}
 */
export function buildCardDocument({ row, t }) {
  const translate = typeof t === 'function' ? t : (key) => key
  const title = plainText(row?.title || row?.content) || String(row?.id ?? '')
  const id = String(row?.id ?? '').trim()
  const platform = plainText(row?.source_platform)
  const type = plainText(row?.type || row?.content_shape)
  const time = plainText(row?.created_at || row?.posted_at)
  const views = row?.stats && Number.isFinite(Number(row.stats.views)) ? Number(row.stats.views) : null
  const duration = Number.isFinite(Number(row?.duration)) && Number(row.duration) > 0 ? Number(row.duration) : null
  const sourceUrl = plainText(row?.source_url)
  const media = plainText(row?.cover_url || (Array.isArray(row?.media_urls) ? row.media_urls[0] : ''))
  const body = plainText(row?.content)
  const lines = [
    `# ${fill(translate('card.session.docHeading'), { title })}`,
    '',
    translate('card.session.docSourceLine'),
    fill(translate('card.session.docIdLine'), { id }),
  ]
  if (platform) lines.push(fill(translate('card.session.docPlatform'), { platform }))
  if (type) lines.push(fill(translate('card.session.docType'), { type }))
  if (time) lines.push(fill(translate('card.session.docTime'), { time }))
  if (views !== null && views >= 0) lines.push(fill(translate('card.session.docViews'), { views }))
  if (duration !== null) lines.push(fill(translate('card.session.docDuration'), { duration }))
  if (sourceUrl) lines.push(fill(translate('card.session.docSourceUrl'), { url: sourceUrl }))
  if (media) lines.push(fill(translate('card.session.docMedia'), { url: media }))
  if (body && body !== title) {
    lines.push('', translate('card.session.docBody'), body)
  }
  lines.push('', translate('card.session.docRead'))
  return `${lines.join('\n')}\n`
}

function createFile(content, name, io) {
  if (typeof io?.makeFile === 'function') return io.makeFile(content, name)
  return new File([content], name, { type: 'text/markdown' })
}

function reportError(io, error) {
  if (typeof io?.onError !== 'function') return
  try {
    io.onError(error)
  } catch (nested) {
    // The sink is diagnostics only: log the fault instead of aborting a mount
    // that may already have succeeded.
    console.error('[omnimux-inspiration] card-to-chat error sink failed', nested)
  }
}

/**
 * Add one card to the current session.
 *
 * @param {Record<string, any>} row
 * @param {{
 *   t?: (key: string) => string,
 *   window?: Window,
 *   sessionId?: string,
 *   reveal?: () => void,
 *   waitForFiles?: (win: any, sessionId: string) => Promise<any>,
 *   nativeFiles?: { add: Function, list: Function },
 *   makeFile?: (content: string, name: string) => any,
 *   onError?: (error: unknown) => void,
 * }} [io]
 * @returns {Promise<{ ok: true, duplicate?: boolean } | { ok: false, errorKey: string, code: string, detail?: string }>}
 */
export async function addCardToSession(row, io = {}) {
  if (isCardAddBusy()) return { ok: false, errorKey: 'card.sessionBusy', code: 'busy' }

  return runExclusive(async () => {
    const windowObject = io.window ?? (typeof window !== 'undefined' ? window : undefined)
    const t = typeof io.t === 'function' ? io.t : () => ''
    const id = String(row?.id ?? '').trim()
    if (!id) return { ok: false, errorKey: 'card.sessionFailed', code: 'invalid-card' }

    const sessionId = Object.hasOwn(io, 'sessionId')
      ? String(io.sessionId ?? '').trim()
      : resolveActiveSessionId(windowObject)
    if (!sessionId) return { ok: false, errorKey: 'card.sessionNoSession', code: 'no-session' }

    const reveal = typeof io.reveal === 'function'
      ? io.reveal
      : () => revealConversation(windowObject, sessionId, error => reportError(io, error))
    reveal()

    const waitForFiles = typeof io.waitForFiles === 'function'
      ? io.waitForFiles
      : (win, session) => waitForComposerFiles(win, session)
    const composerFiles = io.nativeFiles ?? await waitForFiles(windowObject, sessionId)
    if (!composerFiles || typeof composerFiles.add !== 'function') {
      return { ok: false, errorKey: 'card.sessionUnavailable', code: 'no-native-files' }
    }

    const fileName = cardFileName(row)
    let existing = []
    try {
      existing = composerFiles.list()
    } catch (error) {
      reportError(io, error)
    }
    if (Array.isArray(existing) && existing.includes(fileName)) return { ok: true, duplicate: true }

    const content = buildCardDocument({ row, t })
    const file = createFile(content, fileName, io)
    let added
    let addFailed = false
    try {
      added = await composerFiles.add([file])
    } catch (error) {
      addFailed = true
      reportError(io, error)
    }
    if (addFailed) return { ok: false, errorKey: 'card.sessionFailed', code: 'add-failed' }
    if (!added || added.ok !== true) {
      const detail = typeof added?.message === 'string' ? added.message : ''
      return { ok: false, errorKey: 'card.sessionFailed', code: 'add-failed', detail }
    }

    try {
      windowObject?.__omnimuxComposerActions?.revealAttachments?.()
    } catch (error) {
      reportError(io, error)
    }
    return { ok: true }
  })
}
