/**
 * Gateway Contract v2 → local runtime contract adapter.
 *
 * The gateway's contract is the capability authority for models it sells. This
 * module only translates that data into the local ContractIndex model shape so
 * the existing catalog projection and SubmitGuard can consume it. It never
 * writes a local model contract and never invents a value the gateway did not
 * establish.
 */

import { mapLegacyOperation } from './contract/legacy-operation-map.js'
import { approvedOperationLabel } from './contract/operation-label.js'
import { executionProfileFromContract, isExecutionProfileComplete, mergeExecutionProfiles } from './execution-profile.js'

export const GATEWAY_CONTRACT_SCHEMA_VERSION = '2.0'

/** First-wave gateway families: text and image. Video/audio stay local until their adapters are revalidated. */
export const GATEWAY_OVERLAY_FAMILIES = Object.freeze(['llm', 'image'])

/** Gateway operation ids that have a local historical name on some models. */
const GATEWAY_OPERATION_ALIASES = Object.freeze({
  image_to_image: ['multi_reference'],
  image_to_video: ['first_frame'],
  reference_to_video: ['video_multi_ref'],
  first_last_frame_to_video: ['first_last_frame'],
})

/** Gateway parameter names → local logical request/UI names. */
const PARAMETER_NAME_MAP = Object.freeze({
  aspect_ratio: 'aspectRatio',
  generate_audio: 'sound',
  output_format: 'outputFormat',
})

/** Format extensions that local contract slots express as MIME types. */
const MIME_BY_FORMAT = Object.freeze({
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  quicktime: 'video/quicktime',
  webm: 'video/webm',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  pdf: 'application/pdf',
})

const GROUP_BY_FAMILY = Object.freeze({
  llm: 'text',
  image: 'image',
  video: 'video',
  audio: 'audio',
})

/** @param {unknown} value */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** @param {unknown} value */
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {}
}

/** @param {unknown} value */
function array(value) {
  return Array.isArray(value) ? value : []
}

/** @param {string} id */
function humanizeId(id) {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/** Infer a display family when the gateway model has no local contract. */
function familyFor(id, contract) {
  const prefix = String(id).toLowerCase()
  if (prefix.startsWith('gemini') || prefix.startsWith('nano-banana') || prefix.startsWith('imagen')) return 'google'
  if (prefix.startsWith('gpt') || prefix.startsWith('dall-e') || prefix.startsWith('openai')) return 'openai'
  if (prefix.startsWith('claude')) return 'anthropic'
  if (prefix.startsWith('deepseek')) return 'deepseek'
  if (prefix.startsWith('grok')) return 'grok'
  if (prefix.startsWith('kimi')) return 'kimi'
  if (prefix.startsWith('glm')) return 'zhipu'
  if (prefix.startsWith('suno')) return 'suno'
  if (prefix.startsWith('seedance')) return 'seedance'
  if (prefix.startsWith('seedream')) return 'seedream'
  if (prefix.startsWith('wan')) return 'wan'
  if (prefix.startsWith('minimax') || prefix.startsWith('hailuo')) return 'minimax'
  if (prefix.startsWith('indextts') || prefix.startsWith('index-tts')) return 'indextts'
  return text(contract.family) || 'unknown'
}

/** @param {unknown} family */
function groupForFamily(family) {
  return GROUP_BY_FAMILY[text(family)] ?? null
}

/** @param {string} format */
function toMime(format) {
  const token = text(format).toLowerCase()
  return token.includes('/') ? token : (MIME_BY_FORMAT[token] ?? token)
}

/** @param {unknown} value */
function stringList(value) {
  return array(value).map(text).filter(Boolean)
}

/**
 * One gateway parameter's local definition. The gateway uses an array of
 * declarative entries; local contracts use a keyed definition object.
 *
 * @param {Record<string, unknown>} parameter
 * @returns {{ name: string, definition: Record<string, unknown> } | null}
 */
function toLocalParameter(parameter) {
  const gatewayName = text(parameter.name)
  if (!gatewayName) return null
  const name = PARAMETER_NAME_MAP[gatewayName] ?? gatewayName
  const type = text(parameter.type)
  /** @type {Record<string, unknown>} */
  const definition = {}

  const normalizeEnumValue = (value) => (name === 'resolution' && typeof value === 'string' ? value.toLowerCase() : value)

  if (parameter.fixed !== undefined) {
    const fixed = normalizeEnumValue(parameter.fixed)
    definition.type = type === 'integer' || type === 'number'
      ? type
      : type === 'boolean' ? 'boolean' : 'string'
    definition.options = [{ value: fixed }]
    definition.defaultValue = fixed
    return { name, definition }
  }

  if (type === 'enum') {
    const values = array(parameter.enum).map(normalizeEnumValue)
    if (values.length === 0) return null
    definition.type = values.every((value) => typeof value === 'number') ? 'number' : 'string'
    definition.options = values.map((value) => ({ value }))
    const defaultValue = parameter.default === undefined ? values[0] : normalizeEnumValue(parameter.default)
    definition.defaultValue = defaultValue
    if (name === 'resolution') definition.caseInsensitive = true
    return { name, definition }
  }

  if (type === 'integer' || type === 'number') {
    definition.type = type
    const range = {}
    if (parameter.minimum !== undefined) range.min = parameter.minimum
    if (parameter.maximum !== undefined) range.max = parameter.maximum
    if (parameter.step !== undefined) range.step = parameter.step
    if (Object.keys(range).length > 0) definition.range = range
    if (parameter.default !== undefined) definition.defaultValue = parameter.default
    return { name, definition }
  }

  if (type === 'boolean') {
    definition.type = 'boolean'
    definition.defaultValue = parameter.default === true
    return { name, definition }
  }

  definition.type = 'string'
  if (parameter.default !== undefined) definition.defaultValue = parameter.default
  return { name, definition }
}

/**
 * Convert gateway operation parameters to the local keyed definition map.
 *
 * @param {unknown} parameters
 * @returns {Record<string, unknown>}
 */
export function localParameterDefinitions(parameters) {
  if (parameters && typeof parameters === 'object' && !Array.isArray(parameters)) {
    return { .../** @type {Record<string, unknown>} */ (parameters) }
  }
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const entry of array(parameters)) {
    if (!entry || typeof entry !== 'object') continue
    const converted = toLocalParameter(/** @type {Record<string, unknown>} */ (entry))
    if (!converted) continue
    out[converted.name] = converted.definition
  }
  return out
}

/**
 * Legacy resolution compatibility for image contracts that publish only output
 * pixel sizes. Local images historically expose 1K/2K/4K; the gateway's pixel
 * list maps back to those buckets without inventing unsupported pixel values.
 *
 * @param {unknown} sizes
 * @returns {{ type: 'string', options: Array<{ value: string }>, defaultValue: string } | null}
 */
function resolutionFromOutputSizes(sizes) {
  const values = stringList(sizes).map((value) => value.trim())
  if (values.length === 0) return null
  const tokens = values.map((value) => value.toLowerCase())
  if (tokens.some((value) => value === '4k')) return { type: 'string', options: [{ value: '4K' }], defaultValue: '4K' }
  if (tokens.some((value) => value === '2k')) return { type: 'string', options: [{ value: '2K' }], defaultValue: '2K' }
  if (tokens.some((value) => value === '1k')) return { type: 'string', options: [{ value: '1K' }], defaultValue: '1K' }
  // Pixel-size lists such as 1024x1024 / 1536x1024 are the gateway's standard
  // image tier; the local catalog calls that tier 1K.
  if (tokens.every((value) => /^\d+x\d+$/.test(value))) {
    return { type: 'string', options: [{ value: '1K' }], defaultValue: '1K' }
  }
  return null
}

/** @param {unknown} definition */
function schemaOptions(definition) {
  return array(definition?.options).map((option) => {
    const row = object(option)
    return {
      value: row.value,
      ...(typeof row.label === 'string' ? { label: row.label } : {}),
    }
  })
}

/**
 * Model-level ModelParameterSchema for the workflow canvas. This is a display
 * projection only; operation-level definitions remain the guard authority.
 *
 * @param {Array<Record<string, unknown>>} operations
 * @param {Record<string, unknown>} contract
 * @returns {Record<string, unknown> | undefined}
 */
export function modelParameterSchema(operations, contract) {
  /** @type {Record<string, unknown>} */
  const schema = {}
  const promptMax = typeof contract.prompt_max_chars === 'number' && contract.prompt_max_chars > 0
    ? contract.prompt_max_chars
    : undefined
  if (promptMax !== undefined) schema.prompt = { maxLength: promptMax }

  for (const operation of operations) {
    const definitions = localParameterDefinitions(operation.parameters)
    for (const [name, definition] of Object.entries(definitions)) {
      if (schema[name] !== undefined) continue
      if (name === 'aspectRatio' || name === 'resolution' || name === 'quality' || name === 'outputFormat') {
        const options = schemaOptions(definition)
        if (options.length === 0) continue
        schema[name] = {
          options,
          defaultValue: String(definition.defaultValue ?? options[0].value),
        }
        if (name === 'resolution') schema[name].caseInsensitive = true
      } else if (name === 'duration') {
        if (definition.range) {
          schema.duration = {
            range: definition.range,
            defaultValue: typeof definition.defaultValue === 'number' ? definition.defaultValue : Number(definition.range.min ?? 0),
            ...(definition.allowAuto === true ? { allowAuto: true } : {}),
          }
        } else if (definition.options) {
          schema.duration = {
            options: schemaOptions(definition).map((option) => ({ ...option, value: Number(option.value) })),
            defaultValue: Number(definition.defaultValue ?? 0),
          }
        }
      } else if (name === 'sound') {
        schema.sound = { supported: true, defaultValue: definition.defaultValue === true }
      } else if (name === 'seed') {
        schema.seed = { type: 'integer', ...(definition.range ? { range: definition.range } : {}) }
      }
    }
  }
  return Object.keys(schema).length > 0 ? schema : undefined
}

/** @param {unknown} type */
function normalizeInputType(type) {
  if (type === 'pdf' || type === 'url') return 'document'
  return type
}

/**
 * Modalities accepted by one operation set, in the legacy inputCapability
 * shape. This is only a display/fallback summary; operation inputs remain the
 * per-slot authority.
 *
 * @param {Array<Record<string, unknown>>} operations
 * @returns {{ modalities: string[] }}
 */
function inputCapabilityFor(operations) {
  const modalities = []
  for (const operation of operations) {
    for (const input of array(operation.inputs)) {
      const type = normalizeInputType(text(input.type))
      if (!modalities.includes(type)) modalities.push(type)
    }
  }
  return { modalities: modalities.length > 0 ? modalities : ['text'] }
}

/**
 * Convert one gateway input slot to a local InputSlotDto.
 *
 * @param {Record<string, unknown>} input
 * @returns {Record<string, unknown> | null}
 */
export function localInputSlot(input) {
  const slot = text(input.slot)
  const type = normalizeInputType(text(input.type))
  if (!slot || !['text', 'image', 'video', 'audio', 'document'].includes(type)) return null
  const required = input.required === true
  const min = required ? 1 : (typeof input.min === 'number' ? input.min : 0)
  const max = input.max === null || input.max === undefined
    ? (required ? 1 : null)
    : input.max
  const role = text(input.role) || (slot === 'prompt' ? 'prompt' : 'reference')
  /** @type {Record<string, unknown>} */
  const source = text(input.source) || (slot === 'prompt' ? 'node_field' : 'upstream_edge')
  const out = {
    slot,
    type,
    role,
    source,
    min,
    max,
    // Gateway v2 inputs declare cardinality/MIME but not the local editor's
    // value-source/composition hints. Infer the safe local defaults so the
    // canvas does not treat a declared slot as missing.
    valueSources: source === 'upstream_edge'
      ? ['upstream_output']
      : ['local_field', 'upstream_output'],
    ...(slot === 'prompt'
      ? { composition: { kind: 'content_with_instruction', localRole: 'instruction' } }
      : {}),
  }
  const mimes = stringList(input.allowedMimes).map(toMime).filter(Boolean)
  if (mimes.length > 0) out.allowedMimes = mimes
  if (typeof input.maxSizeMb === 'number') out.maxSizeMb = input.maxSizeMb
  if (typeof input.minDurationSec === 'number') out.minDurationSec = input.minDurationSec
  if (typeof input.maxDurationSec === 'number') out.maxDurationSec = input.maxDurationSec
  return out
}

/**
 * Find a local adapter profile that can execute one gateway operation.
 *
 * @param {object} profiles
 * @param {string} operationId
 * @param {string} outputType
 * @param {string} family
 * @returns {{ id: string, seam: string } | null}
 */
function findAdapterProfile(profiles, operationId, outputType, family) {
  const rows = array(profiles?.profiles).filter((profile) => profile && typeof profile === 'object')
  const candidates = rows.filter((profile) =>
    profile.status === 'live'
    && array(profile.operations).includes(operationId)
    && array(profile.outputTypes).includes(outputType))
  if (candidates.length === 0) return null
  const preferred = candidates.find((profile) =>
    (family === 'llm' && profile.id === 'textComplete')
    || (family === 'image' && profile.id === 'imageGenerate')
    || (family === 'video' && profile.id === 'videoGenerate')
    || (family === 'audio' && (profile.id === 'audioGenerate' || profile.id === 'speechToText')))
  const chosen = preferred ?? candidates[0]
  return { id: text(chosen.id), seam: text(chosen.seam) || text(chosen.id) }
}

/** @param {object} localModel @param {string} operationId */
function findLocalOperation(localModel, operationId) {
  const operations = array(localModel?.operations)
  const exact = operations.find((operation) => operation?.id === operationId)
  if (exact) return exact
  const aliases = GATEWAY_OPERATION_ALIASES[operationId] ?? []
  return operations.find((operation) => aliases.includes(operation?.id)) ?? null
}

/**
 * Find the local slot that corresponds to a gateway slot. It is used only to
 * retain a local conservative upload cap when the gateway did not publish one;
 * gateway-declared limits always win.
 *
 * @param {object | null} localOperation
 * @param {Record<string, unknown>} gatewayInput
 * @param {object | null} [localModel]
 */
function findLocalInputTemplate(localOperation, gatewayInput, localModel) {
  const inputs = [
    ...array(localOperation?.inputs),
    ...array(localModel?.operations).flatMap((operation) => array(operation.inputs)),
  ]
  const slot = text(gatewayInput.slot)
  const role = text(gatewayInput.role) || (slot === 'prompt' ? 'prompt' : 'reference')
  const type = normalizeInputType(text(gatewayInput.type))
  return inputs.find((input) => input?.slot === slot)
    ?? inputs.find((input) => input?.role === role && normalizeInputType(input?.type) === type)
    ?? null
}

/**
 * Convert one gateway operation into the local operation shape.
 *
 * @param {Record<string, unknown>} gatewayOperation
 * @param {object | null} localModel
 * @param {object} profiles
 * @param {string} family
 * @returns {{ operation: Record<string, unknown>, adapterSupported: boolean } | null}
 */
function toLocalOperation(gatewayOperation, localModel, profiles, family) {
  const gatewayId = text(gatewayOperation.id)
  if (!gatewayId) return null
  const localOp = findLocalOperation(localModel, gatewayId)
  const operationId = text(localOp?.id) || mapLegacyOperation(gatewayId) || gatewayId
  const output = object(gatewayOperation.output)
  const outputType = text(output.type)
  if (!['text', 'image', 'video', 'audio'].includes(outputType)) return null

  const localProfile = localOp?.implementation && typeof localOp.implementation === 'object'
    ? { id: text(localOp.implementation.profileId), seam: text(localOp.implementation.seam) }
    : null
  const profile = localProfile?.id
    ? localProfile
    : findAdapterProfile(profiles, operationId, outputType, family)
  const executable = gatewayOperation.executable === true
  const adapterSupported = Boolean(profile?.id)
  const inputs = array(gatewayOperation.inputs)
    .map((rawInput) => {
      const gatewayInput = object(rawInput)
      const mapped = localInputSlot(gatewayInput)
      if (!mapped) return null
      const localInput = findLocalInputTemplate(localOp, gatewayInput, localModel)
      if (localInput) {
        // The local adapter may be stricter than the gateway (for example a
        // conservative 20 MB upload cap). Never use it to widen a gateway limit.
        if ((gatewayInput.max === undefined || gatewayInput.max === null) && localInput.max !== undefined) {
          mapped.max = localInput.max
        }
        if (mapped.maxSizeMb === undefined && localInput.maxSizeMb !== undefined) {
          mapped.maxSizeMb = localInput.maxSizeMb
        }
      }
      return mapped
    })
    .filter(Boolean)
  const parameters = localParameterDefinitions(gatewayOperation.parameters)
  if (!parameters.resolution) {
    const resolution = resolutionFromOutputSizes(output.sizes)
    if (resolution) parameters.resolution = resolution
  }

  /** @type {Record<string, unknown>} */
  // label 只来自已审校目录；都不认就省略该字段（Issue #4103）。
  const approvedLabel = text(localOp?.label) || approvedOperationLabel(operationId) || ''
  const operation = {
    id: operationId,
    ...(approvedLabel ? { label: approvedLabel } : {}),
    output: {
      type: outputType,
      ...(output.formats ? { allowedMimes: stringList(output.formats).map(toMime) } : {}),
      ...(output.sizes ? { sizes: stringList(output.sizes) } : {}),
    },
    inputs,
    ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
    // The gateway's executable bit is the admission signal. A missing local
    // adapter profile is a local implementation gap, not a model capability.
    listed: executable && adapterSupported,
    gatewaySource: true,
    research: localOp?.research ?? { status: 'draft', notes: 'Gateway Contract v2; local live evidence not recorded' },
    implementation: profile?.id
      ? { status: 'ready', profileId: profile.id, seam: profile.seam }
      : { status: 'none' },
    execution: localOp?.execution ?? (profile?.id
      ? { status: 'stub', profileId: profile.id, seam: profile.seam, notes: 'Gateway Contract v2' }
      : { status: 'none' }),
    ...(localOp?.inputGroups ? { inputGroups: structuredClone(localOp.inputGroups) } : {}),
    ...(localOp?.aliases ? { aliases: [...localOp.aliases] } : {}),
  }
  if (operationId !== gatewayId) operation.aliases = [...(operation.aliases ?? []), gatewayId]
  // The old local text contract split chat/vision_chat; gateway Contract v2
  // combines media inputs under chat. Keep the old id as a read-only alias.
  if (gatewayId === 'chat' && (localModel?.operations ?? []).some((candidate) => candidate?.id === 'vision_chat')) {
    operation.aliases = [...(operation.aliases ?? []), 'vision_chat']
  }
  if (Array.isArray(gatewayOperation.aliases)) {
    operation.aliases = [...(operation.aliases ?? []), ...stringList(gatewayOperation.aliases)]
  }
  return { operation, adapterSupported }
}

/**
 * Build one runtime model from a gateway contract.
 *
 * @param {Record<string, unknown>} snapshotModel
 * @param {object | null} localModel
 * @param {object} profiles
 * @returns {{ model: Record<string, unknown>, adapterSupported: boolean } | null}
 */
function toRuntimeModel(snapshotModel, localModel, profiles) {
  const contract = object(snapshotModel.contract)
  if (text(contract.schemaVersion) !== GATEWAY_CONTRACT_SCHEMA_VERSION) return null
  const gatewayOperations = array(contract.operations)
  if (gatewayOperations.length === 0) return null
  const family = text(localModel?.family) || familyFor(text(snapshotModel.id), contract)
  const gatewayFamily = text(contract.family)
  const managementGroup = text(localModel?.managementGroup) || groupForFamily(gatewayFamily)
  if (!managementGroup) return null

  const operations = []
  let anyAdapterSupported = false
  for (const raw of gatewayOperations) {
    if (!raw || typeof raw !== 'object') continue
    const result = toLocalOperation(/** @type {Record<string, unknown>} */ (raw), localModel, profiles, gatewayFamily)
    if (!result) continue
    operations.push(result.operation)
    anyAdapterSupported ||= result.adapterSupported
  }
  if (operations.length === 0) return null

  const id = text(snapshotModel.id) || text(contract.model_id)
  if (!id) return null
  const displayName = text(snapshotModel.displayName)
  const listedOperations = operations.filter((operation) => operation.listed).map((operation) => operation.id)
  const parameters = modelParameterSchema(operations, contract)
  const localParameters = localModel?.parameters && typeof localModel.parameters === 'object'
    ? structuredClone(localModel.parameters)
    : undefined
  const executionProfile = mergeExecutionProfiles(localModel?.executionProfile, executionProfileFromContract(contract))
  const model = {
    id,
    label: text(localModel?.label) || (displayName && displayName !== id ? displayName : humanizeId(id)),
    ...(text(localModel?.family) ? { family: text(localModel.family) } : { family }),
    ...(text(localModel?.badge) ? { badge: text(localModel.badge) } : {}),
    ...(text(localModel?.subtitle) ? { subtitle: text(localModel.subtitle) } : {}),
    ...(array(localModel?.aliases).length > 0 ? { aliases: [...localModel.aliases] } : {}),
    ...(text(localModel?.role) ? { role: text(localModel.role) } : { role: 'flagship' }),
    managementGroup,
    operations,
    inputCapability: inputCapabilityFor(operations),
    ...(executionProfile ? { executionProfile } : {}),
    executionStatus: managementGroup === 'text' && !isExecutionProfileComplete(executionProfile, family)
      ? 'unverified'
      : 'ready',
    ...(parameters ? { parameters } : localParameters ? { parameters: localParameters } : {}),
    listed: listedOperations.length > 0,
    listedOperations,
    research: localModel?.research ?? { status: 'draft', notes: 'Gateway Contract v2' },
    implementation: localModel?.implementation ?? { status: 'ready', profileId: '', seam: '' },
    execution: localModel?.execution ?? { status: 'stub', profileId: '', seam: '', notes: 'Gateway Contract v2' },
    gatewaySource: true,
    gatewaySchemaVersion: GATEWAY_CONTRACT_SCHEMA_VERSION,
    gatewayContractVersion: text(contract.contractVersion),
    gatewayStatus: text(contract.status) || 'documented',
    ...(array(contract.unknowns).length > 0 ? { gatewayUnknowns: stringList(contract.unknowns) } : {}),
  }
  if (!localModel?.implementation) {
    const firstProfiled = operations.find((operation) => operation.implementation?.profileId)
    model.implementation = firstProfiled?.implementation ?? { status: 'none' }
    model.execution = firstProfiled?.execution ?? { status: 'stub', profileId: '', seam: '' }
  }
  return { model, adapterSupported: anyAdapterSupported }
}

/**
 * Build gateway-backed runtime models from a snapshot.
 *
 * @param {object | undefined} snapshot
 * @param {object} localIndex
 * @param {object} [profiles]
 * @returns {{ models: Map<string, object>, adapterUnsupported: string[], missingContract: string[] }}
 */
export function gatewayContractModels(snapshot, localIndex, profiles = localIndex?.profiles) {
  const models = new Map()
  const adapterUnsupported = []
  const missingContract = []
  const localModels = localIndex && typeof localIndex.get === 'function'
    ? (id) => localIndex.get(id)
    : () => undefined

  for (const snapshotModel of array(snapshot?.models)) {
    if (!snapshotModel || typeof snapshotModel !== 'object') continue
    const id = text(snapshotModel.id)
    if (!id) continue
    const contract = object(snapshotModel.contract)
    const localModel = localModels(id) ?? null
    const localHasListed = (localModel?.operations ?? []).some((operation) => operation?.listed === true)
    if (!GATEWAY_OVERLAY_FAMILIES.includes(text(contract.family))) {
      // Do not replace local video/audio behavior until its adapter is
      // revalidated against Contract v2. Sold models without a callable local
      // operation are still reported as an adapter gap, never silently dropped.
      if (!localHasListed) adapterUnsupported.push(id)
      continue
    }
    if (Object.keys(contract).length === 0 || text(contract.schemaVersion) !== GATEWAY_CONTRACT_SCHEMA_VERSION) {
      if (!localHasListed) missingContract.push(id)
      continue
    }
    const result = toRuntimeModel(/** @type {Record<string, unknown>} */ (snapshotModel), localModel, profiles)
    if (!result) {
      if (!localHasListed) missingContract.push(id)
      continue
    }
    if (!result.adapterSupported) adapterUnsupported.push(id)
    models.set(id, result.model)
  }
  return { models, adapterUnsupported: [...new Set(adapterUnsupported)].sort(), missingContract: [...new Set(missingContract)].sort() }
}

/**
 * Text-directory rows derived from gateway-backed models.
 *
 * @param {object | undefined} snapshot
 * @param {object} localIndex
 * @param {object} [profiles]
 * @returns {Array<{ id: string, brand: string, role: string, input: string[], inputCapability?: object }>}
 */
export function gatewayTextRows(snapshot, localIndex, profiles = localIndex?.profiles) {
  const { models } = gatewayContractModels(snapshot, localIndex, profiles)
  const rows = []
  for (const model of models.values()) {
    if (model.managementGroup !== 'text') continue
    const textOps = (model.operations ?? []).filter((operation) =>
      operation.listed === true && operation.output?.type === 'text')
    if (textOps.length === 0) continue
    const inputCapability = model.inputCapability ?? { modalities: ['text'] }
    rows.push({
      id: model.id,
      brand: model.family || 'unknown',
      role: model.role === 'classic' ? 'classic' : 'flagship',
      input: Array.isArray(inputCapability.modalities) ? [...inputCapability.modalities] : ['text'],
      inputCapability,
      ...(model.executionProfile ? { executionProfile: structuredClone(model.executionProfile) } : {}),
      executionStatus: model.executionStatus,
    })
  }
  return rows.sort((left, right) => left.id.localeCompare(right.id))
}
