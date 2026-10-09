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

export interface OperationSlot extends GenerationSlot {
  readonly min?: number;
  readonly max?: number | null;
  readonly source?: string;
  readonly totalMinDurationSec?: number;
  readonly totalMaxDurationSec?: number;
  readonly totalMinExclusive?: boolean;
  readonly totalMaxExclusive?: boolean;
  readonly combinedOutputMaxDurationSec?: number;
}
export interface InputGroup {
  readonly slots: readonly string[];
  readonly min?: number;
  readonly hint?: string;
}
export interface AssignmentOperation {
  readonly inputs: readonly OperationSlot[];
  readonly inputGroups?: readonly InputGroup[];
}
export interface AssignmentContext { readonly prompt?: string; readonly duration?: number }
export interface AssignmentPolicy {
  readonly strategy?: 'legacy' | 'strict';
  readonly mode?: 'full' | 'accept';
  readonly maxStates?: number;
}
export type AssignmentDiagnostic = 'invalid_metadata' | 'malformed_contract' | 'intent_required' | 'search_budget_exceeded' | 'completion_unproven';
interface AssignmentIndices { readonly assetIndex?: number; readonly slotIndex?: number }
interface AssignmentMessage extends AssignmentIndices { readonly message: string }
interface AssignmentSlotMessage extends AssignmentMessage { readonly slot: string }
export type AssignmentPending =
  | (Extract<AssetRejection, { code: 'metadata_unknown' }> & AssignmentIndices)
  | (AssignmentSlotMessage & { readonly code: 'metadata_unknown'; readonly field: 'mime' | 'durationSec' | 'outputDurationSec' })
  | (AssignmentMessage & { readonly code: 'min_unsatisfied'; readonly slot?: string; readonly slots?: readonly string[]; readonly min: number; readonly current: number })
  | (AssignmentSlotMessage & { readonly code: 'prompt_required' })
  | (AssignmentSlotMessage & { readonly code: 'operation_incompatible'; readonly diagnostic: 'intent_required'; readonly field?: never });
/** Assignment-only duration proofs do not imply single-asset max/min payloads. */
export type AssignmentDurationRejection = AssignmentSlotMessage & { readonly code: 'duration_exceeded' } & (
  | { readonly totalDurationSec: number; readonly totalMaxDurationSec: number; readonly exclusive: boolean }
  | { readonly totalDurationSec: number; readonly totalMinDurationSec: number; readonly exclusive: boolean }
  | { readonly totalDurationSec: number; readonly outputDurationSec: number; readonly combinedOutputMaxDurationSec: number }
  | { readonly min: number; readonly limit: number }
  | { readonly limit: number }
  | { readonly diagnostic: 'duration_bounds_conflict' }
);
export type AssignmentOperationRejection = AssignmentMessage & { readonly code: 'operation_incompatible' } & (
  | { readonly diagnostic?: never; readonly field?: never; readonly type?: string; readonly slots?: readonly string[]; readonly min?: number; readonly limit?: number }
  | { readonly diagnostic: 'malformed_contract'; readonly field?: 'inputs' | 'min' | 'max' | 'slot' | 'inputGroups'; readonly slot?: string }
  | { readonly diagnostic: 'invalid_metadata'; readonly field: 'sizeBytes' | 'durationSec'; readonly slot: string }
  | { readonly diagnostic: 'search_budget_exceeded' | 'completion_unproven'; readonly field?: never }
);
export type AssignmentRejection =
  | (AssetRejection & AssignmentIndices)
  | AssignmentPending
  | AssignmentDurationRejection
  | AssignmentOperationRejection
  | (AssignmentSlotMessage & { readonly code: 'slot_capacity'; readonly max: number | null | undefined })
  | (AssignmentMessage & { readonly code: 'role_conflict'; readonly role: string; readonly type: string })
  | (AssignmentSlotMessage & { readonly code: 'role_conflict'; readonly role?: never })
  | (AssignmentSlotMessage & { readonly code: 'size_exceeded'; readonly maxSizeMb: number; readonly maxSizeExclusive: true; readonly sizeBytes?: never });
export interface UncheckedConstraint {
  readonly constraint: 'combined_output_ceiling';
  readonly slotIndex: number;
  readonly field: 'outputDurationSec';
}
export interface AssetBinding<A extends GenerationAsset = GenerationAsset> {
  readonly assetIndex: number;
  readonly slotIndex: number;
  readonly slot: string;
  readonly role?: string;
  readonly asset: A;
}
interface AssignmentResultBase<A extends GenerationAsset> {
  readonly bindings: readonly AssetBinding<A>[];
  readonly buckets: readonly (readonly A[])[];
  readonly visitedStates: number;
  readonly uncheckedConstraints: readonly UncheckedConstraint[];
}
export type AssignmentResult<A extends GenerationAsset = GenerationAsset> = AssignmentResultBase<A> & (
  | { readonly status: 'ready'; readonly rejections: readonly []; readonly pending: readonly [] }
  | { readonly status: 'pending'; readonly rejections: readonly AssignmentPending[]; readonly pending: readonly AssignmentPending[] }
  | { readonly status: 'rejected'; readonly rejections: readonly AssignmentRejection[]; readonly pending: readonly [] }
  | { readonly status: 'indeterminate'; readonly diagnostic: 'search_budget_exceeded' | 'completion_unproven'; readonly rejections: readonly AssignmentRejection[]; readonly pending: readonly [] }
);
export function solveAssetAssignment<A extends GenerationAsset>(operation: AssignmentOperation, assets: readonly (A | null | undefined)[], context?: AssignmentContext, policy?: AssignmentPolicy): AssignmentResult<A>;

export type MediaType = 'image' | 'video' | 'audio';
export type CandidateAsset = GenerationAsset & { readonly type: MediaType };
export type CandidateOperation = AssignmentOperation & { readonly id: string };
export interface ParameterLimit { readonly fixed?: ParameterPrimitive; readonly only?: readonly ParameterPrimitive[]; readonly supported?: boolean }
export interface Constraints {
  readonly operations?: readonly string[];
  readonly parameters?: Readonly<Record<string, ParameterLimit>>;
  readonly inputs?: Readonly<Partial<Record<MediaType, { readonly max?: number }>>>;
}
export interface Candidate {
  readonly operation: CandidateOperation;
  readonly parameters: Readonly<Record<string, ParameterDefinition>>;
  readonly constraints: Constraints;
  readonly knownOperationIds: readonly string[];
  readonly currentEligibility: 'eligible' | 'pending' | 'rejected';
  readonly provider?: never; readonly profile?: never; readonly endpoint?: never; readonly purchaseCost?: never;
}
export interface CandidatePolicy { readonly maxStates?: number }
export type LogicalSource = { readonly source: 'explicit' | 'definition-default'; readonly value: ParameterPrimitive } | { readonly source: 'absent'; readonly value?: never };
export type EffectiveSource = 'explicit' | 'definition-default' | 'absent' | 'omitted-by-group';
export interface CandidateSnapshot<A extends CandidateAsset> {
  readonly assets: readonly A[];
  readonly prompt?: string;
  readonly logicalParameters: Readonly<Record<string, ParameterPrimitive>>;
  readonly parameterSources: Readonly<Record<string, LogicalSource>>;
  readonly parameterAuthority: 'resolved' | 'unresolved';
}
export type CandidateCode = 'malformed_input' | 'malformed_constraint' | 'unknown_operation' | 'unknown_field' | 'parameter_nonmember' | 'parameter_indeterminate' | 'empty_domain' | 'fixed_conflict' | 'disabled' | 'source_mismatch' | 'default_ambiguous' | 'input_limit' | 'media_unclassified' | 'asset_rejected' | 'asset_pending' | 'asset_indeterminate' | 'completion_unproven' | 'unchecked_constraint' | 'eligibility_pending' | 'eligibility_rejected';
export interface CandidateDiagnostic { readonly code: CandidateCode; readonly field?: string; readonly assetIndex?: number; readonly slotIndex?: number }
export type CheckedAssignment<A extends CandidateAsset> = Extract<AssignmentResult<A>, { readonly status: 'ready' }> & { readonly uncheckedConstraints: readonly [] };
export type CandidateResult<A extends CandidateAsset> =
  | { readonly status: 'ready'; readonly effectiveParameters: Readonly<Record<string, ParameterPrimitive>>; readonly parameterSources: Readonly<Record<string, EffectiveSource>>; readonly assignment: CheckedAssignment<A>; readonly diagnostics: readonly [] }
  | { readonly status: 'pending' | 'rejected' | 'indeterminate'; readonly diagnostics: readonly CandidateDiagnostic[]; readonly effectiveParameters?: never; readonly parameterSources?: never; readonly assignment?: never };
export function evaluateCandidateRequest<A extends CandidateAsset>(candidate: Candidate, snapshot: CandidateSnapshot<A>, policy?: CandidatePolicy): CandidateResult<A>;

export type ParameterPrimitive = string | boolean | number | null;
export interface ParameterPolicy { readonly mode?: 'canonical' | 'legacyGuard' }
export interface ParameterDefinition {
  readonly type?: 'integer' | 'number' | 'string' | 'boolean';
  readonly options?: readonly (ParameterPrimitive | { readonly value: ParameterPrimitive; readonly label?: string })[];
  readonly optionsFrom?: string;
  readonly range?: { readonly min?: number; readonly max?: number; readonly step?: number };
  readonly defaultValue?: ParameterPrimitive;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly supported?: boolean;
  readonly allowAuto?: boolean;
  readonly caseInsensitive?: boolean;
  readonly unit?: string;
}
export type ParameterNonmemberReason = 'domain' | 'boolean' | 'unsupported' | 'integer' | 'number' | 'string' | 'type' | 'length_type' | 'minLength' | 'maxLength' | 'range' | 'unknown_field';
export type ParameterMemberResult =
  | { readonly status: 'member' }
  | { readonly status: 'nonmember'; readonly reason: ParameterNonmemberReason }
  | { readonly status: 'indeterminate'; readonly diagnostic: 'malformed_definition' | 'unresolved_options' | 'precision_unproven' };
export type DeclaredParameterResult =
  | { readonly ok: true; readonly values: Record<string, unknown> }
  | { readonly ok: false; readonly field: string; readonly source: 'request' | 'default' | 'definition'; readonly result: Exclude<ParameterMemberResult, { readonly status: 'member' }> };
/** Finite Number grid checks use bounded native shortest-decimal residuals; values are never snapped. */
export function checkParameterMember(definition: ParameterDefinition, value: unknown, policy?: ParameterPolicy): ParameterMemberResult;
/** Whole operation fields override model fields. Undefined is absent; legacy also treats null/empty string as absent. */
export function evaluateDeclaredParameters(request: Readonly<Record<string, unknown>>, operationDefinitions?: Readonly<Record<string, ParameterDefinition>>, modelDefinitions?: Readonly<Record<string, ParameterDefinition>>, policy?: ParameterPolicy): DeclaredParameterResult;
