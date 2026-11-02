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
 * Project both catalog representations so no picker, planner or agent can bypass curation.
 *
 * Membership is now settings-driven (spec canvas-model-visibility): every hub-listed
 * row for a kind is a candidate, the user's `canvasHiddenModels[kind]` ids are
 * subtracted, and each survivor must still prove a listed output op in the
 * authoritative catalog. `CANVAS_GENERATION_POLICY` only seeds default fallbacks
 * and `modeSelection`; the emitted `generationPolicy[kind].allowedModelIds` is the
 * post-filter set — it is what capability-only checks (ASR exclusion) read.
 */
export function projectCanvasCatalog(catalog: CapabilityCatalog): CapabilityCatalog {
  const policy = CANVAS_GENERATION_POLICY;
  const kinds = Object.keys(policy) as MaterialType[];
  const hidden = catalog.canvasHiddenModels ?? {};
  const lists = {} as Record<MaterialType, CapabilityModelItem[]>;
  const defaults: NonNullable<CapabilityCatalog['defaults']> = {};
  for (const kind of kinds) {
    const hiddenIds = new Set(hidden[kind] ?? []);
    // Catalog row order is the display order; subtract-only filtering preserves it.
    lists[kind] = (catalog[kind] ?? []).filter((row) => {
      if (!row?.id || hiddenIds.has(row.id)) return false;
      // Every candidate must prove a real listed output in the authoritative catalog.
      return Boolean(catalog.models?.some((model) => model.id === row.id
        && model.operations?.some((op) => op.listed === true && op.output?.type === kind)));
    });
    defaults[kind] = [catalog.defaults?.[kind], policy[kind].defaultModelId]
      .find((id) => lists[kind].some((row) => row.id === id))
      ?? lists[kind][0]?.id ?? '';
  }
  const capabilitySeams = new Set<string>(CANVAS_INPUT_CAPABILITY_SEAMS);
  const capabilityAdmitted = new Set((catalog.models ?? [])
    .filter((model) => (model.operations ?? []).some((op) => op.listed === true
      && capabilitySeams.has(operationSeam(op))))
    .map((model) => model.id));
  const models = catalog.models?.flatMap((model): CatalogModelDto[] => {
    const outputs = kinds.filter((kind) => lists[kind].some((row) => row.id === model.id));
    const capability = capabilityAdmitted.has(model.id);
    if (!outputs.length && !capability) return [];
    const operations = (model.operations ?? []).filter((op) => op.listed === true
      && (outputs.includes(op.output?.type as MaterialType)
        || (capability && capabilitySeams.has(operationSeam(op)))));
    // Never hand the picker an operation-less shell: a row is admitted only with a listed operation.
    if (!operations.length) return [];
    return [{ ...model, operations, listedOperations: operations.map((op) => `${model.id}#${op.id}`) }];
  });
  const defaultsByOperation = Object.fromEntries(Object.entries(catalog.defaultsByOperation ?? {})
    .filter(([operation, id]) => models?.some((model) => model.id === id
      && model.operations?.some((op) => op.id === operation))));
  for (const kind of kinds) {
    const defaultModel = models?.find((model) => model.id === defaults[kind]);
    for (const op of defaultModel?.operations ?? []) {
      if (op.output?.type === kind) defaultsByOperation[op.id] = defaultModel!.id;
    }
  }
  const defaultOperations = Object.fromEntries(Object.entries(catalog.defaultOperations ?? {})
    .filter(([kind, recommendation]) => models?.some((model) => model.id === recommendation?.modelId
      && model.operations?.some((op) => op.id === recommendation.operationId && op.output?.type === kind))));
  // Effective policy: the post-filter set, not the seed constant. This is the
  // shape consumers (compatKernel, isCanvasCapabilityModel) read.
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
