import { sendJson, readJsonBody } from '../auth/http-routes.js'
import { assertLocalWrite, readOriginHeaders } from '../apps/origin.js'
import { findDescriptor } from '../catalog/composer-sync.js'
import { KNOWN_AGENTS, scanLocalAgents, probeAgentBin, resolveBinPath } from './local.js'
import { probeAgentAuth, launchAgentLogin } from './auth.js'
import { createUpdateChecker, runAgentUpdate, detectInstallShape } from './updates.js'

const NAMESPACE = 'omnimux'

function assertLocal(req, res) {
  try {
    assertLocalWrite(readOriginHeaders(req))
    return true
  } catch {
    sendJson(res, 403, { error: 'not-local' })
    return false
  }
}

async function writeSettings(settings, patch) {
  if (!settings || typeof settings.describe !== 'function' || typeof settings.update !== 'function') {
    throw Object.assign(new Error('settings unavailable'), { status: 503 })
  }
  const descriptor = findDescriptor(settings.describe(), NAMESPACE)
  if (!descriptor) throw Object.assign(new Error('settings unavailable'), { status: 503 })
  await settings.update(NAMESPACE, patch, descriptor.revision)
}

function findAgent(id) {
  const key = typeof id === 'string' ? id.trim() : ''
  return KNOWN_AGENTS.find((row) => row.id === key) || null
}

function methodNotAllowed(req, res, expected) {
  const method = (req.method || 'GET').toUpperCase()
  if (method === 'OPTIONS') {
    sendJson(res, 204, {})
    return true
  }
  if (method !== expected) {
    sendJson(res, 404, { error: 'not found' })
    return true
  }
  return false
}

async function readId(req) {
  const body = await readJsonBody(req)
  return body && typeof body.id === 'string' ? body.id.trim() : ''
}

/**
 * Local agent discovery, sign-in state and version state. Scanning and probing
 * are read-only; selecting, signing in and updating are local writes that run
 * a command from the capability table — never one supplied by the request.
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {{
 *   settings?: any,
 *   getSettings?: () => any,
 *   scan?: () => Promise<Array<object>>,
 *   probe?: (bin: string) => Promise<{ installed: boolean, version: string }>,
 *   authProbe?: (id: string) => Promise<{ state: string, method: string }>,
 *   updateCheck?: (agents: Array<object>, options?: { refresh?: boolean }) => Promise<object>,
 *   login?: (id: string) => Promise<object>,
 *   update?: (id: string, options: { shape: string }) => Promise<object>,
 *   installShape?: (agent: object) => string,
 * }} deps
 */
export function registerAgentRoutes(webServer, deps = {}) {
  const getSettings = () => (typeof deps.getSettings === 'function' ? deps.getSettings() : deps.settings)
  const scan = typeof deps.scan === 'function' ? deps.scan : () => scanLocalAgents()
  const probe = typeof deps.probe === 'function' ? deps.probe : (bin) => probeAgentBin(bin)
  const authProbe = typeof deps.authProbe === 'function' ? deps.authProbe : (id) => probeAgentAuth(id)
  const checker = createUpdateChecker()
  const updateCheck = typeof deps.updateCheck === 'function' ? deps.updateCheck : (agents, options) => checker.check(agents, options)
  const login = typeof deps.login === 'function' ? deps.login : (id) => launchAgentLogin(id)
  const update = typeof deps.update === 'function' ? deps.update : (id, options) => runAgentUpdate(id, options)
  const installShape = typeof deps.installShape === 'function'
    ? deps.installShape
    : (agent) => detectInstallShape(resolveBinPath(agent.bin))
  const updating = new Set()

  /** Sign-in state is only asked of CLIs that are actually installed. */
  async function withAuth(rows) {
    return Promise.all(rows.map(async (row) => {
      const agent = findAgent(row?.id)
      const loginSupported = Boolean(agent && agent.login)
      if (!agent || row?.installed !== true) {
        return { ...row, auth: { state: 'unknown', method: 'none', loginSupported } }
      }
      let probed = null
      try {
        probed = await authProbe(agent.id)
      } catch {
        probed = null
      }
      return {
        ...row,
        auth: {
          state: typeof probed?.state === 'string' ? probed.state : 'unknown',
          method: typeof probed?.method === 'string' ? probed.method : 'none',
          loginSupported,
        },
      }
    }))
  }

  const stopScan = webServer.register({
    kind: 'exact',
    path: '/omnimux/agents',
    async handler(req, res) {
      if (methodNotAllowed(req, res, 'GET')) return
      // A scan reveals what lives on this machine; same-origin only.
      if (!assertLocal(req, res)) return
      try {
        const agents = await withAuth(await scan())
        sendJson(res, 200, { agents })
      } catch (error) {
        sendJson(res, 500, { error: typeof error?.message === 'string' ? error.message : String(error) })
      }
    },
  })
  const stopUpdates = webServer.register({
    kind: 'exact',
    path: '/omnimux/agents/updates',
    async handler(req, res) {
      if (methodNotAllowed(req, res, 'GET')) return
      if (!assertLocal(req, res)) return
      try {
        const url = new URL(req.url || '/', 'http://localhost')
        const refresh = url.searchParams.get('refresh') === '1'
        const agents = await scan()
        const result = await updateCheck(agents, { refresh })
        sendJson(res, 200, {
          checkedAt: Number.isFinite(result?.checkedAt) ? result.checkedAt : Date.now(),
          updates: result && typeof result.updates === 'object' && result.updates ? result.updates : {},
        })
      } catch (error) {
        sendJson(res, 500, { error: typeof error?.message === 'string' ? error.message : String(error) })
      }
    },
  })
  const stopLogin = webServer.register({
    kind: 'exact',
    path: '/omnimux/agents/login',
    async handler(req, res) {
      if (methodNotAllowed(req, res, 'POST')) return
      try {
        if (!assertLocal(req, res)) return
        const id = await readId(req)
        const agent = findAgent(id)
        if (!agent) {
          sendJson(res, 400, { ok: false, error: 'unknown-agent' })
          return
        }
        const info = await probe(agent.bin)
        if (!info || info.installed !== true) {
          sendJson(res, 200, { ok: false, error: 'not-installed' })
          return
        }
        sendJson(res, 200, await login(agent.id))
      } catch (error) {
        const status = typeof error?.status === 'number' ? error.status : 500
        sendJson(res, status, { ok: false, error: typeof error?.message === 'string' ? error.message : String(error) })
      }
    },
  })
  const stopUpdate = webServer.register({
    kind: 'exact',
    path: '/omnimux/agents/update',
    async handler(req, res) {
      if (methodNotAllowed(req, res, 'POST')) return
      try {
        if (!assertLocal(req, res)) return
        const id = await readId(req)
        const agent = findAgent(id)
        if (!agent) {
          sendJson(res, 400, { ok: false, error: 'unknown-agent' })
          return
        }
        const info = await probe(agent.bin)
        if (!info || info.installed !== true) {
          sendJson(res, 200, { ok: false, error: 'not-installed' })
          return
        }
        if (updating.has(agent.id)) {
          sendJson(res, 409, { ok: false, error: 'update-in-progress' })
          return
        }
        updating.add(agent.id)
        let result = null
        try {
          result = await update(agent.id, { shape: installShape(agent) })
        } finally {
          updating.delete(agent.id)
        }
        sendJson(res, 200, result && typeof result === 'object' ? result : { ok: false, error: 'update-failed' })
      } catch (error) {
        const status = typeof error?.status === 'number' ? error.status : 500
        sendJson(res, status, { ok: false, error: typeof error?.message === 'string' ? error.message : String(error) })
      }
    },
  })
  const stopSelect = webServer.register({
    kind: 'exact',
    path: '/omnimux/agents/select',
    async handler(req, res) {
      const method = (req.method || 'GET').toUpperCase()
      if (method === 'OPTIONS') {
        sendJson(res, 204, {})
        return
      }
      if (method !== 'POST') {
        sendJson(res, 404, { error: 'not found' })
        return
      }
      try {
        if (!assertLocal(req, res)) return
        const id = await readId(req)
        const agent = findAgent(id)
        if (!agent) {
          sendJson(res, 400, { ok: false, error: 'unknown agent' })
          return
        }
        const result = await probe(agent.bin)
        if (!result || result.installed !== true) {
          await writeSettings(getSettings(), { runtimeAgentId: agent.id, runtimeAgentVerified: false })
          sendJson(res, 200, { ok: false, error: 'not-installed' })
          return
        }
        await writeSettings(getSettings(), { runtimeAgentId: agent.id, runtimeAgentVerified: true })
        sendJson(res, 200, { ok: true, version: typeof result.version === 'string' ? result.version : '' })
      } catch (error) {
        const status = typeof error?.status === 'number' ? error.status : 500
        sendJson(res, status, { ok: false, error: typeof error?.message === 'string' ? error.message : String(error) })
      }
    },
  })
  return () => {
    stopScan()
    stopUpdates()
    stopLogin()
    stopUpdate()
    stopSelect()
  }
}
