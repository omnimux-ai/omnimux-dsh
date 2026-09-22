import { sendJson, readJsonBody } from '../auth/http-routes.js'
import { assertLocalWrite, readOriginHeaders } from '../apps/origin.js'
import { findDescriptor } from '../catalog/composer-sync.js'
import { KNOWN_AGENTS, scanLocalAgents, probeAgentBin } from './local.js'

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

/**
 * Local agent discovery and selection. Scanning is read-only; selecting an
 * agent is a local write that stores the choice and the probe result.
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {{ settings?: any, scan?: () => Promise<Array<object>>, probe?: (bin: string) => Promise<object> }} deps
 */
export function registerAgentRoutes(webServer, deps) {
  const getSettings = () => (typeof deps.getSettings === 'function' ? deps.getSettings() : deps.settings)
  const stopScan = webServer.register({
    kind: 'exact',
    path: '/omnimux/agents',
    async handler(req, res) {
      const method = (req.method || 'GET').toUpperCase()
      if (method === 'OPTIONS') {
        sendJson(res, 204, {})
        return
      }
      if (method !== 'GET') {
        sendJson(res, 404, { error: 'not found' })
        return
      }
      // A scan reveals what lives on this machine; same-origin only.
      if (!assertLocal(req, res)) return
      try {
        const scan = typeof deps.scan === 'function' ? deps.scan : () => scanLocalAgents()
        const agents = await scan()
        sendJson(res, 200, { agents })
      } catch (error) {
        sendJson(res, 500, { error: typeof error?.message === 'string' ? error.message : String(error) })
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
        const body = await readJsonBody(req)
        const id = body && typeof body.id === 'string' ? body.id.trim() : ''
        const agent = KNOWN_AGENTS.find((row) => row.id === id)
        if (!agent) {
          sendJson(res, 400, { ok: false, error: 'unknown agent' })
          return
        }
        const probe = typeof deps.probe === 'function'
          ? await deps.probe(agent.bin)
          : await probeAgentBin(agent.bin)
        if (!probe || probe.installed !== true) {
          await writeSettings(getSettings(), { runtimeAgentId: id, runtimeAgentVerified: false })
          sendJson(res, 200, { ok: false, error: 'not-installed' })
          return
        }
        await writeSettings(getSettings(), { runtimeAgentId: id, runtimeAgentVerified: true })
        sendJson(res, 200, { ok: true, version: typeof probe.version === 'string' ? probe.version : '' })
      } catch (error) {
        const status = typeof error?.status === 'number' ? error.status : 500
        sendJson(res, status, { ok: false, error: typeof error?.message === 'string' ? error.message : String(error) })
      }
    },
  })
  return () => {
    stopScan()
    stopSelect()
  }
}
