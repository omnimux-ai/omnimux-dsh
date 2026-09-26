import { sendJson, readJsonBody } from '../auth/http-routes.js'
import { assertLocalWrite, readOriginHeaders } from '../apps/origin.js'
import { findDescriptor } from '../catalog/composer-sync.js'
import { RUNTIME_MODES, MEDIA_PROVIDERS } from '../settings/runtime-mode.js'

export const BYOK_KEY_REF = 'OMNIMUX_BYOK_API_KEY'
const NAMESPACE = 'omnimux'

export const DEFAULT_PROVIDER_ENDPOINTS = Object.freeze({
  fal: 'https://fal.run',
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
})

/**
 * Current media provider state as the settings card sees it.
 * Preserves exact backward-compatible shape for previous unit tests while
 * attaching enhanced multi-provider fields.
 * @param {unknown} settingsValue
 * @param {boolean} hasKey
 */
export function describeByokConfig(settingsValue, hasKey) {
  const value = settingsValue && typeof settingsValue === 'object' && !Array.isArray(settingsValue)
    ? /** @type {Record<string, unknown>} */ (settingsValue)
    : {}
  const str = (key) => typeof value[key] === 'string' ? value[key].trim() : ''
  const provider = str('runtimeMediaProvider') || 'fal'
  const out = {
    endpoint: str('runtimeKeyEndpoint'),
    model: str('runtimeKeyModel'),
    verified: value.runtimeKeyVerified === true,
    mediaImage: value.runtimeMediaImage === true,
    mediaVideo: value.runtimeMediaVideo === true,
    mediaAudio: value.runtimeMediaAudio === true,
    hasKey: hasKey === true,
  }
  if (value.runtimeMediaProvider) out.provider = provider
  if (value.runtimeMediaImageModel) out.mediaImageModel = value.runtimeMediaImageModel
  if (value.runtimeMediaVideoModel) out.mediaVideoModel = value.runtimeMediaVideoModel
  if (value.runtimeMediaAudioModel) out.mediaAudioModel = value.runtimeMediaAudioModel
  return out
}

function fail(status, message) {
  throw Object.assign(new Error(message), { status })
}

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
  const rawProvider = typeof input.provider === 'string' ? input.provider.trim().toLowerCase() : ''
  const provider = (rawProvider && MEDIA_PROVIDERS.includes(rawProvider)) ? rawProvider : 'fal'
  const model = typeof input.model === 'string' ? input.model.trim() : ''
  if (!model) {
    fail(400, '模型名不能为空')
  }
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''

  const patch = {
    runtimeKeyEndpoint: endpoint,
    runtimeKeyModel: model,
    runtimeKeyVerified: false,
    runtimeMediaImage: input.mediaImage === true,
    runtimeMediaVideo: input.mediaVideo === true,
    runtimeMediaAudio: input.mediaAudio === true,
  }
  if (input.provider) patch.runtimeMediaProvider = provider
  if (input.mediaImageModel) patch.runtimeMediaImageModel = input.mediaImageModel
  if (input.mediaVideoModel) patch.runtimeMediaVideoModel = input.mediaVideoModel
  if (input.mediaAudioModel) patch.runtimeMediaAudioModel = input.mediaAudioModel

  return {
    patch,
    provider,
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

async function resolveStoredKey(credentials, provider = 'fal') {
  if (!credentials || typeof credentials.resolve !== 'function') return ''
  const norm = provider.toLowerCase()
  const specificRef = `OMNIMUX_MEDIA_KEY_${norm.toUpperCase()}`
  try {
    const hit = await credentials.resolve(specificRef)
    if (hit && typeof hit.value === 'string' && hit.value.trim()) return hit.value.trim()
  } catch { /* fall through */ }
  // Only fallback to legacy BYOK_KEY_REF if provider is fal or byok
  if (norm === 'fal' || norm === 'byok' || !norm) {
    try {
      const hit = await credentials.resolve(BYOK_KEY_REF)
      return hit && typeof hit.value === 'string' ? hit.value.trim() : ''
    } catch {
      return ''
    }
  }
  return ''
}

async function runByokTest({ endpoint, model, apiKey, fetcher, signal, provider = 'fal' }) {
  const fetchImpl = fetcher ?? fetch
  const timeout = AbortSignal.timeout(15000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  const norm = (provider || 'fal').toLowerCase()
  let testUrl = `${endpoint}/chat/completions`
  let method = 'POST'
  let headers = {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
    accept: 'application/json',
  }
  let body = JSON.stringify({
    model: model || 'test',
    max_tokens: 8,
    messages: [{ role: 'user', content: 'ping' }],
  })

  if (norm === 'fal' && endpoint.includes('fal.run')) {
    testUrl = `${endpoint}/${model || 'fal-ai/flux/dev'}`
    method = 'POST'
    headers = {
      authorization: `Key ${apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    }
    body = JSON.stringify({ prompt: 'ping' })
  } else if ((norm === 'openai' && endpoint.includes('api.openai.com')) || (norm === 'openrouter' && endpoint.includes('openrouter.ai'))) {
    testUrl = `${endpoint}/models`
    method = 'GET'
    headers = {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
    }
    body = undefined
  }

  try {
    const response = await fetchImpl(testUrl, {
      method,
      headers,
      body,
      signal: combined,
    })
    if (response.ok) {
      return { ok: true }
    }
    return { ok: false, status: response.status }
  } catch {
    return { ok: false, status: 504 }
  }
}

/**
 * Runtime mode selection and media generation provider routes.
 * Writes are local-only; keys are stored securely in credentials seam.
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
      if (method === 'OPTIONS') {
        sendJson(res, 204, {})
        return
      }
      try {
        if (method === 'GET') {
          const value = await readCurrentSettings(getSettings())
          const provider = (typeof value.runtimeMediaProvider === 'string' && value.runtimeMediaProvider.trim()) || 'fal'
          const hasKey = (await resolveStoredKey(getCredentials(), provider)) !== ''
          sendJson(res, 200, describeByokConfig(value, hasKey))
          return
        }
        if (method === 'PUT') {
          if (!assertLocal(req, res)) return
          const body = await readJsonBody(req)
          const { patch, apiKey, provider } = parseByokPut(body)
          const credentials = getCredentials()
          if (apiKey && credentials && typeof credentials.set === 'function') {
            await credentials.set(BYOK_KEY_REF, apiKey)
            if (body && body.provider && provider !== 'fal') {
              await credentials.set(`OMNIMUX_MEDIA_KEY_${provider.toUpperCase()}`, apiKey)
            }
          } else if (apiKey) {
            fail(503, 'credentials unavailable')
          }
          await writeSettings(getSettings(), patch)
          const value = await readCurrentSettings(getSettings())
          const hasKey = (await resolveStoredKey(getCredentials(), provider)) !== ''
          sendJson(res, 200, describeByokConfig(value, hasKey))
          return
        }
        if (method === 'DELETE') {
          if (!assertLocal(req, res)) return
          const credentials = getCredentials()
          if (credentials && typeof credentials.set === 'function') {
            try { await credentials.set(BYOK_KEY_REF, '') } catch { /* best effort */ }
            for (const p of MEDIA_PROVIDERS) {
              try { await credentials.set(`OMNIMUX_MEDIA_KEY_${p.toUpperCase()}`, '') } catch { /* best effort */ }
            }
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
        sendJson(res, status, { error: typeof error?.message === 'string' ? error.message : String(error) })
      }
    },
  })

  const stopMode = webServer.register({
    kind: 'exact',
    path: '/omnimux/runtime/mode',
    async handler(req, res) {
      const method = (req.method || 'GET').toUpperCase()
      if (method === 'OPTIONS') {
        sendJson(res, 204, {})
        return
      }
      if (method !== 'PUT') {
        sendJson(res, 404, { error: 'not found' })
        return
      }
      try {
        if (!assertLocal(req, res)) return
        const body = await readJsonBody(req)
        const mode = body && typeof body.mode === 'string' ? body.mode.trim() : ''
        if (!RUNTIME_MODES.includes(mode)) {
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
        const input = body && typeof body === 'object' ? body : {}
        const current = await readCurrentSettings(getSettings())
        const str = (v) => typeof v === 'string' ? v.trim().replace(/\/+$/, '') : ''
        const rawProvider = str(input.provider) || str(current.runtimeMediaProvider) || 'fal'
        const provider = (rawProvider && MEDIA_PROVIDERS.includes(rawProvider.toLowerCase()))
          ? rawProvider.toLowerCase()
          : 'fal'
        const endpoint = str(input.endpoint) || str(current.runtimeKeyEndpoint)
        const model = str(input.model) || str(current.runtimeKeyModel)
        const apiKey = str(input.apiKey) || (await resolveStoredKey(getCredentials(), provider))

        if (endpoint && !/^https?:\/\//.test(endpoint)) {
          sendJson(res, 400, { ok: false, error: '接口地址必须是 http(s) 地址' })
          return
        }
        if (!apiKey) {
          sendJson(res, 400, { ok: false, error: '缺少密钥' })
          return
        }
        const result = await runByokTest({
          endpoint: endpoint || DEFAULT_PROVIDER_ENDPOINTS[provider] || '',
          model: model || 'test',
          apiKey,
          provider,
          fetcher: deps.fetcher,
        })
        if (!result.ok) {
          await writeSettings(getSettings(), { runtimeKeyVerified: false })
          sendJson(res, 200, { ok: false, status: result.status })
          return
        }
        if (str(input.apiKey)) {
          const credentials = getCredentials()
          if (credentials && typeof credentials.set === 'function') {
            await credentials.set(BYOK_KEY_REF, apiKey)
            if (input.provider && provider !== 'fal') {
              await credentials.set(`OMNIMUX_MEDIA_KEY_${provider.toUpperCase()}`, apiKey)
            }
          } else {
            fail(503, 'credentials unavailable')
          }
        }
        await writeSettings(getSettings(), {
          runtimeMediaProvider: provider,
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
