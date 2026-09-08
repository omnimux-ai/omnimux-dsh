/**
 * AudioParamAdapter — 音频参数读侧适配器（2026-09-07 全模态收敛 / T05；Issue #763 精简）。
 *
 * 职责：只读清洗（schema-driven，废除现网抽屉的 1–60 硬编码滑块）。
 * - 时长：allowAuto && -1 合法；options 命中或 range+step 命中保留；
 *   否则展示回退 schema.duration.defaultValue（兜底 60）；字符串 '8s' 可 parse 后校验；
 * - voice / instrumental / outputFormat 显隐只看 schema，不把 operation id 当开关真源；
 * - 绝不在 resolve 时回写 nodeData.params；
 * - operation 语义委托共享内核 buildEffectiveOpsUiState（outputType: 'audio'）。
 *
 * Issue #763：朗读时长由文本长度决定，底栏时长摘要条与参数浮层已移除，
 * 摘要格式化与浮层写路径白名单随之下线；
 * 本适配器继续为底栏 VoiceTrigger / VoicePickerDialog 提供音色读侧真源。
 */

import type {
  CapabilityCatalog,
  CapabilityModelItem,
  ModelParameterSchema,
} from '../../../../../../shared/api.ts';
import {
  buildEffectiveOpsUiState,
  buildUiUpstreamFingerprint,
  readPreferredOperationId,
  shouldRenderModeUi,
  type EffectiveOpsUiState,
  type UpstreamMediaSnapshot,
} from '../../../../../../shared/validation/operationUi.ts';
import type {
  AudioNodeParams,
  EffectiveAudioParams,
} from './types.ts';

export const DEFAULT_AUDIO_DURATION = 60;

/** T03：朗读正文长度上限（Unicode code point 计，与 schema.prompt 约定同单位） */
export const AUDIO_PROMPT_MAX_CHARS = 10000;

/**
 * T03：朗读正文字数闸门。Array.from 按 Unicode code point 准确统计；
 * exceeded 时宿主禁用 GenerateButton 并提示「朗读正文不能超过 10000 字符」。
 */
export function resolveAudioPromptGate(prompt: string | undefined | null): {
  count: number;
  max: number;
  exceeded: boolean;
} {
  const count = Array.from(prompt ?? '').length;
  return { count, max: AUDIO_PROMPT_MAX_CHARS, exceeded: count > AUDIO_PROMPT_MAX_CHARS };
}

export interface ResolveEffectiveAudioParamsArgs {
  params: AudioNodeParams | undefined;
  schema: ModelParameterSchema | undefined;
  modelItem: CapabilityModelItem | undefined;
  catalog?: CapabilityCatalog | null;
  upstreams?: UpstreamMediaSnapshot[];
  prompt?: string;
}

/** 时长合法性：allowAuto -1 / options 命中 / range+step 命中（无 1–60 硬编码上限） */
export function durationIsValid(
  value: unknown,
  schema: ModelParameterSchema['duration'],
): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !schema) return false;
  if (schema.allowAuto && value === -1) return true;
  if (schema.options?.some((option) => Object.is(option.value, value))) return true;
  const range = schema.range;
  if (!range || value < range.min || value > range.max) return false;
  const step = range.step ?? 1;
  return Math.abs((value - range.min) / step - Math.round((value - range.min) / step)) <= Number.EPSILON;
}

/** 解析时长原始值：数字直用；'8s' / '30' 字符串 parse 后校验 */
function parseDurationRaw(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/s$/i, '');
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function buildOpsState(args: ResolveEffectiveAudioParamsArgs): EffectiveOpsUiState {
  const model = args.modelItem?.id
    ?? (typeof args.params?.model === 'string' ? args.params.model : '');
  const preferred = readPreferredOperationId((args.params ?? {}) as Record<string, unknown>);
  return buildEffectiveOpsUiState({
    catalog: args.catalog ?? null,
    modelId: model,
    fingerprint: buildUiUpstreamFingerprint({
      prompt: args.prompt,
      upstreams: args.upstreams,
    }),
    ...(preferred ? { preferredOperationId: preferred } : {}),
    outputType: 'audio',
  });
}

function resolveOptionValue(
  raw: unknown,
  options: ReadonlyArray<{ value: string }>,
  fallback: string | undefined,
): string | undefined {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value && options.some((option) => option.value === value)) {
    return value;
  }
  return fallback ?? options[0]?.value;
}

/**
 * 解析节点上保存的音频参数。非法值只做展示回退（schema default），
 * 不在 mount 时回写 nodeData.params。
 */
export function resolveEffectiveAudioParams(
  args: ResolveEffectiveAudioParamsArgs,
): EffectiveAudioParams {
  const params = args.params;
  const model = args.modelItem?.id
    ?? (typeof params?.model === 'string' ? params.model : '');
  const opsState = buildOpsState(args);
  const preferredOperation = readPreferredOperationId((params ?? {}) as Record<string, unknown>);
  const selectedId = opsState.selectedOperationId ?? opsState.implicitOperationId;
  const operationOption = preferredOperation
    ? opsState.effectiveOps.find((option) => option.id === preferredOperation)
    : opsState.effectiveOps.find((option) => option.id === selectedId);
  const operation = preferredOperation ?? operationOption?.id ?? '';
  const schema = args.schema ?? {};

  const durationFallback = schema.duration?.defaultValue ?? DEFAULT_AUDIO_DURATION;
  const parsedDuration = parseDurationRaw(params?.duration);
  const duration = durationIsValid(parsedDuration, schema.duration)
    ? (parsedDuration as number)
    : durationFallback;

  const voiceOptions = schema.voice?.options ?? [];
  const hasVoiceOptions = voiceOptions.length > 0;
  const voice = hasVoiceOptions
    ? resolveOptionValue(params?.voice, voiceOptions, schema.voice?.defaultValue)
    : undefined;

  const hasInstrumentalSupport = Boolean(schema.instrumental?.supported);
  const instrumental = typeof params?.instrumental === 'boolean'
    ? params.instrumental
    : (schema.instrumental?.defaultValue ?? false);

  const formatOptions = schema.outputFormat?.options ?? [];
  const outputFormat = formatOptions.length > 0
    ? resolveOptionValue(params?.outputFormat, formatOptions, schema.outputFormat?.defaultValue)
    : undefined;

  const result: EffectiveAudioParams = {
    model,
    operation,
    operationLabel: operationOption?.label ?? operation,
    effectiveOperations: opsState.effectiveOps,
    showModeUi: shouldRenderModeUi(opsState),
    schema,
    duration,
    hasVoiceOptions,
    instrumental,
    hasInstrumentalSupport,
  };
  if (voice !== undefined) result.voice = voice;
  if (outputFormat !== undefined) result.outputFormat = outputFormat;
  if (typeof params?.seed === 'number') result.seed = params.seed;
  return result;
}
