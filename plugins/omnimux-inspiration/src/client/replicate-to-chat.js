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
const recoverableDrafts = new Map()

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
  recoverableDrafts.clear()
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

function defaultRemoveAttachment(win) {
  return (sessionId, id) => win?.__omnimuxAttachments?.removeAttachment?.(sessionId, id)
}

async function materializeReferences(win, input) {
  const fetcher = win?.fetch?.bind(win) ?? globalThis.fetch
  if (typeof fetcher !== 'function') return { ok: false, error: '会话附件能力未就绪，请稍后重试' }
  const response = await fetcher(`/omnimux/inspiration/local/${encodeURIComponent(input.id)}/creation-attachments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: input.sessionId, reference_id: input.reference_id }),
  })
  const body = await response.json()
  return response.ok ? { ok: true, attachments: body.attachments } : { ok: false, error: body.error || '参考文件带入失败，请重试' }
}

/** All-or-nothing composer insertion; only attachments inserted by this call are rolled back. */
function preparedAttachmentBatch(sessionId, payloads, add, remove) {
  const ownedIds = []
  let rolledBack = false
  const rollback = () => {
    if (rolledBack) return
    rolledBack = true
    for (const id of ownedIds) remove(sessionId, id)
  }
  const attach = () => {
    try {
      for (const payload of payloads) {
        const result = add(sessionId, payload)
        if (result?.reason === 'duplicate') continue
        if (result?.ok !== true || typeof result.attachment?.id !== 'string' || !result.attachment.id) {
          rollback()
          return { ok: false, reason: result?.reason || 'invalid-payload' }
        }
        ownedIds.push(result.attachment.id)
      }
      return { ok: true, rollback }
    } catch {
      rollback()
      return { ok: false, reason: 'invalid-payload' }
    }
  }
  return { attach, rollback }
}

/**
 * @param {{ id?: unknown, title?: unknown, source_url?: unknown, source_platform?: unknown, type?: unknown, local_paths?: object, stats?: object, deconstruction?: object, duration?: unknown }} row
 * @param {object} [io]
 */
export async function oneClickReplicate(row, io = {}) {
  const onStatus = typeof io.onStatus === 'function' ? io.onStatus : () => {}

  if (isReplicateBusy()) {
    onStatus('card.cta.busy')
    return { ok: false, error: row?.creation_reference ? '创作参考正在带入，请稍候' : 'busy' }
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

    const prepared = row?.creation_reference != null
    if (prepared && (typeof row.creation_reference.id !== 'string' || !row.creation_reference.id || typeof row.creation_reference.text !== 'string' || !row.creation_reference.text.trim())) {
      return { ok: false, error: '创作参考尚未准备完成，请重新整理' }
    }
    onStatus('card.cta.replicating')

    let clickPromise
    try {
      // Dispatch exactly one official New Session gesture, then reveal the
      // middle column while official lifecycle resolution remains pending.
      clickPromise = clickNew({ document: doc, window: win })
    } catch {
      try { reveal() } catch { /* keep the visible retry surface */ }
      onStatus('card.cta.newSessionFailed')
      return { ok: false, error: prepared ? '新会话未能打开，请重试' : 'newSessionFailed' }
    }
    try { reveal() } catch { /* keep awaiting official resolution */ }

    let clickResult = null
    try {
      clickResult = await clickPromise
    } catch {
      onStatus('card.cta.newSessionFailed')
      return { ok: false, error: prepared ? '新会话未能打开，请重试' : 'newSessionFailed' }
    }
    if (!clickResult || clickResult.ok !== true) {
      onStatus('card.cta.newSessionFailed')
      return { ok: false, error: prepared ? '新会话未能打开，请重试' : 'newSessionFailed' }
    }

    const sessionId = resolveNewSessionId(clickResult)
    if (!sessionId) {
      onStatus('card.cta.newSessionFailed')
      return { ok: false, error: prepared ? '新会话未能打开，请重试' : 'newSessionFailed' }
    }
    // The input.dock consumer performs the empty-draft guard, attachment write,
    // and official setDraft in that order. This keeps an attachment failure
    // retryable: it cannot leave a system-owned prompt in the draft.
    const prompt = buildReplicationPrompt(row)
    let batch
    if (prepared) {
      try {
        const materialize = typeof io.materializeReferences === 'function' ? io.materializeReferences : (input) => materializeReferences(win, input)
        const result = await materialize({ id: row.id, sessionId, reference_id: row.creation_reference.id })
        if (!result?.ok || !Array.isArray(result.attachments) || !result.attachments.length || result.attachments.some((file) => typeof file?.relativePath !== 'string' || !file.relativePath || file.relativePath.startsWith('/') || file.relativePath.split(/[\\/]/).includes('..'))) {
          onStatus('card.cta.attachFailed')
          return { ok: false, error: result?.error || '参考文件尚未完整带入，请重试' }
        }
        const remove = typeof io.removeAttachment === 'function' ? io.removeAttachment : defaultRemoveAttachment(win)
        batch = preparedAttachmentBatch(sessionId, result.attachments, addAttachment, remove)
      } catch {
        onStatus('card.cta.attachFailed')
        return { ok: false, error: '参考文件带入失败，请重试' }
      }
    }
    const payload = prepared ? null : buildInspirationPayload(row)
    const recoveryKey = prepared ? `${row.id}:${row.creation_reference.id}` : null
    const ownDraft = prepared ? recoverableDrafts.get(recoveryKey) : null
    let prefilled
    try {
      prefilled = await prefill({
        targetSessionId: sessionId,
        prompt,
        attach: batch ? batch.attach : () => addAttachment(sessionId, payload),
        ...(prepared ? {
          requireReadback: true,
          resumeOwnPrompt: ownDraft?.sessionId === sessionId && ownDraft?.prompt === prompt,
          onDraftWritten: () => {
            if (recoverableDrafts.size >= 32) recoverableDrafts.delete(recoverableDrafts.keys().next().value)
            recoverableDrafts.set(recoveryKey, { sessionId, prompt })
          },
        } : {}),
      })
    } catch {
      batch?.rollback()
      onStatus('card.cta.sendManual')
      return { ok: false, error: prepared ? '草稿未能完整带入，请重试' : 'sendManual' }
    }
    if (!prefilled || prefilled.ok !== true) {
      batch?.rollback()
      const error = prefilled?.error === 'draft-protected'
        ? 'draftProtected'
        : prefilled?.error === 'attach-full'
          ? 'attachFull'
          : prefilled?.error === 'attach-failed'
            ? 'attachFailed'
            : 'sendManual'
      onStatus(`card.cta.${error}`)
      const message = { draftProtected: '目标会话已有草稿，请先处理后重试', attachFull: '会话附件已满，请移除部分附件后重试', attachFailed: '参考文件未能完整带入，请重试', sendManual: '草稿未能完整带入，请重试' }[error]
      return { ok: false, error: prepared ? message : error }
    }

    if (prepared) recoverableDrafts.delete(recoveryKey)
    onStatus(null)
    return {
      ok: true,
      clickedNewSession: true,
      attached: true,
      ...(prefilled.duplicate ? { duplicate: true } : {}),
    }
  })
}
