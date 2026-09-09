/**
 * Canvas catalog model ids that Hub still accepts as aliases of a live picker row.
 * Keep in sync with hub `MEDIA_WIRE_MODEL_IDS` direction (aliases → live id).
 */
export const CANONICAL_CATALOG_MODEL_IDS: Readonly<Record<string, string>> = Object.freeze({
  'grok-imagine-video': 'grok-imagine-video-1-5',
  'grok-imagine-video.1.5': 'grok-imagine-video-1-5',
  'grok-imagine-video-1.5': 'grok-imagine-video-1-5',
  'minimax/h3-max': 'minimax-h3-max',
  'h3-max': 'minimax-h3-max',
  'minimax/h3-max-turbo': 'minimax-h3-max-turbo',
  'h3-max-turbo': 'minimax-h3-max-turbo',
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
