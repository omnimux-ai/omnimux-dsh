/** Last explicit model choice, shared by every project in one application profile. */
export const GENERATION_KINDS = ['text', 'image', 'video', 'audio'] as const;
export type GenerationKind = typeof GENERATION_KINDS[number];
export type GenerationPreferences = Partial<Record<GenerationKind, string>>;
export interface GenerationPreferencesResponse {
  lastModelByType: GenerationPreferences;
}

export function isGenerationKind(value: unknown): value is GenerationKind {
  return typeof value === 'string' && GENERATION_KINDS.some((kind) => kind === value);
}

export function parseGenerationPreferences(value: unknown): GenerationPreferencesResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('模型偏好格式无效');
  }
  const preferences = (value as Record<string, unknown>).lastModelByType;
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    throw new Error('模型偏好格式无效');
  }
  const parsed: GenerationPreferences = {};
  for (const [kind, modelId] of Object.entries(preferences)) {
    if (!isGenerationKind(kind) || typeof modelId !== 'string' || !modelId.trim()) {
      throw new Error('模型偏好格式无效');
    }
    parsed[kind] = modelId;
  }
  return { lastModelByType: parsed };
}
