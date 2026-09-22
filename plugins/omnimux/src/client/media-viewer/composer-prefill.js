/**
 * One-shot prompt handoff from a chat prompt card into the image/video composer.
 * The click fills the box and switches image or video. It never starts generation.
 */

const KIND = {
  image: 'image',
  video: 'video',
}

let pending = null
const listeners = new Set()

export function queueComposerPrefill({ prompt, kind, token = `${Date.now()}` } = {}) {
  const text = typeof prompt === 'string' ? prompt : ''
  const mode = kind === KIND.video ? KIND.video : KIND.image
  if (!text.trim()) return null
  pending = { prompt: text, kind: mode, token: String(token) }
  for (const listener of listeners) {
    try { listener(pending) } catch { /* a closed page must not drop the request */ }
  }
  return pending
}

export function peekComposerPrefill() {
  return pending
}

export function takeComposerPrefill(token) {
  if (!pending) return null
  if (token != null && pending.token !== String(token)) return null
  const current = pending
  pending = null
  return current
}

export function subscribeComposerPrefill(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resetComposerPrefill() {
  pending = null
}
