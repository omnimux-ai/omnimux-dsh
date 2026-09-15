import type { CapabilityCatalog, CapabilityModelItem, CatalogModelDto } from './api.ts';
import type { MaterialType } from './canvasTypes.ts';

/** Product curation only. Input capabilities remain owned by the hub catalog. */
export interface GenerationPolicy {
  allowedModelIds: readonly string[];
  defaultModelId: string;
  modeSelection: 'automatic' | 'model';
}

export const CANVAS_GENERATION_POLICY: Readonly<Record<MaterialType, GenerationPolicy>> = {
  text: {
    // 网关生产基线已收敛，仅保留谷歌 Gemini 3.8 Flash 主力文本模型
    allowedModelIds: ['gemini-3.8-flash'],
    defaultModelId: 'gemini-3.8-flash',
    modeSelection: 'automatic',
  },
  image: {
    // 仅保留 OpenAI GPT Image 2.5 官方主模型（含 pro/economy 双档）
    allowedModelIds: ['gpt-image-2.5'],
    defaultModelId: 'gpt-image-2.5',
    modeSelection: 'model',
  },
  video: {
    // 仅保留网关在售主流视频模型：字节即梦 2.5/2.0 与 MiniMax H3（含对应任务版）
    allowedModelIds: ['seedance-2-5', 'seedance-2-0', 'minimax-h3'],
    defaultModelId: 'seedance-2-5',
    modeSelection: 'model',
  },
  audio: {
    // 仅保留火山官方直连配音主力模型
    allowedModelIds: ['seed-audio-1.0'],
    defaultModelId: 'seed-audio-1.0',
    modeSelection: 'model',
  },
};

export function isCanvasModelAllowed(kind: MaterialType, modelId: string): boolean {
  return CANVAS_GENERATION_POLICY[kind].allowedModelIds.includes(modelId);
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

/** Project both catalog representations so no picker, planner or agent can bypass curation. */
export function projectCanvasCatalog(catalog: CapabilityCatalog): CapabilityCatalog {
  const policy = CANVAS_GENERATION_POLICY;
  const kinds = Object.keys(policy) as MaterialType[];
  const lists = {} as Record<MaterialType, CapabilityModelItem[]>;
  const defaults: NonNullable<CapabilityCatalog['defaults']> = {};
  for (const kind of kinds) {
    const rows = catalog[kind] ?? [];
    lists[kind] = policy[kind].allowedModelIds.flatMap((id) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) return [];
      // Every candidate must prove a real listed output in the authoritative catalog.
      if (!catalog.models?.some((model) => model.id === id
        && model.operations?.some((op) => op.listed === true && op.output?.type === kind))) return [];
      return [row];
    });
    defaults[kind] = lists[kind].some((row) => row.id === policy[kind].defaultModelId)
      ? policy[kind].defaultModelId
      : lists[kind][0]?.id ?? '';
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
  return {
    ...catalog,
    ...lists,
    ...(models ? { models } : {}),
    defaults,
    defaultsByOperation,
    generationPolicy: policy,
    fingerprint: catalog.fingerprint
      ? `${catalog.fingerprint}:canvas:${JSON.stringify(policy)}`
      : undefined,
  };
}
