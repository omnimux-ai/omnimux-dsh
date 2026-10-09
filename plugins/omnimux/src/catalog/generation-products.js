import { createHash } from 'node:crypto'
import { canonicalStringify, loadAll } from './contract/load.js'
import { resetSchemaCaches } from './contract/schema.js'
import { getModelChannelGroups } from './serving/channel-groups.js'
import { checkParameterMember, evaluateCandidateRequest } from '../../lib/generation-core.js'

/** @typedef {string | number | boolean | null} Primitive */
/** @typedef {Record<string, unknown>} Data */
/** @typedef {{schemaVersion?: string, registry: Data, parseErrors?: unknown[], issues?: Data[], all: () => Data[]}} Index */
/** @typedef {{ readIndex?: () => Index, readGroups?: (modelId: string) => Data[], readQualification?: (candidate: {identity: Data, domain: Data}) => unknown }} Dependencies */
/** @typedef {{schemaVersion: 1, currentFingerprint: string, productId: string, intent: string, prompt?: string, parameters: Record<string, Primitive | undefined>, assets: Data[]}} RequestV1 */
/** @typedef {{schemaVersion: 1, currentFingerprint: string, requestFingerprint?: string, status: 'ready' | 'pending' | 'rejected' | 'indeterminate', executable: false, issues: Data[]}} PreviewV1 */
const POLICY = [
  { productId: 'generation.image', label: '生图', type: 'image', intents: ['text_to_image', 'image_to_image', 'multi_reference'] },
  { productId: 'generation.video', label: '生视频', type: 'video', intents: ['video_multi_ref', 'first_last_frame'] },
]
const INPUT_KEYS = ['slot', 'type', 'role', 'source', 'min', 'max', 'allowedMimes', 'maxSizeMb', 'maxSizeExclusive', 'minDurationSec', 'maxDurationSec', 'totalMinDurationSec', 'totalMaxDurationSec', 'totalMinExclusive', 'totalMaxExclusive', 'combinedOutputMaxDurationSec']
const PARAM_KEYS = ['type', 'options', 'range', 'supported', 'allowAuto', 'caseInsensitive', 'minLength', 'maxLength', 'unit']
const ASSET_KEYS = ['type', 'pathOrUrl', 'role', 'targetSlot', 'mime', 'sizeBytes', 'durationSec', 'sourceNodeId', 'edgeId', 'outputId', 'outputVersion', 'originalName', 'dimensions']
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
/** @param {unknown} value @returns {value is Primitive} */
const primitive = value => value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
const name = value => typeof value === 'string' && value.length > 0 && value.trim().length > 0
const count = value => Number.isSafeInteger(value) && value >= 0
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
/** Own data descriptors are checked before any read, including permitted undefined transport. */
function record(value) {
  return value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && !Object.getOwnPropertySymbols(value).length && Object.getOwnPropertyNames(value).every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      return descriptor?.enumerable === true && own(descriptor, 'value')
    })
}
function array(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== value.length + 1) return false
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i))
    if (!descriptor?.enumerable || !own(descriptor, 'value')) return false
  }
  return true
}
const bounded = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key))
/** @param {Data} target @param {string} key @param {unknown} value */
function put(target, key, value) { Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true }) }
/** Copy JSON data without retaining references or invoking getters. Undefined is not JSON. */
function copy(value, depth = 0) {
  if (primitive(value)) return value
  if (depth > 32) throw new TypeError('invalid data')
  if (array(value)) return value.map(item => copy(item, depth + 1))
  if (!record(value)) throw new TypeError('invalid data')
  const out = {}
  for (const key of Object.keys(value)) put(out, key, copy(value[key], depth + 1))
  return out
}
function pick(value, keys) {
  const out = {}
  for (const key of keys) if (own(value, key) && value[key] !== undefined) put(out, key, copy(value[key]))
  return out
}
/** Entry encoding preserves special own names even in the legacy canonical stringifier. */
function hash(value) {
  function entries(item) {
    if (Array.isArray(item)) return ['array', item.map(entries)]
    if (record(item)) return ['record', Object.keys(item).sort().map(key => [key, entries(item[key])])]
    return item
  }
  return createHash('sha256').update(canonicalStringify(entries(value))).digest('hex')
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const key of Object.keys(value)) freeze(value[key]); Object.freeze(value) }
  return value
}
function definitions(model, operation) {
  const out = {}
  if (!record(model.parameters ?? {}) || !record(operation.parameters ?? {})) return null
  for (const source of [model.parameters ?? {}, operation.parameters ?? {}]) for (const key of Object.keys(source)) put(out, key, copy(source[key]))
  return out
}
/** Only the registered voice materializer's identified picker metadata is non-domain data. */
function optionProjection(option) {
  if (primitive(option)) return option
  if (!bounded(option, ['value', 'label', 'meta'])) return null
  if (own(option, 'meta')) {
    const meta = option.meta
    if (!bounded(meta, ['voice_type', 'name', 'display_name', 'category', 'language', 'accent', 'gender', 'tags', 'resource_id', 'is_hot', 'hot_order', 'preview'])
      || !name(meta.voice_type) || meta.voice_type !== option.value || meta.display_name !== option.label
      || !bounded(meta.preview, ['purpose', 'state', 'primary_url', 'candidates', 'checked_at', 'evidence_ref'])
      || meta.preview.purpose !== 'official-voice-preview' || !['verified-file', 'unverified'].includes(meta.preview.state)
      || ['voice_type', 'name', 'display_name', 'category', 'language', 'accent', 'gender', 'resource_id'].some(key => own(meta, key) && typeof meta[key] !== 'string')
      || (own(meta, 'tags') && (!array(meta.tags) || !meta.tags.every(name)))
      || (own(meta, 'is_hot') && typeof meta.is_hot !== 'boolean') || (own(meta, 'hot_order') && !count(meta.hot_order))
      || !array(meta.preview.candidates) || !meta.preview.candidates.every(name)
      || ['primary_url', 'checked_at', 'evidence_ref'].some(key => !own(meta.preview, key) || (meta.preview[key] !== null && !name(meta.preview[key])))) return null
  }
  return pick(option, ['value', 'label'])
}
/** Recursive positive digest projection. Unknown semantic keys retain presence, never arbitrary values. */
function semantic(value, kind) {
  if (primitive(value)) return value
  if (array(value)) return value.map(item => semantic(item, kind))
  if (!record(value)) throw new TypeError('invalid data')
  if (kind === 'fields') {
    const out = {}
    for (const field of Object.keys(value)) put(out, field, semantic(value[field], 'parameter'))
    return out
  }
  if (kind === 'parameterConstraints') {
    const out = {}
    for (const field of Object.keys(value)) put(out, field, semantic(value[field], 'parameterConstraint'))
    return out
  }
  const shapes = {
    model: { id: '', label: '', family: '', badge: '', subtitle: '', role: '', managementGroup: '', aliases: '', listed: '', listedOperations: '',
      parameters: 'fields', operations: 'operation', research: 'status', implementation: 'status', execution: 'status', routing: 'routing' },
    operation: { id: '', label: '', listed: '', aliases: '', research: 'status', implementation: 'status', execution: 'status',
      inputs: 'input', inputGroups: 'inputGroup', parameters: 'fields', output: 'output' },
    status: { status: '', verifiedAt: '', profileId: '', seam: '' },
    routing: { channel: '', wireModel: '', protocol: '', automaticFallback: '' },
    parameter: { ...Object.fromEntries(PARAM_KEYS.map(key => [key, ''])), options: 'option', range: 'range', defaultValue: '', optionsFrom: '', label: '' },
    option: { value: '', label: '' }, range: { min: '', max: '', step: '' },
    input: { ...Object.fromEntries(INPUT_KEYS.map(key => [key, ''])), valueSources: '', composition: 'composition', limitSource: 'limitSource' },
    composition: { kind: '', localRole: '' }, limitSource: { kind: '' }, inputGroup: { slots: '', min: '' },
    output: { type: '', allowedMimes: '', min: '', max: '' },
    group: { id: '', wireGroup: '', wireModel: '', channelId: '', protocol: '', enabled: '', constraints: 'constraints' },
    constraints: { operations: '', parameters: 'parameterConstraints', inputs: 'mediaConstraints' },
    parameterConstraint: { fixed: '', only: '', supported: '' }, mediaConstraints: { image: 'mediaConstraint', video: 'mediaConstraint', audio: 'mediaConstraint' },
    mediaConstraint: { max: '' }, registry: { version: '', operations: 'registeredOperation' },
    registeredOperation: { id: '', label: '', group: '', defaultOutputType: '', promptPolicy: '' },
    identity: { canonicalModelId: '', channelId: '', realGroupId: '', wireGroup: '', wireModel: '', operationId: '', purpose: '', protocol: '', mappingDigest: '' },
    domain: { inputs: 'input', inputGroups: 'inputGroup', parameters: 'fields', output: 'output', constraints: 'constraints' },
    evidence: { identity: 'identity', domain: 'domain', active: '', sourceDigest: '', documentVersion: '', sample: 'sample' },
    sample: { mode: '', taskId: '', output: 'outputFacts' },
    outputFacts: { type: '', verified: '', count: '', mime: '', sizeBytes: '', durationSec: '', width: '', height: '', digest: '', outputId: '', outputVersion: '' },
  }
  const shape = shapes[kind] ?? {}, out = {}, unknown = []
  const metadata = ['label', 'help', 'description', 'notes', 'docUrl', 'meta', 'hint']
  for (const key of Object.keys(value)) {
    if (own(shape, key)) put(out, key, shape[key] ? semantic(value[key], shape[key]) : scalarSemantics(value[key]))
    else if (!metadata.includes(key) && !['sample', 'outputFacts', 'evidence', 'identity', 'status', 'routing', 'model', 'operation', 'registry', 'registeredOperation'].includes(kind)) unknown.push(key)
  }
  return { values: out, unknown: unknown.sort() }
}
function scalarSemantics(value) {
  if (primitive(value)) return value
  if (array(value)) return value.map(scalarSemantics)
  if (!record(value)) throw new TypeError('invalid data')
  return { unknown: Object.keys(value).sort() }
}
/** Remove only defaults for judgment; unknown options remain unproven. */
function judgmentDefinitions(defs) {
  if (!record(defs)) return defs
  const out = {}
  for (const field of Object.keys(defs)) {
    const def = defs[field]
    if (!record(def)) { put(out, field, def); continue }
    const clean = {}
    for (const key of Object.keys(def)) if (key !== 'defaultValue') put(clean, key, copy(def[key]))
    if (array(clean.options)) clean.options = clean.options.map(option => primitive(option) ? option : optionProjection(option) ?? {})
    put(out, field, clean)
  }
  return out
}
function publicDefinitions(defs) {
  if (!record(defs)) return null
  const out = {}
  for (const field of Object.keys(defs)) {
    const def = defs[field]
    if (!bounded(def, [...PARAM_KEYS, 'defaultValue', 'label', 'help', 'description']) || own(def, 'optionsFrom')) return null
    const clean = pick(def, PARAM_KEYS)
    if (own(clean, 'options')) {
      if (!array(clean.options)) return null
      if (def.options.some(option => !primitive(option) && optionProjection(option) === null)) return null
      clean.options = def.options.map(optionProjection)
      if (clean.options.some(option => !primitive(option) && (!bounded(option, ['value', 'label']) || !own(option, 'value') || !primitive(option.value) || (own(option, 'label') && typeof option.label !== 'string')))) return null
    }
    if (checkParameterMember(clean, undefined, { mode: 'canonical' }).status === 'indeterminate') return null
    put(out, field, clean)
  }
  return out
}
function publicDomain(operation, defs, constraints) {
  if (!array(operation.inputs) || !bounded(operation.output, ['type', 'allowedMimes', 'min', 'max'])
    || !['image', 'video'].includes(operation.output.type)) return null
  const inputs = []
  for (const slot of operation.inputs) {
    if (!bounded(slot, [...INPUT_KEYS, 'label', 'help', 'description', 'limitSource'])) return null
    inputs.push(pick(slot, INPUT_KEYS))
  }
  const inputGroups = []
  if (!array(operation.inputGroups ?? [])) return null
  for (const group of operation.inputGroups ?? []) {
    if (!bounded(group, ['slots', 'min', 'hint'])) return null
    inputGroups.push(pick(group, ['slots', 'min']))
  }
  const output = copy(operation.output)
  if (own(output, 'allowedMimes') && output.allowedMimes !== null && (!array(output.allowedMimes) || !output.allowedMimes.length || !output.allowedMimes.every(name) || new Set(output.allowedMimes).size !== output.allowedMimes.length)) return null
  if ((own(output, 'min') && !count(output.min)) || (own(output, 'max') && output.max !== null && !count(output.max)) || (typeof output.max === 'number' && (output.min ?? 0) > output.max)) return null
  const parameters = publicDefinitions(defs)
  if (parameters === null) return null
  return { inputs, inputGroups, parameters, output, constraints: copy(constraints) }
}
const aggregate = statuses => statuses.includes('ready') ? 'ready' : statuses.includes('indeterminate') ? 'indeterminate' : statuses.includes('pending') || !statuses.length ? 'pending' : 'rejected'
const directoryStatus = statuses => statuses.includes('indeterminate') ? 'indeterminate' : statuses.includes('available') ? 'available' : statuses.includes('pending') || !statuses.length ? 'pending' : 'rejected'
function issue(diagnostic, declared) {
  const code = diagnostic.code
  let publicCode = 'input_unresolved'
  if (code === 'eligibility_pending') publicCode = 'qualification_pending'
  else if (code === 'eligibility_rejected') publicCode = 'qualification_rejected'
  else if (code === 'default_ambiguous') publicCode = code
  else if (['parameter_nonmember', 'empty_domain', 'fixed_conflict', 'disabled', 'unknown_field'].includes(code)) publicCode = 'parameter_invalid'
  else if (['parameter_indeterminate', 'source_mismatch'].includes(code)) publicCode = 'parameter_unresolved'
  else if (['asset_rejected', 'input_limit'].includes(code)) publicCode = 'input_invalid'
  else if (code === 'asset_pending') publicCode = 'input_pending'
  return { code: publicCode, ...(declared.has(diagnostic.field) ? { field: diagnostic.field } : {}), ...(count(diagnostic.assetIndex) ? { assetIndex: diagnostic.assetIndex } : {}) }
}
function result(currentFingerprint, status, issues, requestFingerprint) {
  return { schemaVersion: 1, currentFingerprint, ...(requestFingerprint ? { requestFingerprint } : {}), status, executable: false, issues }
}
/**
 * One fresh authoritative snapshot per call. Missing production qualification stays pending.
 * Dependencies are server-owned read-only sources, never request-supplied eligibility.
 * @param {Dependencies} [deps]
 * @returns {{list: () => Data, preparePreview: (request: unknown) => PreviewV1}}
 */
export function createGenerationProducts(deps = {}) {
  const readIndex = deps.readIndex ?? (() => { resetSchemaCaches(); return loadAll(undefined, { useCache: false }) })
  const readGroups = deps.readGroups ?? getModelChannelGroups
  function snapshot() {
    const index = readIndex()
    if (!index || typeof index.all !== 'function' || !array(index.registry?.operations)
      || (index.parseErrors?.length) || index.issues?.some(item => item.level === 'error')) throw new Error('catalog unavailable')
    const registry = copy(index.registry)
    const knownOperationIds = registry.operations.map(op => op.id)
    if (!knownOperationIds.every(name) || new Set(knownOperationIds).size !== knownOperationIds.length) throw new Error('catalog unavailable')
    const models = index.all()
    if (!array(models)) throw new Error('catalog unavailable')
    const candidates = []
    const covered = []
    for (const raw of models) {
      if (!record(raw) || !name(raw.id) || !array(raw.operations)) throw new Error('catalog unavailable')
      // Explicit contract fields only: no loader paths, settings, credentials or purchase data.
      const model = pick(raw, ['id', 'label', 'family', 'badge', 'subtitle', 'role', 'managementGroup', 'aliases', 'listed', 'listedOperations', 'parameters', 'operations'])
      for (const key of ['research', 'implementation', 'execution']) if (record(raw[key])) model[key] = pick(raw[key], ['status', 'verifiedAt', 'profileId', 'seam', 'docUrl', 'notes'])
      if (record(raw.routing)) model.routing = pick(raw.routing, ['channel', 'wireModel', 'protocol', 'automaticFallback'])
      const groups = readGroups(raw.id)
      if (!array(groups)) throw new Error('catalog unavailable')
      const mappingGroups = groups.map(g => pick(g, ['id', 'wireGroup', 'wireModel', 'channelId', 'protocol', 'enabled', 'constraints']))
      covered.push({ model: semantic(model, 'model'), groups: semantic(mappingGroups, 'group') })
      for (const operation of model.operations) {
        const policy = POLICY.find(p => p.type === operation.output?.type && p.intents.includes(operation.id))
        const registered = registry.operations.find(op => op.id === operation.id && op.defaultOutputType === policy?.type)
        if (!policy || !registered) continue
        const defs = definitions(model, operation)
        for (const group of mappingGroups) {
          const constraints = own(group, 'constraints') ? group.constraints : {}
          const identity = { canonicalModelId: model.id, operationId: operation.id, purpose: operation.id,
            ...pick(group, ['wireGroup', 'wireModel']), realGroupId: group.id,
            ...((group.channelId ?? model.routing?.channel) !== undefined ? { channelId: group.channelId ?? model.routing.channel } : {}),
            ...((group.protocol ?? model.routing?.protocol) !== undefined ? { protocol: group.protocol ?? model.routing.protocol } : {}) }
          if (!own(identity, 'wireModel') && model.routing?.wireModel !== undefined) identity.wireModel = model.routing.wireModel
          identity.mappingDigest = hash({ identity, enabled: group.enabled ?? null, constraints: semantic(constraints, 'constraints') })
          const domain = { inputs: copy(operation.inputs), inputGroups: copy(operation.inputGroups ?? []), parameters: copy(defs), output: copy(operation.output), constraints: copy(constraints) }
          const proof = deps.readQualification ? deps.readQualification(freeze(copy({ identity, domain }))) : null
          const evidence = record(proof) ? pick(proof, ['identity', 'domain', 'active', 'sourceDigest', 'documentVersion', 'sample']) : null
          const complete = ['canonicalModelId', 'channelId', 'realGroupId', 'wireGroup', 'wireModel', 'operationId', 'purpose', 'protocol'].every(key => name(identity[key]))
          let eligibility = 'pending'
          if (group.enabled === false) eligibility = 'rejected'
          else if (group.enabled === true && complete && evidence?.active === true && /^[a-f0-9]{64}$/.test(evidence.sourceDigest)
            && name(evidence.documentVersion) && evidence.sample?.mode === 'live' && name(evidence.sample.taskId)
            && evidence.sample.output?.verified === true && evidence.sample.output.type === domain.output.type
            && record(evidence.identity) && ['canonicalModelId', 'channelId', 'realGroupId', 'wireGroup', 'wireModel', 'operationId', 'purpose', 'protocol', 'mappingDigest'].every(key => name(evidence.identity[key]))
            && hash(evidence.domain) === hash(domain)) {
            const bound = ['channelId', 'realGroupId', 'wireGroup', 'wireModel', 'protocol', 'mappingDigest'].every(key => evidence.identity[key] === identity[key])
            if (bound && ['canonicalModelId', 'operationId', 'purpose'].some(key => evidence.identity[key] !== identity[key])) eligibility = 'rejected'
            else if (hash(evidence.identity) === hash(identity)) eligibility = 'eligible'
          }
          const projected = publicDomain(operation, defs, constraints)
          const coreOperation = { id: operation.id, inputs: projected ? projected.inputs : copy(operation.inputs), inputGroups: projected ? projected.inputGroups : copy(operation.inputGroups ?? []) }
          const core = { operation: coreOperation, parameters: judgmentDefinitions(defs), constraints: copy(constraints), knownOperationIds: [...knownOperationIds], currentEligibility: eligibility }
          candidates.push({ productId: policy.productId, intent: operation.id, core, defs, domain, projected, identity, evidence })
        }
      }
    }
    return { candidates, registry, currentFingerprint: hash({ schemaVersion: 1, policyVersion: 1, policy: POLICY, contractVersion: index.schemaVersion,
      covered, registry: semantic(registry, 'registry'), qualifications: candidates.map(c => ({ identity: semantic(c.identity, 'identity'), evidence: semantic(c.evidence, 'evidence'), eligibility: c.core.currentEligibility, domainProven: c.projected !== null })) }) }
  }
  function list() {
    const current = snapshot()
    return { schemaVersion: 1, currentFingerprint: current.currentFingerprint, products: POLICY.map(policy => {
      const intents = policy.intents.map(intent => {
        const registered = current.registry.operations.find(op => op.id === intent)
        if (!registered || !name(registered.label)) throw new Error('catalog unavailable')
        const alternatives = [], statuses = [], seen = new Set()
        for (const candidate of current.candidates.filter(c => c.productId === policy.productId && c.intent === intent)) {
          const sources = {}
          for (const field of Object.keys(candidate.defs ?? {})) put(sources, field, { source: 'absent' })
          const checked = evaluateCandidateRequest(candidate.core, { assets: [], logicalParameters: {}, parameterSources: sources, parameterAuthority: 'resolved' })
          const structuralUnknown = checked.diagnostics.some(d => ['malformed_input', 'malformed_constraint', 'parameter_indeterminate', 'unknown_operation', 'unchecked_constraint'].includes(d.code))
          if (!candidate.projected || structuralUnknown) { statuses.push('indeterminate'); continue }
          if (candidate.core.currentEligibility === 'rejected' || checked.status === 'rejected') { statuses.push('rejected'); continue }
          const status = candidate.core.currentEligibility === 'eligible' ? 'available' : 'pending'
          statuses.push(status)
          const alternative = { status, ...copy(candidate.projected) }
          const key = hash(alternative)
          if (!seen.has(key)) { seen.add(key); alternatives.push(alternative) }
        }
        return { intent, label: registered.label, status: directoryStatus(statuses), alternatives }
      })
      return { productId: policy.productId, label: policy.label, status: directoryStatus(intents.map(i => i.status)), intents }
    }) }
  }
  /** @param {unknown} request @returns {PreviewV1} */
  function preparePreview(request) {
    const current = snapshot(), fingerprint = current.currentFingerprint
    const reject = code => result(fingerprint, 'rejected', [{ code }])
    if (!bounded(request, ['schemaVersion', 'currentFingerprint', 'productId', 'intent', 'prompt', 'parameters', 'assets'])
      || ['schemaVersion', 'currentFingerprint', 'productId', 'intent', 'parameters', 'assets'].some(key => !own(request, key) || request[key] === undefined)) return reject('invalid_request')
    if (request.schemaVersion !== 1) return reject(typeof request.schemaVersion === 'number' && Number.isInteger(request.schemaVersion) ? 'unsupported_version' : 'invalid_request')
    if (typeof request.currentFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(request.currentFingerprint)
      || !name(request.productId) || !name(request.intent) || !record(request.parameters) || !array(request.assets)
      || (request.prompt !== undefined && typeof request.prompt !== 'string')) return reject('invalid_request')
    const policy = POLICY.find(p => p.productId === request.productId)
    if (!policy) return reject('unknown_product')
    if (!policy.intents.includes(request.intent)) return reject('unknown_intent')
    const candidates = current.candidates.filter(c => c.productId === policy.productId && c.intent === request.intent)
    const declared = new Set(candidates.flatMap(c => Object.keys(c.defs ?? {})))
    if (Object.keys(request.parameters).some(key => !declared.has(key))) return reject('unknown_parameter')
    const parameters = {}
    for (const key of Object.keys(request.parameters)) {
      const value = request.parameters[key]
      if (value === undefined) continue
      if (!primitive(value)) return reject('invalid_request')
      put(parameters, key, value)
    }
    const assets = []
    for (const asset of request.assets) {
      if (!bounded(asset, ASSET_KEYS) || !name(asset.pathOrUrl) || Object.keys(asset).some(key => asset[key] === undefined)) return reject('invalid_request')
      if (['type', 'role', 'targetSlot', 'mime', 'sourceNodeId', 'edgeId', 'outputId', 'outputVersion', 'originalName'].some(key => own(asset, key) && !name(asset[key]))) return reject('invalid_request')
      if ((own(asset, 'sizeBytes') && asset.sizeBytes !== null && !count(asset.sizeBytes)) || (own(asset, 'durationSec') && asset.durationSec !== null && !finite(asset.durationSec))) return reject('invalid_request')
      if (own(asset, 'dimensions') && (!bounded(asset.dimensions, ['width', 'height']) || !count(asset.dimensions.width) || asset.dimensions.width === 0 || !count(asset.dimensions.height) || asset.dimensions.height === 0)) return reject('invalid_request')
      assets.push(copy(asset))
    }
    if (own(parameters, 'prompt') && request.prompt !== undefined && !Object.is(parameters.prompt, request.prompt)) return reject('invalid_request')
    const prompt = request.prompt !== undefined ? request.prompt : own(parameters, 'prompt') ? parameters.prompt : undefined
    if (prompt !== undefined && typeof prompt !== 'string') return reject('invalid_request')
    if (request.currentFingerprint !== fingerprint) return result(fingerprint, 'pending', [{ code: 'stale_fingerprint' }])
    const logicalParameters = copy(parameters), parameterSources = {}
    let authority = 'resolved'
    for (const field of declared) {
      if (own(parameters, field)) { put(parameterSources, field, { source: 'explicit', value: parameters[field] }); continue }
      if (field === 'prompt' && prompt !== undefined) { put(logicalParameters, field, prompt); put(parameterSources, field, { source: 'explicit', value: prompt }); continue }
      const defs = candidates.map(c => c.defs && own(c.defs, field) ? c.defs[field] : null)
      const haveDefaults = defs.some(def => record(def) && own(def, 'defaultValue'))
      put(parameterSources, field, { source: 'absent' })
      if (!haveDefaults) continue
      const first = defs[0]
      const sourceId = def => hash({ productId: policy.productId, intent: request.intent, policyVersion: 1, definition: judgmentDefinitions({ [field]: def }) })
      const consensus = record(first) && primitive(first.defaultValue) && defs.every(def => record(def) && own(def, 'defaultValue') && primitive(def.defaultValue)
        && Object.is(def.defaultValue, first.defaultValue) && sourceId(def) === sourceId(first)
        && checkParameterMember(judgmentDefinitions({ [field]: def })[field], def.defaultValue, { mode: 'canonical' }).status === 'member')
      if (consensus) { put(logicalParameters, field, first.defaultValue); put(parameterSources, field, { source: 'definition-default', value: first.defaultValue }) }
      else authority = 'unresolved'
    }
    const frozenPrompt = own(logicalParameters, 'prompt') ? logicalParameters.prompt : prompt
    // Top-only prompt has one transport view per declared-presence, not one default per candidate.
    const snapshots = candidates.map(candidate => {
      const logical = copy(logicalParameters), sources = copy(parameterSources)
      if (!own(parameters, 'prompt') && !own(candidate.defs ?? {}, 'prompt')) { delete logical.prompt; delete sources.prompt }
      return freeze({ assets, ...(frozenPrompt !== undefined ? { prompt: frozenPrompt } : {}), logicalParameters: logical, parameterSources: sources, parameterAuthority: authority })
    })
    const requestFingerprint = hash({ currentFingerprint: fingerprint, productId: policy.productId, intent: request.intent,
      assets, ...(frozenPrompt !== undefined ? { prompt: frozenPrompt } : {}), logicalParameters, parameterSources, parameterAuthority: authority })
    const results = candidates.map((candidate, index) => {
      const checked = evaluateCandidateRequest(candidate.core, snapshots[index])
      if (!candidate.projected && checked.status !== 'rejected') return { status: 'indeterminate', diagnostics: [...checked.diagnostics, { code: 'unchecked_constraint' }] }
      return checked
    })
    const status = aggregate(results.map(r => r.status))
    const issues = status === 'ready' ? [] : results.flatMap(r => r.diagnostics.map(d => issue(d, declared)))
    if (!candidates.length) issues.push({ code: 'unavailable' })
    const seen = new Set()
    return result(fingerprint, status, issues.filter(item => { const key = hash(item); if (seen.has(key)) return false; seen.add(key); return true }), requestFingerprint)
  }
  return { list, preparePreview }
}
