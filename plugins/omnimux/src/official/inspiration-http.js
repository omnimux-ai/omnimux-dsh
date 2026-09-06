import { sendJson, readJsonBody } from '../auth/http-routes.js'
import { DEFAULT_SITE, resolveSiteBaseUrl } from '../auth/omnimux-auth.js'
import { assertLocalWrite } from '../apps/origin.js'
import { OmnimuxError } from '../media/errors.js'
import { mapOfficialError } from './http-routes.js'
import { createOfficialClient } from './client.js'
import { parseOfficialConfig } from './config.js'
import {
  createInspiration,
  deleteInspiration,
  getInspiration,
  inspirationStatus,
  listInspirations,
  listTags,
  mediaKeyFromHostPath,
  rewriteMediaUrlsForHost,
  updateInspiration,
  uploadMedia,
} from './inspiration.js'

const PREFIX = '/omnimux/inspiration'
const SITE_MEDIA = '/api/inspiration/v1/media/'

function queryRecord(url) {
  /** @type {Record<string, unknown>} */
  const query = {}
  for (const [key, value] of url.searchParams.entries()) query[key] = value
  return query
}

function mapError(error) {
  const mapped = mapOfficialError(error)
  if (mapped.status !== 502) return mapped
  const status = error instanceof OmnimuxError && typeof error.status === 'number' ? error.status : 0
  if (status >= 400 && status < 500) return { status, body: { error: error instanceof Error ? error.message : String(error) } }
  return mapped
}

/**
 * @param {{
 *   official?: { mount: boolean },
 *   identity?: { require: Function },
 *   store?: { resolve: () => Promise<string | undefined> },
 *   siteBaseUrl?: string,
 *   env?: NodeJS.ProcessEnv,
 *   fetcher?: typeof fetch,
 *   client?: { withPat: Function, withPatRaw?: Function },
 * }} [deps]
 */
export function createInspirationDispatcher(deps = {}) {
  const env = deps.env ?? process.env
  const official = deps.official ?? parseOfficialConfig(undefined)
  const siteBaseUrl = resolveSiteBaseUrl(deps.siteBaseUrl || env.OMNIMUX_SITE_URL || DEFAULT_SITE)
  const client = deps.client ?? createOfficialClient({
    fetcher: deps.fetcher,
    siteBaseUrl,
    apiBaseUrl: (env.OMNIMUX_BASE_URL || 'https://api.omnimux.ai/v1').replace(/\/v1\/?$/, ''),
    resolveApiKey: () => env.OMNIMUX_API_KEY || env.OMNIMUX_TOKEN,
    async resolveAccess() {
      if (!deps.identity || typeof deps.identity.require !== 'function') {
        throw new OmnimuxError('needs-omnimux', 'sign in to OmniMux or set OMNIMUX_ACCESS_TOKEN')
      }
      const profile = await deps.identity.require()
      const token = await deps.store?.resolve()
      if (!token) {
        throw new OmnimuxError('needs-omnimux', 'sign in to OmniMux or set OMNIMUX_ACCESS_TOKEN')
      }
      return { token, userId: profile.id }
    },
  })

  /**
   * @param {{ method: string, url: string, body?: unknown, origin?: string, referer?: string, secFetchSite?: string }} req
   */
  async function dispatch(req) {
    if (!official.mount) return { status: 404, body: { error: 'not found' } }
    const url = new URL(req.url, 'http://127.0.0.1')
    const method = req.method.toUpperCase()
    const path = url.pathname
    if (path.startsWith(`${PREFIX}/media/`)) {
      return { status: 404, body: { error: 'use stream' } }
    }
    if (method !== 'GET') {
      try {
        assertLocalWrite(req)
      } catch (error) {
        return { status: 403, body: { error: error instanceof Error ? error.message : String(error) } }
      }
    }
    try {
      if (method === 'GET' && path === `${PREFIX}/status`) {
        return { status: 200, body: rewriteMediaUrlsForHost(await inspirationStatus(client)) }
      }
      if (method === 'GET' && path === `${PREFIX}/tags`) {
        return { status: 200, body: rewriteMediaUrlsForHost(await listTags(client)) }
      }
      if (method === 'GET' && path === PREFIX) {
        return { status: 200, body: rewriteMediaUrlsForHost(await listInspirations(client, queryRecord(url))) }
      }
      if (method === 'POST' && path === PREFIX) {
        const body = req.body && typeof req.body === 'object' ? /** @type {Record<string, unknown>} */ (req.body) : {}
        return { status: 200, body: rewriteMediaUrlsForHost(await createInspiration(client, body)) }
      }
      if (method === 'POST' && path === `${PREFIX}/media`) {
        const body = req.body && typeof req.body === 'object' ? /** @type {Record<string, unknown>} */ (req.body) : {}
        return { status: 200, body: rewriteMediaUrlsForHost(await uploadMedia(client, body)) }
      }
      if (path.startsWith(`${PREFIX}/`) && path !== PREFIX) {
        const id = decodeURIComponent(path.slice(`${PREFIX}/`.length))
        if (!id || id.includes('/')) return { status: 404, body: { error: 'not found' } }
        if (method === 'GET') {
          return { status: 200, body: rewriteMediaUrlsForHost(await getInspiration(client, { id })) }
        }
        if (method === 'PATCH') {
          const body = req.body && typeof req.body === 'object' ? /** @type {Record<string, unknown>} */ (req.body) : {}
          return { status: 200, body: rewriteMediaUrlsForHost(await updateInspiration(client, { id, ...body })) }
        }
        if (method === 'DELETE') {
          return { status: 200, body: rewriteMediaUrlsForHost(await deleteInspiration(client, { id })) }
        }
      }
    } catch (error) {
      return mapError(error)
    }
    return { status: 404, body: { error: 'not found' } }
  }

  /**
   * Pipe a media object through Host so the vertical never talks to the cloud.
   * @param {{ method?: string, url?: string, headers?: Record<string, string | string[] | undefined> }} req
   * @param {import('node:http').ServerResponse} res
   */
  async function streamMedia(req, res) {
    if (!official.mount) {
      sendJson(res, 404, { error: 'not found' })
      return
    }
    const url = new URL(req.url || PREFIX, 'http://127.0.0.1')
    const key = mediaKeyFromHostPath(url.pathname)
    if (!key || key.includes('..')) {
      sendJson(res, 400, { error: 'invalid media key' })
      return
    }
    if ((req.method || 'GET').toUpperCase() !== 'GET') {
      sendJson(res, 405, { error: 'method not allowed' })
      return
    }
    if (typeof client.withPatRaw !== 'function') {
      sendJson(res, 502, { error: 'media stream unavailable' })
      return
    }
    try {
      const range = header(req, 'range')
      const ifRange = header(req, 'if-range')
      const upstream = await client.withPatRaw(
        `${SITE_MEDIA}${key}${url.search}`,
        { headers: { ...(range ? { range } : {}), ...(ifRange ? { 'if-range': ifRange } : {}) } },
      )
      /** @type {Record<string, string>} */
      const outHeaders = {}
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'etag', 'last-modified']) {
        const value = typeof upstream.headers?.get === 'function' ? upstream.headers.get(name) : undefined
        if (value) outHeaders[name] = value
      }
      res.writeHead(upstream.status || 200, outHeaders)
      if (upstream.body && typeof upstream.body.getReader === 'function') {
        const { Readable } = await import('node:stream')
        Readable.fromWeb(/** @type {any} */ (upstream.body)).pipe(res)
        return
      }
      if (typeof upstream.arrayBuffer === 'function') {
        res.end(Buffer.from(await upstream.arrayBuffer()))
        return
      }
      res.end()
    } catch (error) {
      if (res.headersSent) {
        res.destroy()
        return
      }
      const mapped = mapError(error)
      sendJson(res, mapped.status, mapped.body)
    }
  }

  return { dispatch, streamMedia }
}

/**
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {ReturnType<typeof createInspirationDispatcher>} dispatcher
 */
export function registerInspirationRoutes(webServer, dispatcher) {
  const dispose = webServer.register({
    kind: 'prefix',
    path: PREFIX,
    async handler(req, res) {
      try {
        const url = new URL(req.url || PREFIX, 'http://127.0.0.1')
        if (url.pathname.startsWith(`${PREFIX}/media/`)) {
          await dispatcher.streamMedia(req, res)
          return
        }
        const wantsBody = req.method === 'POST' || req.method === 'PATCH'
        const body = wantsBody ? await readJsonBody(req) : undefined
        if (wantsBody && body === null) {
          sendJson(res, 400, { error: 'invalid json' })
          return
        }
        const result = await dispatcher.dispatch({
          method: req.method || 'GET',
          url: req.url || PREFIX,
          body,
          origin: header(req, 'origin'),
          referer: header(req, 'referer'),
          secFetchSite: header(req, 'sec-fetch-site'),
        })
        sendJson(res, result.status, result.body)
      } catch {
        sendJson(res, 500, { error: 'internal error' })
      }
    },
  })
  return () => {
    dispose()
  }
}

/**
 * @param {{ headers?: Record<string, string | string[] | undefined> }} req
 * @param {string} name
 */
function header(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}
