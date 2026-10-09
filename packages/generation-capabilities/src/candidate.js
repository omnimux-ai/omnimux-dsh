import { checkParameterMember } from './parameters.js'
import { solveAssetAssignment } from './assets.js'

/** @typedef {import('../types/index.js').CandidateDiagnostic} Diagnostic */
/** @typedef {import('../types/index.js').ParameterPrimitive} Primitive */
/** @typedef {import('../types/index.js').ParameterDefinition} Definition */
/** @typedef {import('../types/index.js').OperationSlot} Slot */
/** @typedef {Record<string, unknown>} RecordValue */

/** @param {unknown} value @returns {value is RecordValue} */
function record(value) {
  return typeof value === 'object' && value !== null
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    && Object.getOwnPropertySymbols(value).length === 0
    && Object.getOwnPropertyNames(value).every(key => {
      const property = Object.getOwnPropertyDescriptor(value, key)
      return property !== undefined && property.enumerable === true && 'value' in property
    })
}
/** @param {object} value @param {string} key */
function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key) }
/** @param {RecordValue} value @param {readonly string[]} keys */
function bounded(value, keys) { return Object.getOwnPropertyNames(value).every(key => keys.includes(key)) }
/** @param {unknown} value @returns {value is unknown[]} */
function array(value) {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length) return false
  if (Object.getOwnPropertyNames(value).length !== value.length + 1) return false
  for (let index = 0; index < value.length; index++) {
    const property = Object.getOwnPropertyDescriptor(value, String(index))
    if (!property || !property.enumerable || !('value' in property)) return false
  }
  return true
}
/** @param {unknown} value @returns {value is Primitive} */
function primitive(value) { return value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) }
/** @param {unknown} value @returns {value is number} */
function count(value) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 }
/** @param {unknown} value @returns {value is string} */
function name(value) { return typeof value === 'string' && value.trim().length > 0 }
/** @param {unknown} value @returns {value is import('../types/index.js').MediaType} */
function media(value) { return value === 'image' || value === 'video' || value === 'audio' }
/** @param {unknown} left @param {unknown} right @param {boolean} [fold] */
function equal(left, right, fold = false) {
  return Object.is(left, right) || (left === 0 && right === 0)
    || (fold && typeof left === 'string' && typeof right === 'string' && left.toLowerCase() === right.toLowerCase())
}
/** @template T @param {Record<string, T>} target @param {string} field @param {T} value */
function put(target, field, value) { Object.defineProperty(target, field, { value, enumerable: true, writable: true, configurable: true }) }
/** @param {number} left @param {number} right */
function sum(left, right) { return left === Infinity || right === Infinity || left > Number.MAX_SAFE_INTEGER - right ? Infinity : left + right }

/** Structural proof only; the canonical member kernel owns all domain arithmetic.
 * @param {unknown} value @returns {value is Definition}
 */
function definition(value) {
  if (!record(value) || !bounded(value, ['type', 'options', 'optionsFrom', 'range', 'defaultValue', 'minLength', 'maxLength', 'supported', 'allowAuto', 'caseInsensitive', 'unit', 'label', 'help', 'description'])) return false
  if (Object.getOwnPropertyNames(value).some(key => value[key] === undefined)) return false
  const range = value.range
  if (own(value, 'range') && record(range) && Object.getOwnPropertyNames(range).some(key => range[key] === undefined)) return false
  if (own(value, 'type') && !['integer', 'number', 'string', 'boolean'].includes(/** @type {string} */ (value.type))) return false
  for (const key of ['optionsFrom', 'unit', 'label', 'help', 'description']) if (own(value, key) && typeof value[key] !== 'string') return false
  if (own(value, 'range') && (!record(value.range) || !bounded(value.range, ['min', 'max', 'step']))) return false
  if (own(value, 'options')) {
    if (!array(value.options)) return false
    for (const option of value.options) {
      if (primitive(option)) continue
      if (!record(option) || !bounded(option, ['value', 'label']) || !own(option, 'value') || !primitive(option.value) || (own(option, 'label') && typeof option.label !== 'string')) return false
    }
  }
  return true
}

/**
 * Conjoin one candidate without changing the caller's values, media or authority.
 * Domain membership and the one strict/full assignment are delegated to their kernels.
 * @template {import('../types/index.js').CandidateAsset} A
 * @param {import('../types/index.js').Candidate} candidate
 * @param {import('../types/index.js').CandidateSnapshot<A>} snapshot
 * @param {import('../types/index.js').CandidatePolicy} [policy]
 * @returns {import('../types/index.js').CandidateResult<A>}
 */
export function evaluateCandidateRequest(candidate, snapshot, policy) {
  if (policy !== undefined && (!record(policy) || !bounded(policy, ['maxStates'])
    || (own(policy, 'maxStates') && (!count(policy.maxStates) || policy.maxStates === 0)))) throw new TypeError('candidate policy must contain only a positive safe maxStates')
  /** @type {Diagnostic[]} */
  const diagnostics = []
  let hard = false, uncertain = false, pending = false
  /** @param {'rejected'|'indeterminate'|'pending'} status @param {import('../types/index.js').CandidateCode} code @param {{field?:string,assetIndex?:number,slotIndex?:number}} [indices] */
  function issue(status, code, indices = {}) {
    diagnostics.push({ code, ...indices })
    if (status === 'rejected') hard = true
    else if (status === 'indeterminate') uncertain = true
    else pending = true
  }
  const failure = () => ({ status: /** @type {'rejected'|'indeterminate'|'pending'} */ (hard ? 'rejected' : uncertain ? 'indeterminate' : 'pending'), diagnostics })
  if (!record(candidate) || !bounded(candidate, ['operation', 'parameters', 'constraints', 'knownOperationIds', 'currentEligibility'])
    || !record(snapshot) || !bounded(snapshot, ['assets', 'prompt', 'logicalParameters', 'parameterSources', 'parameterAuthority'])) {
    issue('indeterminate', 'malformed_input'); return failure()
  }
  if (!own(candidate, 'currentEligibility') || !['eligible', 'pending', 'rejected'].includes(candidate.currentEligibility)) issue('indeterminate', 'malformed_input', { field: 'currentEligibility' })
  else if (candidate.currentEligibility === 'rejected') issue('rejected', 'eligibility_rejected')
  else if (candidate.currentEligibility === 'pending') issue('pending', 'eligibility_pending')
  if (!own(snapshot, 'parameterAuthority') || !['resolved', 'unresolved'].includes(snapshot.parameterAuthority)) issue('indeterminate', 'malformed_input', { field: 'parameterAuthority' })
  else if (snapshot.parameterAuthority === 'unresolved') issue('pending', 'default_ambiguous')
  const defsOK = record(candidate.parameters)
  const logicalOK = record(snapshot.logicalParameters), sourcesOK = record(snapshot.parameterSources)
  if (!defsOK || !logicalOK || !sourcesOK) issue('indeterminate', 'malformed_input')
  /** @type {Record<string, Primitive>} */
  const effective = {}
  /** @type {Record<string, import('../types/index.js').EffectiveSource>} */
  const origins = {}
  const constraintsOK = record(candidate.constraints) && bounded(candidate.constraints, ['operations', 'parameters', 'inputs'])
  if (!constraintsOK) issue('indeterminate', 'malformed_constraint')
  const limits = constraintsOK && own(candidate.constraints, 'parameters') ? candidate.constraints.parameters : {}
  const limitsOK = record(limits)
  if (!limitsOK) issue('indeterminate', 'malformed_constraint', { field: 'parameters' })
  if (defsOK && logicalOK && sourcesOK) {
    const values = snapshot.logicalParameters, sources = snapshot.parameterSources, definitions = candidate.parameters
    /** @type {Set<string>} */
    const explicitFields = new Set()
    for (const field of Object.getOwnPropertyNames(values)) {
      if (!own(definitions, field)) issue('rejected', 'unknown_field', { field })
      if (!primitive(values[field])) issue('indeterminate', 'source_mismatch', { field })
      if (!own(sources, field)) issue('indeterminate', 'source_mismatch', { field })
    }
    for (const field of Object.getOwnPropertyNames(sources)) {
      const source = sources[field]
      if (!record(source) || !bounded(source, ['source', 'value']) || !own(source, 'source') || !['explicit', 'definition-default', 'absent'].includes(source.source)) {
        issue('indeterminate', 'malformed_input', { field }); continue
      }
      if (source.source === 'absent') {
        if (own(source, 'value') || own(values, field)) issue('indeterminate', 'source_mismatch', { field })
      } else {
        if (!own(definitions, field)) issue('rejected', 'unknown_field', { field })
        if (!own(source, 'value') || !primitive(source.value) || !own(values, field) || !equal(source.value, values[field])) issue('indeterminate', 'source_mismatch', { field })
        else if (source.source === 'explicit') explicitFields.add(field)
      }
    }
    for (const field of Object.getOwnPropertyNames(definitions)) {
      const def = definitions[field], source = sources[field]
      if (!own(sources, field)) issue('indeterminate', 'source_mismatch', { field })
      const limit = limitsOK && own(limits, field) ? limits[field] : {}
      const limitOK = record(limit) && bounded(limit, ['fixed', 'only', 'supported'])
        && (!own(limit, 'fixed') || primitive(limit.fixed))
        && (!own(limit, 'only') || (array(limit.only) && limit.only.every(primitive)))
        && (!own(limit, 'supported') || typeof limit.supported === 'boolean')
      if (!limitOK) issue('indeterminate', 'malformed_constraint', { field })
      else {
        if (array(limit.only) && !limit.only.length) issue('rejected', 'empty_domain', { field })
        if (limit.supported === false && explicitFields.has(field)) issue('rejected', 'disabled', { field })
      }
      if (!definition(def)) { issue('indeterminate', 'parameter_indeterminate', { field }); continue }
      const active = own(values, field)
      const value = active ? values[field] : own(def, 'defaultValue') ? def.defaultValue : undefined
      const checked = checkParameterMember(def, value, { mode: 'canonical' })
      if (checked.status === 'indeterminate') issue('indeterminate', 'parameter_indeterminate', { field })
      else if (checked.status === 'nonmember' && (active || own(def, 'defaultValue'))) issue('rejected', 'parameter_nonmember', { field })
      if (!active && !own(def, 'defaultValue') && (own(def, 'optionsFrom') || (def.range !== undefined && own(def.range, 'step') && !own(def.range, 'min')))) issue('indeterminate', 'parameter_indeterminate', { field })
      if (!limitOK) continue
      const fixed = own(limit, 'fixed') ? checkParameterMember(def, limit.fixed, { mode: 'canonical' }) : undefined
      if (fixed?.status === 'nonmember') issue('rejected', 'empty_domain', { field })
      else if (fixed?.status === 'indeterminate') issue('indeterminate', 'parameter_indeterminate', { field })
      const only = /** @type {readonly Primitive[] | undefined} */ (limit.only)
      if (only !== undefined) {
        const members = only.map(item => checkParameterMember(def, item, { mode: 'canonical' }))
        if (only.length && members.every(item => item.status === 'nonmember')) issue('rejected', 'empty_domain', { field })
        if (members.some(item => item.status === 'indeterminate')) issue('indeterminate', 'parameter_indeterminate', { field })
        if (active && checked.status === 'member' && !only.some((item, index) => members[index].status === 'member' && equal(values[field], item, def.caseInsensitive === true))) {
          issue(members.some(item => item.status === 'indeterminate') ? 'indeterminate' : 'rejected', 'parameter_nonmember', { field })
        }
        if (fixed?.status === 'member' && !only.some(item => equal(limit.fixed, item, def.caseInsensitive === true))) issue('rejected', 'fixed_conflict', { field })
      }
      if (active && own(limit, 'fixed') && !equal(values[field], limit.fixed, def.caseInsensitive === true)) issue('rejected', 'fixed_conflict', { field })
      if (limit.supported === false) {
        if (fixed?.status === 'member') issue('rejected', 'disabled', { field })
        if (!record(source) || source.source !== 'explicit') put(origins, field, 'omitted-by-group')
      } else if (record(source) && (source.source === 'absent' || source.source === 'explicit' || source.source === 'definition-default')) {
        put(origins, field, source.source)
        if (active && checked.status === 'member') put(effective, field, values[field])
      }
    }
    if (own(definitions, 'prompt')) {
      const active = own(values, 'prompt')
      if (own(snapshot, 'prompt') !== active || (active && !equal(snapshot.prompt, values.prompt))) issue('indeterminate', 'source_mismatch', { field: 'prompt' })
    }
  }
  if (limitsOK && defsOK) for (const field of Object.getOwnPropertyNames(limits)) if (!own(candidate.parameters, field)) issue('rejected', 'unknown_field', { field })
  const operationOK = record(candidate.operation) && bounded(candidate.operation, ['id', 'inputs', 'inputGroups'])
  const idsOK = array(candidate.knownOperationIds) && candidate.knownOperationIds.every(name) && new Set(candidate.knownOperationIds).size === candidate.knownOperationIds.length
  if (!operationOK || !name(candidate.operation.id)) issue('indeterminate', 'malformed_input', { field: 'operation' })
  if (!idsOK || (operationOK && idsOK && !candidate.knownOperationIds.includes(candidate.operation.id))) issue('indeterminate', 'unknown_operation')
  if (constraintsOK && own(candidate.constraints, 'operations')) {
    const operations = candidate.constraints.operations
    if (!array(operations) || !operations.every(name)) issue('indeterminate', 'malformed_constraint', { field: 'operations' })
    else {
      if (!operations.length) issue('rejected', 'empty_domain', { field: 'operations' })
      if (!idsOK || operations.some(id => !candidate.knownOperationIds.includes(id))) issue('indeterminate', 'unknown_operation')
      else if (operationOK && !operations.includes(candidate.operation.id)) issue('rejected', 'disabled', { field: 'operations' })
    }
  }
  let slotsOK = operationOK && array(candidate.operation.inputs), groupsOK = operationOK
  if (!slotsOK) issue('indeterminate', 'malformed_input', { field: 'inputs' })
  const slots = slotsOK ? candidate.operation.inputs : []
  const groups = operationOK && own(candidate.operation, 'inputGroups') ? candidate.operation.inputGroups : []
  const slotNames = new Set()
  let texts = 0
  const numeric = ['maxSizeMb', 'minDurationSec', 'maxDurationSec', 'totalMinDurationSec', 'totalMaxDurationSec', 'combinedOutputMaxDurationSec']
  for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
    const slot = slots[slotIndex]
    if (!record(slot) || !bounded(slot, ['slot', 'type', 'role', 'min', 'max', 'source', 'allowedMimes', ...numeric, 'maxSizeExclusive', 'totalMinExclusive', 'totalMaxExclusive'])) {
      issue('indeterminate', 'malformed_input', { slotIndex }); slotsOK = false; continue
    }
    if (!name(slot.slot) || slotNames.has(slot.slot)) { issue('rejected', 'malformed_input', { slotIndex }); slotsOK = false }
    slotNames.add(slot.slot)
    if (!media(slot.type) && slot.type !== 'text') { issue('indeterminate', 'malformed_input', { slotIndex }); slotsOK = false }
    if ((own(slot, 'role') && !name(slot.role)) || (own(slot, 'source') && !['user', 'upstream_edge', 'node_field'].includes(/** @type {string} */ (slot.source)))) { issue('indeterminate', 'malformed_input', { slotIndex }); slotsOK = false }
    const min = slot.min === undefined && !own(slot, 'min') ? 0 : slot.min
    const max = !own(slot, 'max') || slot.max === null ? Infinity : slot.max
    if (!count(min) || (own(slot, 'max') && slot.max !== null && !count(slot.max)) || /** @type {number} */ (min) > /** @type {number} */ (max)) { issue('rejected', 'malformed_input', { slotIndex }); slotsOK = false }
    for (const field of numeric) if (own(slot, field) && (typeof slot[field] !== 'number' || !Number.isFinite(slot[field]) || /** @type {number} */ (slot[field]) < 0)) { issue('rejected', 'malformed_input', { slotIndex }); slotsOK = false }
    for (const field of ['maxSizeExclusive', 'totalMinExclusive', 'totalMaxExclusive']) if (own(slot, field) && typeof slot[field] !== 'boolean') { issue('rejected', 'malformed_input', { slotIndex }); slotsOK = false }
    if (own(slot, 'allowedMimes') && slot.allowedMimes !== null && (!array(slot.allowedMimes) || !slot.allowedMimes.length || !slot.allowedMimes.every(name) || new Set(slot.allowedMimes).size !== slot.allowedMimes.length)) { issue('rejected', 'malformed_input', { slotIndex }); slotsOK = false }
    if ((typeof slot.minDurationSec === 'number' && typeof slot.maxDurationSec === 'number' && slot.minDurationSec > slot.maxDurationSec)
      || (typeof slot.totalMinDurationSec === 'number' && typeof slot.totalMaxDurationSec === 'number' && (slot.totalMinDurationSec > slot.totalMaxDurationSec || (slot.totalMinDurationSec === slot.totalMaxDurationSec && (slot.totalMinExclusive === true || slot.totalMaxExclusive === true))))) issue('rejected', 'asset_rejected', { slotIndex })
    if (slot.type === 'text') {
      if (!bounded(slot, ['slot', 'type', 'role', 'source', 'min', 'max'])) issue('indeterminate', 'unchecked_constraint', { slotIndex })
      texts++
      if (texts > 1 || slot.role !== 'prompt' || slot.source !== 'node_field' || ![0, 1].includes(/** @type {number} */ (min)) || (max !== Infinity && ![0, 1].includes(/** @type {number} */ (max)))) { issue('indeterminate', 'malformed_input', { slotIndex }); slotsOK = false }
      const presence = typeof snapshot.prompt === 'string' && snapshot.prompt.trim() ? 1 : 0
      if (presence > /** @type {number} */ (max)) issue('rejected', 'input_limit', { slotIndex })
      else if (presence < /** @type {number} */ (min)) issue('pending', 'asset_pending', { slotIndex })
    } else if (slot.role === 'prompt') { issue('indeterminate', 'malformed_input', { slotIndex }); slotsOK = false }
  }
  if (own(snapshot, 'prompt') && typeof snapshot.prompt !== 'string') issue('indeterminate', 'malformed_input', { field: 'prompt' })
  if (!array(groups)) { issue('indeterminate', 'malformed_input', { field: 'inputGroups' }); groupsOK = false }
  else for (const group of groups) {
    if (!record(group) || !bounded(group, ['slots', 'min', 'hint'])) { issue('indeterminate', 'malformed_input', { field: 'inputGroups' }); groupsOK = false; continue }
    if (!array(group.slots) || !group.slots.every(name) || new Set(group.slots).size !== group.slots.length
      || (own(group, 'min') && !count(group.min)) || (!group.slots.length && (group.min ?? 0) > 0) || (own(group, 'hint') && typeof group.hint !== 'string')) { issue('rejected', 'malformed_input', { field: 'inputGroups' }); groupsOK = false; continue }
    if (group.slots.some(id => !slotNames.has(id))) { issue('rejected', 'malformed_input', { field: 'inputGroups' }); groupsOK = false }
    if (slotsOK && group.slots.some(id => slots.some(slot => slot.slot === id && slot.type === 'text'))) { issue('indeterminate', 'malformed_input', { field: 'inputGroups' }); groupsOK = false }
  }
  const caps = constraintsOK && own(candidate.constraints, 'inputs') ? candidate.constraints.inputs : {}
  let capsOK = record(caps) && bounded(caps, ['image', 'video', 'audio'])
  if (!capsOK) issue('indeterminate', 'malformed_constraint', { field: 'inputs' })
  /** @type {Partial<Record<import('../types/index.js').MediaType, number>>} */
  const maxima = {}
  if (record(caps) && capsOK) for (const type of /** @type {const} */ (['image', 'video', 'audio'])) if (own(caps, type)) {
    const limit = caps[type]
    if (!record(limit) || !bounded(limit, ['max']) || (own(limit, 'max') && !count(limit.max))) { issue('indeterminate', 'malformed_constraint', { field: type }); capsOK = false }
    else if (typeof limit.max === 'number') maxima[type] = limit.max
  }
  let assetsOK = array(snapshot.assets), classified = true
  const counts = { image: 0, video: 0, audio: 0 }
  if (!assetsOK) issue('rejected', 'malformed_input', { field: 'assets' })
  else for (let assetIndex = 0; assetIndex < snapshot.assets.length; assetIndex++) {
    const asset = snapshot.assets[assetIndex]
    if (!record(asset) || !Object.getOwnPropertyNames(asset).length) { issue('rejected', 'malformed_input', { assetIndex }); assetsOK = false; continue }
    if (!own(asset, 'type')) { issue('indeterminate', 'media_unclassified', { assetIndex }); classified = false }
    else if (!media(asset.type)) { issue('rejected', 'malformed_input', { assetIndex }); assetsOK = false }
    else { const type = asset.type; counts[type]++ }
    for (const field of ['role', 'targetSlot', 'mime']) if (own(asset, field) && !name(asset[field])) { issue('rejected', 'malformed_input', { assetIndex }); assetsOK = false }
    for (const field of ['sizeBytes', 'durationSec']) if (own(asset, field) && asset[field] !== null && (typeof asset[field] !== 'number' || !Number.isFinite(asset[field]) || /** @type {number} */ (asset[field]) < 0)) { issue('rejected', 'malformed_input', { assetIndex }); assetsOK = false }
  }
  for (const type of /** @type {const} */ (['image', 'video', 'audio'])) {
    const max = maxima[type]
    if (max !== undefined && counts[type] > max) issue('rejected', 'input_limit', { field: type })
    if (slotsOK && max !== undefined && slots.filter(slot => slot.type === type).reduce((n, slot) => sum(n, slot.min ?? 0), 0) > max) issue('rejected', 'input_limit', { field: type })
  }
  if (slotsOK && groupsOK && array(groups)) for (const group of groups) {
    let upper = 0
    for (const type of /** @type {const} */ (['image', 'video', 'audio'])) {
      const slotUpper = slots.filter(slot => slot.type === type && group.slots.includes(slot.slot)).reduce((n, slot) => sum(n, slot.max ?? Infinity), 0)
      const max = maxima[type] ?? Infinity
      upper = sum(upper, slotUpper < max ? slotUpper : max)
    }
    if (upper < (group.min ?? 0)) issue('rejected', 'input_limit', { field: 'inputGroups' })
  }
  /** @type {import('../types/index.js').AssignmentResult<A> | undefined} */
  let assignment
  if (slotsOK && groupsOK && assetsOK) {
    const duration = own(effective, 'duration') && typeof effective.duration === 'number' && Number.isFinite(effective.duration) && effective.duration > 0 ? effective.duration : undefined
    assignment = solveAssetAssignment(candidate.operation, snapshot.assets, { prompt: snapshot.prompt, duration }, { strategy: 'strict', mode: 'full', maxStates: /** @type {number} */ (policy?.maxStates ?? 100000) })
    if (assignment.status === 'rejected') {
      // Without classification only the child's pre-search local-domain rejection is sound.
      const local = assignment.rejections.filter(reason => reason.assetIndex !== undefined && reason.code !== 'slot_capacity')
      if (classified || (assignment.visitedStates === 0 && local.length)) {
        for (const reason of classified ? assignment.rejections : local) issue('rejected', 'asset_rejected', { ...(reason.assetIndex === undefined ? {} : { assetIndex: reason.assetIndex }), ...(reason.slotIndex === undefined ? {} : { slotIndex: reason.slotIndex }) })
      }
    } else if (assignment.status === 'indeterminate') issue('indeterminate', assignment.diagnostic === 'completion_unproven' ? 'completion_unproven' : 'asset_indeterminate')
    else {
      if (assignment.uncheckedConstraints.length) issue('indeterminate', 'unchecked_constraint')
      if (classified && (assignment.bindings.length !== snapshot.assets.length || new Set(assignment.bindings.map(binding => binding.assetIndex)).size !== snapshot.assets.length || assignment.bindings.some(binding => { const index = binding.assetIndex; return binding.asset !== snapshot.assets[index] }))) issue('indeterminate', 'asset_indeterminate')
      if (assignment.status === 'pending') {
        const limited = Object.getOwnPropertyNames(maxima)
        let certificate = classified && assignment.pending.every(reason => reason.code === 'min_unsatisfied' || reason.code === 'prompt_required')
        if (array(groups)) for (const group of groups) if (assignment.bindings.filter(binding => group.slots.includes(binding.slot)).length < (group.min ?? 0)) certificate = false
        for (const type of limited) {
          const typed = /** @type {import('../types/index.js').MediaType} */ (type)
          const future = slots.filter((slot, index) => slot.type === typed && (slot.max ?? Infinity) > /** @type {import('../types/index.js').AssignmentResult<A>} */ (assignment).buckets[index].length)
          const missing = slots.filter(slot => slot.type === typed).reduce((n, slot) => sum(n, (slot.min ?? 0) > assignmentBindings(slot.slot) ? (slot.min ?? 0) - assignmentBindings(slot.slot) : 0), 0)
          if (future.length > 1 || missing > /** @type {number} */ (maxima[typed]) - counts[typed] || future.some(slot => ['allowedMimes', ...numeric, 'maxSizeExclusive', 'totalMinExclusive', 'totalMaxExclusive'].some(field => own(slot, field)))) certificate = false
        }
        if (limited.length && !certificate) issue('indeterminate', 'completion_unproven')
        else issue('pending', 'asset_pending')
      }
    }
  }
  /** @param {string} slot */
  function assignmentBindings(slot) { return assignment?.bindings.filter(binding => binding.slot === slot).length ?? 0 }
  if (hard || uncertain || pending) return failure()
  if (!assignment || assignment.status !== 'ready' || !classified || assignment.uncheckedConstraints.length) { issue('indeterminate', 'asset_indeterminate'); return failure() }
  return { status: 'ready', effectiveParameters: effective, parameterSources: origins, assignment: /** @type {import('../types/index.js').CheckedAssignment<A>} */ (assignment), diagnostics: [] }
}
