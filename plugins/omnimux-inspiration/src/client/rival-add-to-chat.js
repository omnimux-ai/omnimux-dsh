/**
 * "Add to session": mount one rival post as an attachment on the *current*
 * conversation.
 *
 * Four red lines this file exists to hold (#552 and this module's own contract):
 *
 * 1. The library tab is never closed — `closeTab` is not called anywhere here.
 * 2. The canvas is never touched — no `setCanvas*` call, no project creation.
 * 3. Nothing is ever sent — no `setDraft`, no click on send. The user still
 *    types their own request.
 * 4. No URL is ever built from a filesystem path — `previewUrl` comes from the
 *    Host media route, `relativePath` is the absolute file path only for the
 *    `@` reference.
 *
 * Mounting targets the *active* session (`addAttachment('')`), which is what the
 * assets plugin already does. This is deliberately not the "one-click replicate"
 * path: that one starts a new session and prefills a prompt, while this one puts
 * a reference in the conversation the user is already having.
 */

import { ensureRivalPostMedia } from './rival-api.js'

/** Module-level inflight lock: a second click while the first is running is refused. */
let attachInflight = null

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T | { ok: false, error: 'busy' }>}
 */
export function runExclusive(fn) {
  if (attachInflight) return Promise.resolve({ ok: false, error: 'busy' })
  const work = Promise.resolve().then(fn).finally(() => {
    if (attachInflight === work) attachInflight = null
  })
  attachInflight = work
  return work
}

export function isAddToChatBusy() {
  return attachInflight != null
}

/** Test-only: drop the inflight handle so cases start from idle. */
export function resetAddToChatLock() {
  attachInflight = null
}

/**
 * Attachment payload of a rival post.
 *
 * Exported so the shape is asserted without a DOM: the kind, the entity id (the
 * fingerprint key) and the `relativePath`/`previewUrl` split are the contract.
 * @param {Record<string, any>} post
 * @param {{ localPath: string, httpUrl?: string, kind?: 'cover' | 'video', duration?: number | null }} media
 * @param {Record<string, any>} [account]
 */
export function buildRivalAttachmentPayload(post, media, account = {}) {
  const usingVideo = media.kind === 'video'
  const duration = usingVideo
    ? (typeof media.duration === 'number' ? media.duration : post?.duration)
    : null
  return {
    sourcePlugin: 'omnimux-inspiration',
    kind: 'rival_post',
    entityId: String(post?.id || ''),
    title: String(post?.title || post?.text || post?.url || post?.id || ''),
    extension: usingVideo ? 'MP4' : 'JPG',
    // The `@` reference must point at a real file; the renderer uses previewUrl.
    relativePath: media.localPath,
    previewUrl: media.httpUrl || '',
    ...(typeof duration === 'number' && duration > 0 ? { duration } : {}),
    metadata: {
      rival_post_id: String(post?.id || ''),
      rival_account_id: String(account?.id || ''),
      platform: String(account?.platform || ''),
      stats: post?.stats || {},
      source_url: String(post?.url || ''),
      text: String(post?.text || ''),
      cover_http_url: media.httpUrl || '',
      media_mode: usingVideo ? 'video' : 'cover',
    },
  }
}

/**
 * Whether the post already carries a local file we can reuse.
 * @param {Record<string, any>} post
 * @param {'cover' | 'video'} kind
 * @returns {string}
 */
export function localMediaPath(post, kind) {
  const value = kind === 'video' ? post?.video_local_path : post?.cover_local_path
  return typeof value === 'string' ? value : ''
}

/**
 * Reveal the conversation column: exit host fullscreen + uncollapse + split.
 *
 * The host right-sidebar fullscreen state lives outside the plugin collapse key:
 * in fullscreen the collapse key is already `false`, so the old collapse/focus
 * pair did nothing and the user saw "clicked, nothing happened". The official
 * `ensureConversationVisible()` is the one entry that also exits host fullscreen;
 * it is preferred, with the legacy pair kept as a fallback for older hosts.
 * A reveal failure must never undo a successful attachment.
 * @param {{ ensureConversationVisible?: Function, setConversationCollapsed?: Function, setFocus?: Function } | undefined} workbench
 * @param {Window | undefined} [windowObject]
 */
export function revealConversation(workbench, windowObject) {
  const wb = workbench || windowObject?.__omnimuxWorkbench
  if (!wb) return
  const revealOnce = () => {
    if (typeof wb.ensureConversationVisible === 'function') {
      try {
        wb.ensureConversationVisible()
        return
      } catch (error) {
        console.warn('omnimux-inspiration: ensureConversationVisible failed; falling back to collapse+split', error)
      }
    }
    try {
      if (typeof wb.setConversationCollapsed === 'function') wb.setConversationCollapsed(false)
    } catch (error) {
      console.warn('omnimux-inspiration: setConversationCollapsed failed during reveal', error)
    }
    try {
      if (typeof wb.setFocus === 'function') wb.setFocus('split')
    } catch (error) {
      console.warn('omnimux-inspiration: setFocus failed during reveal', error)
    }
  }
  revealOnce()
  if (typeof setTimeout === 'function') {
    setTimeout(revealOnce, 0)
    setTimeout(revealOnce, 50)
  }
}

/**
 * @param {Window | undefined} win
 */
function workbenchFrom(win) {
  if (win && win.__omnimuxWorkbench) return win.__omnimuxWorkbench
  if (typeof window !== 'undefined' && window.__omnimuxWorkbench) return window.__omnimuxWorkbench
  return undefined
}

/**
 * @param {Window | undefined} win
 */
function attachmentsFrom(win) {
  if (win && win.__omnimuxAttachments) return win.__omnimuxAttachments
  if (typeof window !== 'undefined' && window.__omnimuxAttachments) return window.__omnimuxAttachments
  return undefined
}

/**
 * Map an attachment-store refusal to the locale key the panel shows.
 * @param {unknown} reason
 * @returns {string}
 */
export function attachFailureKey(reason) {
  if (reason === 'duplicate') return 'rivalAccounts.post.alreadyInChat'
  if (reason === 'quota-exceeded' || reason === 'attach-full') return 'rivalAccounts.post.attachFull'
  return 'rivalAccounts.post.attachFailed'
}

/**
 * Add one post to the current session.
 *
 * @param {Record<string, any>} post
 * @param {Record<string, any>} account
 * @param {{
 *   preferVideo?: boolean,
 *   window?: Window,
 *   ensureMedia?: Function,
 *   addAttachment?: Function,
 *   reveal?: Function,
 *   onStatus?: (key: string | null) => void,
 * }} [io]
 * @returns {Promise<{ ok: boolean, error?: string, reason?: string, key?: string, attachment?: object }>}
 */
export async function addRivalPostToSession(post, account, io = {}) {
  const onStatus = typeof io.onStatus === 'function' ? io.onStatus : () => {}
  if (isAddToChatBusy()) return { ok: false, error: 'busy' }

  return runExclusive(async () => {
    const win = io.window ?? (typeof window !== 'undefined' ? window : undefined)
    const ensureMedia = typeof io.ensureMedia === 'function' ? io.ensureMedia : ensureRivalPostMedia
    const store = attachmentsFrom(win)
    const addAttachment = typeof io.addAttachment === 'function'
      ? io.addAttachment
      : (sessionId, payload) => {
        if (!store || typeof store.addAttachment !== 'function') return { ok: false, reason: 'invalid-payload' }
        return store.addAttachment(sessionId, payload)
      }
    const reveal = typeof io.reveal === 'function' ? io.reveal : () => revealConversation(workbenchFrom(win), win)

    const wantVideo = io.preferVideo === true
    let media
    const cachedVideo = localMediaPath(post, 'video')
    const cachedCover = localMediaPath(post, 'cover')
    if (wantVideo && cachedVideo) {
      media = { localPath: cachedVideo, httpUrl: post.cover_http_url || '', kind: 'video', duration: post.duration }
    } else if (!wantVideo && cachedCover) {
      media = { localPath: cachedCover, httpUrl: post.cover_http_url || '', kind: 'cover' }
    } else {
      const wanted = wantVideo ? 'video' : 'cover'
      let ensured
      try {
        ensured = await ensureMedia(account.id, post.id, wanted)
      } catch {
        onStatus('rivalAccounts.post.attachFailed')
        return { ok: false, error: 'media-failed', key: 'rivalAccounts.post.attachFailed' }
      }
      const data = ensured?.body?.data
      if (!ensured?.ok || !data?.absolute_path) {
        // A post with no downloadable media has one honest answer, and the panel
        // points the user at "convert to inspiration" instead.
        const key = ensured?.body?.code === 'no-media'
          ? 'rivalAccounts.post.noMedia'
          : 'rivalAccounts.post.attachFailed'
        onStatus(key)
        return { ok: false, error: ensured?.body?.code || 'media-failed', key }
      }
      media = {
        localPath: data.absolute_path,
        httpUrl: data.http_url || '',
        kind: data.kind === 'video' ? 'video' : 'cover',
        duration: data.duration,
      }
    }

    const payload = buildRivalAttachmentPayload(post, media, account)
    const attached = await addAttachment('', payload)
    if (!attached || attached.ok !== true) {
      const key = attachFailureKey(attached?.reason)
      onStatus(key)
      return { ok: false, error: attached?.reason || 'attach-failed', key }
    }

    // Reveal only after the attachment landed: a failed mount must not move the
    // user's layout.
    reveal()
    onStatus(null)
    return { ok: true, attachment: payload, duplicate: Boolean(attached.duplicate) }
  })
}
