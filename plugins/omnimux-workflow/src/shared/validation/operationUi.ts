/** Canvas picker presentation derived from the shared compatibility kernel. */

import { resolveGenerationPrompt } from '../graph/generationPrompt.ts';
import type {
  CapabilityCatalog,
  CapabilityModelItem,
  CatalogModelDto,
  OperationContractDto,
} from '../api.ts';
import {
  buildContractView,
  buildUpstreamFingerprint,
  evaluateCatalogCompat,
  evaluateModelCompat,
  resolveModelView,
  type CompatReasonCode,
  type CompatRejection,
  type ModelCompatVerdict,
  type OperationMatch,
  type UpstreamAssetFingerprint,
  type UpstreamFingerprint,
} from './compatKernel.ts';

// ============================================================================
// Operation option (Catalog DTO projection — open string id)
// ============================================================================

export interface OperationUiOption {
  /** Canonical operation id (open string; future ids must not crash). */
  id: string;
  /** User-facing label from Catalog DTO (fallback = id). */
  label: string;
  /** Slot metadata from the contract (may be empty). */
  slots: OperationContractDto['inputs'];
  /** Output type when known. */
  outputType?: string;
  /** Operation-level parameter overrides from the model contract. */
  parameters?: Record<string, unknown>;
  /** Deterministic edge-to-slot bindings produced by the compatibility kernel. */
  bindings: OperationMatch['bindings'];
  /** True when this operation absorbs the current fingerprint. */
  effective: boolean;
  /** Ready-to-submit for this operation under the current fingerprint. */
  ready: boolean;
  /** Blocking readiness reasons for this operation. */
  pending: OperationMatch['pending'];
}

export type ModeUiVisibility = 'hidden' | 'selector';

/** UI-only state: no model has been selected yet, distinct from catalog availability. */
export type EffectiveOpsReasonCode = CompatReasonCode | 'model_unselected';

export interface EffectiveOpsUiState {
  /** Effective (absorbing) operations for the current model + fingerprint. */
  effectiveOps: OperationUiOption[];
  /** Count of effective operations. */
  count: number;
  /** Text is automatic; other outputs show a selector for multiple operations. */
  visibility: ModeUiVisibility;
  /** Implicit sole operation when count === 1; undefined when 0 or ≥2. */
  implicitOperationId?: string;
  /** Currently selected / preferred operation (canonical). */
  selectedOperationId?: string;
  /** True when the selected operation cannot be submitted. */
  blockGenerate: boolean;
  /** Primary typed reason when blocked / configuration error. */
  reasonCode?: EffectiveOpsReasonCode;
  /** Human-readable explanation (typed, stable). */
  reasonMessage?: string;
  /** Structured details for localized UI copy. */
  reason?: CompatRejection;
}

export interface FilteredModelOption {
  id: string;
  label: string;
  badge?: string;
  subtitle?: string;
  family?: string;
  aliases?: string[];
  /** Catalog row (bucket or models[] projection) when available. */
  item?: CapabilityModelItem | CatalogModelDto;
  /** Kernel verdict for this model under the current fingerprint. */
  verdict: ModelCompatVerdict;
}

export interface FilteredModelListResult {
  /** Compatible models only — these are the only ones that may enter the DOM. */
  options: FilteredModelOption[];
  /** True when catalog is missing / unavailable. */
  catalogAvailable: boolean;
  /** True when zero compatible models remain. */
  zeroCandidates: boolean;
  /** Primary rejection when zeroCandidates. */
  reasonCode?: CompatReasonCode;
  reasonMessage?: string;
  /** Structured details for localized UI copy. */
  reason?: CompatRejection;
}

// ============================================================================
// Fingerprint helpers (UI-side assembly from upstream node snapshots)
// ============================================================================

export interface UpstreamMediaSnapshot {
  availability?: 'ready' | 'waiting' | 'unavailable';
  availabilityMessage?: string;
  outputId?: string;
  url?: string;
  nodeId: string;
  materialType: string;
  textContent?: string;
  mimeType?: string | null;
  /** Prefer sizeBytes; fileSize is a legacy alias. Unknown → omit (never invent 0). */
  sizeBytes?: number | null;
  fileSize?: number | null;
  /** Prefer durationSec; duration is a legacy alias. Unknown → omit. */
  durationSec?: number | null;
  duration?: number | null;
  role?: string | null;
  targetSlot?: string | null;
  edgeId?: string | null;
}

/**
 * Normalize a possibly-unknown numeric media field.
 * Returns undefined when the value is null/undefined/NaN/non-finite —
 * callers MUST NOT coerce unknown to 0.
 */
export function readOptionalMediaNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'number') return undefined;
  if (!Number.isFinite(value)) return undefined;
  return value;
}

/**
 * Normalize a MIME string. Empty / "unknown" / non-string → undefined
 * (never invent a catch-all MIME).
 */
export function readOptionalMime(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === 'unknown') return undefined;
  if (trimmed === 'application/octet-stream') return undefined;
  return trimmed;
}

/** Build an UpstreamAssetFingerprint from a UI upstream snapshot. */
export function assetFromUpstreamSnapshot(snap: UpstreamMediaSnapshot): UpstreamAssetFingerprint {
  const sizeBytes =
    readOptionalMediaNumber(snap.sizeBytes) ?? readOptionalMediaNumber(snap.fileSize);
  const durationSec =
    readOptionalMediaNumber(snap.durationSec) ?? readOptionalMediaNumber(snap.duration);
  const mimeType = readOptionalMime(snap.mimeType);
  const role = typeof snap.role === 'string' && snap.role.trim() ? snap.role.trim() : undefined;
  const targetSlot =
    typeof snap.targetSlot === 'string' && snap.targetSlot.trim()
      ? snap.targetSlot.trim()
      : undefined;
  const edgeId =
    typeof snap.edgeId === 'string' && snap.edgeId.trim() ? snap.edgeId.trim() : undefined;

  return {
    sourceNodeId: snap.nodeId,
    availability: snap.availability,
    availabilityMessage: snap.availabilityMessage,
    outputId: snap.outputId,
    url: snap.url,
    textContent: snap.textContent,
    type: snap.materialType || 'text',
    ...(edgeId ? { edgeId } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(role ? { role } : {}),
    ...(targetSlot ? { targetSlot } : {}),
  };
}

export function buildUiUpstreamFingerprint(input: {
  materialType?: string;
  prompt?: string;
  content?: string;
  nodeFields?: Record<string, unknown>;
  upstreams?: UpstreamMediaSnapshot[];
}): UpstreamFingerprint {
  const assets = (input.upstreams ?? []).map(assetFromUpstreamSnapshot);
  return buildUpstreamFingerprint({
    prompt: resolveGenerationPrompt(input, (input.upstreams ?? []).filter((item) => item.materialType === 'text').map((item) => item.textContent)),
    nodeFields: input.nodeFields,
    localText: resolveGenerationPrompt(input),
    assets,
  });
}

// ============================================================================
// Operation label / option projection
// ============================================================================

/** Resolve a human label for an operation id from the Catalog DTO. */
export function resolveOperationLabel(
  catalog: CapabilityCatalog | null | undefined,
  modelId: string | undefined,
  operationId: string,
): string {
  const canonical = operationId.trim();
  if (!canonical) return '';
  if (!catalog || !modelId) return canonical;
  const view = buildContractView(catalog);
  const model = resolveModelView(view, modelId);
  const op = model?.operations.find((entry) => entry.id === canonical);
  if (op?.label && op.label.trim()) return op.label.trim();
  // Fall back to any model that declares this operation (label reuse).
  for (const candidate of view.models) {
    const hit = candidate.operations.find((entry) => entry.id === canonical);
    if (hit?.label && hit.label.trim()) return hit.label.trim();
  }
  return canonical;
}

function matchToOption(
  match: OperationMatch,
  model: ReturnType<typeof resolveModelView>,
): OperationUiOption {
  const opView = model?.operations.find((entry) => entry.id === match.operationId);
  return {
    id: match.operationId,
    label: (opView?.label && opView.label.trim()) || match.operationId,
    slots: opView?.inputs ?? [],
    ...(opView?.output?.type ? { outputType: opView.output.type } : {}),
    ...(opView?.parameters ? { parameters: opView.parameters } : {}),
    bindings: match.bindings,
    effective: match.accepts,
    ready: match.ready,
    pending: match.pending,
  };
}

/**
 * Read the canonical operation id from node params.
 * Empty means no preferred operation; no fallback is inferred.
 */
export function readPreferredOperationId(
  params: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!params || typeof params !== 'object') return undefined;
  return typeof params.operation === 'string' && params.operation.trim()
    ? params.operation.trim()
    : undefined;
}

/**
 * Build the effective-ops UI state for one selected model + fingerprint.
 *
 * 0 → hide mode UI + block generate
 * 1 → hide mode UI, implicit sole op
 * Text operations adapt automatically; other outputs expose multiple effective ops.
 */
export function buildEffectiveOpsUiState(args: {
  catalog: CapabilityCatalog | null | undefined;
  modelId: string | undefined;
  fingerprint: UpstreamFingerprint;
  preferredOperationId?: string;
  outputType?: string;
}): EffectiveOpsUiState {
  const catalog = args.catalog;
  const modelId = typeof args.modelId === 'string' ? args.modelId.trim() : '';
  if (!catalog) {
    return {
      effectiveOps: [],
      count: 0,
      visibility: 'hidden',
      blockGenerate: true,
      reasonCode: 'catalog_unavailable',
      reasonMessage: '模型目录不可用，请稍后重试',
    };
  }
  if (!modelId) {
    return {
      effectiveOps: [],
      count: 0,
      visibility: 'hidden',
      blockGenerate: true,
      reasonCode: 'model_unselected',
      reasonMessage: '请先选择模型',
    };
  }

  const view = buildContractView(catalog);
  if (!view.available) {
    return {
      effectiveOps: [],
      count: 0,
      visibility: 'hidden',
      blockGenerate: true,
      reasonCode: 'catalog_unavailable',
      reasonMessage: '模型目录不可用，请稍后重试',
    };
  }

  const model = resolveModelView(view, modelId);
  if (!model) {
    return {
      effectiveOps: [],
      count: 0,
      visibility: 'hidden',
      blockGenerate: true,
      reasonCode: 'unknown_model',
      reasonMessage: `模型 ${modelId} 不在目录中（未知或已下架）`,
    };
  }

  const preferred =
    typeof args.preferredOperationId === 'string' && args.preferredOperationId.trim()
      ? args.preferredOperationId.trim()
      : undefined;
  const verdict = evaluateModelCompat(model, args.fingerprint, {
    ...(preferred ? { operationId: preferred } : {}),
    ...(args.outputType ? { outputType: args.outputType } : {}),
  });

  const effectiveOps = verdict.effectiveOperations.map((match) => matchToOption(match, model));
  const count = effectiveOps.length;
  // Explicit image/audio/video creative choices remain selected until a transition;
  // text input adaptation is automatic below.
  const preferredIsEffective = !preferred || effectiveOps.some((op) => op.id === preferred);

  if (count === 0) {
    const primary = verdict.rejections[0] as CompatRejection | undefined;
    return {
      effectiveOps: [],
      count: 0,
      visibility: 'hidden',
      blockGenerate: true,
      reasonCode: primary?.code ?? 'operation_incompatible',
      reasonMessage:
        primary?.message
        ?? `当前模型 ${modelId} 无法处理这些输入素材`,
      ...(primary ? { reason: primary } : {}),
      ...(preferred ? { selectedOperationId: preferred } : {}),
    };
  }

  if (args.outputType === 'text') {
    const preferredOp = effectiveOps.find((op) => op.id === preferred);
    const selected = (preferredOp?.ready ? preferredOp : undefined)
      ?? effectiveOps.find((op) => op.ready)
      ?? preferredOp
      ?? effectiveOps[0]!;
    const pending = selected.pending[0];
    return {
      effectiveOps,
      count,
      visibility: 'hidden',
      implicitOperationId: selected.id,
      selectedOperationId: selected.id,
      blockGenerate: !selected.ready,
      ...(pending ? { reasonCode: pending.code, reasonMessage: pending.message, reason: pending } : {}),
    };
  }

  if (count === 1) {
    const sole = effectiveOps[0]!;
    const pending = sole.pending[0];
    if (!preferredIsEffective) {
      return {
        effectiveOps,
        count: 1,
        visibility: 'hidden',
        implicitOperationId: sole.id,
        selectedOperationId: preferred,
        blockGenerate: true,
        reasonCode: 'operation_incompatible',
        reasonMessage: '当前模型不支持已保存的生成方式，请重新选择',
      };
    }
    return {
      effectiveOps,
      count: 1,
      visibility: 'hidden',
      implicitOperationId: sole.id,
      selectedOperationId: sole.id,
      blockGenerate: !sole.ready,
      ...(pending ? { reasonCode: pending.code, reasonMessage: pending.message, reason: pending } : {}),
    };
  }

  // ≥2: a stale requested operation remains blocked until the user chooses
  // one of the effective operations; never auto-select a replacement.
  if (!preferredIsEffective) {
    return {
      effectiveOps,
      count,
      visibility: 'selector',
      selectedOperationId: preferred,
      blockGenerate: true,
      reasonCode: 'operation_incompatible',
      reasonMessage: '当前模型不支持已保存的生成方式，请重新选择',
    };
  }
  // This stricter gate belongs to video only. Other modality callers retain
  // their established first-effective behavior unless they opt in.
  if (!preferred && args.outputType === 'video') {
    return {
      effectiveOps,
      count,
      visibility: 'selector',
      blockGenerate: true,
      reasonCode: 'operation_incompatible',
      reasonMessage: '请选择生成方式',
    };
  }
  const selected =
    (preferred ? effectiveOps.find((op) => op.id === preferred) : undefined)
    ?? effectiveOps.find((op) => op.ready)
    ?? effectiveOps[0]!;
  const pending = selected.pending[0];
  return {
    effectiveOps,
    count,
    visibility: 'selector',
    selectedOperationId: selected.id,
    blockGenerate: !selected.ready,
    ...(pending ? { reasonCode: pending.code, reasonMessage: pending.message, reason: pending } : {}),
  };
}

/**
 * Whether the mode UI (ConfigPanel segment / TriggerBar mode text) should
 * render. Equivalent to `state.visibility === 'selector'`.
 */
export function shouldRenderModeUi(state: EffectiveOpsUiState): boolean {
  return state.visibility === 'selector' && state.count >= 2;
}

// ============================================================================
// Filtered model list (Hide, Don't Grey)
// ============================================================================

function findBucketItem(
  catalog: CapabilityCatalog,
  materialType: string,
  modelId: string,
): CapabilityModelItem | undefined {
  const bucket =
    materialType === 'text' ? catalog.text
    : materialType === 'image' ? catalog.image
    : materialType === 'video' ? catalog.video
    : materialType === 'audio' ? catalog.audio
    : undefined;
  if (!Array.isArray(bucket)) return undefined;
  return bucket.find((row) => row.id === modelId);
}

function findAuthoritativeItem(
  catalog: CapabilityCatalog,
  modelId: string,
): CatalogModelDto | undefined {
  if (!Array.isArray(catalog.models)) return undefined;
  return catalog.models.find(
    (row) =>
      row.id === modelId
      || (Array.isArray(row.aliases) && row.aliases.includes(modelId)),
  );
}

/**
 * Build the model picker options for a generate node.
 *
 * Only models with `acceptsCurrentInputs === true` are returned — incompatible
 * / unlisted / not-in-catalog models NEVER enter the DOM (no disabled greys).
 *
 * The kernel applies the canvas model policy and authoritative capability contracts.
 *
 * Whisper / speech_to_text models only appear when their operation is listed
 * (kernel already enforces listed-only); if the catalog has zero listed ASR
 * ops, the list is empty and callers show the empty state.
 */
export function buildFilteredModelOptions(args: {
  catalog: CapabilityCatalog | null | undefined;
  fingerprint: UpstreamFingerprint;
  /** Output material type of the generate node (filters by operation.output.type). */
  outputType?: string;
}): FilteredModelListResult {
  const catalog = args.catalog;
  if (!catalog) {
    return {
      options: [],
      catalogAvailable: false,
      zeroCandidates: true,
      reasonCode: 'catalog_unavailable',
      reasonMessage: '模型目录不可用',
    };
  }

  const evaluation = evaluateCatalogCompat(catalog, args.fingerprint, {
    ...(args.outputType ? { outputType: args.outputType } : {}),
  });
  if (!evaluation.catalogAvailable) {
    return {
      options: [],
      catalogAvailable: false,
      zeroCandidates: true,
      reasonCode: 'catalog_unavailable',
      reasonMessage: '模型目录不可用',
    };
  }

  const options: FilteredModelOption[] = [];
  for (const verdict of evaluation.compatible) {
    const auth = findAuthoritativeItem(catalog, verdict.modelId);
    const bucket = args.outputType
      ? findBucketItem(catalog, args.outputType, verdict.modelId)
      : undefined;
    const label = auth?.label || bucket?.label || verdict.modelId;
    options.push({
      id: verdict.modelId,
      label,
      ...(auth?.badge || bucket?.badge ? { badge: (auth?.badge ?? bucket?.badge) as string } : {}),
      ...(auth?.subtitle || bucket?.subtitle
        ? { subtitle: (auth?.subtitle ?? bucket?.subtitle) as string }
        : {}),
      ...(verdict.family ? { family: verdict.family } : {}),
      ...(auth?.aliases ? { aliases: auth.aliases } : {}),
      ...(auth || bucket ? { item: (auth ?? bucket) as CapabilityModelItem | CatalogModelDto } : {}),
      verdict,
    });
  }

  if (options.length === 0) {
    // Prefer a specific rejection from the evaluation; fall back to generic.
    let reasonCode: CompatReasonCode = 'no_compatible_model';
    let reasonMessage = '当前输入没有可兼容的已上架模型';
    let reason: CompatRejection | undefined;
    for (const verdict of evaluation.models) {
      const primary = verdict.rejections[0];
      if (primary) {
        reason = primary;
        reasonCode = primary.code;
        reasonMessage = primary.message;
        break;
      }
    }
    return {
      options: [],
      catalogAvailable: true,
      zeroCandidates: true,
      reasonCode,
      reasonMessage,
      ...(reason ? { reason } : {}),
    };
  }

  return {
    options,
    catalogAvailable: true,
    zeroCandidates: false,
  };
}

/**
 * True when the model picker / config panel should show the "no executor"
 * empty state (e.g. audio-transcription with zero listed ASR models).
 */
export function isZeroCandidateEmptyState(result: FilteredModelListResult): boolean {
  return result.zeroCandidates === true;
}

/**
 * Write a canonical operation id into a params bag without mutating the input.
 */
export function setParamsOperation(
  params: Record<string, unknown> | null | undefined,
  nextOperationId?: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(params ?? {}) };
  const operation = typeof nextOperationId === 'string' && nextOperationId.trim()
    ? nextOperationId.trim()
    : readPreferredOperationId(next);
  if (operation) next.operation = operation;
  return next;
}

/**
 * Build TriggerBar mode text: only when mode UI is visible (≥2 effective ops).
 * Returns '' when the mode segment must be omitted (0/1).
 */
export function resolveTriggerModeText(
  state: EffectiveOpsUiState,
  selectedOperationId?: string,
): string {
  if (!shouldRenderModeUi(state)) return '';
  const id = selectedOperationId || state.selectedOperationId;
  if (!id) return '';
  const hit = state.effectiveOps.find((op) => op.id === id);
  return hit?.label || id;
}
