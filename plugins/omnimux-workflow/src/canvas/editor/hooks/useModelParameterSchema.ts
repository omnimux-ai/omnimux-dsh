/**
 * useModelParameterSchema — 动态模型参数 Schema 与多级缓存钩子。
 *
 * 1. 从 CapabilityCatalog 中提取指定模型的 parameterSchema；
 * 2. 保留 SWR / 本地持久化缓存，仅展示合法选中型号的实际参数；
 * 3. 驱动 ConfigPanel 自适应画幅、时长、分辨率等动态参数胶囊。
 */

import { useMemo } from 'react';
import type { CapabilityCatalog, CapabilityModelItem, ModelParameterSchema } from '../../../shared/api';
import type { MaterialType } from '../../types/materialNode';
import { shouldReplaceCatalogCache } from './catalogCache';

export { shouldReplaceCatalogCache };
export type { ShouldReplaceCatalogCacheInput } from './catalogCache';

const CATALOG_CACHE_KEY = 'wf_capabilities_catalog_v4';
const CATALOG_TTL_MS = 60 * 60 * 1000;

interface CatalogCacheEnvelope {
  catalog: CapabilityCatalog;
  fingerprint: string;
  fetchedAt: number;
}

/** Module singleton — ConfigPanel open should not re-fetch when boot already has it. */
let memoryCatalog: CapabilityCatalog | null = null;
let memoryFingerprint = '';
let memoryFetchedAt = 0;

export interface UseModelParameterSchemaResult {
  schema: ModelParameterSchema;
  modelItem: CapabilityModelItem | undefined;
  aspectRatioOptions: Array<{ value: string; label: string }>;
  defaultAspectRatio: string;
  isAspectRatioValid: (ratio: string | undefined) => boolean;
  durationOptions: Array<{ value: number; label: string }>;
  defaultDuration: number;
  isDurationValid: (duration: number | undefined) => boolean;
  resolutionOptions: Array<{ value: string; label: string }>;
  defaultResolution: string;
  qualityOptions: Array<{ value: string; label: string }>;
  defaultQuality: string;
  hasSoundSupport: boolean;
  defaultSound: boolean;
  voiceOptions: Array<{ value: string; label: string }>;
  defaultVoice: string;
  hasInstrumentalSupport: boolean;
  defaultInstrumental: boolean;
}

function readEnvelope(): CatalogCacheEnvelope | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CatalogCacheEnvelope;
    if (!parsed || typeof parsed !== 'object' || !parsed.catalog) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hydrateFromEnvelope(): CatalogCacheEnvelope | null {
  const envelope = readEnvelope();
  if (!envelope) return null;
  memoryCatalog = envelope.catalog;
  memoryFingerprint = envelope.fingerprint || envelope.catalog.fingerprint || '';
  memoryFetchedAt = typeof envelope.fetchedAt === 'number' ? envelope.fetchedAt : 0;
  return envelope;
}

/** 获取本地缓存的 Catalog（带异常保护 + TTL 过期仍可读，供 SWR） */
export function getCachedCatalog(): CapabilityCatalog | null {
  if (memoryCatalog) return memoryCatalog;
  hydrateFromEnvelope();
  return memoryCatalog;
}

/** Memory fingerprint first, else envelope.fingerprint || catalog.fingerprint. */
export function getCachedFingerprint(): string {
  if (memoryFingerprint) return memoryFingerprint;
  hydrateFromEnvelope();
  return memoryFingerprint || '';
}

/** Whether the local cache is older than the SWR TTL (still readable). */
export function isCatalogCacheStale(now = Date.now()): boolean {
  if (!memoryCatalog && !readEnvelope()) return true;
  const fetchedAt = memoryFetchedAt || readEnvelope()?.fetchedAt || 0;
  return !fetchedAt || now - fetchedAt > CATALOG_TTL_MS;
}

/** 写入本地持久化缓存 + 内存单例 */
export function setCachedCatalog(catalog: CapabilityCatalog): void {
  memoryCatalog = catalog;
  memoryFingerprint = catalog.fingerprint || '';
  memoryFetchedAt = Date.now();
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const envelope: CatalogCacheEnvelope = {
        catalog,
        fingerprint: memoryFingerprint,
        fetchedAt: memoryFetchedAt,
      };
      window.localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(envelope));
    }
  } catch {
    // 忽略 QuotaExceededError
  }
}

/** Drop memory + localStorage catalog (settings save / catalog-updated). */
export function invalidateCachedCatalog(): void {
  memoryCatalog = null;
  memoryFingerprint = '';
  memoryFetchedAt = 0;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(CATALOG_CACHE_KEY);
    }
  } catch {
    // ignore
  }
}

export function useModelParameterSchema(
  materialType: MaterialType,
  modelId: string | undefined,
  catalog: CapabilityCatalog | null,
): UseModelParameterSchemaResult {
  return useMemo(() => {
    const activeCatalog = catalog ?? getCachedCatalog();
    const isMaterialType = materialType === 'text' || materialType === 'image'
      || materialType === 'video' || materialType === 'audio';
    const modelList = isMaterialType ? activeCatalog?.[materialType] ?? [] : [];
    const hasListedOutput = isMaterialType && Boolean(modelId) && activeCatalog?.models?.some((model) =>
      model.id === modelId && model.operations?.some((operation) =>
        operation.listed === true && operation.output?.type === materialType));
    const modelItem = hasListedOutput ? modelList.find((model) => model.id === modelId) : undefined;
    const schema: ModelParameterSchema = modelItem?.parameters ?? {};

    // 画幅
    const aspectRatioOptions = schema.aspectRatio?.options ?? [];
    const defaultAspectRatio = schema.aspectRatio?.defaultValue ?? aspectRatioOptions[0]?.value ?? '16:9';

    const isAspectRatioValid = (ratio: string | undefined) => {
      if (!ratio) return false;
      return aspectRatioOptions.some((opt) => opt.value === ratio);
    };

    // 时长
    const durationOptions = schema.duration?.options ?? [];
    const defaultDuration = schema.duration?.defaultValue ?? durationOptions[0]?.value ?? 5;

    const isDurationValid = (duration: number | undefined) => {
      if (typeof duration !== 'number') return false;
      if (schema.duration?.allowAuto && duration === -1) return true;
      if (durationOptions.some((opt) => opt.value === duration)) return true;
      const range = schema.duration?.range;
      if (!range || duration < range.min || duration > range.max) return false;
      const step = range.step ?? 1;
      return Math.abs((duration - range.min) / step - Math.round((duration - range.min) / step)) <= Number.EPSILON;
    };

    // 分辨率
    const resolutionOptions = schema.resolution?.options ?? [];
    const defaultResolution = schema.resolution?.defaultValue ?? resolutionOptions[0]?.value ?? '';

    // 质量
    const qualityOptions = schema.quality?.options ?? [];
    const defaultQuality = schema.quality?.defaultValue ?? qualityOptions[0]?.value ?? '';

    // 音效
    const hasSoundSupport = Boolean(schema.sound?.supported);
    const defaultSound = Boolean(schema.sound?.defaultValue);

    // 音色 (TTS)
    const voiceOptions = schema.voice?.options ?? [];
    const defaultVoice = schema.voice?.defaultValue ?? voiceOptions[0]?.value ?? '';

    // 纯音乐 (Suno)
    const hasInstrumentalSupport = Boolean(schema.instrumental?.supported);
    const defaultInstrumental = Boolean(schema.instrumental?.defaultValue);

    return {
      schema,
      modelItem,
      aspectRatioOptions,
      defaultAspectRatio,
      isAspectRatioValid,
      durationOptions,
      defaultDuration,
      isDurationValid,
      resolutionOptions,
      defaultResolution,
      qualityOptions,
      defaultQuality,
      hasSoundSupport,
      defaultSound,
      voiceOptions,
      defaultVoice,
      hasInstrumentalSupport,
      defaultInstrumental,
    };
  }, [materialType, modelId, catalog]);
}
