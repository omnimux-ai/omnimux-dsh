import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  parseGenerationPreferences,
  type GenerationKind,
  type GenerationPreferencesResponse,
} from '../../shared/generationPreferences.ts';

export interface GenerationPreferencesStore {
  get(): GenerationPreferencesResponse;
  set(kind: GenerationKind, modelId: string): GenerationPreferencesResponse;
}

/** Synchronous read/merge/atomic rename keeps independent kinds from overwriting each other. */
export function createGenerationPreferencesStore(filePath: string): GenerationPreferencesStore {
  function get(): GenerationPreferencesResponse {
    let contents: string;
    try {
      contents = readFileSync(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { lastModelByType: {} };
      throw new Error('无法读取模型偏好，请检查应用数据目录权限');
    }
    return parseGenerationPreferences(JSON.parse(contents));
  }
  return {
    get,
    set(kind, modelId) {
      const value = get();
      value.lastModelByType[kind] = modelId;
      const temporary = `${filePath}.${randomUUID()}.tmp`;
      try {
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        renameSync(temporary, filePath);
      } finally {
        rmSync(temporary, { force: true });
      }
      return value;
    },
  };
}
