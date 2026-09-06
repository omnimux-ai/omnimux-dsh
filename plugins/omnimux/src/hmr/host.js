import { randomUUID } from 'node:crypto'
import { isLocalRequest } from '../workbench/http-routes.js'

export const REBUILT_EVENT = 'omnimux:hmr:rebuilt'
export const SNAPSHOT_PATH = '/omnimux/hmr/revisions'

/**
 * Keep the official watcher and publish its notifications on the hub socket.
 * The profile must disable the official client-hmr row so no EventSource opens.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {ReturnType<import('../events/hub-event-bus.js').createHubEventBus>} hubEvents
 * @param {Function} applyWatcher Official dsh-client-hmr public apply export.
 */
export function mountWebSocketHmr(ctx, hubEvents, applyWatcher) {
  if (ctx.clientModules.graph().entries.some(row => row.id === '@deepseek-ai/dsh-client-hmr')) {
    throw new Error('WebSocket HMR requires the official client-hmr row to be disabled')
  }
  const epoch = randomUUID()
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: SNAPSHOT_PATH,
    handler(req, res) {
      const rejection = ctx.connection.requestRejection(req) ?? (isLocalRequest(req) ? undefined : 403)
      if (rejection !== undefined) {
        res.writeHead(rejection)
        res.end()
        return
      }
      if (req.method !== 'GET') {
        res.writeHead(405)
        res.end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ epoch, entries: ctx.clientModules.graph().entries.map(({ id, rev }) => ({ id, rev })) }))
    },
  }), 'omnimux: HMR revision snapshot')
  ctx.effect(() => ctx.clientModules.onRebuilt((id, rev) => {
    hubEvents.emit({ type: REBUILT_EVENT, payload: { id, rev } })
  }), 'omnimux: HMR notifications')
  // Defaults are explicit because direct apply does not run Cordis Config parsing.
  applyWatcher(ctx, { pollIntervalMs: 500 })
}
