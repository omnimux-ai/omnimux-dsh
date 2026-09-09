/**
 * useModelParameterSchema — 动态模型参数 Schema 与多级缓存钩子。
 *
 * 1. 从 CapabilityCatalog 中提取指定模型的 parameterSchema；
 * 2. 具备 SWR / 本地持久化缓存与安全回退缺省值，无网络延迟；
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

/** 针对未包含在 Catalog 中的未知模型提供的安全通用兜底 Schema */
const DEFAULT_FALLBACK_SCHEMA: Record<MaterialType, ModelParameterSchema> = {
  image: {
    aspectRatio: {
      options: [
        { value: 'auto', label: '自适应' },
        { value: '1:1', label: '1:1' },
        { value: '4:3', label: '4:3' },
        { value: '3:4', label: '3:4' },
        { value: '16:9', label: '16:9' },
        { value: '9:16', label: '9:16' },
        { value: '21:9', label: '21:9' },
      ],
      defaultValue: '16:9',
    },
    resolution: {
      options: [{ value: '2K', label: '2K' }, { value: '1K', label: '1K' }],
      defaultValue: '2K',
    },
  },
  video: {
    aspectRatio: {
      options: [
        { value: '16:9', label: '16:9' },
        { value: '9:16', label: '9:16' },
        { value: '1:1', label: '1:1' },
      ],
      defaultValue: '16:9',
    },
    duration: {
      options: [
        { value: 5, label: '5s' },
        { value: 10, label: '10s' },
      ],
      defaultValue: 5,
      unit: 's',
    },
    resolution: {
      options: [{ value: '1080P', label: '1080P' }],
      defaultValue: '1080P',
    },
  },
  audio: {
    duration: {
      options: [
        { value: 30, label: '30s' },
        { value: 60, label: '60s' },
        { value: 120, label: '120s' },
      ],
      defaultValue: 60,
      unit: 's',
    },
    voice: {
      options: [
        { value: 'alloy', label: 'Alloy' },
        { value: 'echo', label: 'Echo' },
        { value: 'fable', label: 'Fable' },
        { value: 'onyx', label: 'Onyx' },
        { value: 'nova', label: 'Nova' },
        { value: 'shimmer', label: 'Shimmer' },
      ],
      defaultValue: 'alloy',
    },
  },
  text: {},
};

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
    const modelList: CapabilityModelItem[] = activeCatalog && (activeCatalog as Record<string, any>)[materialType]
      ? (activeCatalog as Record<string, any>)[materialType]
      : [];
    const modelItem = modelList.find((m: CapabilityModelItem) => m.id === modelId) ?? modelList[0];

    const fallback = DEFAULT_FALLBACK_SCHEMA[materialType] ?? {};
    const schema: ModelParameterSchema = modelItem?.parameters ?? fallback;

    // 画幅
    const aspectRatioOptions =
      schema.aspectRatio?.options && schema.aspectRatio.options.length > 0
        ? schema.aspectRatio.options
        : (fallback.aspectRatio?.options ?? [{ value: '16:9', label: '16:9' }]);
    const defaultAspectRatio = schema.aspectRatio?.defaultValue ?? aspectRatioOptions[0]?.value ?? '16:9';

    const isAspectRatioValid = (ratio: string | undefined) => {
      if (!ratio) return false;
      return aspectRatioOptions.some((opt) => opt.value === ratio);
    };

    // 时长
    const durationOptions = schema.duration?.options ?? fallback.duration?.options ?? [];
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
