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
let pendingWrites = 0;
let persistedPreferences: GenerationPreferences = {};

export async function loadGenerationPreferences(): Promise<void> {
  const version = writeVersion;
  const result = await fetchGenerationPreferences();
  if (!result.ok) throw new Error(result.body.message ?? '模型偏好读取失败，请重试');
  const value = parseGenerationPreferences(result.body);
  // An old boot response must not replace a newer successful manual selection.
  if (version === writeVersion && pendingWrites === 0) {
    persistedPreferences = value.lastModelByType;
    useGenerationPreferencesStore.setState(value);
  }
}

export async function rememberGenerationModel(kind: GenerationKind, modelId: string): Promise<void> {
  const version = ++writeVersion;
  pendingWrites += 1;
  // A node created immediately after a manual choice uses it even while the save is pending.
  useGenerationPreferencesStore.setState((state) => ({
    lastModelByType: { ...state.lastModelByType, [kind]: modelId },
  }));
  const save = async () => {
    try {
      const result = await saveGenerationPreference(kind, modelId);
      if (!result.ok) throw new Error(result.body.message ?? '模型偏好保存失败，请重试');
      const value = parseGenerationPreferences(result.body);
      persistedPreferences = value.lastModelByType;
      if (version === writeVersion) useGenerationPreferencesStore.setState(value);
    } catch (error) {
      if (version === writeVersion) {
        useGenerationPreferencesStore.setState({ lastModelByType: persistedPreferences });
      }
      throw error;
    } finally {
      pendingWrites -= 1;
      // Invalidate reads started while this write was pending.
      if (version === writeVersion) writeVersion += 1;
    }
  };
  // Preserve click order, but a failed save does not prevent the next explicit choice.
  const result = writeQueue.then(save, save);
  writeQueue = result;
  return result;
}
