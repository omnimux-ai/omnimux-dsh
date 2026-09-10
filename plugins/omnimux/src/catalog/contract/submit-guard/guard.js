/**
 * SubmitGuard — deep module at the Hub execution boundary (#468 / H3).
 *
 * Input:  canonical/alias model + logical request + contract index/profile
 * Output: validated normalized plan OR typed rejection
 *
 * All first-time media/text/stt submits must pass through before vendor/runtime.
 * taskId poll/finish skips initial asset guard (caller responsibility).
 */

import { getContractIndex } from '../index.js'
import { loadAdapterProfiles } from '../schema.js'
import { loadDispositions } from '../dispositions.js'
import { mapLegacyOperation } from '../legacy-operation-map.js'
import { OmnimuxError } from '../../../media/errors.js'
import { GUARD_CODES } from './codes.js'
import { normalizeLogicalRequest } from './normalize.js'
import { assignAndValidateSlots } from './slots.js'
import {
  admitDisposition,
  admitModel,
  admitOperation,
  inferUniqueOperation,
} from './admission.js'
import { mapValidatedPlanToVendor, resolveProfilePayloadContract } from './map.js'
import { validateVendorResult } from './output.js'

/**
 * @typedef {object} GuardRejection
 * @property {false} ok
 * @property {string} code
 * @property {string} message
 * @property {object[]} [diagnostics]
 * @property {Record<string, unknown>} [details]
 */

/**
 * @typedef {object} GuardPlan
 * @property {true} ok
 * @property {string} modelId
 * @property {string} [requestedModelId]
 * @property {string} operationId
 * @property {boolean} operationInferred
 * @property {object} operation
 * @property {object} model
 * @property {object} profile
 * @property {string} profileId
 * @property {string} seam
 * @property {string} prompt
 * @property {import('./normalize.js').LogicalAsset[]} assets
 * @property {Array<object>} bindings
 * @property {Map<string, object[]>} bySlot
 * @property {Record<string, unknown>} vendorPayload
 * @property {Record<string, unknown>} logicalPayload
 * @property {Record<string, unknown>} extras
 * @property {object[]} diagnostics
 * @property {object} [disposition]
 * @property {object} payloadContract
 */

/**
 * Map guard code → OmnimuxError.code (stable hub wire codes).
 * @param {string} code
 */
export function toOmnimuxErrorCode(code) {
  switch (code) {
    case GUARD_CODES.INVALID_RESPONSE:
    case GUARD_CODES.OUTPUT_TYPE_MISMATCH:
    case GUARD_CODES.OUTPUT_MIME_MISMATCH:
      return 'omnimux-invalid-response'
    case GUARD_CODES.CATALOG_UNAVAILABLE:
    case GUARD_CODES.CATALOG_MALFORMED:
      return 'omnimux-invalid-request'
    default:
      return 'omnimux-invalid-request'
  }
}

/**
 * @param {GuardRejection} rejection
 * @returns {OmnimuxError}
 */
export function rejectionToError(rejection) {
  return new OmnimuxError(toOmnimuxErrorCode(rejection.code), rejection.message, {
    details: {
      guardCode: rejection.code,
      ...(rejection.details ?? {}),
      ...(rejection.diagnostics ? { diagnostics: rejection.diagnostics } : {}),
    },
  })
}

/**
 * @param {object} partial
 * @returns {GuardRejection}
 */
function reject(partial) {
  return {
    ok: false,
    code: partial.code ?? GUARD_CODES.OPERATION_INCOMPATIBLE,
    message: partial.message ?? 'submit rejected',
    ...(partial.diagnostics ? { diagnostics: partial.diagnostics } : {}),
    details: {
      ...(partial.modelId ? { modelId: partial.modelId } : {}),
      ...(partial.operationId ? { operationId: partial.operationId } : {}),
      ...(partial.slot ? { slot: partial.slot } : {}),
      ...(partial.candidates ? { candidates: partial.candidates } : {}),
      ...(partial.field ? { field: partial.field } : {}),
      ...(partial.disposition ? { disposition: partial.disposition } : {}),
      ...(partial.profileId ? { profileId: partial.profileId } : {}),
      ...(partial.extra ?? {}),
    },
  }
}

/**
 * Core admit + validate + map.
 *
 * @param {object} request  logical hub request (media/text/stt fields)
 * @param {{
 *   index?: import('../index.js').ContractIndex,
 *   profiles?: object,
 *   dispositions?: object,
 *   specsDir?: string,
 *   requireListed?: boolean,
 *   gateAllows?: Function,
 *   seam?: string,
 *   capability?: string,
 *   outputType?: string,
 *   skipVendorMap?: boolean,
 * }} [opts]
 * @returns {GuardPlan | GuardRejection}
 */
export function guardSubmit(request, opts = {}) {
  /** @type {object[]} */
  const diagnostics = []

  let index = opts.index
  try {
    if (!index) index = getContractIndex(opts.specsDir)
  } catch (err) {
    return reject({
      code: GUARD_CODES.CATALOG_UNAVAILABLE,
      message: `failed to load contract catalog: ${err instanceof Error ? err.message : String(err)}`,
    })
  }
  if (!index) {
    return reject({ code: GUARD_CODES.CATALOG_UNAVAILABLE, message: 'contract index is null' })
  }

  const profiles = opts.profiles ?? index.profiles ?? loadAdapterProfiles()
  const dispositions = opts.dispositions ?? loadDispositions()

  const normalized = normalizeLogicalRequest({
    ...request,
    ...(opts.seam ? { seam: opts.seam } : {}),
    ...(opts.capability ? { capability: opts.capability } : {}),
  })

  const modelAdmit = admitModel(index, normalized.model || request?.model)
  if (!modelAdmit.ok) {
    return reject(modelAdmit)
  }

  const disp = admitDisposition(modelAdmit.modelId, dispositions)
  if (!disp.ok) {
    return reject(disp)
  }

  let operationId = normalized.operation
  let operationInferred = false
  if (!operationId) {
    const inferred = inferUniqueOperation(modelAdmit.model, normalized.assets, {
      prompt: normalized.prompt,
      seam: opts.seam || normalized.seam || normalized.capability,
      profiles,
      outputType: opts.outputType,
    })
    if (!inferred.ok) {
      return reject({ ...inferred, modelId: modelAdmit.modelId })
    }
    operationId = inferred.operationId
    operationInferred = true
    diagnostics.push({
      code: 'legacy_operation_inferred',
      level: 'warning',
      message: `legacy request missing operation; inferred "${operationId}" (deprecated — pass operation explicitly)`,
      operationId,
      modelId: modelAdmit.modelId,
    })
  } else {
    operationId = mapLegacyOperation(operationId)
  }

  const opAdmit = admitOperation(modelAdmit.model, operationId, profiles, {
    requireListed: opts.requireListed !== false,
    gateAllows: opts.gateAllows,
    seam: opts.seam || normalized.seam || normalized.capability,
  })
  if (!opAdmit.ok) {
    return reject({ ...opAdmit, modelId: modelAdmit.modelId })
  }

  if (modelAdmit.modelId.startsWith('minimax-h3')
    && /^720p?$/i.test(String(normalized.extras?.resolution ?? request?.resolution ?? ''))) {
    return reject({
      code: GUARD_CODES.OPERATION_INCOMPATIBLE,
      message: 'MiniMax H3 的旧 720p 配置已停用，请在分辨率中重新选择 768p；不会自动改写已保存的选择。',
      modelId: modelAdmit.modelId,
      field: 'resolution',
    })
  }

  const parameterResult = validateDeclaredParameters(
    { ...request, ...normalized.extras, prompt: normalized.prompt },
    opAdmit.operation.parameters,
    modelAdmit.model.parameters,
  )
  if (!parameterResult.ok) {
    return reject({
      code: parameterResult.code,
      message: parameterResult.message,
      modelId: modelAdmit.modelId,
      operationId: opAdmit.operationId,
      field: parameterResult.field,
      diagnostics,
    })
  }

  const slotResult = assignAndValidateSlots(opAdmit.operation, normalized.assets, {
    prompt: normalized.prompt,
    duration: parameterResult.values.duration,
  })
  if (!slotResult.ok) {
    const top = slotResult.rejections[0] ?? {
      code: GUARD_CODES.OPERATION_INCOMPATIBLE,
      message: 'slot validation failed',
    }
    return reject({
      code: top.code,
      message: top.message,
      modelId: modelAdmit.modelId,
      operationId: opAdmit.operationId,
      slot: top.slot,
      extra: { rejections: slotResult.rejections },
      diagnostics,
    })
  }

  if (opts.skipVendorMap) {
    return {
      ok: true,
      modelId: modelAdmit.modelId,
      requestedModelId: modelAdmit.requestedModelId,
      operationId: opAdmit.operationId,
      operationInferred,
      operation: opAdmit.operation,
      model: modelAdmit.model,
      profile: opAdmit.profile,
      profileId: opAdmit.profileId,
      seam: opAdmit.profile.seam,
      prompt: normalized.prompt,
      assets: normalized.assets,
      bindings: slotResult.bindings,
      bySlot: slotResult.bySlot,
      vendorPayload: {},
      logicalPayload: { prompt: normalized.prompt },
      extras: parameterResult.values,
      diagnostics,
      disposition: disp.disposition ?? undefined,
      payloadContract: resolveProfilePayloadContract(opAdmit.profile),
    }
  }

  const mapped = mapValidatedPlanToVendor({
    operation: opAdmit.operation,
    profile: opAdmit.profile,
    modelId: modelAdmit.modelId,
    model: modelAdmit.model,
    family: modelAdmit.model?.family,
    prompt: normalized.prompt,
    bindings: slotResult.bindings,
    bySlot: slotResult.bySlot,
    extras: parameterResult.values,
    userSpecifiedQuality: (request?.quality !== undefined && request?.quality !== null && request?.quality !== '')
      || (normalized.extras?.quality !== undefined && Object.prototype.hasOwnProperty.call(request, 'quality')),
  })
  if (!mapped.ok) {
    return reject({
      ...mapped,
      modelId: modelAdmit.modelId,
      operationId: opAdmit.operationId,
      diagnostics,
    })
  }

  const effectiveModelId = mapped.targetModelId || modelAdmit.modelId
  return {
    ok: true,
    modelId: effectiveModelId,
    requestedModelId: modelAdmit.requestedModelId,
    targetModelId: effectiveModelId,
    operationId: opAdmit.operationId,
    operationInferred,
    operation: opAdmit.operation,
    model: modelAdmit.model,
    profile: opAdmit.profile,
    profileId: opAdmit.profileId,
    seam: opAdmit.profile.seam,
    prompt: normalized.prompt,
    assets: normalized.assets,
    bindings: slotResult.bindings,
    bySlot: slotResult.bySlot,
    vendorPayload: mapped.vendorPayload,
    logicalPayload: mapped.logicalPayload,
    extras: parameterResult.values,
    diagnostics,
    disposition: disp.disposition ?? undefined,
    payloadContract: resolveProfilePayloadContract(opAdmit.profile),
  }
}

/**
 * Throw OmnimuxError on rejection; return plan on success.
 * @param {object} request
 * @param {Parameters<typeof guardSubmit>[1]} [opts]
 * @returns {GuardPlan}
 */
export function assertGuardSubmit(request, opts = {}) {
  const result = guardSubmit(request, opts)
  if (!result.ok) throw rejectionToError(result)
  return result
}

/**
 * Validate a runtime/vendor result against the plan's operation contract.
 * @param {GuardPlan} plan
 * @param {unknown} result
 * @param {{ capability?: string }} [opts]
 */
export function assertGuardOutput(plan, result, opts = {}) {
  const check = validateVendorResult(result, plan.operation, opts)
  if (!check.ok) throw rejectionToError(check)
  return check.result
}

/**
 * Validate only values the caller actually supplied. Operation declarations
 * override model declarations; absent declarations intentionally impose no
 * inferred constraint.
 * @param {Record<string, unknown>} request
 * @param {object | undefined} operationParameters
 * @param {object | undefined} modelParameters
 */
function validateDeclaredParameters(request, operationParameters, modelParameters) {
  const operation = operationParameters && typeof operationParameters === 'object' ? operationParameters : {}
  const model = modelParameters && typeof modelParameters === 'object' ? modelParameters : {}
  const definitions = { ...model, ...operation }
  const values = {}
  for (const [field, definition] of Object.entries(definitions)) {
    if (!definition || typeof definition !== 'object') continue
    const supplied = Object.prototype.hasOwnProperty.call(request, field)
      && request[field] !== undefined
      && request[field] !== null
      && request[field] !== ''
    const hasDefault = Object.prototype.hasOwnProperty.call(definition, 'defaultValue')
    if (!supplied && !hasDefault) continue
    const value = supplied ? request[field] : definition.defaultValue

    if (Array.isArray(definition.options) && definition.options.length > 0) {
      const allowed = definition.options.map((option) => option && typeof option === 'object' && 'value' in option ? option.value : option)
      const optionMatches = allowed.some((candidate) => Object.is(candidate, value)
        || (definition.caseInsensitive === true
          && typeof candidate === 'string'
          && typeof value === 'string'
          && candidate.toLowerCase() === value.toLowerCase()))
      const inRange = definition.range && typeof definition.range === 'object'
        && typeof value === 'number' && Number.isFinite(value)
        && (typeof definition.range.min !== 'number' || value >= definition.range.min)
        && (typeof definition.range.max !== 'number' || value <= definition.range.max)
      if (!optionMatches && !inRange) {
        return {
          ok: false,
          code: GUARD_CODES.PARAMETER_UNSUPPORTED,
          field,
          message: `parameter "${field}" does not accept ${JSON.stringify(value)}`,
        }
      }
    }

    if (definition.supported === true && typeof value !== 'boolean') {
      return {
        ok: false,
        code: GUARD_CODES.PARAMETER_UNSUPPORTED,
        field,
        message: `parameter "${field}" must be boolean`,
      }
    }
    if (definition.supported === false && supplied) {
      return {
        ok: false,
        code: GUARD_CODES.PARAMETER_UNSUPPORTED,
        field,
        message: `parameter "${field}" is not supported`,
      }
    }
    if (definition.type === 'integer' && !Number.isInteger(value)) {
      return {
        ok: false,
        code: GUARD_CODES.PARAMETER_UNSUPPORTED,
        field,
        message: `parameter "${field}" must be an integer`,
      }
    }
    if (definition.range && typeof definition.range === 'object') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return {
          ok: false,
          code: GUARD_CODES.PARAMETER_UNSUPPORTED,
          field,
          message: `parameter "${field}" must be numeric`,
        }
      }
      const auto = definition.allowAuto === true && value === -1
      if (!auto && (
        (typeof definition.range.min === 'number' && value < definition.range.min)
        || (typeof definition.range.max === 'number' && value > definition.range.max)
        || (typeof definition.range.step === 'number'
          && typeof definition.range.min === 'number'
          && Math.abs((value - definition.range.min) / definition.range.step - Math.round((value - definition.range.min) / definition.range.step)) > Number.EPSILON)
      )) {
        return {
          ok: false,
          code: GUARD_CODES.PARAMETER_UNSUPPORTED,
          field,
          message: `parameter "${field}" is outside its documented range`,
        }
      }
    }
    if (typeof value === 'string') {
      const length = Array.from(value).length
      if (typeof definition.minLength === 'number' && length < definition.minLength) {
        return {
          ok: false,
          code: GUARD_CODES.PARAMETER_UNSUPPORTED,
          field,
          message: `parameter "${field}" is shorter than ${definition.minLength} characters`,
        }
      }
      if (typeof definition.maxLength === 'number' && length > definition.maxLength) {
        return {
          ok: false,
          code: GUARD_CODES.PARAMETER_UNSUPPORTED,
          field,
          message: `parameter "${field}" exceeds ${definition.maxLength} characters`,
        }
      }
    }
    values[field] = value
  }
  return { ok: true, values }
}

export { GUARD_CODES, validateVendorResult, normalizeLogicalRequest, mapValidatedPlanToVendor }
