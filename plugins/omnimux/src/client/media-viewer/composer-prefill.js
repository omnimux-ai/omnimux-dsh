/**
 * One-shot prompt handoff from a chat prompt card into the image/video composer.
 * The click fills the box and switches image or video. It never starts generation.
 *
 * The chat card (omnimux) writes and the composer (omnimux-viewer) reads, and each
 * plugin bundles its own copy of this file. The queue therefore lives on the host
 * window, so both copies see one request.
 */

const KIND = {
  image: 'image',
  video: 'video',
}

const STORE_KEY = '__omnimuxComposerPrefill'

function store() {
  const host = typeof window !== 'undefined' ? window : globalThis
  let shared = host[STORE_KEY]
  if (!shared || typeof shared !== 'object' || !(shared.listeners instanceof Set)) {
    shared = { pending: null, listeners: new Set() }
    host[STORE_KEY] = shared
  }
  return shared
}

export function queueComposerPrefill({ prompt, kind, token = `${Date.now()}` } = {}) {
  const text = typeof prompt === 'string' ? prompt : ''
  const mode = kind === KIND.video ? KIND.video : KIND.image
  if (!text.trim()) return null
  const shared = store()
  shared.pending = { prompt: text, kind: mode, token: String(token) }
  notify()
  return shared.pending
}

export function peekComposerPrefill() {
  return store().pending
}

function notify() {
  const shared = store()
  for (const listener of shared.listeners) {
    try { listener(shared.pending) } catch { /* a closed page must not drop the request */ }
  }
}

export function takeComposerPrefill(token) {
  const shared = store()
  if (!shared.pending) return null
  if (token != null && shared.pending.token !== String(token)) return null
  const current = shared.pending
  shared.pending = null
  notify()
  return current
}

export function subscribeComposerPrefill(listener) {
  const { listeners } = store()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resetComposerPrefill() {
  const shared = store()
  if (!shared.pending) return
  shared.pending = null
  notify()
}
