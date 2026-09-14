/**
 * Canvas catalog model ids that Hub still accepts as aliases of a live picker row.
 * Keep in sync with hub `MEDIA_WIRE_MODEL_IDS` direction (aliases → live id).
 */
export const CANONICAL_CATALOG_MODEL_IDS: Readonly<Record<string, string>> = Object.freeze({
  'grok-imagine-video': 'grok-imagine-video-1-5',
  'grok-imagine-video.1.5': 'grok-imagine-video-1-5',
  'grok-imagine-video-1.5': 'grok-imagine-video-1-5',
  // 2026-09-14 #1751：上游 c8d134c4f 把这些 h3-max 线路名收敛为 minimax-h3 的 model_mapping 目标，
  // 上游仍接受它们并路由到 h3 家族，故已保存画布里的这些名字归一到仍在册的 minimax-h3，
  // 而不是掉进 unknown_model。注意：已下架的产品 id `minimax-h3-max` / `minimax-h3-max-turbo`
  // **不在**此表内，它们必须走 orphan 路径（模型已 unavailable）。
  'minimax/h3-max': 'minimax-h3',
  'h3-max': 'minimax-h3',
  'minimax/h3-max-turbo': 'minimax-h3',
  'h3-max-turbo': 'minimax-h3',
});

/**
 * Map a saved canvas / catalog model id onto the live picker id.
 * Unknown ids pass through unchanged.
 */
export function canonicalizeCatalogModelId(modelId: unknown): string {
  const id = typeof modelId === 'string' ? modelId.trim() : '';
  if (!id) return '';
  return CANONICAL_CATALOG_MODEL_IDS[id] || id;
}

export interface SavedPickerModel {
  modelId: string;
  insertOrphan: boolean;
}

/**
 * Decide the picker value and whether a deprecated orphan row is needed.
 * If the canonical id is already in catalog rows, do not insert an orphan.
 */
export function resolveSavedModelForPicker(
  savedModel: unknown,
  catalogIds: Iterable<string> | ReadonlySet<string>,
): SavedPickerModel {
  const modelId = canonicalizeCatalogModelId(savedModel);
  if (!modelId) return { modelId: '', insertOrphan: false };
  const ids = catalogIds instanceof Set ? catalogIds : new Set(catalogIds);
  return { modelId, insertOrphan: !ids.has(modelId) };
}
