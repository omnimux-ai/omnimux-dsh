const STORAGE_PREFIX = 'omnimux:composer-add:client-action-runtime:'
const delivered = new Set()

/**
 * Show the local runtime-update notice once for a Host build identity.
 * Storage is best-effort; the in-memory set keeps the bound if storage is
 * disabled by the Host.
 *
 * @param {{ build?: unknown, storage?: Storage | (() => Storage | undefined), notify: () => void }} options
 */
export function notifyClientActionRuntimeUpdateOnce({ build, storage, notify }) {
  const identity = typeof build === 'string' && build ? build : 'origin'
  const key = `${STORAGE_PREFIX}${identity}`
  if (delivered.has(key)) return false
  try {
    const resolvedStorage = typeof storage === 'function' ? storage() : storage
    if (resolvedStorage?.getItem(key) === '1') {
      delivered.add(key)
      return false
    }
    resolvedStorage?.setItem(key, '1')
  } catch {
    // Private or restricted storage still gets one in-memory notification.
  }
  delivered.add(key)
  notify()
  return true
}

export function resetClientActionRuntimeNoticesForTests() {
  delivered.clear()
}
