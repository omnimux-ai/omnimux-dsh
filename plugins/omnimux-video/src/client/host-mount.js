/**
 * Host-container mount for the generation panel.
 *
 * The Clip editor renders an empty container marked with
 * `data-omnimux-host="clip.editor.generate"` and nothing else. The generation
 * surface belongs to this plugin and mounts itself into that container, so
 * neither plugin imports the other: the editor still works when this plugin is
 * absent, and this plugin can report a readable state instead of rendering
 * into nowhere when the editor is absent.
 *
 * The container is rebuilt whenever the editor remounts (tab reopened, project
 * switched), so the mount is re-established on DOM changes rather than once.
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'

export const GENERATE_HOST_ATTR = 'data-omnimux-host'
export const GENERATE_HOST_NAME = 'clip.editor.generate'
export const GENERATE_HOST_SELECTOR = `[${GENERATE_HOST_ATTR}="${GENERATE_HOST_NAME}"]`

/**
 * Locate the editor's generation column container.
 * @param {Document} [doc]
 * @returns {Element | null}
 */
export function findGenerateHost(doc = globalThis.document) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  return doc.querySelector(GENERATE_HOST_SELECTOR)
}

/**
 * Mount the generation panel into the Clip editor's left column and keep it in
 * sync with the container's lifetime.
 *
 * The panel component is passed in rather than imported so this module stays a
 * plain lifetime manager: the entry supplies the surface, and the mount rules
 * stay testable without a renderer.
 *
 * @param {{ document?: Document, layout?: object, component?: Function, variant?: string }} [options]
 * @returns {() => void} disposer that unmounts the panel and stops observing
 */
export function mountGeneratePanel(options = {}) {
  const doc = options.document ?? globalThis.document
  const { layout, component } = options
  const variant = options.variant ?? 'panel'
  const createRootImpl = options.createRoot ?? createRoot
  if (typeof component !== 'function') return () => {}
  if (typeof createRootImpl !== 'function') return () => {}
  if (!doc || typeof doc.querySelector !== 'function') return () => {}

  let host = null
  let root = null
  let disposed = false

  const unmount = () => {
    const current = root
    root = null
    host = null
    if (!current) return
    try {
      current.unmount()
    } catch (err) {
      if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
        console.warn('[omnimux-video] Failed to unmount generation panel:', err)
      }
    }
  }

  const sync = () => {
    if (disposed) return
    const next = findGenerateHost(doc)
    if (next === host && root) return
    if (host) unmount()
    if (!next) return
    host = next
    root = createRootImpl(next)
    root.render(createElement(component, {
      variant,
      visible: true,
      layout,
    }))
  }

  const observer = typeof MutationObserver === 'function'
    ? new MutationObserver(() => sync())
    : null
  if (observer) {
    observer.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true })
  }
  sync()

  return () => {
    disposed = true
    if (observer) observer.disconnect()
    unmount()
  }
}
