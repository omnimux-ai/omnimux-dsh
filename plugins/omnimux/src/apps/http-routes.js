import { sendJson, readJsonBody } from '../auth/http-routes.js'
import { resolveDshHome } from '../auth/store.js'
import { DEFAULT_SITE, resolveSiteBaseUrl } from '../auth/omnimux-auth.js'
import { parseAppsConfig } from './config.js'
import { assertLocalWrite } from './origin.js'
import { resolvePluginCli } from '../plugins/manage.js'
import { createAppsStore } from './store.js'
import { createTabsStore, isValidTabId } from './tabs.js'

const WRITE_METHODS = new Set(['POST', 'PATCH', 'DELETE'])

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   homeDir?: string,
 *   profile?: string,
 *   apps?: { remote: boolean, catalogUrl: string, ttlSeconds: number, timeoutMs: number },
 *   siteBaseUrl?: string,
 *   store?: ReturnType<typeof createAppsStore>,
 *   tabsStore?: ReturnType<typeof createTabsStore>,
 *   fetcher?: typeof fetch,
 * }} [deps]
 */
export function createAppsDispatcher(deps = {}) {
  const env = deps.env ?? process.env
  const home = resolveDshHome(deps.homeDir || env.DSH_HOME)
  const profile = deps.profile
    || (env.OMNIMUX_PLUGIN_PROFILE && env.OMNIMUX_PLUGIN_PROFILE.trim() !== ''
      ? env.OMNIMUX_PLUGIN_PROFILE
      : resolvePluginCli(env)?.profile)
    || 'omnimux'
  const siteBaseUrl = resolveSiteBaseUrl(deps.siteBaseUrl || env.OMNIMUX_SITE_URL || DEFAULT_SITE)
  const apps = deps.apps ?? parseAppsConfig(undefined, siteBaseUrl)
  const store = deps.store ?? createAppsStore({
    home,
    profile,
    env,
    apps,
    siteBaseUrl,
    fetcher: deps.fetcher,
  })
  const tabsStore = deps.tabsStore ?? createTabsStore({ home })

  /**
   * Current shelf rows, used to filter and title the tabs view.
   */
  function shelfApps() {
    const body = store.view()
    return Array.isArray(body.apps) ? body.apps : []
  }

  /**
   * Validate a PATCH body: exactly `{ pinned: boolean }` or `{ order: "top" }`.
   * @param {unknown} body
   * @returns {{ pinned?: boolean, order?: 'top' } | undefined}
   */
  function parseTabPatch(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined
    const row = /** @type {Record<string, unknown>} */ (body)
    const keys = Object.keys(row)
    if (keys.length !== 1) return undefined
    if (keys[0] === 'pinned' && typeof row.pinned === 'boolean') return { pinned: row.pinned }
    if (keys[0] === 'order' && row.order === 'top') return { order: 'top' }
    return undefined
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {unknown} body
   */
  function dispatchTabs(method, path, body) {
    const id = decodeURIComponent(path.slice('/omnimux/apps/tabs/'.length))
    if (!isValidTabId(id)) return { status: 400, body: { error: 'invalid tab id' } }
    try {
      if (method === 'POST') {
        const appsView = shelfApps()
        if (!appsView.some((app) => app.id === id)) return { status: 404, body: { error: 'unknown app id' } }
        tabsStore.upsert(id)
        return { status: 200, body: tabsStore.view({ apps: appsView }) }
      }
      if (method === 'PATCH') {
        const change = parseTabPatch(body)
        if (change === undefined) return { status: 400, body: { error: 'invalid tab patch' } }
        if (tabsStore.patch(id, change) === null) return { status: 404, body: { error: 'no tab row' } }
        return { status: 200, body: tabsStore.view({ apps: shelfApps() }) }
      }
      if (tabsStore.remove(id) === null) return { status: 404, body: { error: 'no tab row' } }
      return { status: 200, body: tabsStore.view({ apps: shelfApps() }) }
    } catch (error) {
      return { status: 500, body: { error: error instanceof Error ? error.message : String(error) } }
    }
  }

  /**
   * @param {{ method: string, url: string, body?: unknown, origin?: string, referer?: string, secFetchSite?: string }} req
   */
  async function dispatch(req) {
    const url = new URL(req.url, 'http://127.0.0.1')
    const method = req.method.toUpperCase()
    const path = url.pathname
    if (WRITE_METHODS.has(method)) {
      try {
        assertLocalWrite(req, { rejectSameSite: true })
      } catch (error) {
        return { status: 403, body: { error: error instanceof Error ? error.message : String(error) } }
      }
    }
    if (method === 'GET' && path === '/omnimux/apps') {
      try {
        const body = store.view()
        store.maybeRefresh()
        return { status: 200, body }
      } catch (error) {
        return { status: 500, body: { error: error instanceof Error ? error.message : String(error) } }
      }
    }
    if (method === 'POST' && path === '/omnimux/apps/refresh') {
      try {
        const body = await waitFor(store.refreshOnce(true), apps.timeoutMs, () => store.view())
        return { status: 200, body }
      } catch (error) {
        return { status: 500, body: { error: error instanceof Error ? error.message : String(error) } }
      }
    }
    if (method === 'GET' && path === '/omnimux/apps/tabs') {
      try {
        return { status: 200, body: tabsStore.view({ apps: shelfApps() }) }
      } catch (error) {
        return { status: 500, body: { error: error instanceof Error ? error.message : String(error) } }
      }
    }
    if (WRITE_METHODS.has(method) && path.startsWith('/omnimux/apps/tabs/')) {
      return dispatchTabs(method, path, req.body)
    }
    return { status: 404, body: { error: 'not found' } }
  }

  return { dispatch, store }
}

/**
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {ReturnType<typeof createAppsDispatcher>} dispatcher
 */
export function registerAppsRoutes(webServer, dispatcher) {
  const dispose = webServer.register({
    kind: 'prefix',
    path: '/omnimux/apps',
    async handler(req, res) {
      try {
        let body
        if (req.method === 'POST' || req.method === 'PATCH') {
          body = await readJsonBody(req)
          if (body === null) {
            sendJson(res, 400, { error: 'invalid json' })
            return
          }
        }
        const result = await dispatcher.dispatch({
          method: req.method || 'GET',
          url: req.url || '/omnimux/apps',
          body,
          origin: header(req, 'origin'),
          referer: header(req, 'referer'),
          secFetchSite: header(req, 'sec-fetch-site'),
          host: header(req, 'host'),
          secure: Boolean(req.socket?.encrypted),
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
 * @template T
 * @param {Promise<T>} work
 * @param {number} timeoutMs
 * @param {() => T} fallback
 */
/**
 * @param {{ headers?: Record<string, string | string[] | undefined> }} req
 * @param {string} name
 */
function header(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function waitFor(work, timeoutMs, fallback) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(fallback()), timeoutMs)
    timer.unref?.()
    work.then((value) => {
      clearTimeout(timer)
      resolve(value)
    }, (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}
