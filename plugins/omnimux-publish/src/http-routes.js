/** Official webServer routes; domain operations live in the shared dispatcher. */
import { PublishError } from './publish-error.js'
import { STATUS_BY_CODE, sendJson, readJsonBody, readRawBody, assertLocalWrite, header, messageOf } from './http-helpers.js'
export { createPublishDispatcher } from './publish-dispatcher.js'
export { sendJson, readJsonBody, readRawBody, assertLocalWrite } from './http-helpers.js'

/** @param {string} pathname */
function extractSubPath(pathname) {
  if (pathname.startsWith('/omnimux/publish')) return pathname.slice('/omnimux/publish'.length) || '/'
  if (pathname.startsWith('/dsh-publish')) return pathname.slice('/dsh-publish'.length) || '/'
  return pathname
}

/**
 * Mount primary and existing legacy prefixes on the official webServer seat.
 * @param {import('./http-helpers.js').WebServer} webServer
 * @param {ReturnType<typeof import('./publish-dispatcher.js').createPublishDispatcher>} dispatcher
 * @returns {() => void}
 */
export function registerPublishRoutes(webServer, dispatcher) {
  /** @type {import('./http-helpers.js').RouteHandler} */
  const handler = async (req, res) => {
    try {
      const method = (req.method || 'GET').toUpperCase()
      const url = new URL(req.url || '/omnimux/publish/state', 'http://127.0.0.1')
      const subPath = extractSubPath(url.pathname)
      if (method === 'POST') {
        try {
          assertLocalWrite({ origin: header(req, 'origin'), referer: header(req, 'referer'), secFetchSite: header(req, 'sec-fetch-site') })
        } catch {
          sendJson(res, 403, { error: 'not-local', message: 'cross-origin write refused' })
          return
        }
      }
      if (method === 'GET' && subPath === '/state') {
        const revRaw = url.searchParams.get('rev')
        sendJson(res, 200, dispatcher.state(revRaw == null || revRaw === '' ? NaN : Number(revRaw)))
        return
      }
      if (method === 'GET' && subPath === '/records') {
        sendJson(res, 200, dispatcher.listRecords({
          status_filter: url.searchParams.get('status') || 'all', type: url.searchParams.get('type') || '',
          page: Number(url.searchParams.get('page')) || 1,
        }))
        return
      }
      if (method === 'GET' && subPath === '/records/detail') {
        sendJson(res, 200, await dispatcher.getRecord({ record_id: url.searchParams.get('id') || '', refresh: false }))
        return
      }
      if (method === 'GET' && subPath === '/capabilities') {
        sendJson(res, 200, dispatcher.capabilities())
        return
      }
      if (method === 'GET' && subPath === '/media/content') {
        try {
          const { buffer, meta } = dispatcher.openMedia(url.searchParams.get('id') || '')
          res.writeHead(200, {
            'Content-Type': String(meta.content_type || 'application/octet-stream'),
            'Content-Length': String(buffer.length), 'Cache-Control': 'private, max-age=86400',
          })
          res.end(buffer)
        } catch (error) {
          if (error instanceof PublishError) sendJson(res, STATUS_BY_CODE[error.code] ?? 404, { error: error.code, message: error.message })
          else sendJson(res, 500, { error: 'internal', message: messageOf(error) })
        }
        return
      }
      if (method === 'POST' && subPath === '/media') {
        const buffer = await readRawBody(req)
        sendJson(res, 200, dispatcher.importMedia(buffer, {
          filename: url.searchParams.get('filename') || undefined, content_type: header(req, 'content-type') || undefined,
        }))
        return
      }
      const body = await readJsonBody(req)
      if (body === null) {
        sendJson(res, 400, { error: 'invalid-json', message: 'request body is not valid JSON' })
        return
      }
      if (typeof body !== 'object' || Array.isArray(body)) {
        sendJson(res, 400, { error: 'invalid-json', message: 'request body must be a JSON object' })
        return
      }
      const json = /** @type {Record<string, unknown>} */ (body)
      if (method === 'POST' && subPath === '/drafts') {
        sendJson(res, 200, await dispatcher.createDraft({
          type: json.type, payload: json.payload, account_ids: Array.isArray(json.account_ids) ? json.account_ids : undefined,
        }))
        return
      }
      if (method === 'POST' && subPath === '/drafts/update') {
        sendJson(res, 200, await dispatcher.updateDraft({ draft_id: String(json.draft_id || json.id || ''), patch: json.patch }))
        return
      }
      if (method === 'POST' && subPath === '/drafts/delete') {
        sendJson(res, 200, dispatcher.deleteDraft({ draft_id: String(json.draft_id || json.id || ''), confirm: json.confirm === true }))
        return
      }
      if (method === 'POST' && subPath === '/records/submit') {
        const recordId = String(json.record_id || json.id || '')
        // Validation errors are returned before dispatch starts in the background.
        await dispatcher.submitPrepare({ record_id: recordId })
        dispatcher.submitDispatch({ record_id: recordId }).catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          try {
            dispatcher.setRecordError(recordId, `submit runner failed: ${message}`)
          } catch {
            console.error('[omnimux-publish] submit runner failed without a ledger row:', message)
          }
        })
        sendJson(res, 200, { started: true, record_id: recordId })
        return
      }
      if (method === 'POST' && subPath === '/records/refresh') {
        sendJson(res, 200, await dispatcher.getRecord({ record_id: String(json.record_id || json.id || ''), refresh: true }))
        return
      }
      if (method === 'POST' && subPath === '/tasks/retry') {
        sendJson(res, 200, await dispatcher.retryTask({ task_id: String(json.task_id || json.id || '') }))
        return
      }
      sendJson(res, 404, { error: 'not-found', message: 'unknown route' })
    } catch (error) {
      if (error instanceof PublishError) {
        sendJson(res, STATUS_BY_CODE[error.code] ?? 500, {
          error: error.code, message: error.message, ...(error.details ? { details: error.details } : {}),
        })
        return
      }
      sendJson(res, 500, { error: 'internal', message: messageOf(error) })
    }
  }
  const disposePrimary = webServer.register({ kind: 'prefix', path: '/omnimux/publish', handler })
  const disposeLegacy = webServer.register({ kind: 'prefix', path: '/dsh-publish', handler })
  return () => { disposePrimary?.(); disposeLegacy?.() }
}
