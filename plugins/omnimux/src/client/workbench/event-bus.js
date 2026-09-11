/**
 * Workbench Event Bus & Store Attachment.
 * Manages listeners, notifications, store reference counts, and host state subscriptions.
 */

/** @type {Set<() => void>} */
const listeners = new Set()

/** @type {WeakMap<object, number>} */
const attachCounts = new WeakMap()

/**
 * Emit change event to all registered workbench listeners.
 */
export function notifyWorkbenchChange() {
  for (const listener of listeners) {
    try {
      listener()
    } catch (err) {
      console.error('[omnimux-workbench] listener error:', err)
    }
  }
}

/**
 * Subscribe a callback to workbench state changes.
 * @param {() => void} listener
 * @returns {() => void} unregister function
 */
export function subscribeWorkbench(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Clear all registered listeners (test-only).
 */
export function resetWorkbenchListeners() {
  listeners.clear()
}

/**
 * Track store attachment count.
 * @param {object} store
 * @returns {number} incremented count
 */
export function incrementAttachCount(store) {
  if (!store) return 0
  const next = (attachCounts.get(store) || 0) + 1
  attachCounts.set(store, next)
  return next
}

/**
 * Decrement store attachment count.
 * @param {object} store
 * @returns {number} remaining count
 */
export function decrementAttachCount(store) {
  if (!store) return 0
  const remaining = Math.max(0, (attachCounts.get(store) || 1) - 1)
  if (remaining === 0) {
    attachCounts.delete(store)
  } else {
    attachCounts.set(store, remaining)
  }
  return remaining
}
