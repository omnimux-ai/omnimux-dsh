/**
 * Hub SubmitGuard public surface (#468).
 */

export { GUARD_CODES } from './codes.js'
export { normalizeLogicalRequest } from './normalize.js'
export {
  validateAssetAgainstSlot,
  assignAndValidateSlots,
  operationAcceptsAssets,
} from './slots.js'
export {
  admitModel,
  admitDisposition,
  admitOperation,
  inferUniqueOperation,
} from './admission.js'
export {
  DEFAULT_PROFILE_PAYLOADS,
  resolveProfilePayloadContract,
  mapValidatedPlanToVendor,
  mapOpenAiImageSize,
  assertVendorBodyAllowed,
} from './map.js'
export { validateVendorResult } from './output.js'
export {
  guardSubmit,
  assertGuardSubmit,
  assertGuardOutput,
  rejectionToError,
  toOmnimuxErrorCode,
} from './guard.js'
