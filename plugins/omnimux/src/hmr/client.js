const REBUILT_EVENT = 'omnimux:hmr:rebuilt'
const STATE_KEY = Symbol.for('omnimux.hmr.state')

/**
 * Serial plugin replacement using the installed Loader and module services.
 * The unload order follows dsh-client-hmr at the repository's Harness pin.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{subscribe: Function}} events
 * @param {Document} document
 */
export function installWebSocketHmr(ctx, events, document, options = {}) {
  const target = document.defaultView
  const fetchSnapshot = options.fetch ?? target.fetch.bind(target)
  const reloadPage = options.reloadPage ?? (() => target.location.reload())
  if (target[STATE_KEY]?.modules !== ctx.modules) {
    target[STATE_KEY] = {
      modules: ctx.modules,
      revisions: new Map(ctx.modules.manifest.modules.map(({ id, rev }) => [id, rev])),
      queue: Promise.resolve(),
      epoch: null,
    }
  }
  // State outlives the hub fiber so its own rebuild cannot restart from boot revisions.
  const state = target[STATE_KEY]
  let disposed = false
  let snapshotRequest = null
  const notifications = new Map()

  async function reload(id, rev) {
    if (disposed || state.revisions.get(id) === rev) return
    const entry = [...ctx.loader.entries()].find(row => row.options.name === id)
    if (!entry) throw new Error(`HMR entry is not loaded: ${id}`)

    ctx.modules.invalidate(id, rev)
    state.revisions.delete(id)
    await ctx.modules.prefetch(id)
    // Unmount during prefetch must not tear down another plugin afterwards.
    if (disposed) return
    const oldFiber = entry.fiber
    if (oldFiber) {
      if (oldFiber.runtime !== null) ctx.registry.delete(oldFiber.runtime.callback)
      while (oldFiber.inertia !== undefined) await oldFiber.inertia
      delete entry.fiber
    }
    for (const style of document.querySelectorAll('style[data-plugin]')) {
      if (style.getAttribute('data-plugin') === id) style.remove()
    }
    await entry.refresh()
    if (!entry.fiber) throw new Error(`HMR entry failed to materialize: ${id}`)
    await entry.fiber.await()
    state.revisions.set(id, rev)
  }

  function enqueue(payload) {
    if (!payload || typeof payload.id !== 'string' || typeof payload.rev !== 'string') {
      ctx.logger.warn('omnimux: invalid HMR notification')
      return
    }
    state.queue = state.queue.then(() => reload(payload.id, payload.rev)).catch(error => {
      ctx.logger.error(`omnimux: HMR reload failed for ${payload.id}`)
      ctx.logger.error(error)
    })
  }
  async function reconcile() {
    snapshotRequest?.abort()
    const request = new AbortController()
    snapshotRequest = request
    const observed = new Map(notifications)
    const timer = setTimeout(() => request.abort(), 5000)
    try {
      const response = await fetchSnapshot('/omnimux/hmr/revisions', { signal: request.signal })
      if (!response.ok) throw new Error(`HMR snapshot HTTP ${response.status}`)
      const snapshot = await response.json()
      if (disposed || snapshotRequest !== request) return
      if (typeof snapshot.epoch !== 'string' || !Array.isArray(snapshot.entries)
        || snapshot.entries.some(row => typeof row?.id !== 'string' || typeof row?.rev !== 'string')) {
        throw new Error('Invalid HMR revision snapshot')
      }
      if (state.epoch !== null && state.epoch !== snapshot.epoch) {
        // Host startup assigns new opaque revisions to all modules, including boot modules.
        reloadPage()
        return
      }
      state.epoch = snapshot.epoch
      for (const row of snapshot.entries) {
        if (notifications.get(row.id) === observed.get(row.id)) enqueue(row)
      }
    } catch (error) {
      if (!disposed && snapshotRequest === request) ctx.logger.error(error)
    } finally {
      clearTimeout(timer)
      if (snapshotRequest === request) snapshotRequest = null
    }
  }
  const unsubscribe = events.subscribe(REBUILT_EVENT, ({ payload }) => {
    if (typeof payload?.id === 'string') notifications.set(payload.id, (notifications.get(payload.id) ?? 0) + 1)
    enqueue(payload)
  })
  const unsubscribeConnected = events.subscribe('omnimux:connected', () => { void reconcile() })
  if (events.isHealthy()) void reconcile()
  return () => {
    disposed = true
    unsubscribe()
    unsubscribeConnected()
    snapshotRequest?.abort()
  }
}
