/**
 * ImageParamAdapter — 图像参数读侧适配器（2026-09-07 全模态收敛 / T04）。
 *
 * 职责：只读清洗与摘要格式化。
 * - 非法 aspectRatio / resolution 展示回退到 schema default；
 * - 绝不在 resolve 时回写 nodeData.params（避免无用户动作改提交载荷）；
 * - 绝不调用 buildVideoParamTransition / pending 调整（视频专属，冻结）；
 * - operation 语义委托共享内核 buildEffectiveOpsUiState（outputType: 'image'）。
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
  EffectiveImageParams,
  ImageNodeParams,
  ImageSummaryFormatResult,
} from './types.ts';

export const DEFAULT_IMAGE_ASPECT_RATIO = '16:9';

/** 图像浮层允许写入的 key。禁止 generationMode 与未知 key。 */
export type ImageParamWriteKey =
  | 'operation'
  | 'aspectRatio'
  | 'resolution'
  | 'quality'
  | 'seed';

/** 运行期断言：禁止 generationMode 与未知 key 进入写入路径。 */
export function assertImageParamWriteKey(key: string): asserts key is ImageParamWriteKey {
  const allowed: readonly string[] = ['operation', 'aspectRatio', 'resolution', 'quality', 'seed'];
  if (key === 'generationMode') {
    throw new Error('UI must not write params.generationMode');
  }
  if (!allowed.includes(key)) {
    throw new Error(`UI must not write params.${key}`);
  }
}

export interface ResolveEffectiveImageParamsArgs {
  params: ImageNodeParams | undefined;
  schema: ModelParameterSchema | undefined;
  modelItem: CapabilityModelItem | undefined;
  catalog?: CapabilityCatalog | null;
  upstreams?: UpstreamMediaSnapshot[];
  prompt?: string;
}

function buildOpsState(args: ResolveEffectiveImageParamsArgs): EffectiveOpsUiState {
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
    outputType: 'image',
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
 * 解析节点上保存的图像参数。非法值只做展示回退（schema default），
 * 不在 mount 时回写 nodeData.params。
 */
export function resolveEffectiveImageParams(
  args: ResolveEffectiveImageParamsArgs,
): EffectiveImageParams {
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

  const ratioOptions = schema.aspectRatio?.options ?? [];
  const aspectRatio = resolveOptionValue(
    params?.aspectRatio,
    ratioOptions,
    schema.aspectRatio?.defaultValue ?? DEFAULT_IMAGE_ASPECT_RATIO,
  ) ?? DEFAULT_IMAGE_ASPECT_RATIO;

  // 无 resolution.options → undefined：摘要与浮层都不渲染清晰度槽
  const resolutionOptions = schema.resolution?.options ?? [];
  const resolution = resolutionOptions.length > 0
    ? resolveOptionValue(params?.resolution, resolutionOptions, schema.resolution?.defaultValue)
    : undefined;

  // quality 仅当没有 resolution.options 时占据清晰度槽（避免 1K 与 quality 双排重复）
  const qualityOptions = schema.quality?.options ?? [];
  const quality = resolution === undefined && qualityOptions.length > 0
    ? resolveOptionValue(params?.quality, qualityOptions, schema.quality?.defaultValue)
    : undefined;

  const result: EffectiveImageParams = {
    model,
    operation,
    operationLabel: operationOption?.label ?? operation,
    effectiveOperations: opsState.effectiveOps,
    showModeUi: shouldRenderModeUi(opsState),
    schema,
    aspectRatio,
  };
  if (resolution !== undefined) result.resolution = resolution;
  if (quality !== undefined) result.quality = quality;
  if (typeof params?.seed === 'number') result.seed = params.seed;
  return result;
}

/**
 * 将生效的 EffectiveImageParams 转换为摘要触发条展示用的结构化摘要。
 * fullText 为空格拼接（禁止中点 `·`）。
 */
export function formatImageSummary(params: EffectiveImageParams): ImageSummaryFormatResult {
  const modeText = params.showModeUi
    ? (params.operationLabel.trim() || params.operation.trim())
    : '';
  const ratioText = params.aspectRatio === 'auto'
    ? '自适应'
    : (params.aspectRatio.trim() || DEFAULT_IMAGE_ASPECT_RATIO);
  const resolutionText = params.resolution ? params.resolution.trim().toUpperCase() : null;

  const segments: string[] = [];
  if (modeText) segments.push(modeText);
  if (ratioText) segments.push(ratioText);
  if (resolutionText) segments.push(resolutionText);

  return {
    modeText,
    ratioText,
    resolutionText,
    fullText: segments.join(' '),
  };
}
