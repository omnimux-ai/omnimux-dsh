import type { CapabilityCatalog, CapabilityModelItem, CatalogModelDto } from './api.ts';
import type { MaterialType } from './canvasTypes.ts';

/** Product curation only. Input capabilities remain owned by the hub catalog. */
export interface GenerationPolicy {
  allowedModelIds: readonly string[];
  defaultModelId: string;
  modeSelection: 'automatic' | 'model';
}

/**
 * Seed defaults and mode-selection for the canvas curation. The allowed set is
 * NO LONGER read from this constant — `projectCanvasCatalog` derives it from
 * the hub catalog rows minus the user's per-kind hidden set (settings-driven
 * visibility, spec canvas-model-visibility). These ids only seed `defaultModelId`
 * fallbacks when the catalog itself offers no better candidate.
 */
export const CANVAS_GENERATION_POLICY: Readonly<Record<MaterialType, GenerationPolicy>> = {
  text: {
    allowedModelIds: ['gemini-3.8-flash'],
    defaultModelId: 'gemini-3.8-flash',
    modeSelection: 'model',
  },
  image: {
    allowedModelIds: ['gpt-image-2.5'],
    defaultModelId: 'gpt-image-2.5',
    modeSelection: 'model',
  },
  video: {
    allowedModelIds: ['seedance-2-5', 'seedance-2-0'],
    defaultModelId: 'seedance-2-5',
    modeSelection: 'model',
  },
  audio: {
    allowedModelIds: ['suno'],
    defaultModelId: 'suno',
    modeSelection: 'model',
  },
};

/**
 * Effective membership check for one kind: the model must survive the canvas
 * projection — i.e. be a hub-listed row for that kind, prove a listed output op,
 * and not be in the user's hidden set. Reads the projected `generationPolicy`,
 * so callers pass the canvas catalog (not the raw hub DTO).
 */
export function isCanvasModelAllowed(catalog: CapabilityCatalog, kind: MaterialType, modelId: string): boolean {
  return Boolean(catalog?.generationPolicy?.[kind]?.allowedModelIds?.includes(modelId));
}

/**
 * Canvas tools that consume an input capability instead of generating a material.
 *
 * These are not curation: a model reaches a capability tool only through its own contract.
 * The single admission rule is "the model owns a LISTED operation bound to the tool's adapter
 * seam", so an unlisted, draft, alias-only or non-canonical row can never appear, and nothing
 * has to be edited here when a new speech model is registered — a new *capability* does.
 *
 * Capability models stay out of the four generative buckets: they are reachable only by the
 * tool that consumes the capability, so a chat node can never offer an ASR model.
 */
export const CANVAS_CAPABILITY_TOOLS: Readonly<Record<string, string>> = Object.freeze({
  'audio-transcription': 'speechToText',
});

/** Seams consumed by capability tools; the projection admits their models outside the whitelists. */
export const CANVAS_INPUT_CAPABILITY_SEAMS: readonly string[] = Object.freeze([
  ...new Set(Object.values(CANVAS_CAPABILITY_TOOLS)),
]);

/** Adapter seam an operation is bound to; contract rows declare implementation and execution. */
function operationSeam(op: NonNullable<CatalogModelDto['operations']>[number]): string {
  return op?.implementation?.seam ?? op?.execution?.seam ?? '';
}

/** True when one of the model's LISTED operations is bound to `seam`. */
export function modelBindsSeam(model: CatalogModelDto | undefined, seam: string | undefined): boolean {
  if (!model || !seam) return false;
  return (model.operations ?? []).some((op) => op.listed === true && operationSeam(op) === seam);
}

/**
 * True when the model is in the canvas only through a capability seam — i.e. no generative
 * whitelist admits it. Such a model must never enter a picker that does not serve its seam.
 */
export function isCanvasCapabilityModel(catalog: CapabilityCatalog, modelId: string): boolean {
  const policy = catalog?.generationPolicy;
  if (!policy) return false;
  for (const entry of Object.values(policy)) {
    if (entry?.allowedModelIds?.includes(modelId)) return false;
  }
  const seams = new Set(CANVAS_INPUT_CAPABILITY_SEAMS);
  return (catalog.models ?? []).some((model) => model.id === modelId
    && (model.operations ?? []).some((op) => op.listed === true && seams.has(operationSeam(op))));
}

/**
 * Project the hub catalog for canvas consumers.
 *
 * Visibility is owned by the hub: gateway-public rows and custom BYOK model
 * profiles are passed through as-is. Local adapter support is represented by
 * `executionStatus` on the row and never removes it here. `CANVAS_GENERATION_POLICY`
 * only seeds default fallbacks and `modeSelection`; `allowedModelIds` is the
 * current visible set used for ordering, not an admission gate.
 */
export function projectCanvasCatalog(catalog: CapabilityCatalog): CapabilityCatalog {
  const policy = CANVAS_GENERATION_POLICY;
  const kinds = Object.keys(policy) as MaterialType[];
  // Visibility is owned by the hub catalog (gateway public + custom rows). The
  // canvas projection is deliberately an identity pass: it must not subtract
  // hidden ids or remove rows whose local adapter is unavailable.
  const models = catalog.models ? [...catalog.models] : undefined;
  const modelIds = new Set((models ?? []).map((model) => model.id));
  const rowsFor = (kind: MaterialType) => (catalog[kind] ?? []).filter((row) => {
    // New hub rows carry provenance/status and are authoritative. Legacy
    // bucket-only fixtures keep the old listed-operation safety check so an
    // old stale bucket cannot masquerade as an executable catalog.
    if (row.source === 'gateway' || row.source === 'custom' || row.executionStatus) return true;
    if (!models) return false;
    return models.some((model) => model.id === row.id
      && model.operations?.some((op) => op.listed === true && op.output?.type === kind));
  });
  const lists = Object.fromEntries(kinds.map((kind) => [kind, rowsFor(kind)])) as Record<MaterialType, CapabilityModelItem[]>;
  const defaults: NonNullable<CapabilityCatalog['defaults']> = {};
  for (const kind of kinds) {
    const rows = lists[kind].filter((row) => !models || modelIds.has(row.id));
    defaults[kind] = [catalog.defaults?.[kind], policy[kind].defaultModelId]
      .find((id) => id && rows.some((row) => row.id === id))
      ?? rows[0]?.id ?? '';
  }
  const defaultsByOperation = Object.fromEntries(Object.entries(catalog.defaultsByOperation ?? {})
    .filter(([operation, id]) => models?.some((model) => model.id === id
      && model.operations?.some((op) => op.id === operation))));
  // Keep the existing default operation map only when it still names a real
  // model/op pair; never use it as an admission decision.
  const defaultOperations = Object.fromEntries(Object.entries(catalog.defaultOperations ?? {})
    .filter(([kind, recommendation]) => models?.some((model) => model.id === recommendation?.modelId
      && model.operations?.some((operation) => operation.id === recommendation.operationId && operation.output?.type === kind))));
  const effectivePolicy = Object.fromEntries(kinds.map((kind) => [kind, {
    allowedModelIds: lists[kind].map((row) => row.id),
    defaultModelId: defaults[kind] ?? '',
    modeSelection: policy[kind].modeSelection,
  }])) as unknown as Readonly<Record<MaterialType, GenerationPolicy>>;
  return {
    ...catalog,
    ...lists,
    ...(models ? { models } : {}),
    defaults,
    defaultsByOperation,
    defaultOperations,
    generationPolicy: effectivePolicy,
    fingerprint: catalog.fingerprint
      ? `${catalog.fingerprint}:canvas:${JSON.stringify(effectivePolicy)}`
      : undefined,
  };
}