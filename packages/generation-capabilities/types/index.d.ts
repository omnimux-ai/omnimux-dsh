export interface GenerationAsset {
  readonly type?: string;
  readonly role?: string;
  readonly targetSlot?: string;
  readonly mime?: string;
  readonly sizeBytes?: number | null;
  readonly durationSec?: number | null;
}

/** Only the fields consumed by the legacy single-asset predicate. */
export interface GenerationSlot {
  readonly slot: string;
  readonly type?: string;
  readonly role?: string;
  readonly allowedMimes?: readonly string[] | null;
  readonly maxSizeMb?: number;
  readonly maxSizeExclusive?: boolean;
  readonly minDurationSec?: number;
  readonly maxDurationSec?: number;
}

export const BYTES_PER_MB: number;
export function mbToBytes(maxSizeMb: number): number;
export function isWithinSizeLimit(sizeBytes: number, maxSizeMb: number, exclusive?: boolean): boolean;
export function isWithinDurationLimit(durationSec: number, maxDurationSec: number): boolean;

export const GUARD_CODES: Readonly<{
  CATALOG_UNAVAILABLE: 'catalog_unavailable';
  CATALOG_MALFORMED: 'catalog_malformed';
  CONTRACT_MISSING: 'contract_missing';
  UNKNOWN_MODEL: 'unknown_model';
  MODEL_NOT_ADMITTED: 'model_not_admitted';
  DISPOSITION_FORBIDDEN: 'disposition_forbidden';
  OPERATION_REQUIRED: 'operation_required';
  UNKNOWN_OPERATION: 'unknown_operation';
  OPERATION_NOT_ON_MODEL: 'operation_not_on_model';
  NOT_LISTED: 'not_listed';
  RESEARCH_NOT_VERIFIED: 'research_not_verified';
  IMPLEMENTATION_UNAVAILABLE: 'implementation_unavailable';
  EXECUTION_UNAVAILABLE: 'execution_unavailable';
  PROFILE_MISSING: 'profile_missing';
  PROFILE_INCOMPATIBLE: 'profile_incompatible';
  SEAM_MISMATCH: 'seam_mismatch';
  PROMPT_REQUIRED: 'prompt_required';
  MIN_UNSATISFIED: 'min_unsatisfied';
  SLOT_CAPACITY: 'slot_capacity';
  ROLE_CONFLICT: 'role_conflict';
  MIME_UNSUPPORTED: 'mime_unsupported';
  SIZE_EXCEEDED: 'size_exceeded';
  DURATION_EXCEEDED: 'duration_exceeded';
  METADATA_UNKNOWN: 'metadata_unknown';
  OPERATION_INCOMPATIBLE: 'operation_incompatible';
  ASSET_TYPE_MISMATCH: 'asset_type_mismatch';
  PARAMETER_UNSUPPORTED: 'parameter_unsupported';
  VENDOR_FIELD_FORBIDDEN: 'vendor_field_forbidden';
  LOGICAL_FIELD_FORBIDDEN: 'logical_field_forbidden';
  MAPPER_INCOMPLETE: 'mapper_incomplete';
  INVALID_RESPONSE: 'invalid_response';
  OUTPUT_TYPE_MISMATCH: 'output_type_mismatch';
  OUTPUT_MIME_MISMATCH: 'output_mime_mismatch';
}>;
export type GuardCode = typeof GUARD_CODES[keyof typeof GUARD_CODES];
export const SLOT_ALIASES: Readonly<{
  reference_image: readonly ['reference_images'];
  reference_images: readonly ['reference_image'];
  first_frame: readonly ['first_frame_image'];
  first_frame_image: readonly ['first_frame'];
  last_frame: readonly ['last_frame_image'];
  last_frame_image: readonly ['last_frame'];
}>;
export function getSlotAliases(slotName?: string): readonly string[];

interface AssetDiagnostic { readonly message: string; readonly slot: string }
export type AssetRejection =
  | (AssetDiagnostic & { readonly code: 'asset_type_mismatch'; readonly assetType: string; readonly slotType: string })
  | (AssetDiagnostic & { readonly code: 'role_conflict'; readonly role: string })
  | (AssetDiagnostic & { readonly code: 'mime_unsupported'; readonly mime: string; readonly allowedMimes: string[] })
  | (AssetDiagnostic & { readonly code: 'metadata_unknown'; readonly field: 'sizeBytes'; readonly maxSizeMb: number })
  | (AssetDiagnostic & { readonly code: 'metadata_unknown'; readonly field: 'durationSec'; readonly maxDurationSec: number })
  | (AssetDiagnostic & { readonly code: 'metadata_unknown'; readonly field: 'durationSec'; readonly minDurationSec: number })
  | (AssetDiagnostic & { readonly code: 'size_exceeded'; readonly sizeBytes: number; readonly maxSizeMb: number; readonly maxSizeExclusive: boolean })
  | (AssetDiagnostic & { readonly code: 'duration_exceeded'; readonly durationSec: number; readonly maxDurationSec: number })
  | (AssetDiagnostic & { readonly code: 'duration_exceeded'; readonly durationSec: number; readonly minDurationSec: number });
export type AssetSlotResult = { readonly ok: true } | { readonly ok: false; readonly rejection: AssetRejection };
/** Invalid numeric metadata retains the legacy TypeError behavior. */
export function validateAssetAgainstSlot(asset: GenerationAsset, slot: GenerationSlot): AssetSlotResult;
