/**
 * Typed rejection / diagnostic codes for the Hub SubmitGuard (H3 / #468).
 * Stable machine codes — callers map them to OmnimuxError / telemetry.
 */

export const GUARD_CODES = Object.freeze({
  // Catalog / index
  CATALOG_UNAVAILABLE: 'catalog_unavailable',
  CATALOG_MALFORMED: 'catalog_malformed',
  CONTRACT_MISSING: 'contract_missing',

  // Model / operation admission
  UNKNOWN_MODEL: 'unknown_model',
  MODEL_NOT_ADMITTED: 'model_not_admitted',
  DISPOSITION_FORBIDDEN: 'disposition_forbidden',
  OPERATION_REQUIRED: 'operation_required',
  UNKNOWN_OPERATION: 'unknown_operation',
  OPERATION_NOT_ON_MODEL: 'operation_not_on_model',
  NOT_LISTED: 'not_listed',
  RESEARCH_NOT_VERIFIED: 'research_not_verified',
  IMPLEMENTATION_UNAVAILABLE: 'implementation_unavailable',
  EXECUTION_UNAVAILABLE: 'execution_unavailable',
  PROFILE_MISSING: 'profile_missing',
  PROFILE_INCOMPATIBLE: 'profile_incompatible',
  SEAM_MISMATCH: 'seam_mismatch',

  // Slots / assets
  PROMPT_REQUIRED: 'prompt_required',
  MIN_UNSATISFIED: 'min_unsatisfied',
  SLOT_CAPACITY: 'slot_capacity',
  ROLE_CONFLICT: 'role_conflict',
  MIME_UNSUPPORTED: 'mime_unsupported',
  SIZE_EXCEEDED: 'size_exceeded',
  DURATION_EXCEEDED: 'duration_exceeded',
  METADATA_UNKNOWN: 'metadata_unknown',
  OPERATION_INCOMPATIBLE: 'operation_incompatible',
  ASSET_TYPE_MISMATCH: 'asset_type_mismatch',
  PARAMETER_UNSUPPORTED: 'parameter_unsupported',

  // Vendor mapping
  VENDOR_FIELD_FORBIDDEN: 'vendor_field_forbidden',
  LOGICAL_FIELD_FORBIDDEN: 'logical_field_forbidden',
  MAPPER_INCOMPLETE: 'mapper_incomplete',

  // Output
  INVALID_RESPONSE: 'invalid_response',
  OUTPUT_TYPE_MISMATCH: 'output_type_mismatch',
  OUTPUT_MIME_MISMATCH: 'output_mime_mismatch',
})

/** @typedef {typeof GUARD_CODES[keyof typeof GUARD_CODES]} GuardCode */
