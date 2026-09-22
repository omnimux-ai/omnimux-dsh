import { sendJson, readJsonBody } from '../auth/http-routes.js'
import { assertLocalWrite, readOriginHeaders } from '../apps/origin.js'
import { findDescriptor } from '../catalog/composer-sync.js'

export const BYOK_KEY_REF = 'OMNIMUX_BYOK_API_KEY'
const NAMESPACE = 'omnimux'

/**
 * Current BYOK state as the settings dialog sees it. The key itself never
 * leaves the host: `hasKey` only says one is stored.
 * @param {unknown} settingsValue
 * @param {boolean} hasKey
 */
export function describeByokConfig(settingsValue, hasKey) {
  const value = settingsValue && typeof settingsValue === 'object' && !Array.isArray(settingsValue)
    ? /** @type {Record<string, unknown>} */ (settingsValue)
    : {}
  const str = (key) => typeof value[key] === 'string' ? value[key].trim() : ''
  return {
    endpoint: str('runtimeKeyEndpoint'),
    model: str('runtimeKeyModel'),
    verified: value.runtimeKeyVerified === true,
    mediaImage: value.runtimeMediaImage === true,
    mediaVideo: value.runtimeMediaVideo === true,
    mediaAudio: value.runtimeMediaAudio === true,
    hasKey: hasKey === true,
  }
}

/** Parse and validate a PUT body. Returns the patch or throws an Error with .status. */
function fail(status, message) {
  throw Object.assign(new Error(message), { status })
}

/**
 * Local-writes only. Returns false (after sending 403) when the call is not
 * from the same machine's browser.
 */
function assertLocal(req, res) {
  try {
    assertLocalWrite(readOriginHeaders(req))
    return true
  } catch {
    sendJson(res, 403, { error: 'not-local' })
    return false
  }
}

export function parseByokPut(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail(400, 'invalid json')
  }
  const input = /** @type {Record<string, unknown>} */ (body)
  const endpoint = typeof input.endpoint === 'string' ? input.endpoint.trim().replace(/\/+$/, '') : ''
  if (!endpoint || !/^https?:\/\//.test(endpoint)) {
    fail(400, '接口地址必须是 http(s) 地址')
  }
  const model = typeof input.model === 'string' ? input.model.trim() : ''
  if (!model) {
    fail(400, '模型名不能为空')
  }
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''
  return {
    patch: {
      runtimeKeyEndpoint: endpoint,
      runtimeKeyModel: model,
      // Any change to the coordinates invalidates a previous pass.
      runtimeKeyVerified: false,
      runtimeMediaImage: input.mediaImage === true,
      runtimeMediaVideo: input.mediaVideo === true,
      runtimeMediaAudio: input.mediaAudio === true,
    },
    apiKey,
  }
}

async function readCurrentSettings(settings) {
  if (!settings || typeof settings.get !== 'function') return {}
  const value = await settings.get(NAMESPACE)
  return value && typeof value === 'object' ? value : {}
}

async function writeSettings(settings, patch) {
  if (!settings || typeof settings.describe !== 'function' || typeof settings.update !== 'function') {
    fail(503, 'settings unavailable')
  }
  const descriptor = findDescriptor(settings.describe(), NAMESPACE)
  if (!descriptor) fail(503, 'settings unavailable')
  await settings.update(NAMESPACE, patch, descriptor.revision)
}

async function resolveStoredKey(credentials) {
  if (!credentials || typeof credentials.resolve !== 'function') return ''
  try {
    const hit = await credentials.resolve(BYOK_KEY_REF)
    return hit && typeof hit.value === 'string' ? hit.value.trim() : ''
  } catch {
    return ''
  }
}

async function runByokTest({ endpoint, model, apiKey, fetcher, signal }) {
  const fetchImpl = fetcher ?? fetch
  const response = await fetchImpl(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'ping' }],
    }),
    ...(signal ? { signal } : {}),
  })
  if (!response.ok) {
    return { ok: false, status: response.status }
  }
  return { ok: true }
}

/**
 * Runtime mode selection rides the same host write channel as the BYOK
 * fields: the official client settings scope silently drops fields it never
 * whitelisted, so the choice is written where the schema actually lives.
 */
const RUNTIME_MODE_VALUES = new Set(['official', 'agent', 'key'])

/**
 * BYOK configuration routes. Writes are local-only; the key is stored in the
 * credentials seam and never returned in any response.
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {{ settings?: any, credentials?: any, getSettings?: () => any, getCredentials?: () => any, fetcher?: typeof fetch }} deps
 */
export function registerByokRoutes(webServer, deps) {
  const getSettings = () => (typeof deps.getSettings === 'function' ? deps.getSettings() : deps.settings)
  const getCredentials = () => (typeof deps.getCredentials === 'function' ? deps.getCredentials() : deps.credentials)
  const stopConfig = webServer.register({
    kind: 'exact',
    path: '/omnimux/byok/config',
    async handler(req, res) {
      const method = (req.method || 'GET').toUpperCase()
      try {
        if (method === 'GET') {
          const value = await readCurrentSettings(getSettings())
          const hasKey = (await resolveStoredKey(getCredentials())) !== ''
          sendJson(res, 200, describeByokConfig(value, hasKey))
          return
        }
        if (method === 'PUT') {
          if (!assertLocal(req, res)) return
          const body = await readJsonBody(req)
          const { patch, apiKey } = parseByokPut(body)
          const credentials = getCredentials()
          if (apiKey && credentials && typeof credentials.set === 'function') {
            await credentials.set(BYOK_KEY_REF, apiKey)
          } else if (apiKey) {
            fail(503, 'credentials unavailable')
          }
          // A key the user did not resend keeps the stored one; only the
          // coordinates and the verified flag are written here.
          await writeSettings(getSettings(), patch)
          const value = await readCurrentSettings(getSettings())
          const hasKey = (await resolveStoredKey(getCredentials())) !== ''
          sendJson(res, 200, describeByokConfig(value, hasKey))
          return
        }
        if (method === 'DELETE') {
          if (!assertLocal(req, res)) return
          const credentials = getCredentials()
          if (credentials && typeof credentials.set === 'function') {
            try { await credentials.set(BYOK_KEY_REF, '') } catch { /* best effort */ }
          }
          await writeSettings(getSettings(), {
            runtimeKeyEndpoint: '',
            runtimeKeyModel: '',
            runtimeKeyVerified: false,
            runtimeMediaImage: false,
            runtimeMediaVideo: false,
            runtimeMediaAudio: false,
          })
          sendJson(res, 200, describeByokConfig({}, false))
          return
        }
        sendJson(res, 404, { error: 'not found' })
      } catch (error) {
        const status = typeof error?.status === 'number' ? error.status : 500
        const message = typeof error?.message === 'string' ? error.message
          : String(error) || 'internal error'
        sendJson(res, status, { error: message })
      }
    },
  })
  const stopMode = webServer.register({
    kind: 'exact',
    path: '/omnimux/runtime/mode',
    async handler(req, res) {
      const method = (req.method || 'GET').toUpperCase()
      if (method !== 'PUT') {
        sendJson(res, 404, { error: 'not found' })
        return
      }
      try {
        if (!assertLocal(req, res)) return
        const body = await readJsonBody(req)
        const mode = body && typeof body.mode === 'string' ? body.mode.trim() : ''
        if (!RUNTIME_MODE_VALUES.has(mode)) {
          sendJson(res, 400, { error: 'unknown mode' })
          return
        }
        await writeSettings(getSettings(), { runtimeMode: mode })
        sendJson(res, 200, { ok: true, mode })
      } catch (error) {
        const status = typeof error?.status === 'number' ? error.status : 500
        sendJson(res, status, { error: typeof error?.message === 'string' ? error.message : String(error) })
      }
    },
  })
  const stopTest = webServer.register({
    kind: 'exact',
    path: '/omnimux/byok/test',
    async handler(req, res) {
      const method = (req.method || 'GET').toUpperCase()
      if (method !== 'POST') {
        sendJson(res, 404, { error: 'not found' })
        return
      }
      try {
        if (!assertLocal(req, res)) return
        const body = await readJsonBody(req)
        const input = body && typeof body === 'object' ? body : {}
        const current = await readCurrentSettings(getSettings())
        const str = (v) => typeof v === 'string' ? v.trim().replace(/\/+$/, '') : ''
        const endpoint = str(input.endpoint) || str(current.runtimeKeyEndpoint)
        const model = str(input.model) || str(current.runtimeKeyModel)
        const apiKey = str(input.apiKey) || (await resolveStoredKey(getCredentials()))
        if (!endpoint || !model) {
          sendJson(res, 400, { ok: false, error: '缺少接口地址或模型名' })
          return
        }
        if (!apiKey) {
          sendJson(res, 400, { ok: false, error: '缺少密钥' })
          return
        }
        const result = await runByokTest({
          endpoint,
          model,
          apiKey,
          fetcher: deps.fetcher,
        })
        if (!result.ok) {
          await writeSettings(getSettings(), { runtimeKeyVerified: false })
          sendJson(res, 200, { ok: false, status: result.status })
          return
        }
        await writeSettings(getSettings(), {
          runtimeKeyEndpoint: endpoint,
          runtimeKeyModel: model,
          runtimeKeyVerified: true,
        })
        sendJson(res, 200, { ok: true })
      } catch (error) {
        const status = typeof error?.status === 'number' ? error.status : 500
        sendJson(res, status, { ok: false, error: typeof error?.message === 'string' ? error.message : String(error) })
      }
    },
  })
  return () => {
    stopConfig()
    stopMode()
    stopTest()
  }
}
