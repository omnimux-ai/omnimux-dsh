/**
 * Inspiration → chat orchestrator (official new-session semantics).
 *
 * Pipeline: exclusive lock → clickOfficialNewSession → reveal conversation →
 * one guarded session-scoped attachment + prefill intent.
 * Never starts a workflow project, never copies text, never clicks send.
 * 灵感库 Tab 永不由此链路关闭（#552 P-1）；画布开关权归用户，本链路完全不触碰（P-3）。
 * CTA 唯一副作用 = 展开中间会话栏（split）+ 预填 prompt（P-2）。
 */
import { buildReplicationPrompt } from './replication.js'
import { queueSessionPrefill } from './session-prefill.js'
import { clickOfficialNewSession } from './new-session-click.js'

/** Module-level inflight lock. A second call returns `{ error: 'busy' }` and does not queue. */
let replicateInflight = null

/**
 * Immediate try-lock. If a replicate is already running, the second caller
 * is rejected with `{ ok: false, error: 'busy' }` and `fn` is never invoked.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T | { ok: false, error: 'busy' }>}
 */
export function runExclusive(fn) {
  if (replicateInflight) {
    return Promise.resolve({ ok: false, error: 'busy' })
  }
  const work = Promise.resolve()
    .then(fn)
    .finally(() => {
      if (replicateInflight === work) replicateInflight = null
    })
  replicateInflight = work
  return work
}

export function isReplicateBusy() {
  return replicateInflight != null
}

/**
 * Test-only: drop the inflight handle so cases start from idle.
 */
export function resetReplicateLock() {
  replicateInflight = null
}

function resolveDoc(io) {
  if (io.document) return io.document
  return typeof document !== 'undefined' ? document : null
}

function resolveWindow(io, doc) {
  if (io.window) return io.window
  if (doc && doc.defaultView) return doc.defaultView
  if (typeof window !== 'undefined') return window
  return undefined
}

/**
 * Cover fallback copied from CoverCard's pickCoverSrc usage; do not import api.js.
 * @param {object | null | undefined} row
 * @returns {string}
 */
export function pickReplicationPreviewUrl(row) {
  if (!row || typeof row !== 'object') return ''
  const rec = /** @type {Record<string, unknown>} */ (row)
  const raw = rec.cover_key ?? rec.cover_url
  if (typeof raw !== 'string' || raw === '') return ''
  if (raw.includes('..')) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('/omnimux/inspiration/local/media/')) return raw
  if (raw.startsWith('/omnimux/inspiration/media/')) return raw
  if (raw.startsWith('/api/inspiration/v1/media/')) {
    return `/omnimux/inspiration/media/${raw.slice('/api/inspiration/v1/media/'.length)}`
  }
  return `/omnimux/inspiration/media/${raw.replace(/^\/+/, '')}`
}

/**
 * Attachment payload for this CTA only.
 * @param {object} row
 */
export function buildInspirationPayload(row) {
  const id = row?.id
  const decon = row?.deconstruction && typeof row.deconstruction === 'object' ? row.deconstruction : {}
  const shots = Array.isArray(decon.shots) ? decon.shots : (Array.isArray(row?.shots) ? row.shots : [])
  const structure = Array.isArray(decon.structure) ? decon.structure : []
  return {
    sourcePlugin: 'omnimux-inspiration',
    kind: 'inspiration',
    entityId: id,
    title: row?.title || row?.source_url || '灵感素材',
    extension: 'INSPIRATION',
    relativePath: row?.local_paths?.video || row?.local_paths?.cover || `inspiration/${id}`,
    previewUrl: pickReplicationPreviewUrl(row),
    metadata: {
      inspiration_id: id,
      source_url: row?.source_url,
      source_platform: row?.source_platform,
      hook: decon.hook || decon.hook_highlight || '',
      summary: decon.summary || '',
      shots,
      structure,
    },
  }
}

/**
 * @param {{ setConversationCollapsed?: (next: boolean) => void, setFocus?: (mode: string) => void } | undefined} wb
 */
/**
 * Enter-conversation: uncollapse + split only. The library tab stays open
 * (#552 P-1) and the canvas panel is left untouched (#552 P-3).
 * `setFocus('split')` already uncollapses the conversation internally;
 * the explicit call is a redundant-but-harmless double safety.
 */
function revealConversationColumn(wb) {
  if (!wb) return
  if (typeof wb.setConversationCollapsed === 'function') {
    try { wb.setConversationCollapsed(false) } catch { /* ignore */ }
  }
  if (typeof wb.setFocus === 'function') {
    try { wb.setFocus('split') } catch { /* ignore */ }
  }
}

function workbenchFrom(win) {
  if (win && win.__omnimuxWorkbench) return win.__omnimuxWorkbench
  if (typeof window !== 'undefined' && window.__omnimuxWorkbench) return window.__omnimuxWorkbench
  return undefined
}

/**
 * Reveal the conversation column for a replicate CTA. The library tab is
 * never closed and the canvas panel is never touched (#552 P-1/P-3); the
 * only side effects are uncollapse + split focus, plus closing the card
 * detail modal via `onDismissModal` (unrelated to tabs).
 * @param {{ window?: Window, onDismissModal?: () => void }} [io]
 */
export function revealConversationForReplicate(io = {}) {
  if (typeof io.onDismissModal === 'function') {
    try { io.onDismissModal() } catch { /* ignore */ }
  }
  const win = io.window
    ?? (typeof window !== 'undefined' ? window : undefined)
  const wb = workbenchFrom(win)
  revealConversationColumn(wb)
  // Reveal-only replay after React/workbench subscribers settle. Idempotent
  // geometry assertion: re-asserts uncollapse + split without mutating the
  // tab set or persisting any new state (#552).
  if (typeof setTimeout === 'function') {
    const replay = () => revealConversationColumn(wb)
    setTimeout(replay, 0)
    setTimeout(replay, 50)
  }
}

function resolveNewSessionId(clickResult) {
  const sessionId = clickResult && clickResult.sessionId != null
    ? String(clickResult.sessionId)
    : ''
  return sessionId !== 'default' ? sessionId : ''
}

function defaultAddAttachment(win) {
  return (sessionId, payload) => {
    const store = win && win.__omnimuxAttachments
    if (store && typeof store.addAttachment === 'function') {
      return store.addAttachment(sessionId || '', payload)
    }
    return { ok: false, reason: 'invalid-payload' }
  }
}

/**
 * @param {{ id?: unknown, title?: unknown, source_url?: unknown, source_platform?: unknown, type?: unknown, local_paths?: object, stats?: object, deconstruction?: object, duration?: unknown }} row
 * @param {object} [io]
 */
export async function oneClickReplicate(row, io = {}) {
  const onStatus = typeof io.onStatus === 'function' ? io.onStatus : () => {}

  if (isReplicateBusy()) {
    onStatus('card.cta.busy')
    return { ok: false, error: 'busy' }
  }

  return runExclusive(async () => {
    const doc = resolveDoc(io)
    const win = resolveWindow(io, doc)
    const clickNew = typeof io.clickNewSession === 'function' ? io.clickNewSession : clickOfficialNewSession
    const addAttachment = typeof io.addAttachment === 'function'
      ? io.addAttachment
      : defaultAddAttachment(win)
    const prefill = typeof io.prefillPrompt === 'function'
      ? io.prefillPrompt
      : queueSessionPrefill
    const reveal = typeof io.revealConversation === 'function'
      ? io.revealConversation
      : () => revealConversationForReplicate({
        window: win,
        onDismissModal: io.onDismissModal,
      })

    onStatus('card.cta.replicating')

    let clickPromise
    try {
      // Dispatch exactly one official New Session gesture, then reveal the
      // middle column while official lifecycle resolution remains pending.
      clickPromise = clickNew({ document: doc, window: win })
    } catch {
      try { reveal() } catch { /* keep the visible retry surface */ }
      onStatus('card.cta.newSessionFailed')
      return { ok: false, error: 'newSessionFailed' }
    }
    try { reveal() } catch { /* keep awaiting official resolution */ }

    let clickResult = null
    try {
      clickResult = await clickPromise
    } catch {
      onStatus('card.cta.newSessionFailed')
      return { ok: false, error: 'newSessionFailed' }
    }
    if (!clickResult || clickResult.ok !== true) {
      onStatus('card.cta.newSessionFailed')
      return { ok: false, error: 'newSessionFailed' }
    }

    const sessionId = resolveNewSessionId(clickResult)
    if (!sessionId) {
      onStatus('card.cta.newSessionFailed')
      return { ok: false, error: 'newSessionFailed' }
    }
    // The input.dock consumer performs the empty-draft guard, attachment write,
    // and official setDraft in that order. This keeps an attachment failure
    // retryable: it cannot leave a system-owned prompt in the draft.
    const prompt = buildReplicationPrompt(row)
    const payload = buildInspirationPayload(row)
    let prefilled
    try {
      prefilled = await prefill({
        targetSessionId: sessionId,
        prompt,
        attach: () => addAttachment(sessionId, payload),
      })
    } catch {
      onStatus('card.cta.sendManual')
      return { ok: false, error: 'sendManual' }
    }
    if (!prefilled || prefilled.ok !== true) {
      const error = prefilled?.error === 'draft-protected'
        ? 'draftProtected'
        : prefilled?.error === 'attach-full'
          ? 'attachFull'
          : prefilled?.error === 'attach-failed'
            ? 'attachFailed'
            : 'sendManual'
      onStatus(`card.cta.${error}`)
      return { ok: false, error }
    }

    onStatus(null)
    return {
      ok: true,
      clickedNewSession: true,
      attached: true,
      ...(prefilled.duplicate ? { duplicate: true } : {}),
    }
  })
}
