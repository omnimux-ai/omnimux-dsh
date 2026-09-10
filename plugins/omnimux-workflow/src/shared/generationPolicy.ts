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
    allowedModelIds: ['claude-opus-4-6', 'gemini-3.8-flash', 'deepseek-v4-flash-vision-exp', 'gpt-5.5'],
    defaultModelId: 'gemini-3.8-flash',
    modeSelection: 'automatic',
  },
  image: {
    allowedModelIds: ['gpt-image-2', 'grok-imagine-image-2', 'gpt-image-2.5'],
    defaultModelId: 'gpt-image-2',
    modeSelection: 'model',
  },
  video: {
    allowedModelIds: ['seedance-2-0', 'seedance-2-0-fast', 'seedance-2-0-mini', 'seedance-2-5', 'wan-3.0', 'minimax-h3', 'grok-imagine-video-1-5', 'minimax-h3-max', 'minimax-h3-max-turbo'],
    defaultModelId: 'seedance-2-0-fast',
    modeSelection: 'model',
  },
  audio: {
    allowedModelIds: ['seed-audio-1.0', 'suno', 'gpt-4o-mini-tts'],
    defaultModelId: 'seed-audio-1.0',
    modeSelection: 'model',
  },
};

export function isCanvasModelAllowed(kind: MaterialType, modelId: string): boolean {
  return CANVAS_GENERATION_POLICY[kind].allowedModelIds.includes(modelId);
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
      // Legacy catalogs have no operation rows. Current catalogs must prove a listed output.
      if (catalog.models && !catalog.models.some((model) => model.id === id
        && model.operations?.some((op) => op.listed === true && op.output?.type === kind))) return [];
      return [row];
    });
    defaults[kind] = lists[kind].some((row) => row.id === policy[kind].defaultModelId)
      ? policy[kind].defaultModelId
      : lists[kind][0]?.id ?? '';
  }
  const models = catalog.models?.flatMap((model): CatalogModelDto[] => {
    const outputs = kinds.filter((kind) => lists[kind].some((row) => row.id === model.id));
    if (!outputs.length) return [];
    const operations = (model.operations ?? []).filter((op) => op.listed === true
      && outputs.includes(op.output?.type as MaterialType));
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
