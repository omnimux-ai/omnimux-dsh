import { OmnimuxError } from './errors.js'
import {
  gatewayCandidates,
  PRODUCT_ID_ALIASES,
  parseModelAndGroup,
  resolveChannelCandidates,
  resolveChannelPlan,
  ROUTING_STRATEGIES,
  toProductId,
} from '../catalog/serving/id-universe.js'

export {
  gatewayCandidates,
  parseModelAndGroup,
  resolveChannelCandidates,
  resolveChannelPlan,
  ROUTING_STRATEGIES,
  toProductId,
}
export const PROTOCOLS = Object.freeze(['openai-media'])
export const AUTH_MODES = Object.freeze(['auto', 'token', 'custom'])

/** @deprecated Compatibility names; these normalize to product IDs, not wire IDs. */
export const MEDIA_WIRE_MODEL_IDS = PRODUCT_ID_ALIASES
export const toMediaWireModelId = toProductId

export const DEFAULT_MEDIA = Object.freeze({
  defaultProvider: 'omnimux',
  authMode: 'auto',
  providers: Object.freeze({
    omnimux: Object.freeze({
      protocol: 'openai-media',
      baseUrl: 'https://api.omnimux.ai/v1',
      apiKeyEnv: 'OMNIMUX_API_KEY',
      models: Object.freeze({
        video: 'seedance-2-0-fast',
        image: 'gpt-image-2.5',
        audio: 'seed-audio-1.0',
        stt: 'doubao-asr-bigmodel',
      }),
    }),
  }),
})

/**
 * @param {unknown} value
 * @returns {typeof DEFAULT_MEDIA}
 */
export function parseMediaConfig(value) {
  if (value == null) return structuredClone(DEFAULT_MEDIA)
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('omnimux: media config must be an object')
  }
  const input = /** @type {Record<string, unknown>} */ (value)
  const authMode = typeof input.authMode === 'string' && input.authMode.trim()
    ? input.authMode.trim()
    : DEFAULT_MEDIA.authMode
  if (!AUTH_MODES.includes(authMode)) {
    throw new Error(`omnimux: media.authMode must be one of ${AUTH_MODES.join(', ')}`)
  }
  const defaultProvider = typeof input.defaultProvider === 'string' && input.defaultProvider.trim()
    ? input.defaultProvider.trim()
    : DEFAULT_MEDIA.defaultProvider
  const rawProviders = input.providers == null
    ? DEFAULT_MEDIA.providers
    : input.providers
  if (typeof rawProviders !== 'object' || rawProviders == null || Array.isArray(rawProviders)) {
    throw new Error('omnimux: media.providers must be an object')
  }
  /** @type {Record<string, { protocol: string, baseUrl: string, apiKeyEnv?: string, apiKey?: string, models: Record<string, string> }>} */
  const providers = {}
  for (const [id, row] of Object.entries(rawProviders)) {
    if (!id.trim()) throw new Error('omnimux: media provider id must be non-empty')
    if (typeof row !== 'object' || row == null || Array.isArray(row)) {
      throw new Error(`omnimux: media.providers.${id} must be an object`)
    }
    const spec = /** @type {Record<string, unknown>} */ (row)
    const fallback = DEFAULT_MEDIA.providers[id]
    const protocol = String(spec.protocol ?? fallback?.protocol ?? '')
    if (!PROTOCOLS.includes(protocol)) {
      throw new Error(`omnimux: media.providers.${id}.protocol must be one of ${PROTOCOLS.join(', ')}`)
    }
    const baseUrl = String(spec.baseUrl ?? fallback?.baseUrl ?? '').replace(/\/+$/, '')
    if (!baseUrl) throw new Error(`omnimux: media.providers.${id}.baseUrl is required`)
    const apiKeyEnv = spec.apiKeyEnv !== undefined
      ? String(spec.apiKeyEnv)
      : (fallback?.apiKeyEnv !== undefined ? String(fallback.apiKeyEnv) : '')
    const apiKey = typeof spec.apiKey === 'string'
      ? spec.apiKey
      : (typeof fallback?.apiKey === 'string' ? fallback.apiKey : undefined)
    if (!apiKeyEnv && apiKey === undefined) {
      throw new Error(`omnimux: media.providers.${id}.apiKeyEnv is required`)
    }
    const modelsIn = spec.models && typeof spec.models === 'object' && !Array.isArray(spec.models)
      ? /** @type {Record<string, unknown>} */ (spec.models)
      : {}
    /** @type {Record<string, string>} */
    const models = { ...(fallback?.models ?? {}) }
    for (const [cap, model] of Object.entries(modelsIn)) {
      if (typeof model === 'string' && model.trim()) models[cap] = model.trim()
    }
    /** @type {{ protocol: string, baseUrl: string, apiKeyEnv?: string, apiKey?: string, models: Record<string, string> }} */
    const rowObj = { protocol, baseUrl, models }
    if (apiKeyEnv) rowObj.apiKeyEnv = apiKeyEnv
    if (apiKey !== undefined) rowObj.apiKey = apiKey
    providers[id] = rowObj
  }
  if (!providers[defaultProvider]) {
    throw new Error(`omnimux: media.defaultProvider '${defaultProvider}' is not in media.providers`)
  }
  return { authMode, defaultProvider, providers }
}

/**
 * @param {string} capability
 * @param {{ provider?: string, model?: string }} request
 * @param {ReturnType<typeof parseMediaConfig>} media
 * @param {Record<string, string | undefined>} [env]
 */
export function resolveMediaRoute(capability, request, media, env = process.env) {
  const providerId = typeof request.provider === 'string' && request.provider.trim()
    ? request.provider.trim()
    : media.defaultProvider
  const row = media.providers[providerId]
  if (!row) {
    throw new OmnimuxError('unknown-provider', `unknown media provider '${providerId}'`)
  }
  if (!PROTOCOLS.includes(row.protocol)) {
    throw new OmnimuxError('unknown-protocol', `unsupported media protocol '${row.protocol}'`)
  }
  const envBase = providerId === 'omnimux' ? env.OMNIMUX_BASE_URL : undefined
  const baseUrl = (envBase || row.baseUrl).replace(/\/+$/, '')
  const envModel = providerId === 'omnimux'
    ? (capability === 'video'
      ? env.OMNIMUX_VIDEO_MODEL
      : capability === 'image'
        ? env.OMNIMUX_IMAGE_MODEL
        : capability === 'audio'
          ? env.OMNIMUX_AUDIO_MODEL
          : capability === 'stt'
            ? env.OMNIMUX_STT_MODEL
            : undefined)
    : undefined
  const catalogModelId = (typeof request.model === 'string' && request.model.trim()
    ? request.model.trim()
    : (envModel || row.models[capability] || ''))
  const { modelId, group: inlineGroup } = parseModelAndGroup(catalogModelId)
  if (!modelId) {
    throw new OmnimuxError('unknown-model', `no model configured for ${providerId}/${capability}`)
  }
  const group = inlineGroup || (typeof request.group === 'string' && request.group.trim() ? request.group.trim() : undefined)
  const explicitStrategy = typeof request.strategy === 'string' && ROUTING_STRATEGIES.includes(request.strategy)
  const allowedGroups = Array.isArray(request.allowedGroups) && request.allowedGroups.length > 0
    ? request.allowedGroups
    : undefined
  const hasRoutingIntent = Boolean(group || allowedGroups || explicitStrategy)

  const plan = providerId === 'omnimux' && hasRoutingIntent
    ? resolveChannelPlan(modelId, { strategy: explicitStrategy ? request.strategy : 'auto', group, allowedGroups })
    : { candidates: providerId === 'omnimux' ? gatewayCandidates(modelId) : [modelId], unresolvedGroups: [] }
  if (hasRoutingIntent && plan.candidates.length === 0) {
    // Fail closed: an empty plan means every requested channel was excluded or
    // unknown. Falling back to the bare model would silently widen the pool.
    const detail = plan.unresolvedGroups.length > 0 ? plan.unresolvedGroups.join(', ') : 'no enabled channel group'
    throw new OmnimuxError('unknown-group', `所选渠道分组不可用于 ${modelId}（${detail}）`)
  }

  const apiKey = readProviderKey(providerId, row.apiKeyEnv, row.apiKey, env)
  return {
    providerId,
    protocol: row.protocol,
    baseUrl,
    apiKey,
    apiKeyEnv: row.apiKeyEnv,
    authMode: media.authMode || 'auto',
    modelId,
    group,
    // Reported only when the caller actually asked for a policy, so a legacy
    // request can never be mistaken for an explicit strategy choice.
    strategy: hasRoutingIntent ? (explicitStrategy ? request.strategy : 'auto') : undefined,
    candidates: plan.candidates,
    // Channel ids the plan could not resolve (unknown group, or a model with no pool).
    unresolvedGroups: plan.unresolvedGroups,
    capability,
  }
}

/**
 * @param {string} providerId
 * @param {string | undefined} apiKeyEnv
 * @param {string | undefined} inlineApiKey
 * @param {Record<string, string | undefined>} env
 */
function readProviderKey(providerId, apiKeyEnv, inlineApiKey, env) {
  const primary = apiKeyEnv ? env[apiKeyEnv] ?? '' : ''
  if (primary) return primary
  if (providerId === 'omnimux' && env.OMNIMUX_TOKEN) return env.OMNIMUX_TOKEN
  if (typeof inlineApiKey === 'string') return inlineApiKey
  return ''
}

/**
 * @param {ReturnType<typeof resolveMediaRoute>} route
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   store?: { resolve: () => Promise<string | undefined> },
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 * }} [deps]
 * @returns {Promise<{ apiKey: string, authType: 'api-key' | 'access-token' | 'none' }>}
 */
export async function resolveMediaAuth(route, deps = {}) {
  const env = deps.env !== undefined ? deps.env : process.env

  // 1. 检查环境变量：env[route.apiKeyEnv] 或（若 providerId === 'omnimux'）env.OMNIMUX_API_KEY / env.OMNIMUX_TOKEN
  const envKey = (route.apiKeyEnv ? env?.[route.apiKeyEnv] : undefined) ||
    (route.providerId === 'omnimux' ? (env?.OMNIMUX_API_KEY || env?.OMNIMUX_TOKEN) : undefined)
  if (typeof envKey === 'string' && envKey.trim()) {
    return { apiKey: envKey.trim(), authType: 'api-key' }
  }

  // 2. 检查内联 route.apiKey：若为 'none'，返回 { apiKey: '', authType: 'none' }；若有非空字符串则返回 { apiKey: route.apiKey, authType: 'api-key' }
  if (typeof route.apiKey === 'string') {
    if (route.apiKey.trim() === 'none') {
      return { apiKey: '', authType: 'none' }
    }
    if (route.apiKey.trim()) {
      return { apiKey: route.apiKey.trim(), authType: 'api-key' }
    }
  }

  // 3. OmniMux: credentials sk- (same refs as chat / official tools), then login PAT.
  // Desktop login writes a console access_token that 401s /v1/images/generations.
  if (route.providerId === 'omnimux' && deps.credentials && typeof deps.credentials.resolve === 'function') {
    for (const ref of ['OMNIMUX_API_KEY', 'OMNIMUX_TOKEN']) {
      try {
        const hit = await deps.credentials.resolve(ref)
        if (hit && typeof hit.value === 'string' && hit.value.trim()) {
          return { apiKey: hit.value.trim(), authType: 'api-key' }
        }
      } catch {
        // next ref
      }
    }
    try {
      const hit = await deps.credentials.resolve('OMNIMUX_ACCESS_TOKEN')
      if (hit && typeof hit.value === 'string' && hit.value.trim()) {
        return { apiKey: hit.value.trim(), authType: 'access-token' }
      }
    } catch {
      // fall through to login store
    }
  }
  if (route.providerId === 'omnimux' && deps.store && typeof deps.store.resolve === 'function') {
    try {
      const token = await deps.store.resolve()
      if (typeof token === 'string' && token.trim()) {
        return { apiKey: token.trim(), authType: 'access-token' }
      }
    } catch {
      // store resolution fallback
    }
  }

  // 4. 若均未获取到：
  if (route.providerId === 'omnimux') {
    throw new OmnimuxError('needs-omnimux', '请先在侧边栏登录 OmniMux 账号，或配置 OMNIMUX_API_KEY')
  }
  throw new OmnimuxError('omnimux-unconfigured', `media provider '${route.providerId}' has no apiKey configured`)
}
