/**
 * Contract-driven Model Compatibility Kernel (Issue #466 / W1).
 *
 * Pure functions only — no React, no store, no hub imports. The kernel
 * consumes the Catalog v1.1 DTO (`CapabilityCatalog`, see shared/api.ts) and
 * an upstream fingerprint (prompt + per-edge type/MIME/size/duration/role)
 * and answers:
 *
 *   - which models are compatible (≥1 LISTED operation absorbs the inputs)
 *   - the effective operation set per model
 *   - deterministic slot bindings (explicit role → required narrow slots →
 *     generic reference slots)
 *   - typed rejection reasons (stable codes, PRD §6.9)
 *   - the atomic auto-adaptation pick (model + operation) with the locked
 *     deterministic ordering: keep current model+operation → same model
 *     other operation → same family → byOperation default → catalog order
 *
 * Fail-closed: unknown models, a missing catalog and zero candidates never
 * fall back to a permissive "available".
 *
 * Operation ids are open strings + metadata — the registry-owned open string
 * is NOT copied here as an N-entry union (cross-package iron rule). Historical
 * GenerationMode strings are translated at read time via LEGACY_OPERATION_MAP.
 */

import type {
  CapabilityCatalog,
  CatalogModelDto,
  InputSlotDto,
  OperationContractDto,
} from '../api.ts';

// ============================================================================
// Reason codes (PRD §6.9 — stable, telemetry-safe)
// ============================================================================

export type CompatReasonCode =
  | 'catalog_unavailable'
  | 'contract_missing'
  | 'unknown_model'
  | 'not_listed'
  | 'mime_unsupported'
  | 'size_exceeded'
  | 'duration_exceeded'
  | 'slot_capacity'
  | 'role_conflict'
  | 'no_compatible_model'
  | 'model_incompatible'
  | 'operation_incompatible'
  | 'min_unsatisfied'
  | 'prompt_required'
  | 'metadata_required'
  | 'execution_unavailable'
  | 'input_waiting'
  | 'input_unavailable'
  | 'text_role_required';

export interface CompatRejection {
  code: CompatReasonCode;
  message: string;
  modelId?: string;
  operationId?: string;
  slot?: string;
  meta?: Record<string, unknown>;
}

function rejection(
  code: CompatReasonCode,
  message: string,
  extra?: Omit<CompatRejection, 'code' | 'message'>,
): CompatRejection {
  return { code, message, ...(extra ?? {}) };
}

/**
 * Read a semantic target slot from an edge.
 *
 * in and input are graph handles for ordinary connections, not contract slots.
 * Explicit edge metadata and real frame slot handles remain semantic slots.
 */
export function readExplicitTargetSlot(
  edgeData: Record<string, unknown>,
  targetHandle: unknown,
): string | undefined {
  const direct = typeof edgeData.targetSlot === 'string' ? edgeData.targetSlot.trim() : '';
  if (direct) return direct;
  // Ordinary node-level input handles are NOT contract slots; do not let runtime slotBinding
  // lock the connection into a single operation mode.
  if (typeof targetHandle === 'string') {
    const handle = targetHandle.trim();
    if (handle === 'in' || handle === 'input') {
      return undefined;
    }
    if (handle) return handle;
  }
  const binding = edgeData.slotBinding;
  if (binding && typeof binding === 'object') {
    const slot = (binding as { slot?: unknown }).slot;
    if (typeof slot === 'string' && slot.trim()) return slot.trim();
  }
  return undefined;
}

// ============================================================================
// Legacy operation mapping (read-time only; mirrors the hub legacy map
// semantically WITHOUT importing plugins/omnimux)
// ============================================================================

export const LEGACY_OPERATION_MAP: Readonly<Record<string, string>> = Object.freeze({
  reference: 'video_multi_ref',
  first_last_frame: 'first_last_frame',
  first_frame: 'first_frame',
  end_frame: 'end_frame',
  endframe: 'end_frame',
  'end-frame': 'end_frame',
  text_to_video: 'text_to_video',
  i2v: 'first_frame',
  t2v: 'text_to_video',
  flf: 'first_last_frame',
  avatar: 'digital_human',
  digital_human: 'digital_human',
  tts: 'text_to_speech',
  asr: 'speech_to_text',
  stt: 'speech_to_text',
  music: 'text_to_music',
  t2i: 'text_to_image',
  i2i: 'image_to_image',
});

/** Map a historical GenerationMode / wire operation string to the canonical id. */
export function mapLegacyOperation(raw: string | undefined | null): string {
  const key = String(raw ?? '').trim();
  if (!key) return '';
  return LEGACY_OPERATION_MAP[key] ?? key;
}

// ============================================================================
// Media type helpers
// ============================================================================

export const MEDIA_INPUT_TYPES = Object.freeze(['image', 'video', 'audio'] as const);
export type MediaInputType = (typeof MEDIA_INPUT_TYPES)[number];

export function isMediaInputType(type: string | undefined | null): type is MediaInputType {
  return type === 'image' || type === 'video' || type === 'audio';
}

const BYTES_PER_MB = 1024 * 1024;

// ============================================================================
// Upstream fingerprint
// ============================================================================

export interface UpstreamAssetFingerprint {
  availability?: 'ready' | 'waiting' | 'unavailable';
  availabilityMessage?: string;
  sourceLabel?: string;
  outputId?: string;
  url?: string;
  textContent?: string;
  /** Edge identity (stable per graph edge). */
  edgeId?: string;
  sourceNodeId: string;
  /** Material type of the upstream node ('image' | 'video' | 'audio' | 'text' | …). */
  type: string;
  mimeType?: string;
  sizeBytes?: number;
  durationSec?: number;
  /** Explicit role request (from edge data / handle semantics). */
  role?: string;
  /** Explicit target slot request (from edge data). */
  targetSlot?: string;
}

export interface UpstreamFingerprint {
  prompt: string;
  /** Values supplied on the node itself (for `source: node_field` contract slots). */
  nodeFields: Record<string, unknown>;
  localText?: string;
  /** All upstream assets in deterministic (caller-supplied) order. */
  assets: UpstreamAssetFingerprint[];
  /** Media assets only (image/video/audio) — the hard-gate population. */
  mediaAssets: UpstreamAssetFingerprint[];
  /** Stable content signature; any fingerprint change invalidates caches. */
  signature: string;
}

/** Canonical (key-sorted) JSON for stable fingerprint signatures. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(',')}}`;
}

export function buildUpstreamFingerprint(input: {
  prompt?: string;
  nodeFields?: Record<string, unknown>;
  assets?: UpstreamAssetFingerprint[];
  localText?: string;
}): UpstreamFingerprint {
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  const nodeFields = Object.fromEntries(
    Object.entries(input.nodeFields ?? {}).filter(([, value]) => value !== undefined),
  );
  const assets = (input.assets ?? []).map((asset) => ({ ...asset }));
  const mediaAssets = assets.filter((asset) => isMediaInputType(asset.type));
  const localText = input.localText;
  const signature = canonicalJson({ prompt, nodeFields, assets, localText });
  return { prompt, nodeFields, assets, mediaAssets, signature, localText };
}

// ============================================================================
// Contract view (normalized from the Catalog v1.1 DTO)
// ============================================================================

export interface ContractOperationView {
  id: string;
  label: string;
  output: { type: string; allowedMimes?: string[]; min?: number; max?: number };
  inputs: InputSlotDto[];
  inputGroups: Array<{ slots: string[]; min: number; hint?: string }>;
  parameters?: Record<string, unknown>;
  listed: boolean;
}

export interface ContractModelView {
  id: string;
  label: string;
  family?: string;
  aliases: string[];
  operations: ContractOperationView[];
  /** Stable catalog order — the final auto-pick tiebreaker. */
  order: number;
  /** True when synthesized from legacy inputCapability rows (pre-v1.1 DTO). */
  synthesized: boolean;
}

export interface ContractView {
  available: boolean;
  models: ContractModelView[];
  byIdOrAlias: Map<string, ContractModelView>;
  defaultsByOperation: Record<string, string>;
}

function normalizeSlot(raw: unknown): InputSlotDto | null {
  if (!raw || typeof raw !== 'object') return null;
  const slot = raw as Record<string, unknown>;
  if (typeof slot.slot !== 'string' || typeof slot.type !== 'string') return null;
  return {
    slot: slot.slot,
    type: slot.type,
    role: typeof slot.role === 'string' ? slot.role : 'reference',
    ...(typeof slot.source === 'string' ? { source: slot.source as InputSlotDto['source'] } : {}),
    min: Number.isFinite(slot.min) ? (slot.min as number) : 0,
    max: slot.max === null ? null : Number.isFinite(slot.max) ? (slot.max as number) : 0,
    ...(Array.isArray(slot.allowedMimes) ? { allowedMimes: slot.allowedMimes.map(String) } : {}),
    ...(Number.isFinite(slot.maxSizeMb) ? { maxSizeMb: slot.maxSizeMb as number } : {}),
    ...(typeof slot.maxSizeExclusive === 'boolean' ? { maxSizeExclusive: slot.maxSizeExclusive } : {}),
    ...(Number.isFinite(slot.minDurationSec) ? { minDurationSec: slot.minDurationSec as number } : {}),
    ...(Number.isFinite(slot.maxDurationSec) ? { maxDurationSec: slot.maxDurationSec as number } : {}),
    ...(Number.isFinite(slot.totalMinDurationSec) ? { totalMinDurationSec: slot.totalMinDurationSec as number } : {}),
    ...(Number.isFinite(slot.totalMaxDurationSec) ? { totalMaxDurationSec: slot.totalMaxDurationSec as number } : {}),
    ...(Number.isFinite(slot.combinedOutputMaxDurationSec)
      ? { combinedOutputMaxDurationSec: slot.combinedOutputMaxDurationSec as number }
      : {}),
    ...(typeof slot.totalMinExclusive === 'boolean' ? { totalMinExclusive: slot.totalMinExclusive } : {}),
    ...(typeof slot.totalMaxExclusive === 'boolean' ? { totalMaxExclusive: slot.totalMaxExclusive } : {}),
    ...(slot.limitSource && typeof slot.limitSource === 'object'
      ? { limitSource: slot.limitSource as InputSlotDto['limitSource'] }
      : {}),
  };
}

function normalizeOperation(raw: OperationContractDto): ContractOperationView | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;
  const outputType = typeof raw.output?.type === 'string' ? raw.output.type : '';
  if (!outputType) return null;
  return {
    id: raw.id,
    label: typeof raw.label === 'string' ? raw.label : raw.id,
    output: { ...raw.output, type: outputType },
    inputs: (Array.isArray(raw.inputs) ? raw.inputs : [])
      .map(normalizeSlot)
      .filter((slot): slot is InputSlotDto => slot !== null),
    inputGroups: (Array.isArray(raw.inputGroups) ? raw.inputGroups : [])
      .filter((group) => group && typeof group === 'object' && Array.isArray(group.slots))
      .map((group) => ({
        slots: group.slots.map(String),
        min: Number.isFinite(group.min) ? group.min : 0,
        ...(typeof group.hint === 'string' ? { hint: group.hint } : {}),
      })),
    ...(raw.parameters && typeof raw.parameters === 'object'
      ? { parameters: raw.parameters as Record<string, unknown> }
      : {}),
    listed: raw.listed === true,
  };
}

function toModelView(model: CatalogModelDto, order: number): ContractModelView | null {
  if (!model || typeof model.id !== 'string' || !model.id) return null;
  return {
    id: model.id,
    label: typeof model.label === 'string' ? model.label : model.id,
    ...(typeof model.family === 'string' ? { family: model.family } : {}),
    aliases: Array.isArray(model.aliases) ? model.aliases.map(String).filter(Boolean) : [],
    operations: (Array.isArray(model.operations) ? model.operations : [])
      .map(normalizeOperation)
      .filter((op): op is ContractOperationView => op !== null),
    order,
    synthesized: false,
  };
}

interface LegacyInputCapabilityLike {
  modalities?: string[];
  referenceImages?: { min?: number; max?: number; allowedMimeTypes?: string[]; supportedRoles?: string[] };
  referenceVideos?: { min?: number; max?: number; allowedMimeTypes?: string[]; supportedRoles?: string[] };
  referenceAudios?: { min?: number; max?: number; allowedMimeTypes?: string[]; supportedRoles?: string[] };
}

/**
 * Synthesize a one-operation contract view from a legacy bucket row's merged
 * inputCapability (pre-v1.1 static catalogs). Data-driven — nothing is
 * hardcoded per model; the row simply has no operation granularity.
 */
function synthesizeLegacyView(
  row: { id: string; label?: string; family?: string; aliases?: string[]; inputCapability?: LegacyInputCapabilityLike },
  outputType: string,
  order: number,
): ContractModelView {
  const cap = row.inputCapability ?? {};
  const inputs: InputSlotDto[] = [];
  const pushRef = (
    ref: { min?: number; max?: number; allowedMimeTypes?: string[]; supportedRoles?: string[] } | undefined,
    type: MediaInputType,
    slotName: string,
  ) => {
    if (!ref) return;
    inputs.push({
      slot: slotName,
      type,
      role: ref.supportedRoles?.[0] ?? 'reference',
      source: 'upstream_edge',
      min: Number.isFinite(ref.min) ? (ref.min as number) : 0,
      max: Number.isFinite(ref.max) ? (ref.max as number) : 0,
      ...(Array.isArray(ref.allowedMimeTypes) ? { allowedMimes: [...ref.allowedMimeTypes] } : {}),
    });
  };
  pushRef(cap.referenceImages, 'image', 'reference_images');
  pushRef(cap.referenceVideos, 'video', 'reference_videos');
  pushRef(cap.referenceAudios, 'audio', 'reference_audios');
  return {
    id: row.id,
    label: typeof row.label === 'string' ? row.label : row.id,
    ...(typeof row.family === 'string' ? { family: row.family } : {}),
    aliases: Array.isArray(row.aliases) ? row.aliases.map(String).filter(Boolean) : [],
    operations: [
      {
        id: 'legacy_default',
        label: row.label ?? row.id,
        output: { type: outputType },
        inputs,
        inputGroups: [],
        listed: true,
      },
    ],
    order,
    synthesized: true,
  };
}

/**
 * Normalize any catalog DTO (seam or HTTP) into the contract view the kernel
 * evaluates. `available` is false when the DTO carries no model knowledge at
 * all (hub seam missing / empty static shell) — callers fail closed.
 */
export function buildContractView(catalog: CapabilityCatalog | null | undefined): ContractView {
  const empty: ContractView = {
    available: false,
    models: [],
    byIdOrAlias: new Map(),
    defaultsByOperation: {},
  };
  if (!catalog || typeof catalog !== 'object') return empty;

  const models: ContractModelView[] = [];
  if (Array.isArray(catalog.models)) {
    catalog.models.forEach((row, index) => {
      const view = toModelView(row, index);
      if (view) models.push(view);
    });
  } else {
    // Legacy path: synthesize views from bucket rows that carry capability data.
    const buckets: Array<{ kind: string; rows: unknown }> = [
      { kind: 'text', rows: catalog.text },
      { kind: 'image', rows: catalog.image },
      { kind: 'video', rows: catalog.video },
      { kind: 'audio', rows: catalog.audio },
    ];
    for (const bucket of buckets) {
      if (!Array.isArray(bucket.rows)) continue;
      for (const raw of bucket.rows) {
        if (!raw || typeof raw !== 'object') continue;
        const row = raw as { id?: unknown; inputCapability?: unknown };
        if (typeof row.id !== 'string' || !row.id) continue;
        models.push(
          synthesizeLegacyView(
            row as { id: string; label?: string; family?: string; aliases?: string[]; inputCapability?: LegacyInputCapabilityLike },
            bucket.kind,
            models.length,
          ),
        );
      }
    }
  }

  const byIdOrAlias = new Map<string, ContractModelView>();
  for (const view of models) {
    if (!byIdOrAlias.has(view.id)) byIdOrAlias.set(view.id, view);
    for (const alias of view.aliases) {
      if (!byIdOrAlias.has(alias)) byIdOrAlias.set(alias, view);
    }
  }

  const defaultsByOperation: Record<string, string> = {};
  if (catalog.defaultsByOperation && typeof catalog.defaultsByOperation === 'object') {
    for (const [key, value] of Object.entries(catalog.defaultsByOperation)) {
      if (typeof value === 'string' && value) defaultsByOperation[key] = value;
    }
  }

  return {
    available: models.length > 0 || Array.isArray(catalog.models),
    models,
    byIdOrAlias,
    defaultsByOperation,
  };
}

/** Resolve a model by canonical id or runtime/wire alias. */
export function resolveModelView(
  view: ContractView,
  modelId: string | undefined | null,
): ContractModelView | undefined {
  const key = String(modelId ?? '').trim();
  if (!key) return undefined;
  return view.byIdOrAlias.get(key);
}

// ============================================================================
// Slot matcher (explicit role → required narrow slots → generic reference)
// ============================================================================

export interface SlotBinding {
  edgeId?: string;
  sourceNodeId: string;
  slot: string;
  role: string;
  type: string;
}

export interface OperationMatch {
  operationId: string;
  /** absorbs current inputs (min / prompt may still be unsatisfied). */
  accepts: boolean;
  /** accepts ∧ all slot min satisfied ∧ required prompt present. */
  ready: boolean;
  bindings: SlotBinding[];
  /** Blocking-for-accept rejections (typed, deterministic). */
  rejections: CompatRejection[];
  /** Blocking-for-ready-only reasons (min_unsatisfied / prompt_required). */
  pending: CompatRejection[];
}

function camelCaseSlot(slot: string): string {
  return slot.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function readNodeField(slot: InputSlotDto, fingerprint: UpstreamFingerprint): unknown {
  if (slot.slot === 'prompt' || slot.role === 'prompt') return fingerprint.prompt;
  return fingerprint.nodeFields[slot.slot] ?? fingerprint.nodeFields[camelCaseSlot(slot.slot)];
}

function isRequiredNodeFieldPresent(slot: InputSlotDto, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!slot.slot.endsWith('_url')) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Slots that upstream edges can bind into (prompt/node_field slots excluded). */
export function bindableSlots(op: ContractOperationView): InputSlotDto[] {
  return op.inputs.filter(
    (slot) => slot.source !== 'node_field' && slot.role !== 'prompt' && isMediaInputType(slot.type),
  );
}

interface SlotAssignment {
  slot: InputSlotDto;
  assets: UpstreamAssetFingerprint[];
}

const REJECTION_PRIORITY: CompatReasonCode[] = [
  'role_conflict',
  'slot_capacity',
  'mime_unsupported',
  'size_exceeded',
  'duration_exceeded',
  'operation_incompatible',
];

function bestRejection(candidates: CompatRejection[]): CompatRejection {
  for (const code of REJECTION_PRIORITY) {
    const hit = candidates.find((candidate) => candidate.code === code);
    if (hit) return hit;
  }
  return candidates[0] ?? rejection('operation_incompatible', '输入无法被该 operation 吸收');
}

/**
 * Match one operation's slots against the fingerprint's media assets.
 *
 * Determinism: assets bind in caller order; slot candidates are tried in a
 * fixed order — explicit targetSlot / role first, then required narrow slots
 * (min > already-assigned, role ≠ 'reference'), then generic reference
 * slots, then the rest — each group in declaration order.
 */
export function matchOperationInputs(
  op: ContractOperationView,
  fingerprint: UpstreamFingerprint,
): OperationMatch {
  const slots = bindableSlots(op);
  const assignments = new Map<InputSlotDto, SlotAssignment>();
  for (const slot of slots) assignments.set(slot, { slot, assets: [] });

  const rejections: CompatRejection[] = [];

  const tryAssign = (
    asset: UpstreamAssetFingerprint,
    candidates: InputSlotDto[],
  ): { assigned: boolean; attempts: CompatRejection[] } => {
    const attempts: CompatRejection[] = [];
    for (const slot of candidates) {
      const state = assignments.get(slot);
      if (!state) continue;
      const max = slot.max === null ? Number.POSITIVE_INFINITY : slot.max;
      if (state.assets.length >= max) {
        attempts.push(rejection('slot_capacity', `槽位 ${slot.slot} 已满（max ${slot.max}）`, {
          operationId: op.id,
          slot: slot.slot,
          meta: { max: slot.max, current: state.assets.length },
        }));
        continue;
      }
      if (
        Array.isArray(slot.allowedMimes)
        && slot.allowedMimes.length > 0
        && typeof asset.mimeType === 'string'
        && asset.mimeType
        && !slot.allowedMimes.includes(asset.mimeType)
      ) {
        attempts.push(rejection('mime_unsupported', `素材 MIME ${asset.mimeType} 不在槽位 ${slot.slot} 允许列表`, {
          operationId: op.id,
          slot: slot.slot,
          meta: { mimeType: asset.mimeType, allowedMimes: [...slot.allowedMimes] },
        }));
        continue;
      }
      if (
        Number.isFinite(slot.maxSizeMb)
        && Number.isFinite(asset.sizeBytes)
        && (slot.maxSizeExclusive === true
          ? (asset.sizeBytes as number) >= (slot.maxSizeMb as number) * BYTES_PER_MB
          : (asset.sizeBytes as number) > (slot.maxSizeMb as number) * BYTES_PER_MB)
      ) {
        attempts.push(rejection('size_exceeded', `素材体积超过槽位 ${slot.slot} 上限（${slot.maxSizeMb}MB）`, {
          operationId: op.id,
          slot: slot.slot,
          meta: { sizeBytes: asset.sizeBytes, maxSizeMb: slot.maxSizeMb },
        }));
        continue;
      }
      if (
        Number.isFinite(slot.maxDurationSec)
        && Number.isFinite(asset.durationSec)
        && (asset.durationSec as number) > (slot.maxDurationSec as number)
      ) {
        attempts.push(rejection('duration_exceeded', `素材时长超过槽位 ${slot.slot} 上限（${slot.maxDurationSec}s）`, {
          operationId: op.id,
          slot: slot.slot,
          meta: { durationSec: asset.durationSec, maxDurationSec: slot.maxDurationSec },
        }));
        continue;
      }
      if (
        Number.isFinite(slot.minDurationSec)
        && Number.isFinite(asset.durationSec)
        && (asset.durationSec as number) < (slot.minDurationSec as number)
      ) {
        attempts.push(rejection('duration_exceeded', `素材时长低于槽位 ${slot.slot} 下限（${slot.minDurationSec}s）`, {
          operationId: op.id,
          slot: slot.slot,
          meta: { durationSec: asset.durationSec, minDurationSec: slot.minDurationSec },
        }));
        continue;
      }
      state.assets.push(asset);
      return { assigned: true, attempts };
    }
    return { assigned: false, attempts };
  };

  for (const asset of fingerprint.mediaAssets) {
    // 1. Explicit target slot wins above everything.
    if (asset.targetSlot) {
      const explicit = slots.filter((slot) => slot.slot === asset.targetSlot && slot.type === asset.type);
      if (explicit.length === 0) {
        rejections.push(rejection('role_conflict', `显式目标槽位 ${asset.targetSlot} 不存在或类型不符`, {
          operationId: op.id,
          slot: asset.targetSlot,
        }));
        continue;
      }
      const result = tryAssign(asset, explicit);
      if (!result.assigned) rejections.push(bestRejection(result.attempts));
      continue;
    }

    // 2. Explicit role: only slots carrying that role.
    if (asset.role) {
      const roleSlots = slots.filter((slot) => slot.role === asset.role && slot.type === asset.type);
      if (roleSlots.length === 0) {
        rejections.push(rejection('role_conflict', `没有角色为 ${asset.role} 且类型为 ${asset.type} 的槽位`, {
          operationId: op.id,
          meta: { role: asset.role, type: asset.type },
        }));
        continue;
      }
      const result = tryAssign(asset, roleSlots);
      if (!result.assigned) rejections.push(bestRejection(result.attempts));
      continue;
    }

    // 3. Type-matched slots: required narrow → generic reference → rest.
    const typed = slots.filter((slot) => slot.type === asset.type);
    if (typed.length === 0) {
      rejections.push(rejection('operation_incompatible', `operation ${op.id} 没有可吸收 ${asset.type} 的槽位`, {
        operationId: op.id,
        meta: { type: asset.type },
      }));
      continue;
    }
    const requiredNarrow = typed.filter((slot) => {
      const state = assignments.get(slot);
      return slot.role !== 'reference' && state !== undefined && state.assets.length < slot.min;
    });
    const genericReference = typed.filter((slot) => slot.role === 'reference' && !requiredNarrow.includes(slot));
    const rest = typed.filter((slot) => !requiredNarrow.includes(slot) && !genericReference.includes(slot));
    const result = tryAssign(asset, [...requiredNarrow, ...genericReference, ...rest]);
    if (!result.assigned) rejections.push(bestRejection(result.attempts));
  }

  for (const state of assignments.values()) {
    if (state.assets.length === 0) continue;
    if (!state.assets.every((asset) => Number.isFinite(asset.durationSec))) continue;
    const total = state.assets.reduce((sum, asset) => sum + (asset.durationSec as number), 0);
    if (
      Number.isFinite(state.slot.totalMinDurationSec)
      && (state.slot.totalMinExclusive
        ? total <= (state.slot.totalMinDurationSec as number)
        : total < (state.slot.totalMinDurationSec as number))
    ) {
      rejections.push(rejection('duration_exceeded', `槽位 ${state.slot.slot} 的素材总时长低于文档下限`, {
        operationId: op.id,
        slot: state.slot.slot,
        meta: { totalDurationSec: total, totalMinDurationSec: state.slot.totalMinDurationSec },
      }));
    }
    if (
      Number.isFinite(state.slot.totalMaxDurationSec)
      && (state.slot.totalMaxExclusive
        ? total >= (state.slot.totalMaxDurationSec as number)
        : total > (state.slot.totalMaxDurationSec as number))
    ) {
      rejections.push(rejection('duration_exceeded', `槽位 ${state.slot.slot} 的素材总时长超过文档上限`, {
        operationId: op.id,
        slot: state.slot.slot,
        meta: { totalDurationSec: total, totalMaxDurationSec: state.slot.totalMaxDurationSec },
      }));
    }
  }

  const bindings: SlotBinding[] = [];
  for (const state of assignments.values()) {
    for (const asset of state.assets) {
      bindings.push({
        ...(asset.edgeId ? { edgeId: asset.edgeId } : {}),
        sourceNodeId: asset.sourceNodeId,
        slot: state.slot.slot,
        role: state.slot.role,
        type: state.slot.type,
      });
    }
  }

  const accepts = rejections.length === 0;

  // readyToSubmit: every slot min satisfied + required prompt present.
  const pending: CompatRejection[] = [];
  if (accepts) {
    if (op.output.type === 'audio' && fingerprint.localText?.trim()
      && fingerprint.assets.some((asset) => asset.type === 'text' && asset.textContent?.trim())) {
      pending.push(rejection('text_role_required', '当前音频任务不能分别表达上游正文和本地要求；请将正文保留在一个来源，并用已支持的音色、语速等参数调整表达', { operationId: op.id }));
    }
    for (const asset of fingerprint.assets) {
      if (!asset.availability || asset.availability === 'ready') continue;
      pending.push(rejection(asset.availability === 'waiting' ? 'input_waiting' : 'input_unavailable',
        asset.availabilityMessage ?? `来源 ${asset.sourceNodeId} 尚未就绪，请补齐内容或移除引用`, {
          operationId: op.id, meta: { sourceNodeId: asset.sourceNodeId, sourceLabel: asset.sourceLabel ?? asset.sourceNodeId, edgeId: asset.edgeId },
        }));
    }
    for (const state of assignments.values()) {
      if (state.assets.length < state.slot.min) {
        pending.push(rejection('min_unsatisfied', `槽位 ${state.slot.slot} 需要至少 ${state.slot.min} 个输入（当前 ${state.assets.length}）`, {
          operationId: op.id,
          slot: state.slot.slot,
          meta: { min: state.slot.min, current: state.assets.length },
        }));
      }
    }
    for (const group of op.inputGroups) {
      const count = group.slots.reduce(
        (sum, slotName) => sum + (assignments.get(slots.find((slot) => slot.slot === slotName)!)?.assets.length ?? 0),
        0,
      );
      if (count < group.min) {
        pending.push(rejection('min_unsatisfied', group.hint || `输入组至少需要 ${group.min} 个素材（当前 ${count}）`, {
          operationId: op.id,
          meta: { slots: [...group.slots], min: group.min, current: count },
        }));
      }
    }
    const promptRequired = op.inputs.some(
      (slot) => (slot.role === 'prompt' || slot.slot === 'prompt') && slot.min >= 1,
    );
    if (promptRequired && !fingerprint.prompt.trim()) {
      pending.push(rejection('prompt_required', '请提供正文或补充要求，也可连接已有文本', { operationId: op.id }));
    }
    for (const slot of op.inputs) {
      if (slot.source !== 'node_field' || slot.min < 1 || slot.role === 'prompt' || slot.slot === 'prompt') continue;
      if (isRequiredNodeFieldPresent(slot, readNodeField(slot, fingerprint))) continue;
      const name = slot.slot.endsWith('_url') ? '有效 URL' : '非空值';
      pending.push(rejection('metadata_required', `槽位 ${slot.slot} 需要${name}`, {
        operationId: op.id,
        slot: slot.slot,
      }));
    }
  }

  return {
    operationId: op.id,
    accepts,
    ready: accepts && pending.length === 0,
    bindings,
    rejections,
    pending,
  };
}

// ============================================================================
// Per-model verdict
// ============================================================================

export interface ModelCompatVerdict {
  modelId: string;
  known: boolean;
  family?: string;
  /** Canonical (legacy-mapped) requested operation, when one was given. */
  requestedOperationId?: string;
  listedOperationIds: string[];
  /** All evaluated listed operations (filtered by outputType when given). */
  matches: OperationMatch[];
  /** Listed operations that absorb the current fingerprint. */
  effectiveOperations: OperationMatch[];
  acceptsCurrentInputs: boolean;
  readyToSubmit: boolean;
  chosenOperationId?: string;
  bindings: SlotBinding[];
  rejections: CompatRejection[];
}

export function evaluateModelCompat(
  model: ContractModelView | undefined,
  fingerprint: UpstreamFingerprint,
  opts: { operationId?: string; outputType?: string } = {},
): ModelCompatVerdict {
  if (!model) {
    return {
      modelId: '',
      known: false,
      listedOperationIds: [],
      matches: [],
      effectiveOperations: [],
      acceptsCurrentInputs: false,
      readyToSubmit: false,
      bindings: [],
      rejections: [rejection('unknown_model', '模型不在目录中（未知或已下架）')],
    };
  }

  const requestedOperationId =
    typeof opts.operationId === 'string' && opts.operationId.trim()
      ? opts.operationId.trim()
      : undefined;
  const listedOps = model.operations.filter((op) => op.listed);
  const candidateOps = opts.outputType
    ? listedOps.filter((op) => op.output.type === opts.outputType)
    : listedOps;

  const base: ModelCompatVerdict = {
    modelId: model.id,
    known: true,
    ...(model.family !== undefined ? { family: model.family } : {}),
    ...(requestedOperationId ? { requestedOperationId } : {}),
    listedOperationIds: candidateOps.map((op) => op.id),
    matches: [],
    effectiveOperations: [],
    acceptsCurrentInputs: false,
    readyToSubmit: false,
    bindings: [],
    rejections: [],
  };

  if (listedOps.length === 0) {
    base.rejections = [rejection('not_listed', `模型 ${model.id} 没有已上架 operation`, { modelId: model.id })];
    return base;
  }
  if (candidateOps.length === 0) {
    base.rejections = [rejection('operation_incompatible', `模型 ${model.id} 没有产出类型为 ${opts.outputType ?? '?'} 的已上架 operation`, {
      modelId: model.id,
      meta: { outputType: opts.outputType },
    })];
    return base;
  }

  const matches = candidateOps.map((op) => matchOperationInputs(op, fingerprint));
  const effective = matches.filter((match) => match.accepts);

  base.matches = matches;
  base.effectiveOperations = effective;

  if (effective.length === 0) {
    // Deterministic "best" explanation: the operation with the fewest
    // rejections (declaration order breaks ties), then its best rejection.
    const ranked = [...matches].sort((a, b) => a.rejections.length - b.rejections.length);
    const best = ranked[0];
    base.rejections = best
      ? best.rejections.map((item) => ({ ...item, modelId: model.id }))
      : [rejection('model_incompatible', `模型 ${model.id} 无法吸收当前输入`, { modelId: model.id })];
    return base;
  }

  // Chosen operation: the requested one when effective, else first effective.
  // `effective` is provably non-empty here (early return above).
  const chosen = ((requestedOperationId
    ? effective.find((match) => match.operationId === requestedOperationId)
    : undefined) ?? effective[0]) as OperationMatch;

  base.acceptsCurrentInputs = true;
  base.readyToSubmit = chosen.ready;
  base.chosenOperationId = chosen.operationId;
  base.bindings = chosen.bindings;
  base.rejections = chosen.pending.map((item) => ({ ...item, modelId: model.id }));
  return base;
}

// ============================================================================
// Catalog-wide evaluation
// ============================================================================

export interface CatalogCompatEvaluation {
  catalogAvailable: boolean;
  fingerprint: UpstreamFingerprint;
  models: ModelCompatVerdict[];
  /** Models with acceptsCurrentInputs === true, in catalog order. */
  compatible: ModelCompatVerdict[];
  zeroCandidates: boolean;
}

export function evaluateCatalogCompat(
  catalog: CapabilityCatalog | null | undefined,
  fingerprint: UpstreamFingerprint,
  opts: { outputType?: string } = {},
): CatalogCompatEvaluation {
  const view = buildContractView(catalog);
  if (!view.available) {
    return { catalogAvailable: false, fingerprint, models: [], compatible: [], zeroCandidates: true };
  }
  const models = view.models.map((model) => evaluateModelCompat(model, fingerprint, opts));
  const compatible = models.filter((verdict) => verdict.acceptsCurrentInputs);
  return {
    catalogAvailable: true,
    fingerprint,
    models,
    compatible,
    zeroCandidates: compatible.length === 0,
  };
}

/**
 * Deterministic primary rejection code for a zero-candidate evaluation.
 * Specific input-violation codes beat the generic no_compatible_model.
 */
export function primaryRejectionCode(evaluation: CatalogCompatEvaluation): CompatReasonCode {
  if (!evaluation.catalogAvailable) return 'catalog_unavailable';
  const codes = new Set<CompatReasonCode>();
  for (const verdict of evaluation.models) {
    for (const item of verdict.rejections) codes.add(item.code);
  }
  for (const code of [
    'mime_unsupported',
    'size_exceeded',
    'duration_exceeded',
    'slot_capacity',
    'role_conflict',
    'operation_incompatible',
    'not_listed',
  ] as CompatReasonCode[]) {
    if (codes.has(code)) return code === 'not_listed' || code === 'operation_incompatible' ? 'no_compatible_model' : code;
  }
  return 'no_compatible_model';
}

// ============================================================================
// Auto adaptation (locked deterministic ordering)
// ============================================================================

export interface AutoAdaptationPick {
  modelId: string;
  operationId: string;
  bindings: SlotBinding[];
  readyToSubmit: boolean;
  keptCurrentModel: boolean;
  keptCurrentOperation: boolean;
  /** Which rule produced the pick (telemetry / tests). */
  rule: 'keep_current' | 'same_model' | 'user_preference' | 'type_default' | 'operation_default' | 'catalog_order';
}

function firstEffective(verdict: ModelCompatVerdict): OperationMatch | undefined {
  return verdict.effectiveOperations.find((op) => op.ready) ?? verdict.effectiveOperations[0];
}

function effectiveOp(verdict: ModelCompatVerdict, operationId: string | undefined): OperationMatch | undefined {
  if (!operationId) return undefined;
  return verdict.effectiveOperations.find((match) => match.operationId === operationId);
}

function pickFromVerdict(
  verdict: ModelCompatVerdict,
  preferredOperationId: string | undefined,
  rule: AutoAdaptationPick['rule'],
  keptCurrentModel: boolean,
): AutoAdaptationPick | null {
  const op = effectiveOp(verdict, preferredOperationId) ?? firstEffective(verdict);
  if (!op) return null;
  return {
    modelId: verdict.modelId,
    operationId: op.operationId,
    bindings: op.bindings,
    readyToSubmit: op.ready,
    keptCurrentModel,
    keptCurrentOperation: keptCurrentModel && op.operationId === preferredOperationId,
    rule,
  };
}

/** Keep a compatible current model; otherwise prefer the user's new-node choice,
 * the node-type default, then the curated catalog order. Never rewrites preferences.
 */
export function planAutoAdaptation(args: {
  catalog: CapabilityCatalog | null | undefined;
  fingerprint: UpstreamFingerprint;
  outputType?: string;
  currentModelId?: string;
  currentOperationId?: string;
  /** Only supplied for a new node without an explicit model. */
  preferredModelId?: string;
}): AutoAdaptationPick | null {
  const view = buildContractView(args.catalog);
  if (!view.available) return null;
  const outputType = args.outputType;
  const currentOperationId = args.currentOperationId?.trim() || undefined;
  // Editing/extension is user intent, not an interchangeable input format.
  const preserveOperation = outputType === 'video'
    && (currentOperationId === 'video_edit' || currentOperationId === 'video_extend');
  const pick = (verdict: ModelCompatVerdict, rule: AutoAdaptationPick['rule'], kept: boolean) => {
    const preferred = effectiveOp(verdict, currentOperationId);
    if (preserveOperation && !preferred) return null;
    const operation = outputType === 'text' && !preferred?.ready
      ? undefined
      : currentOperationId;
    return pickFromVerdict(verdict, operation, rule, kept);
  };
  const current = resolveModelView(view, args.currentModelId);
  if (current) {
    const verdict = evaluateModelCompat(current, args.fingerprint, { outputType });
    if (verdict.acceptsCurrentInputs) {
      const result = pick(verdict, 'keep_current', true);
      if (result) {
        if (!result.keptCurrentOperation) result.rule = 'same_model';
        return result;
      }
    }
  }
  const evaluation = evaluateCatalogCompat(args.catalog, args.fingerprint, { outputType });
  if (evaluation.zeroCandidates) return null;
  const kind = outputType as keyof NonNullable<CapabilityCatalog['defaults']>;
  const defaults = args.catalog?.generationPolicy?.[kind]?.defaultModelId
    ?? args.catalog?.defaults?.[kind];
  const preferredIds: Array<[string | undefined, AutoAdaptationPick['rule']]> = [
    [!args.currentModelId ? args.preferredModelId : undefined, 'user_preference'],
    [defaults, 'type_default'],
    [!args.catalog?.generationPolicy && currentOperationId ? view.defaultsByOperation[currentOperationId] : undefined, 'operation_default'],
  ];
  for (const [id, rule] of preferredIds) {
    if (!id) continue;
    const resolved = resolveModelView(view, id);
    const verdict = evaluation.compatible.find((candidate) => candidate.modelId === resolved?.id);
    if (verdict) {
      const result = pick(verdict, rule, false);
      if (result) return result;
    }
  }
  const order = args.catalog?.generationPolicy?.[kind]?.allowedModelIds;
  const candidates = order
    ? order.flatMap((id) => evaluation.compatible.filter((candidate) => candidate.modelId === id))
    : evaluation.compatible;
  for (const verdict of candidates) {
    const result = pick(verdict, 'catalog_order', false);
    if (result) return result;
  }
  return null;
}

// ============================================================================
// Merged input capability (legacy facade support)
// ============================================================================

export interface MergedInputCapability {
  modalities: string[];
  referenceImages?: { min: number; max: number | null; allowedMimeTypes: string[]; supportedRoles: string[] };
  referenceVideos?: { min: number; max: number | null; allowedMimeTypes: string[]; supportedRoles: string[] };
  referenceAudios?: { min: number; max: number | null; allowedMimeTypes: string[]; supportedRoles: string[] };
}

/**
 * Merge a model's operation inputs into the legacy ModelInputCapability row
 * shape (roles union, min = min, max = max, mimes union). Lossy by design —
 * the authoritative consumption path is per-operation.
 */
export function deriveMergedInputCapability(model: ContractModelView): MergedInputCapability | undefined {
  const modalities: string[] = [];
  const refs: Record<MediaInputType, { min: number; max: number | null; allowedMimeTypes: string[]; supportedRoles: string[] } | undefined> = {
    image: undefined,
    video: undefined,
    audio: undefined,
  };

  const addModality = (modality: string) => {
    if (modality && !modalities.includes(modality)) modalities.push(modality);
  };

  for (const op of model.operations) {
    // Listed operations only — mirrors the hub bucket-row projection.
    if (!op.listed) continue;
    for (const slot of op.inputs) {
      if (slot.role === 'prompt' || slot.type === 'text') addModality('text');
      else addModality(slot.type);
      if (!isMediaInputType(slot.type)) continue;
      const acc = refs[slot.type];
      if (!acc) {
        refs[slot.type] = {
          min: slot.min,
          max: slot.max,
          allowedMimeTypes: [...(slot.allowedMimes ?? [])],
          supportedRoles: slot.role ? [slot.role] : [],
        };
      } else {
        acc.min = Math.min(acc.min, slot.min);
        acc.max = acc.max === null || slot.max === null
          ? null
          : Math.max(acc.max, slot.max);
        for (const mime of slot.allowedMimes ?? []) {
          if (!acc.allowedMimeTypes.includes(mime)) acc.allowedMimeTypes.push(mime);
        }
        if (slot.role && !acc.supportedRoles.includes(slot.role)) acc.supportedRoles.push(slot.role);
      }
    }
  }

  if (modalities.length === 0) return undefined;
  const out: MergedInputCapability = { modalities };
  if (refs.image) out.referenceImages = refs.image;
  if (refs.video) out.referenceVideos = refs.video;
  if (refs.audio) out.referenceAudios = refs.audio;
  return out;
}
