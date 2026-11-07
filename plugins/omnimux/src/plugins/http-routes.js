import { sendJson, readJsonBody } from '../auth/http-routes.js'
import { assertLocalWrite } from '../apps/origin.js'
import {
  assertNpmSpec,
  assertRemovable,
  readProfilePlugins,
  resolveBundledInstall,
  resolvePluginCli,
  resolveProfileDir,
  runDshPlugin,
} from './manage.js'

/**
 * Catalog rows whose install spec maps to this bundle name. Snapshotted from
 * the apps view BEFORE the removal so the mapping cannot change mid-flight.
 * @param {Array<{ id?: unknown, spec?: { name?: unknown } }> | undefined} apps
 * @param {string} name
 * @returns {string[]}
 */
function appTabIds(apps, name) {
  if (!Array.isArray(apps)) return []
  const ids = []
  for (const app of apps) {
    if (app && typeof app === 'object' && app.spec?.name === name && typeof app.id === 'string') {
      ids.push(app.id)
    }
  }
  return ids
}

/**
 * The bundled catalog row for a package name, if the shelf lists one.
 * @param {Array<{ spec?: { name?: unknown, source?: unknown } }> | undefined} apps
 * @param {string} name
 * @returns {{ spec: { name: string, source: string } } | undefined}
 */
function bundledRow(apps, name) {
  if (!Array.isArray(apps)) return undefined
  return apps.find(
    (app) => app && typeof app === 'object' && app.spec?.name === name && app.spec?.source === 'bundled',
  )
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   spawn?: Function,
 *   appsView?: () => Array<{ id?: unknown, spec?: { name?: unknown } }>,
 *   tabsRemove?: (id: string) => unknown,
 *   bundledDir?: string,
 * }} [deps]
 */
export function createPluginDispatcher(deps = {}) {
  const env = deps.env ?? process.env
  const appsView = typeof deps.appsView === 'function' ? deps.appsView : undefined
  const tabsRemove = typeof deps.tabsRemove === 'function' ? deps.tabsRemove : undefined

  /**
   * @param {{ method: string, url: string, body?: unknown }} req
   */
  function dispatch(req) {
    const url = new URL(req.url, 'http://127.0.0.1')
    const method = req.method.toUpperCase()
    const path = url.pathname
    const exe = resolvePluginCli(env)

    if (method === 'GET' && path === '/omnimux/plugins') {
      if (exe === undefined) return { status: 200, body: { available: false, plugins: [] } }
      try {
        return { status: 200, body: { available: true, plugins: readProfilePlugins(exe.profile, env) } }
      } catch (error) {
        return { status: 500, body: { error: error instanceof Error ? error.message : String(error) } }
      }
    }

    if (exe === undefined) return { status: 501, body: { error: 'desktop plugin CLI is not configured' } }

    if (method !== 'GET') {
      try {
        assertLocalWrite(req, { rejectSameSite: true })
      } catch (error) {
        return { status: 403, body: { error: error instanceof Error ? error.message : String(error) } }
      }
    }

    if (method === 'POST' && path === '/omnimux/plugins') {
      const spec = req.body && typeof req.body === 'object' ? /** @type {{ spec?: unknown }} */ (req.body).spec : undefined
      try {
        const name = assertNpmSpec(typeof spec === 'string' ? spec : '')
        const bundled = bundledRow(appsView?.(), name) !== undefined
        const installArg = bundled
          ? resolveBundledInstall({
              name,
              bundledDir: typeof deps.bundledDir === 'string' ? deps.bundledDir : '',
              profileDir: resolveProfileDir(exe.profile, env),
            })
          : name
        if (bundled && installArg === undefined) {
          return {
            status: 400,
            body: { error: `bundled package ${name} is not on disk (set apps.bundledDir or seed the desktop preset)` },
          }
        }
        runDshPlugin({ args: ['add', installArg], env, spawn: deps.spawn })
        return { status: 200, body: { ok: true, plugins: readProfilePlugins(exe.profile, env) } }
      } catch (error) {
        return { status: 400, body: { error: error instanceof Error ? error.message : String(error) } }
      }
    }

    if (method === 'DELETE' && path.startsWith('/omnimux/plugins/')) {
      const name = decodeURIComponent(path.slice('/omnimux/plugins/'.length))
      try {
        assertRemovable(name)
        const tabIds = appTabIds(appsView?.(), name)
        runDshPlugin({ args: ['remove', name], env, spawn: deps.spawn })
        if (tabsRemove) {
          for (const id of tabIds) {
            try {
              tabsRemove(id)
            } catch {
              // Tab cleanup after a successful uninstall is best-effort.
            }
          }
        }
        return { status: 200, body: { ok: true, plugins: readProfilePlugins(exe.profile, env) } }
      } catch (error) {
        return { status: 400, body: { error: error instanceof Error ? error.message : String(error) } }
      }
    }

    return { status: 404, body: { error: 'not found' } }
  }

  return { dispatch }
}

/**
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {ReturnType<typeof createPluginDispatcher>} dispatcher
 */
export function registerPluginRoutes(webServer, dispatcher) {
  const disposers = [
    webServer.register({
    kind: 'prefix',
    path: '/omnimux/plugins',
    async handler(req, res) {
      try {
        const body = req.method === 'POST' ? await readJsonBody(req, 1024 * 1024) : undefined
        if (req.method === 'POST' && body === null) {
          sendJson(res, 400, { error: 'invalid json' })
          return
        }
        const result = dispatcher.dispatch({
          method: req.method || 'GET',
          url: req.url || '/omnimux/plugins',
          body,
          origin: header(req, 'origin'),
          referer: header(req, 'referer'),
          secFetchSite: header(req, 'sec-fetch-site'),
          host: header(req, 'host'),
          secure: Boolean(req.socket?.encrypted),
        })
        sendJson(res, result.status, result.body)
      } catch (error) {
        const status = error?.code === 'request_too_large' ? 413 : 500
        sendJson(res, status, { error: status === 413 ? 'request-too-large' : 'internal error' })
      }
    },
    }),
  ]
  return () => {
    for (const dispose of disposers) dispose()
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
