import { isDeepStrictEqual } from 'node:util'
import { sendJson, readJsonBody } from '../auth/http-routes.js'
import { assertLocalWrite, readOriginHeaders } from '../apps/origin.js'
import { findDescriptor } from '../catalog/composer-sync.js'
import { RUNTIME_MODES, MEDIA_PROVIDERS } from '../settings/runtime-mode.js'
import { parseSettingsSection } from '../settings/schema.js'
import { requestRejection } from '../host/request-authorization.js'
import { readScenarioSettings, resolveScenarioBindings, resolveScenarioChoice } from '../settings/runtime-mode.js'

/** Legacy reference is read-only here; new provider saves never write it. */
export const BYOK_KEY_REF = 'OMNIMUX_BYOK_API_KEY'
const NAMESPACE = 'omnimux'
const SCENARIOS = Object.freeze(['text', 'analysis', 'image', 'video', 'audio'])
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const str = (value) => typeof value === 'string' ? value.trim() : ''
const credentialRef = (provider) => `OMNIMUX_MEDIA_KEY_${provider.toUpperCase()}`

export const DEFAULT_PROVIDER_ENDPOINTS = Object.freeze({
  fal: 'https://fal.run',
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
})

/** Legacy view. Provider records and confirmed state are added by the HTTP route. */
export function describeByokConfig(settingsValue, hasKey) {
  const value = object(settingsValue)
  const out = {
    endpoint: str(value.runtimeKeyEndpoint),
    model: str(value.runtimeKeyModel),
    verified: value.runtimeKeyVerified === true,
    mediaImage: value.runtimeMediaImage === true,
    mediaVideo: value.runtimeMediaVideo === true,
    mediaAudio: value.runtimeMediaAudio === true,
    hasKey: hasKey === true,
  }
  if (value.runtimeMediaProvider) out.provider = str(value.runtimeMediaProvider)
  for (const capability of ['Image', 'Video', 'Audio']) {
    if (value[`runtimeMedia${capability}Model`]) out[`media${capability}Model`] = value[`runtimeMedia${capability}Model`]
  }
  return out
}

function fail(status, message, detail = {}) {
  throw Object.assign(new Error(message), { status, detail, byokSafe: true })
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

function parseProvider(value) {
  const provider = str(value).toLowerCase()
  if (!MEDIA_PROVIDERS.includes(provider)) fail(400, '供应商不能为空或未知')
  return provider
}

function parseEndpoint(value) {
  const endpoint = str(value).replace(/\/+$/, '')
  let url
  try { url = new URL(endpoint) } catch { fail(400, '接口地址必须是 http(s) 地址') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    fail(400, '接口地址必须是无凭据、查询参数或片段的 http(s) 地址')
  }
  return url.href.replace(/\/+$/, '')
}

/** Parse provider metadata, never turn a media model into the text model. */
export function parseByokPut(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'invalid json')
  const input = object(body)
  const endpoint = parseEndpoint(input.endpoint)
  const provider = parseProvider(input.provider)
  const models = {}
  for (const scenario of SCENARIOS) {
    const model = str(object(input.models)[scenario])
    if (model) models[scenario] = model
  }
  const patch = { runtimeKeyEndpoint: endpoint, runtimeKeyVerified: false }
  for (const capability of ['image', 'video', 'audio']) {
    const title = capability[0].toUpperCase() + capability.slice(1)
    const field = `media${title}Model`
    if (str(input[field])) models[capability] = str(input[field])
    if (typeof input[`media${title}`] === 'boolean') patch[`runtimeMedia${title}`] = input[`media${title}`]
    // The old model field only has a provable media purpose when explicitly selected.
    if (input[`media${title}`] === true && !models[capability] && str(input.model)) models[capability] = str(input.model)
    if (models[capability]) patch[`runtimeMedia${title}Model`] = models[capability]
  }
  if (!Object.keys(models).length && !str(input.model)) fail(400, '模型名不能为空')
  if (!Object.keys(models).length) fail(400, '请选择模型的明确用途')
  const capabilities = input.capabilities === undefined
    ? Object.keys(models)
    : input.capabilities
  if (!Array.isArray(capabilities) || capabilities.some((cap) => !SCENARIOS.includes(cap) || !models[cap])) {
    fail(400, '能力必须对应明确配置的模型')
  }
  return { patch, provider, endpoint, models, capabilities: [...new Set(capabilities)], apiKey: str(input.apiKey) }
}

function projectRecord(item) {
  const input = object(item)
  const models = {}
  for (const scenario of SCENARIOS) {
    const model = str(object(input.models)[scenario])
    if (model) models[scenario] = model
  }
  return {
    provider: str(input.provider).toLowerCase(), endpoint: str(input.endpoint), models,
    capabilities: Array.isArray(input.capabilities) ? input.capabilities.filter((cap) => SCENARIOS.includes(cap)) : [],
    credentialRef: credentialRef(str(input.provider)),
    revision: Number.isSafeInteger(input.revision) ? input.revision : 0,
    // A historical bool is not a scoped connection or capability receipt.
    verified: false,
    ...(input.saveState === 'pending' ? { saveState: 'pending' } : {}),
  }
}

function storedMetadata(item) {
  const input = object(item)
  const metadata = projectRecord(input)
  for (const key of ['imageModel', 'videoModel', 'audioModel', 'model']) {
    if (str(input[key])) metadata[key] = str(input[key])
  }
  for (const key of ['image', 'video', 'audio', 'runtimeMediaImage', 'runtimeMediaVideo', 'runtimeMediaAudio']) {
    if (typeof input[key] === 'boolean') metadata[key] = input[key]
  }
  if (input.constraints && typeof input.constraints === 'object' && !Array.isArray(input.constraints)) metadata.constraints = structuredClone(input.constraints)
  return metadata
}

function records(value) {
  return (Array.isArray(value.byokProviders) ? value.byokProviders : [])
    .filter((item) => MEDIA_PROVIDERS.includes(str(item?.provider).toLowerCase()))
}

function targetRecord(value, provider) {
  const matches = records(value).filter((item) => str(item.provider).toLowerCase() === provider)
  if (matches.length > 1) fail(409, '供应商配置身份不唯一，需确认')
  return matches[0]
}

function bindingsView(value) {
  const bindings = {}
  for (const scenario of SCENARIOS) {
    const binding = object(object(value.scenarioBindings)[scenario])
    if (['official', 'agent', 'byok', 'pending'].includes(binding.channel)) {
      bindings[scenario] = { channel: binding.channel }
      if (MEDIA_PROVIDERS.includes(binding.provider)) bindings[scenario].provider = binding.provider
    }
  }
  return bindings
}

/** Read the settings value under a stable descriptor revision. */
async function readSnapshot(settings) {
  if (!settings || typeof settings.describe !== 'function') fail(503, 'settings unavailable')
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = findDescriptor(settings.describe(), NAMESPACE)
    if (!before || !Number.isSafeInteger(before.revision)) fail(503, 'settings unavailable')
    const value = typeof settings.get === 'function'
      ? await settings.get(NAMESPACE)
      : before.value
    const after = findDescriptor(settings.describe(), NAMESPACE)
    if (after?.revision === before.revision) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail(503, 'settings snapshot unavailable')
      return { value: structuredClone(value), revision: before.revision }
    }
  }
  fail(409, '配置正在变化，请重新读取')
}

async function describeCredential(credentials, provider) {
  if (!credentials || typeof credentials.describe !== 'function') fail(503, 'credentials description unavailable')
  const info = await credentials.describe(credentialRef(provider))
  return { configured: info?.configured === true, source: str(info?.source) || null, writable: info?.writable === true }
}

function expectRevision(input, snapshot) {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) fail(400, '缺少配置期望版本')
  if (input.expectedRevision !== snapshot.revision) fail(409, '配置版本冲突，请重新读取', { revision: snapshot.revision })
}

async function writeConfirmed(settings, patch, revision) {
  if (typeof settings?.update !== 'function') fail(503, 'settings unavailable')
  const normalized = parseSettingsSection(patch)
  const matchesPatch = (value) => Object.keys(patch).every((key) => isDeepStrictEqual(value[key], normalized[key]))
  try {
    await settings.update(NAMESPACE, patch, revision)
  } catch (error) {
    // A transport error may follow a committed write: only an exact readback confirms it.
    const snapshot = await readSnapshot(settings)
    if (snapshot.revision > revision && matchesPatch(snapshot.value)) return snapshot
    if (error?.code === 'SETTINGS_CONFLICT' || snapshot.revision !== revision) fail(409, '配置版本冲突，请重新读取', { revision: snapshot.revision })
    fail(503, '配置写入未确认')
  }
  const snapshot = await readSnapshot(settings)
  if (snapshot.revision <= revision || !matchesPatch(snapshot.value)) {
    fail(503, '配置读回未确认')
  }
  return snapshot
}

/**
 * Local provider configuration routes. Checks are strictly offline and read-only.
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {{ settings?: any, credentials?: any, getSettings?: () => any, getCredentials?: () => any }} deps
 */
export function registerByokRoutes(webServer, deps) {
  const getSettings = () => typeof deps.getSettings === 'function' ? deps.getSettings() : deps.settings
  const getCredentials = () => typeof deps.getCredentials === 'function' ? deps.getCredentials() : deps.credentials
  // Namespace writes share a revision; serialize the entire save, including readback.
  const credentialGenerations = new Map()
  const credentialVersion = (provider) => credentialGenerations.get(provider) || 0
  const stopCredentialEvents = typeof deps.onCredentialUpdated === 'function'
    ? deps.onCredentialUpdated((ref) => {
        const provider = MEDIA_PROVIDERS.find((id) => credentialRef(id) === ref)
        if (provider) {
          const version = credentialVersion(provider) + 1
          credentialGenerations.set(provider, version)
          deps.hubEvents?.emit?.({ type: 'omnimux:provider-config:credential-changed', payload: { provider, credentialVersion: version } })
        }
      }) : null
  let tail = Promise.resolve()
  const exclusive = (run) => {
    const pending = tail.then(run)
    tail = pending.catch(() => {})
    return pending
  }

  async function configView(settings, credentials) {
    const credentialSnapshot = MEDIA_PROVIDERS.map((provider) => credentialVersion(provider))
    const snapshot = await readSnapshot(settings)
    const providers = []
    for (const item of records(snapshot.value)) {
      providers.push({ ...projectRecord(item), ...await describeCredential(credentials, str(item.provider).toLowerCase()),
        credentialVersion: credentialVersion(str(item.provider).toLowerCase()) })
    }
    const provider = str(snapshot.value.runtimeMediaProvider).toLowerCase()
    const selected = providers.find((item) => item.provider === provider)
    const state = selected || (MEDIA_PROVIDERS.includes(provider)
      ? await describeCredential(credentials, provider)
      : { configured: false, source: null, writable: false })
    const after = await readSnapshot(settings)
    if (after.revision !== snapshot.revision || MEDIA_PROVIDERS.some((provider, index) => credentialVersion(provider) !== credentialSnapshot[index])) fail(409, '配置或密钥正在变化，请重新读取')
    return {
      ...describeByokConfig(snapshot.value, state.configured), verified: false,
      configured: state.configured, source: state.source, writable: state.writable,
      revision: snapshot.revision, providers, bindings: bindingsView(snapshot.value),
    }
  }

  async function save(input, deleting = false) {
    const settings = getSettings()
    const credentials = getCredentials()
    let snapshot = await readSnapshot(settings)
    expectRevision(input, snapshot)
    const parsed = deleting ? { provider: parseProvider(input.provider) } : parseByokPut(input)
    const { provider } = parsed
    const ref = credentialRef(provider)
    const previous = targetRecord(snapshot.value, provider)
    if (!deleting && previous) {
      parsed.models = { ...projectRecord(previous).models, ...parsed.models }
      if (input.capabilities === undefined) parsed.capabilities = [...new Set([...projectRecord(previous).capabilities, ...parsed.capabilities])]
    }
    const info = await describeCredential(credentials, provider)
    if (!deleting && previous?.saveState === 'pending' && !parsed.apiKey) fail(409, '上次保存未完成，请重新提供此服务密钥后保存')
    if ((deleting || parsed.apiKey) && !info.writable) fail(409, '当前密钥来源只读')
    if ((deleting && typeof credentials.unset !== 'function') || (!deleting && parsed.apiKey && typeof credentials.set !== 'function')) {
      fail(503, 'credentials write unavailable')
    }
    if (!deleting && parsed.apiKey && typeof credentials.resolve !== 'function') fail(503, 'credentials confirmation unavailable')
    const previousEndpoint = str(previous?.endpoint) || (str(snapshot.value.runtimeMediaProvider) === provider ? str(snapshot.value.runtimeKeyEndpoint) : '')
    if (!deleting && !parsed.apiKey && info.configured && previousEndpoint !== parsed.endpoint) {
      fail(409, '地址已改变，请重新提供此来源的密钥')
    }
    const bindings = bindingsView(snapshot.value)
    if (!deleting && input.scenarioBindings !== undefined) {
      if (!input.scenarioBindings || typeof input.scenarioBindings !== 'object' || Array.isArray(input.scenarioBindings)) fail(400, '场景绑定格式无效')
      for (const [scenario, raw] of Object.entries(input.scenarioBindings)) {
        const binding = object(raw)
        if (!SCENARIOS.includes(scenario) || binding.channel !== 'byok' || binding.provider !== provider || !parsed.models[scenario] || !parsed.capabilities.includes(scenario)) {
          fail(400, '仅可绑定本供应商明确配置的能力')
        }
        bindings[scenario] = { channel: 'byok', provider }
      }
    }
    const providerRevision = (Number.isSafeInteger(previous?.revision) ? previous.revision : 0) + 1
    const invalid = { ...storedMetadata(previous || { provider }), provider, credentialRef: ref, revision: providerRevision, verified: false, saveState: 'pending' }
    const other = (Array.isArray(snapshot.value.byokProviders) ? snapshot.value.byokProviders : [])
      .filter((item) => str(item?.provider).toLowerCase() !== provider)
    const invalidPatch = { byokProviders: [...other, invalid] }
    if (str(snapshot.value.runtimeMediaProvider).toLowerCase() === provider) invalidPatch.runtimeKeyVerified = false
    let stage = 'invalidate'
    let credential = 'unchanged'
    try {
      snapshot = await writeConfirmed(settings, invalidPatch, snapshot.revision)
      stage = 'credential'
      if (deleting || parsed.apiKey) {
        credential = 'unknown'
        let writeRejected = false
        try {
          if (deleting) await credentials.unset(ref)
          else await credentials.set(ref, parsed.apiKey)
        } catch {
          writeRejected = true
        }
        if (deleting) {
          if ((await describeCredential(credentials, provider)).configured) fail(503, writeRejected ? '密钥删除被拒绝或未确认' : '密钥删除未确认')
        } else {
          const resolved = await credentials.resolve(ref)
          if (resolved?.value !== parsed.apiKey) fail(503, writeRejected ? '密钥保存被拒绝或未确认' : '密钥保存未确认')
        }
        credential = 'confirmed'
      }
      const confirmedCredentialVersion = credentialVersion(provider)
      stage = 'metadata'
      let patch
      if (deleting) {
        for (const scenario of SCENARIOS) {
          if (bindings[scenario]?.channel === 'byok' && bindings[scenario].provider === provider) bindings[scenario] = { channel: 'pending' }
        }
        patch = { byokProviders: other, scenarioBindings: bindings }
        if (str(snapshot.value.runtimeMediaProvider).toLowerCase() === provider) {
          Object.assign(patch, { runtimeKeyVerified: false, runtimeMediaImage: false, runtimeMediaVideo: false, runtimeMediaAudio: false })
        }
      } else {
        const record = { ...storedMetadata(previous), provider, endpoint: parsed.endpoint, models: parsed.models, capabilities: parsed.capabilities, credentialRef: ref, revision: providerRevision, verified: false }
        delete record.saveState
        patch = { byokProviders: [...other, record] }
        if (input.scenarioBindings !== undefined) patch.scenarioBindings = bindings
        // Only compatibility fields for the already-selected media supplier are updated.
        if (str(snapshot.value.runtimeMediaProvider).toLowerCase() === provider) Object.assign(patch, parsed.patch)
      }
      snapshot = await writeConfirmed(settings, patch, snapshot.revision)
      stage = 'readback'
      if (credentialVersion(provider) !== confirmedCredentialVersion) fail(409, '保存期间密钥已变化，请重新确认')
      if (parsed.apiKey) {
        const finalCredential = await credentials.resolve(ref)
        if (finalCredential?.value !== parsed.apiKey) fail(409, '保存后密钥已变化，请重新确认')
      }
      const confirmed = await configView(settings, credentials)
      if (confirmed.revision !== snapshot.revision || credentialVersion(provider) !== confirmedCredentialVersion) fail(409, '保存后配置或密钥已变化，请重新读取')
      return { ...confirmed, saved: true, provider, providerRevision, credential }
    } catch (error) {
      fail(error?.status || 503, '保存未完成，请读取配置后确认', {
        partial: true, needsConfirmation: true, stage, provider,
        providerRevision, credential, revision: error?.detail?.revision ?? snapshot.revision,
      })
    }
  }

  function errorResponse(res, error, test = false) {
    sendJson(res, typeof error?.status === 'number' ? error.status : 503, {
      ...(test ? { ok: false } : {}),
      error: error?.byokSafe === true ? error.message : '配置服务未确认，请重试读取',
      ...(error?.byokSafe === true ? object(error.detail) : {}),
    })
  }

  const stopConfig = webServer.register({
    kind: 'exact', path: '/omnimux/byok/config',
    async handler(req, res) {
      const method = (req.method || 'GET').toUpperCase()
      if (method === 'OPTIONS') return sendJson(res, 204, {})
      try {
        if (method === 'GET') return sendJson(res, 200, await exclusive(() => configView(getSettings(), getCredentials())))
        if (method === 'PUT' || method === 'DELETE') {
          if (!assertLocal(req, res)) return
          const input = object(await readJsonBody(req))
          return sendJson(res, 200, await exclusive(() => save(input, method === 'DELETE')))
        }
        sendJson(res, 404, { error: 'not found' })
      } catch (error) { errorResponse(res, error) }
    },
  })

  async function analysisView(settings) {
    const snapshot = await readSnapshot(settings)
    const effective = readScenarioSettings(settings)
    const choice = resolveScenarioChoice(effective, 'analysis')
    const toolModel = str(effective.toolModel)
    const separator = toolModel.indexOf(':')
    const imageToolConfigured = separator > 0 && separator < toolModel.length - 1
    const after = await readSnapshot(settings)
    if (after.revision !== snapshot.revision) fail(409, '配置正在变化，请重新读取')
    return { revision: snapshot.revision, channel: choice.channel, configured: choice.configured,
      reason: choice.reason || '', imageToolConfigured }
  }

  const stopAnalysisService = webServer.register({
    kind: 'exact', path: '/omnimux/analysis/service',
    async handler(req, res) {
      const method = (req.method || 'GET').toUpperCase()
      if (method === 'OPTIONS') return sendJson(res, 204, {})
      try {
        if (method === 'GET') return sendJson(res, 200, await exclusive(() => analysisView(getSettings())))
        if (method !== 'PUT') return sendJson(res, 405, { error: 'method-not-allowed' })
        const rejection = requestRejection(req, deps.getConnection)
        if (rejection !== undefined) return sendJson(res, rejection, { error: 'request-denied' })
        const input = object(await readJsonBody(req, 4096))
        if (input.channel !== 'official') fail(400, '请选择 OmniMux 分析服务')
        const result = await exclusive(async () => {
          const settings = getSettings()
          const snapshot = await readSnapshot(settings)
          expectRevision(input, snapshot)
          const bindings = resolveScenarioBindings(readScenarioSettings(settings))
          await writeConfirmed(settings, { scenarioBindings: { ...bindings, analysis: { channel: 'official' } } }, snapshot.revision)
          return analysisView(settings)
        })
        return sendJson(res, 200, result)
      } catch (error) { errorResponse(res, error) }
    },
  })

  // Legacy explicit mode endpoint remains separate; provider save/check never invokes it.
  const stopMode = webServer.register({
    kind: 'exact', path: '/omnimux/runtime/mode',
    async handler(req, res) {
      const method = (req.method || 'GET').toUpperCase()
      if (method === 'OPTIONS') return sendJson(res, 204, {})
      if (method !== 'PUT') return sendJson(res, 404, { error: 'not found' })
      try {
        if (!assertLocal(req, res)) return
        const body = object(await readJsonBody(req))
        const mode = str(body.mode)
        if (!RUNTIME_MODES.includes(mode)) return sendJson(res, 400, { error: 'unknown mode' })
        await exclusive(async () => {
          const settings = getSettings()
          const descriptor = findDescriptor(settings.describe(), NAMESPACE)
          if (!descriptor) fail(503, 'settings unavailable')
          await settings.update(NAMESPACE, { runtimeMode: mode }, descriptor.revision)
        })
        sendJson(res, 200, { ok: true, mode })
      } catch (error) { errorResponse(res, error) }
    },
  })

  const stopTest = webServer.register({
    kind: 'exact', path: '/omnimux/byok/test',
    async handler(req, res) {
      const method = (req.method || 'GET').toUpperCase()
      if (method === 'OPTIONS') return sendJson(res, 204, {})
      if (method !== 'POST') return sendJson(res, 404, { error: 'not found' })
      try {
        if (!assertLocal(req, res)) return
        const input = object(await readJsonBody(req))
        const response = await exclusive(async () => {
          const settings = getSettings()
          const snapshot = await readSnapshot(settings)
          if (input.expectedRevision !== undefined) expectRevision(input, snapshot)
          const provider = parseProvider(input.provider || snapshot.value.runtimeMediaProvider)
          const stored = targetRecord(snapshot.value, provider)
          const parsed = parseByokPut({
            provider, endpoint: input.endpoint || stored?.endpoint || snapshot.value.runtimeKeyEndpoint,
            models: input.models || stored?.models, model: input.model,
            capabilities: input.capabilities || stored?.capabilities,
            mediaImage: input.mediaImage, mediaVideo: input.mediaVideo, mediaAudio: input.mediaAudio,
            apiKey: input.apiKey,
          })
          const credentialAtStart = credentialVersion(provider)
          const info = await describeCredential(getCredentials(), provider)
          const after = await readSnapshot(settings)
          if (credentialVersion(provider) !== credentialAtStart) fail(409, '检查期间密钥已变化')
          if (after.revision !== snapshot.revision) fail(409, '检查期间配置已变化')
          return {
            ok: true, checkType: 'offline-config', persisted: false, verified: false,
            connectionVerified: false, ready: false, checkedAt: new Date().toISOString(),
            revision: snapshot.revision, providerRevision: Number.isSafeInteger(stored?.revision) ? stored.revision : 0,
            credentialVersion: credentialVersion(provider),
            identity: { provider, endpoint: parsed.endpoint, models: parsed.models, capabilities: parsed.capabilities, adapterVersion: 'unconfirmed' },
            configured: Boolean(parsed.apiKey) || info.configured,
            credentialSource: parsed.apiKey ? 'draft' : info.source,
            capabilities: parsed.capabilities.map((capability) => ({ capability, model: parsed.models[capability], configured: true, supported: false, reason: 'adapter-unconfirmed' })),
          }
        })
        sendJson(res, 200, response)
      } catch (error) { errorResponse(res, error, true) }
    },
  })

  return () => { stopConfig(); stopAnalysisService(); stopMode(); stopTest(); stopCredentialEvents?.() }
}
