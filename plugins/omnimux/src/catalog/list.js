import { contentFingerprint } from './contract/load.js'
import { isMediaEnabled } from '../gate/guard.js'
import { DEFAULT_MEDIA } from '../media/route.js'
import { DEFAULT_TEXT, enabledTextModels } from '../text/catalog.js'
import { textModelLabel } from './labels.js'
import { sortCatalogRows } from './sort.js'
import {
  assertContractHealthy,
  getHealthyContractIndex,
  mergeInputCapability,
  projectCatalog,
  resolveModelId,
} from './project.js'
import { executionProfileFromContract, isExecutionProfileComplete, mergeExecutionProfiles } from './execution-profile.js'
import { getGatewayTextRows, getRuntimeContractIndex } from './runtime-index.js'
import {
  loadDispositions,
  loadCatalogDefaults,
  validateDispositionsShape,
} from './contract/dispositions.js'
import { CANONICAL_SCHEMA_VERSION } from './contract/schema.js'
import { DEFAULT_OPERATION_AUTO } from '../settings/schema.js'
import { resolveCurrentSnapshot } from './cloud/current.js'
import { snapshotContentDigest } from './cloud/snapshot.js'
import { usableSnapshotModels } from './cloud/view.js'
import { getModelChannelGroups } from './serving/channel-groups.js'
import { approvedOperationLabel } from './contract/operation-label.js'

export const CATALOG_KINDS = Object.freeze(['text', 'image', 'video', 'audio'])

/** Primary operation per catalog kind, used to read catalog-defaults.byOperation. */
const KIND_PRIMARY_OP = Object.freeze({
  text: 'chat',
  image: 'text_to_image',
  video: 'text_to_video',
  audio: 'text_to_music',
})

export const ENV_DEFAULT_KEYS = Object.freeze({
  text: 'OMNIMUX_TEXT_DEFAULT_MODEL',
  image: 'OMNIMUX_IMAGE_MODEL',
  video: 'OMNIMUX_VIDEO_MODEL',
  audio: 'OMNIMUX_AUDIO_MODEL',
})

export const SETTINGS_DEFAULT_KEYS = Object.freeze({
  text: 'defaultTextModel',
  image: 'defaultImageModel',
  video: 'defaultVideoModel',
  audio: 'defaultAudioModel',
})

/** Kinds whose default generation mode is configurable through settings. */
export const SETTINGS_DEFAULT_OPERATION_KEYS = Object.freeze({
  image: 'defaultImageOperation',
  video: 'defaultVideoOperation',
})

/** Ordered models to try when the configured default model cannot publish the preferred mode. */
const PREFERRED_OPERATION_MODELS = Object.freeze({
  image: ['gpt-image-2.5', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'],
  video: ['minimax-h3', 'seedance-2-0', 'seedance-2-5'],
})

/** The mode a kind starts in: it consumes upstream media, so a new node shows its slots. */
const PREFERRED_OPERATION = Object.freeze({
  image: 'multi_reference',
  video: 'video_multi_ref',
})

/** Listed operation ids of one model for one output type, in contract order. */
function listedOperationIds(models, modelId, kind) {
  const model = (models ?? []).find((row) => row && row.id === modelId)
  return (model?.operations ?? [])
    .filter((op) => op && op.listed === true && op.output?.type === kind)
    .map((op) => op.id)
}

/**
 * Resolve the generation mode a new node of `kind` starts in.
 *
 * An explicit setting wins while some listed model publishes it; otherwise the
 * configured default model keeps the preferred media-consuming mode, then the
 * preferred-model chain is walked, then the model's own first listed mode.
 *
 * @param {{ kind: string, configured: unknown, modelId: string, ids: Set<string>, models: Array<object> }} input
 * @returns {{ modelId: string, operationId: string, rule: string }}
 */
export function resolveDefaultOperation(input) {
  const kind = input.kind
  const preferred = PREFERRED_OPERATION[kind]
  const chain = PREFERRED_OPERATION_MODELS[kind] ?? []
  const configured = typeof input.configured === 'string' ? input.configured.trim() : ''
  if (configured && configured !== DEFAULT_OPERATION_AUTO) {
    if (listedOperationIds(input.models, input.modelId, kind).includes(configured)) {
      return { modelId: input.modelId, operationId: configured, rule: 'configured' }
    }
    for (const candidate of chain) {
      if (candidate === input.modelId || !input.ids.has(candidate)) continue
      if (listedOperationIds(input.models, candidate, kind).includes(configured)) {
        return { modelId: candidate, operationId: configured, rule: 'configured_chain' }
      }
    }
  }
  if (preferred && listedOperationIds(input.models, input.modelId, kind).includes(preferred)) {
    return { modelId: input.modelId, operationId: preferred, rule: 'auto' }
  }
  for (const candidate of chain) {
    if (candidate === input.modelId || !input.ids.has(candidate)) continue
    if (preferred && listedOperationIds(input.models, candidate, kind).includes(preferred)) {
      return { modelId: candidate, operationId: preferred, rule: 'auto_chain' }
    }
  }
  const first = listedOperationIds(input.models, input.modelId, kind)[0]
  return { modelId: input.modelId, operationId: first ?? '', rule: first ? 'first_operation' : 'none' }
}

/**
 * Catalog v1.1: the contract projection is the authority (models[] + four
 * lists derived from visible ops' output.type). Fail-closed: any contract
 * parse/admission/dispositions failure throws; there is no legacy table to
 * fall back to.
 *
 * @param {object} [opts]
 * @param {ReturnType<typeof import('../text/catalog.js').parseTextConfig>} [opts.text]
 * @param {ReturnType<typeof import('../media/route.js').parseMediaConfig>} [opts.media]
 * @param {object} [opts.gate]
 * @param {Record<string, string | undefined>} [opts.env]
 * @param {Record<string, unknown>} [opts.settingsDefaults]
 * @param {object} [opts.contractIndex] internal test seam: inject a preloaded index
 * @param {object} [opts.snapshot] resolved gateway snapshot; defaults to the
 *   read-only current snapshot (bundled floor to disk cache, never the network)
 */
export function buildModelCatalog(opts = {}) {
  const text = opts.text ?? DEFAULT_TEXT
  const media = opts.media ?? DEFAULT_MEDIA
  const gate = opts.gate
  const env = opts.env ?? process.env
  const settingsDefaults = opts.settingsDefaults && typeof opts.settingsDefaults === 'object'
    ? opts.settingsDefaults
    : {}

  const index = opts.contractIndex
    ? assertContractHealthy(opts.contractIndex)
    : getHealthyContractIndex()
  const dispositionsDoc = loadDispositions()
  const dispositionShapeIssues = validateDispositionsShape(dispositionsDoc)
  if (dispositionShapeIssues.length > 0) {
    const first = dispositionShapeIssues[0]
    throw new Error(`model dispositions invalid: ${first.code} ${first.path ?? ''}: ${first.message}`)
  }
  const defaultsCfg = loadCatalogDefaults()

  // P1b: the gateway snapshot decides membership. An explicit snapshot wins
  // (the runtime shares P1a's refreshed copy); otherwise the read-only current
  // snapshot serves, so an offline machine still gets the bundled floor and a
  // damaged snapshot can never produce an empty catalog.
  const resolved = typeof opts.snapshot === 'object' && opts.snapshot !== null
    ? {
        snapshot: opts.snapshot,
        source: opts.snapshotSource ?? 'injected',
        digest: typeof opts.snapshotDigest === 'string' && opts.snapshotDigest
          ? opts.snapshotDigest
          : snapshotContentDigest(opts.snapshot),
      }
    : resolveCurrentSnapshot()
  const snapshot = resolved.snapshot
  const gatewayIds = new Set(usableSnapshotModels(snapshot).keys())

  // Gateway Contract v2 is the capability source for models the gateway sells.
  // The local ContractIndex remains the adapter/fallback layer. An injected
  // contract index is the test/local-fixture entrypoint and keeps the old
  // local-only projection unless the caller explicitly opts in.
  const gatewayContracts = opts.gatewayContracts !== undefined
    ? opts.gatewayContracts !== false
    : opts.contractIndex === undefined
  const runtime = getRuntimeContractIndex({ localIndex: index, snapshot, gatewayContracts })
  const dto = projectCatalog(runtime.index, dispositionsDoc, defaultsCfg, snapshot)

  // "Missing call contract": the gateway sells the model but no callable
  // contract operation exists. Models with a v2 contract but no local adapter
  // profile are reported separately as adapterUnsupported.
  const gateway = {
    source: resolved.source ?? 'none',
    digest: resolved.digest ?? null,
    models: usableSnapshotModels(snapshot).size,
    missingContract: runtime.missingContract,
    adapterUnsupported: runtime.adapterUnsupported,
  }

  // Gateway publication is the display authority. Local adapter support is an
  // execution status, never a visibility filter; gateway rows without a local
  // adapter remain visible but are marked unsupported.
  const enrichGatewayPublic = opts.contractIndex === undefined || opts.snapshot !== undefined
  const gatewayPublic = enrichGatewayPublic
    ? projectGatewayPublicModels(snapshot, dto.models, new Set(gateway.adapterUnsupported))
    : { models: [] }
  for (const model of gatewayPublic.models) {
    const index = dto.models.findIndex((row) => row.id === model.id)
    if (index >= 0) dto.models[index] = model
    else dto.models.push(model)
  }
  const customModels = projectCustomModels(settingsDefaults.byokProviders)
  for (const model of customModels) {
    if (!dto.models.some((row) => row.id === model.id)) dto.models.push(model)
  }

  // Text bucket: projected listed rows ∩ gateway membership ∩ config/gate-enabled rows.
  // Gateway-only text models are added by the runtime index; local text.models
  // remains the local fallback/override list.
  const enabledTextIds = new Set(
    enabledTextModels(text, gate, getGatewayTextRows({ localIndex: index, snapshot, gatewayContracts }))
      .map((row) => row.id),
  )
  const textRows = dto.text
    .filter((row) => gatewayIds.has(row.id) && enabledTextIds.has(row.id))
    .map((row) => ({ ...row, label: row.label || textModelLabel(row.id) }))

  /** Only models the gateway sells, with a usable line, may enter a list. */
  const listed = (rows) => rows.filter((row) => gatewayIds.has(row.id))

  const lists = {
    text: textRows,
    image: isMediaEnabled(gate, 'image') ? listed(dto.image) : [],
    video: isMediaEnabled(gate, 'video') ? listed(dto.video) : [],
    audio: isMediaEnabled(gate, 'audio') ? listed(dto.audio) : [],
  }
  // Add gateway-public rows that the local contract projection dropped (e.g.
  // no local adapter yet) and user-defined BYOK models. These rows are visible
  // by definition; executionStatus on the row decides whether they may run.
  const kindEnabled = (kind) => kind === 'text' || isMediaEnabled(gate, kind)
  for (const model of gatewayPublic.models) appendCatalogRowByKinds(lists, model, kindEnabled)
  for (const model of customModels) appendCatalogRowByKinds(lists, model, kindEnabled)
  for (const kind of CATALOG_KINDS) lists[kind] = sortCatalogRows(lists[kind])

  const gatewayDefaults = resolved.snapshot && typeof resolved.snapshot.defaults === 'object'
    ? resolved.snapshot.defaults
    : {}
  const configDefaults = {
    text: text.defaultModel || DEFAULT_TEXT.defaultModel,
    image: media.providers?.omnimux?.models?.image || DEFAULT_MEDIA.providers.omnimux.models.image,
    video: media.providers?.omnimux?.models?.video || DEFAULT_MEDIA.providers.omnimux.models.video,
    audio: media.providers?.omnimux?.models?.audio || DEFAULT_MEDIA.providers.omnimux.models.audio,
  }

  /** @type {{ text: string, image: string, video: string, audio: string, analysis?: string }} */
  const defaults = {
    text: '',
    image: '',
    video: '',
    audio: '',
  }
  /** @type {Record<string, { modelId: string, source: string, needsConfirmation?: boolean }>} */
  const defaultsMeta = {}
  for (const kind of CATALOG_KINDS) {
    const ids = new Set(lists[kind].map((row) => row.id))
    const settingsKey = SETTINGS_DEFAULT_KEYS[kind]
    const saved = resolveModelId(runtime.index, trimId(settingsDefaults[settingsKey]))
    const byOpDefault = dto.defaultsByOperation[KIND_PRIMARY_OP[kind]]
    const offlineDefault = typeof byOpDefault === 'string' && ids.has(byOpDefault) ? byOpDefault : ''
    const readyDocumented = lists[kind].find((row) => row.executionStatus === 'ready' && row.gateway?.status === 'documented')
    const ready = lists[kind].find((row) => row.executionStatus === 'ready')
    const fallback = offlineDefault || readyDocumented?.id || ready?.id || lists[kind][0]?.id || ''
    const gatewayDefaultId = resolveModelId(runtime.index, trimId(gatewayDefaults[kind] ?? gatewayDefaults[KIND_PRIMARY_OP[kind]]))
    const gatewayDefault = gatewayDefaultId && lists[kind].some((row) => row.id === gatewayDefaultId && row.executionStatus === 'ready')
      ? gatewayDefaultId : ''
    const resolvedDefault = resolveDefault({
      kind,
      ids,
      env: { [ENV_DEFAULT_KEYS[kind]]: resolveModelId(runtime.index, trimId(env[ENV_DEFAULT_KEYS[kind]])) },
      settingsDefaults: { [settingsKey]: saved },
      gatewayDefault: gatewayDefault && ids.has(gatewayDefault) ? gatewayDefault : '',
      configDefault: resolveModelId(runtime.index, configDefaults[kind]) ?? '',
      fallback,
    })
    defaults[kind] = resolvedDefault
    const explicit = saved && ids.has(saved)
    const source = gatewayDefault && !explicit && resolvedDefault === gatewayDefault ? 'gateway-recommended'
      : offlineDefault && !explicit && resolvedDefault === offlineDefault ? 'offline-floor'
        : !explicit && resolvedDefault === fallback ? (readyDocumented || ready ? 'first-ready' : 'offline-floor')
          : explicit ? 'user'
            : resolvedDefault ? 'config' : 'none'
    defaultsMeta[kind] = {
      modelId: resolvedDefault,
      source,
      ...(saved && !explicit ? { needsConfirmation: true } : {}),
    }
  }

  /** Per-kind generation mode a new node starts in (see resolveDefaultOperation). */
  const defaultOperations = {}
  for (const kind of Object.keys(SETTINGS_DEFAULT_OPERATION_KEYS)) {
    defaultOperations[kind] = resolveDefaultOperation({
      kind,
      configured: settingsDefaults[SETTINGS_DEFAULT_OPERATION_KEYS[kind]],
      modelId: defaults[kind],
      ids: new Set(lists[kind].map((row) => row.id)),
      models: dto.models,
    })
  }

  // Multimodal-understanding default: the analysis scenario rides catalog.text
  // rows but only accepts a model that can take non-text input, so the picker
  // offers it separately from the plain-text default rather than letting the
  // text default silently drive video/audio/document calls.
  const savedAnalysis = trimId(settingsDefaults.defaultAnalysisModel)
  const modalitiesOf = (row) => row?.inputCapability?.modalities
    ?? row?.input
    ?? []
  const analysisRows = lists.text.filter((row) => row.executionStatus !== 'unverified'
    && (modalitiesOf(row) ?? []).some((modality) => modality !== 'text'))
  const gatewayAnalysisId = resolveModelId(runtime.index, trimId(gatewayDefaults.vision_chat))
  const gatewayAnalysis = gatewayAnalysisId
    ? analysisRows.find((row) => row.id === gatewayAnalysisId)
    : undefined
  const analysisFallback = (row) => row?.id || ''
  const firstAnalysis = analysisRows.find((row) => row.id === defaults.text) ?? analysisRows[0]
  if (savedAnalysis) {
    const resolvedAnalysis = resolveModelId(runtime.index, savedAnalysis)
    const compatible = resolvedAnalysis && analysisRows.find((row) => row.id === resolvedAnalysis)
    defaults.analysis = compatible ? resolvedAnalysis : analysisFallback(gatewayAnalysis) || analysisFallback(firstAnalysis)
    defaultsMeta.analysis = {
      modelId: defaults.analysis,
      source: compatible ? 'user' : gatewayAnalysis ? 'gateway-recommended' : 'first-ready',
      ...(!compatible ? { needsConfirmation: true } : {}),
    }
  } else if (gatewayAnalysis) {
    defaults.analysis = gatewayAnalysis.id
    defaultsMeta.analysis = { modelId: gatewayAnalysis.id, source: 'gateway-recommended' }
  } else {
    defaults.analysis = analysisFallback(firstAnalysis)
    defaultsMeta.analysis = { modelId: defaults.analysis, source: defaults.analysis ? 'first-ready' : 'none' }
  }

  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    source: 'omnimux',
    fingerprint: fingerprintOf(lists, defaults, {
      schemaVersion: CANONICAL_SCHEMA_VERSION,
      contractFingerprint: index.contentFingerprint,
      listedOperations: runtime.index.listedOperations ?? [],
      defaultsByOperation: dto.defaultsByOperation,
      defaultsMeta,
      defaultOperations,
      channelGroups: dto.models.map((model) => ({ modelId: model.id, groups: model.channelGroups })),
      dispositions: (dispositionsDoc.dispositions ?? []).map((row) => [
        row?.id,
        row?.disposition,
        row?.target ?? null,
      ]),
      gateway: { source: gateway.source, digest: gateway.digest, missingContract: gateway.missingContract, adapterUnsupported: gateway.adapterUnsupported },
    }),
    contractFingerprint: index.contentFingerprint,
    /** Raw sha256 of the official voice preview mapping from the same loaded snapshot. */
    preview_fingerprint: index.previewFingerprint,
    models: dto.models,
    defaults,
    defaultsMeta,
    defaultsByOperation: dto.defaultsByOperation,
    defaultOperations,
    text: lists.text,
    image: lists.image,
    video: lists.video,
    audio: lists.audio,
    /** Gateway truth this catalog was built against (P1b). */
    gateway,
  }
}

const GATEWAY_KINDS = new Set(CATALOG_KINDS)
const CUSTOM_OPERATION_BY_KIND = Object.freeze({
  text: { id: 'chat', label: '文本对话', inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', required: true, min: 1, max: 1 }], output: { type: 'text' } },
  image: { id: 'text_to_image', label: '文生图', inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', required: true, min: 1, max: 1 }], output: { type: 'image' } },
  video: { id: 'text_to_video', label: '文生视频', inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', required: true, min: 1, max: 1 }], output: { type: 'video' } },
  audio: { id: 'text_to_speech', label: '文本转语音', inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', required: true, min: 1, max: 1 }], output: { type: 'audio' } },
})

/** Convert one Gateway Contract v2 operation into the catalog DTO operation shape. */
function gatewayOperationDto(operation, executionStatus) {
  const parameters = {}
  for (const parameter of Array.isArray(operation?.parameters) ? operation.parameters : []) {
    if (parameter && typeof parameter.name === 'string' && parameter.name) parameters[parameter.name] = structuredClone(parameter)
  }
  const label = approvedOperationLabel(operation.id)
  return {
    id: operation.id,
    // label 只来自已审校目录（operation-registry）；gateway-only 型号不再用 id 冒充。
    ...(label ? { label } : {}),
    output: structuredClone(operation.output ?? {}),
    inputs: (Array.isArray(operation.inputs) ? operation.inputs : []).map((slot) => ({
      ...structuredClone(slot),
      slot: slot.slot || slot.type || 'input',
      ...(slot.required === true ? { required: true } : {}),
    })),
    ...(Object.keys(parameters).length ? { parameters } : {}),
    listed: true,
    implementation: { status: executionStatus === 'ready' ? 'ready' : 'missing' },
    execution: { status: executionStatus === 'ready' ? 'live' : 'none' },
  }
}

/**
 * Build visible rows for every gateway-public model, including models whose
 * local adapter is unsupported. The gateway's executable operations are the
 * display contract; adapter support only changes executionStatus.
 */
function projectGatewayPublicModels(snapshot, localModels, adapterUnsupported) {
  const models = []
  const byId = new Map((localModels ?? []).map((model) => [model.id, model]))
  for (const [id, snapshotModel] of usableSnapshotModels(snapshot)) {
    const contract = snapshotModel?.contract?.schemaVersion === '2.0' ? snapshotModel.contract : null
    if (!contract || !Array.isArray(contract.operations)) continue
    const executable = contract.operations.filter((operation) => operation?.executable === true)
    if (!executable.length) continue
    const local = byId.get(id)
    const executionProfile = mergeExecutionProfiles(local?.executionProfile, executionProfileFromContract(contract))
    const incompleteProfile = !isExecutionProfileComplete(executionProfile, contract.family)
    const status = adapterUnsupported.has(id)
      ? 'unsupported'
      : incompleteProfile ? 'unverified' : 'ready'
    const localOperations = local?.operations ?? []
    const hasLocalListedOperation = localOperations.some((operation) => operation?.listed === true)
    const operations = hasLocalListedOperation ? localOperations : executable.map((operation) => gatewayOperationDto(operation, status))
    const inputCapability = local?.inputCapability ?? mergeInputCapability(executable)
    const gateway = {
      schemaVersion: contract.schemaVersion,
      contractVersion: contract.contractVersion,
      status: contract.status,
      ...(Array.isArray(contract.unknowns) ? { unknowns: [...contract.unknowns] } : {}),
    }
    const row = local ? {
      ...local,
      source: 'gateway',
      executionStatus: status,
      ...(executionProfile ? { executionProfile } : {}),
      ...(inputCapability ? { inputCapability } : {}),
      gateway,
      operations,
    } : {
      id,
      label: typeof snapshotModel.displayName === 'string' && snapshotModel.displayName.trim() ? snapshotModel.displayName.trim() : id,
      source: 'gateway',
      executionStatus: status,
      sourceLabel: 'OmniMux Gateway',
      family: typeof contract.family === 'string' ? contract.family : undefined,
      ...(executionProfile ? { executionProfile } : {}),
      ...(inputCapability ? { inputCapability } : {}),
      channelGroups: getModelChannelGroups(id, snapshot),
      gateway,
      operations,
    }
    models.push(row)
  }
  return { models }
}

/** Build visible rows from legacy BYOK model maps and the new optional profile list. */
function projectCustomModels(byokProviders) {
  const providers = Array.isArray(byokProviders) ? byokProviders : []
  const rows = []
  const seen = new Set()
  for (const provider of providers) {
    if (!provider || typeof provider !== 'object' || typeof provider.provider !== 'string') continue
    const providerId = provider.provider.trim().toLowerCase()
    if (!providerId) continue
    const profiles = Array.isArray(provider.modelProfiles) ? provider.modelProfiles : []
    const entries = profiles.length
      ? profiles.map((profile) => ({
        model: typeof profile?.model === 'string' ? profile.model.trim() : '',
        capability: typeof profile?.capability === 'string' ? profile.capability : '',
        parameters: profile?.parameters,
      }))
      : Object.entries(provider.models && typeof provider.models === 'object' ? provider.models : {}).map(([capability, model]) => ({
        model: typeof model === 'string' ? model.trim() : '',
        capability: capability === 'analysis' ? 'text' : capability,
      }))
    for (const entry of entries) {
      if (!entry.model || !CUSTOM_OPERATION_BY_KIND[entry.capability]) continue
      const id = `${providerId}:${entry.model}`
      if (seen.has(id)) continue
      seen.add(id)
      const operation = CUSTOM_OPERATION_BY_KIND[entry.capability]
      rows.push({
        id,
        label: entry.model,
        source: 'custom',
        executionStatus: 'ready',
        providerId,
        sourceLabel: providerId,
        family: providerId,
        operations: [{ ...structuredClone(operation), listed: true, implementation: { status: 'ready' }, execution: { status: 'ready' } }],
        channelGroups: [{ id: `byok-${providerId}`, label: providerId, enabled: true }],
      })
    }
  }
  return rows
}

/** Append one visible model row into each catalog bucket represented by its operations. */
function appendCatalogRowByKinds(lists, model, kindEnabled = () => true) {
  const kinds = [...new Set((model.operations ?? [])
    .filter((operation) => operation?.listed === true)
    .map((operation) => operation?.output?.type)
    .filter((kind) => GATEWAY_KINDS.has(kind) && kindEnabled(kind)))]
  for (const kind of kinds) {
    const operations = (model.operations ?? []).filter((operation) => operation.output?.type === kind)
    const existing = lists[kind].find((row) => row.id === model.id)
    if (existing) {
      Object.assign(existing, {
        source: model.source,
        executionStatus: model.executionStatus ?? existing.executionStatus,
        operations,
        ...(model.executionProfile ? { executionProfile: structuredClone(model.executionProfile) } : {}),
        ...(model.inputCapability ? { inputCapability: structuredClone(model.inputCapability) } : {}),
        ...(model.gateway ? { gateway: model.gateway } : {}),
        ...(model.channelGroups ? { channelGroups: model.channelGroups } : {}),
      })
      continue
    }
    lists[kind].push({
      id: model.id,
      label: model.label,
      ...(model.badge ? { badge: model.badge } : {}),
      ...(model.subtitle ? { subtitle: model.subtitle } : {}),
      ...(model.family ? { family: model.family } : {}),
      source: model.source,
      executionStatus: model.executionStatus,
      ...(model.providerId ? { providerId: model.providerId } : {}),
      ...(model.sourceLabel ? { sourceLabel: model.sourceLabel } : {}),
      ...(model.channelGroups ? { channelGroups: model.channelGroups } : {}),
      ...(model.gateway ? { gateway: model.gateway } : {}),
      ...(model.inputCapability ? { inputCapability: structuredClone(model.inputCapability) } : {}),
      ...(model.executionProfile ? { executionProfile: structuredClone(model.executionProfile) } : {}),
      operations,
      ...(model.parameters ? { parameters: model.parameters } : {}),
    })
  }
}

const CANVAS_HIDDEN_KINDS = ['text', 'image', 'video', 'audio']


/**
 * @param {{
 *   kind: 'text' | 'image' | 'video' | 'audio',
 *   ids: Set<string>,
 *   env: Record<string, string | undefined>,
 *   settingsDefaults: Record<string, unknown>,
 *   gatewayDefault?: string,
 *   configDefault: string,
 *   fallback: string,
 * }} input
 */
export function resolveDefault(input) {
  const envId = trimId(input.env[ENV_DEFAULT_KEYS[input.kind]])
  if (envId && input.ids.has(envId)) return envId
  const settingsId = trimId(input.settingsDefaults[SETTINGS_DEFAULT_KEYS[input.kind]])
  if (settingsId && input.ids.has(settingsId)) return settingsId
  const gatewayId = trimId(input.gatewayDefault)
  if (gatewayId && input.ids.has(gatewayId)) return gatewayId
  if (input.configDefault && input.ids.has(input.configDefault)) return input.configDefault
  return input.fallback
}

/** @param {unknown} value */
function trimId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

/**
 * Contract-sensitive fingerprint: canonical contract content, projected public
 * channel groups, resolved defaults and disposition governance. Object keys
 * have no ordering semantics; operation and channel candidate arrays retain
 * their order. Two-arg calls remain supported for legacy callers.
 *
 * @param {{ text: Array<{ id: string }>, image: Array<{ id: string }>, video: Array<{ id: string }>, audio: Array<{ id: string }> }} lists
 * @param {{ text: string, image: string, video: string, audio: string }} defaults
 * @param {{
 *   schemaVersion: string,
 *   contractFingerprint: string,
 *   listedOperations: string[],
 *   defaultsByOperation: Record<string, string>,
 *   defaultsMeta?: Record<string, { modelId: string, source: string, needsConfirmation?: boolean }>,
 *   defaultOperations?: Record<string, { modelId: string, operationId: string, rule: string }>,
 *   channelGroups?: Array<{ modelId: string, groups: object[] }>,
 *   dispositions: unknown[],
 *   gateway?: { source: string, digest: string|null, missingContract: string[] },
 * }} [contract]
 */
export function fingerprintOf(lists, defaults, contract) {
  const listIds = {
    text: lists.text.map((row) => row.id),
    image: lists.image.map((row) => row.id),
    video: lists.video.map((row) => row.id),
    audio: lists.audio.map((row) => row.id),
  }
  return contentFingerprint(
    contract && typeof contract === 'object'
      ? {
          schemaVersion: contract.schemaVersion,
          contractFingerprint: contract.contractFingerprint,
          listedOperations: [...(contract.listedOperations ?? [])].sort(),
          defaultsByOperation: contract.defaultsByOperation ?? {},
          defaultsMeta: contract.defaultsMeta ?? {},
          defaultOperations: contract.defaultOperations ?? {},
          channelGroups: contract.channelGroups ?? [],
          dispositions: contract.dispositions ?? [],
          gateway: contract.gateway ?? null,
          lists: listIds,
          defaults,
        }
      : { ...listIds, defaults },
  )
}
