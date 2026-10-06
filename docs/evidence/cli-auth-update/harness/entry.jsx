/**
 * Real-browser acceptance harness for Issue #3178 (本机 CLI 登录态 + 版本更新).
 *
 * Mounts the REAL `RuntimeModeSection` (the "本机 CLI" settings card) from
 * `plugins/omnimux/src/client/RuntimeModeSection.jsx` — no copy, no re-implementation.
 * The panel's own `api()` helper calls the global `fetch`, so the harness server
 * answers the four contract routes over real HTTP (see server.mjs).
 *
 * Harness-only concerns kept here: the `t` translator (the host supplies this in
 * production), a scope stub, the real HUB_CSS, and a console-error recorder.
 */
import { createRoot } from 'react-dom/client'
import { RuntimeModeSection } from '../../../../plugins/omnimux/src/client/RuntimeModeSection.jsx'
import { zh } from '../../../../plugins/omnimux/src/client/locales.js'
import { HUB_CSS } from '../../../../plugins/omnimux/src/client/styles.js'

/* ---- console error recorder (assertion: no console errors during render) ---- */
const consoleErrors = []
window.__consoleErrors = consoleErrors
const nativeError = console.error.bind(console)
console.error = (...args) => {
  consoleErrors.push(args.map((a) => (a && a.stack ? a.stack : String(a))).join(' '))
  nativeError(...args)
}
const onWindowError = (e) => {
  consoleErrors.push(`window.error: ${e.message || String(e.error)}`)
}
const onUnhandledRejection = (e) => {
  consoleErrors.push(`unhandledrejection: ${String(e.reason)}`)
}
window.addEventListener('error', onWindowError)
window.addEventListener('unhandledrejection', onUnhandledRejection)
/** Detach both capture listeners; exposed so the harness owns no global state after teardown. */
window.__teardownErrorCapture = () => {
  window.removeEventListener('error', onWindowError)
  window.removeEventListener('unhandledrejection', onUnhandledRejection)
}

/* ---- real hub stylesheet ---- */
const style = document.createElement('style')
style.setAttribute('data-harness', 'hub-css')
style.textContent = HUB_CSS
document.head.appendChild(style)

/* ---- translator: real zh dictionary, real {param} interpolation ---- */
function t(key, params) {
  let text = zh[key]
  if (typeof text !== 'string') text = key
  if (params && typeof params === 'object') {
    text = text.replace(/\{(\w+)\}/g, (match, name) =>
      params[name] === undefined ? match : String(params[name]))
  }
  return text
}

/* ---- settings-seat scope stub (no persistence in a standalone harness) ----
 * `getSnapshot` MUST return a referentially stable object between changes:
 * useSyncExternalStore re-renders forever if it returns a fresh object each
 * call (React error #185, maximum update depth exceeded). */
let scopeValue = {}
let snapshot = { status: 'ready', value: scopeValue, writable: true }
const listeners = new Set()
const scope = {
  getSnapshot: () => snapshot,
  subscribe: (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  set: async (field, next) => {
    scopeValue = { ...scopeValue, [field]: next }
    snapshot = { status: 'ready', value: scopeValue, writable: true }
    listeners.forEach((listener) => listener())
  },
}

window.__harnessReady = false
createRoot(document.getElementById('root')).render(
  <RuntimeModeSection t={t} scope={scope} />,
)
window.__harnessReady = true
