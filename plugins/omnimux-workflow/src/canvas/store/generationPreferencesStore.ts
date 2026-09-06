import { create } from 'zustand';
import { fetchGenerationPreferences, saveGenerationPreference } from '../bridge/apiClient';
import {
  parseGenerationPreferences,
  type GenerationKind,
  type GenerationPreferences,
} from '../../shared/generationPreferences';

interface GenerationPreferencesState {
  lastModelByType: GenerationPreferences;
}

/** Profile state is independent of canvas history and workspace hydration. */
export const useGenerationPreferencesStore = create<GenerationPreferencesState>(() => ({ lastModelByType: {} }));
let writeQueue: Promise<unknown> = Promise.resolve();
let writeVersion = 0;

export async function loadGenerationPreferences(): Promise<void> {
  const version = writeVersion;
  const result = await fetchGenerationPreferences();
  if (!result.ok) throw new Error(result.body.message ?? '模型偏好读取失败，请重试');
  const value = parseGenerationPreferences(result.body);
  // An old boot response must not replace a newer successful manual selection.
  if (version === writeVersion) useGenerationPreferencesStore.setState(value);
}

export async function rememberGenerationModel(kind: GenerationKind, modelId: string): Promise<void> {
  // Preserve click order when multiple model choices are made before a response arrives.
  const save = async () => {
    writeVersion += 1;
    const result = await saveGenerationPreference(kind, modelId);
    if (!result.ok) throw new Error(result.body.message ?? '模型偏好保存失败，请重试');
    const value = parseGenerationPreferences(result.body);
    writeVersion += 1;
    useGenerationPreferencesStore.setState(value);
  };
  const result = writeQueue.then(save, save);
  writeQueue = result;
  return result;
}
