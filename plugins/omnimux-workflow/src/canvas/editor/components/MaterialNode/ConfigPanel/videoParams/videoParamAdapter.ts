/**
 * Contract-driven video parameter resolution and transition validation.
 *
 * Model declarations provide the base schema. The selected operation may
 * replace individual fields (for example Seedance edit requires adaptive / -1).
 * Model or operation switches report every adjustment or dormant value.
 */

import type {
  CapabilityCatalog,
  CapabilityModelItem,
  ModelParameterSchema,
} from '../../../../../../shared/api.ts';
import {
  buildEffectiveOpsUiState,
  buildUiUpstreamFingerprint,
  setParamsOperation,
  readPreferredOperationId,
  shouldRenderModeUi,
  type EffectiveOpsUiState,
  type OperationUiOption,
  type UpstreamMediaSnapshot,
} from '../../../../../../shared/validation/operationUi.ts';
import { findDeclaredParameterFailure } from '../../../../../../shared/validation/declaredParameterValidation.ts';
import { resolveGenerationPrompt } from '../../../../../../shared/graph/generationPrompt.ts';
import type { EffectiveVideoParams, VideoNodeParams } from './types.ts';

export const DEFAULT_ASPECT_RATIO = '16:9';
export const DEFAULT_DURATION = 5;

const BOOLEAN_FIELDS = [
  ['sound', '声音'],
  ['watermark', '水印'],
  ['returnLastFrame', '返回尾帧'],
  ['webSearch', '联网搜索'],
  ['nsfwCheck', '内容审核'],
] as const;

const ENUM_FIELDS = [
  ['outputFormat', '输出格式'],
  ['referenceTaskType', '参考任务类型'],
  ['generationType', '生成类型'],
] as const;

export interface ResolveEffectiveVideoParamsArgs {
  params: VideoNodeParams | undefined;
  schema: ModelParameterSchema | undefined;
  modelItem: CapabilityModelItem | undefined;
  catalog?: CapabilityCatalog | null;
  upstreams?: UpstreamMediaSnapshot[];
  prompt?: string;
}

export interface PendingVideoParamAdjustment {
  /** Complete parameter set to write only after the user accepts the suggestion. */
  suggestedParams: Record<string, unknown>;
  /** Values observed when each suggestion was created; protects later edits. */
  originalParams: Record<string, unknown>;
  /** Human-readable list of the fields that would change. */
  notices: string[];
}

export interface VideoParamTransition {
  /** User-selected model/operation plus safe initialization of previously unset values. */
  params: Record<string, unknown>;
  /** The changes held for explicit confirmation, if any. */
  pending?: PendingVideoParamAdjustment;
  notices: string[];
}

const PENDING_ADJUSTMENT_KEY = 'pendingVideoParamAdjustment';

/** Operation fields replace the corresponding model-level declaration. */
export function mergeVideoParameterSchema(
  base: ModelParameterSchema | undefined,
  override: Record<string, unknown> | undefined,
): ModelParameterSchema {
  return {
    ...(base ?? {}),
    ...((override ?? {}) as ModelParameterSchema),
  };
}

function selectedOperation(state: EffectiveOpsUiState): OperationUiOption | undefined {
  const id = state.selectedOperationId ?? state.implicitOperationId;
  return id ? state.effectiveOps.find((operation) => operation.id === id) : undefined;
}

function optionValue<T extends string | number>(
  value: unknown,
  options: Array<{ value: T }>,
  fallback: T,
  caseInsensitive = false,
): T {
  const exact = options.find((option) => Object.is(option.value, value));
  if (exact) return exact.value;
  if (caseInsensitive && typeof value === 'string') {
    const folded = value.toLowerCase();
    const match = options.find(
      (option) => typeof option.value === 'string' && option.value.toLowerCase() === folded,
    );
    if (match) return match.value;
  }
  return fallback;
}

function durationIsValid(value: unknown, schema: ModelParameterSchema['duration']): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !schema) return false;
  if (schema.allowAuto && value === -1) return true;
  if (schema.options?.some((option) => Object.is(option.value, value))) return true;
  const range = schema.range;
  if (!range || value < range.min || value > range.max) return false;
  const step = range.step ?? 1;
  return Math.abs((value - range.min) / step - Math.round((value - range.min) / step)) <= Number.EPSILON;
}

function integerIsValid(value: unknown, schema: ModelParameterSchema['seed']): value is number {
  if (!schema || !Number.isInteger(value)) return false;
  if (!schema.range) return true;
  const numeric = value as number;
  if (numeric < schema.range.min || numeric > schema.range.max) return false;
  const step = schema.range.step ?? 1;
  return Math.abs((numeric - schema.range.min) / step - Math.round((numeric - schema.range.min) / step)) <= Number.EPSILON;
}

function buildOpsState(args: ResolveEffectiveVideoParamsArgs): EffectiveOpsUiState {
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
    outputType: 'video',
  });
}

/**
 * Resolve the values saved on the node. It defaults only fields that were
 * never set; an unsupported saved value remains visible until the user either
 * accepts an adjustment or explicitly keeps it.
 */
export function resolveEffectiveVideoParams(
  args: ResolveEffectiveVideoParamsArgs,
): EffectiveVideoParams {
  const params = args.params;
  const model = args.modelItem?.id
    ?? (typeof params?.model === 'string' ? params.model : '');
  const opsState = buildOpsState(args);
  const preferredOperation = readPreferredOperationId((params ?? {}) as Record<string, unknown>);
  const operationOption = preferredOperation
    ? opsState.effectiveOps.find((option) => option.id === preferredOperation)
    : selectedOperation(opsState);
  const operation = preferredOperation ?? operationOption?.id ?? '';
  const schema = mergeVideoParameterSchema(args.schema, operationOption?.parameters);

  const ratioOptions = schema.aspectRatio?.options ?? [];
  const aspectRatio = typeof params?.aspectRatio === 'string' && params.aspectRatio.trim()
    ? params.aspectRatio
    : schema.aspectRatio?.defaultValue ?? ratioOptions[0]?.value ?? DEFAULT_ASPECT_RATIO;

  const resolutionOptions = schema.resolution?.options ?? [];
  const resolution = typeof params?.resolution === 'string' && params.resolution.trim()
    ? params.resolution
    : (schema.resolution?.defaultValue ?? resolutionOptions[0]?.value);

  const duration = params?.duration !== undefined
    ? params.duration
    : schema.duration?.defaultValue ?? DEFAULT_DURATION;

  const sound = typeof params?.sound === 'boolean'
    ? params.sound
    : (schema.sound?.supported ? schema.sound.defaultValue : false);

  const result: EffectiveVideoParams = {
    model,
    operation,
    operationLabel: operationOption?.label ?? operation,
    effectiveOperations: opsState.effectiveOps,
    showModeUi: shouldRenderModeUi(opsState),
    schema,
    aspectRatio,
    duration,
    sound,
    hasSoundSupport: Boolean(schema.sound?.supported),
  };

  if (resolution !== undefined) result.resolution = resolution;
  if (typeof params?.seed === 'number') result.seed = params.seed;
  for (const [field] of BOOLEAN_FIELDS) {
    if (field === 'sound') continue;
    const definition = schema[field];
    if (definition?.supported) {
      result[field] = typeof params?.[field] === 'boolean'
        ? params[field] as boolean
        : definition.defaultValue;
    }
  }
  for (const [field] of ENUM_FIELDS) {
    const definition = schema[field];
    if (definition?.options?.length) {
      const value = params?.[field];
      result[field] = typeof value === 'string' && value.trim()
        ? value
        : definition.defaultValue ?? definition.options[0]!.value;
    }
  }
  if (typeof params?.fileUrl === 'string') result.fileUrl = params.fileUrl;
  if (typeof params?.linkUrl === 'string') result.linkUrl = params.linkUrl;
  if (typeof params?.firstFrameUrl === 'string') result.firstFrameUrl = params.firstFrameUrl;
  if (typeof params?.lastFrameUrl === 'string') result.lastFrameUrl = params.lastFrameUrl;
  return result;
}

function pushUnique(items: string[], value: string): void {
  if (!items.includes(value)) items.push(value);
}

function withoutPendingAdjustment(params: Record<string, unknown>): Record<string, unknown> {
  const { [PENDING_ADJUSTMENT_KEY]: _pending, ...rest } = params;
  return rest;
}

/** Returns a persisted pending adjustment only when its shape is usable. */
export function readPendingVideoParamAdjustment(
  params: Record<string, unknown> | undefined,
): PendingVideoParamAdjustment | undefined {
  const value = params?.[PENDING_ADJUSTMENT_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (!candidate.suggestedParams || typeof candidate.suggestedParams !== 'object' || Array.isArray(candidate.suggestedParams)) {
    return undefined;
  }
  const notices = Array.isArray(candidate.notices)
    ? candidate.notices.filter((notice): notice is string => typeof notice === 'string' && notice.length > 0)
    : [];
  const originalParams = candidate.originalParams && typeof candidate.originalParams === 'object' && !Array.isArray(candidate.originalParams)
    ? candidate.originalParams as Record<string, unknown>
    : {};
  return { suggestedParams: candidate.suggestedParams as Record<string, unknown>, originalParams, notices };
}

export function applyPendingVideoParamAdjustment(params: Record<string, unknown>): Record<string, unknown> {
  const pending = readPendingVideoParamAdjustment(params);
  const current = withoutPendingAdjustment(params);
  if (!pending) return current;
  const next = { ...current };
  for (const [field, value] of Object.entries(pending.suggestedParams)) {
    if (!(field in pending.originalParams) || Object.is(current[field], pending.originalParams[field])) {
      next[field] = value;
    }
  }
  return next;
}

export function keepCurrentVideoParamValues(params: Record<string, unknown>): Record<string, unknown> {
  return withoutPendingAdjustment(params);
}

/**
 * Builds an explicit confirmation plan. Existing values are never overwritten
 * or removed during a model/operation switch. Only fields that were unset may
 * be initialized immediately; incompatible saved values are stored as a
 * persisted suggestion and block execution until the user decides.
 */
export function buildVideoParamTransition(
  oldParams: Record<string, unknown>,
  targetModelItem: CapabilityModelItem | undefined,
  opts: {
    catalog?: CapabilityCatalog | null;
    upstreams?: UpstreamMediaSnapshot[];
    prompt?: string;
    nextOperationId?: string;
  } = {},
): VideoParamTransition {
  let nextParams: Record<string, unknown> = {
    ...withoutPendingAdjustment(oldParams),
    model: targetModelItem?.id ?? oldParams.model,
  };
  const requestedOperation = opts.nextOperationId ?? readPreferredOperationId(nextParams);
  // A model switch must not migrate or delete an existing legacy operation.
  // Only an explicit mode choice writes canonical params.operation.
  if (opts.nextOperationId !== undefined) {
    nextParams = setParamsOperation(nextParams, opts.nextOperationId);
  }
  const suggestedParams: Record<string, unknown> = {};
  const originalParams: Record<string, unknown> = {};
  const notices: string[] = [];

  let operationOption: OperationUiOption | undefined;
  if (opts.catalog && targetModelItem?.id) {
    const opsState = buildEffectiveOpsUiState({
      catalog: opts.catalog,
      modelId: targetModelItem.id,
      fingerprint: buildUiUpstreamFingerprint({ prompt: opts.prompt, upstreams: opts.upstreams }),
      ...(requestedOperation ? { preferredOperationId: requestedOperation } : {}),
      outputType: 'video',
    });
    operationOption = requestedOperation
      ? opsState.effectiveOps.find((option) => option.id === requestedOperation)
      : selectedOperation(opsState);
    // A model-only switch retains the raw operation. When there is exactly one
    // compatible replacement, stage it behind the same explicit confirmation
    // gate as parameter changes instead of silently rewriting the contract.
    if (requestedOperation && !operationOption && opsState.effectiveOps.length === 1) {
      const replacement = opsState.effectiveOps[0]!.id;
      suggestedParams.operation = replacement;
      originalParams.operation = nextParams.operation;
      pushUnique(notices, `生成方式将从 ${requestedOperation} 调整为 ${replacement}`);
    }
  }

  const schema = mergeVideoParameterSchema(targetModelItem?.parameters, operationOption?.parameters);
  const suggestAdjustment = (field: string, value: unknown, label: string): void => {
    if (nextParams[field] === undefined) {
      nextParams[field] = value;
      return;
    }
    if (!Object.is(nextParams[field], value)) {
      suggestedParams[field] = value;
      originalParams[field] = nextParams[field];
      pushUnique(notices, `${label}将从 ${String(nextParams[field])} 调整为 ${String(value)}`);
    }
  };

  const ratioOptions = schema.aspectRatio?.options ?? [];
  if (ratioOptions.length > 0 && !ratioOptions.some((option) => Object.is(option.value, nextParams.aspectRatio))) {
    suggestAdjustment('aspectRatio', schema.aspectRatio?.defaultValue ?? ratioOptions[0]?.value ?? DEFAULT_ASPECT_RATIO, '比例');
  }
  if (schema.duration && !durationIsValid(nextParams.duration, schema.duration)) {
    suggestAdjustment('duration', schema.duration.defaultValue ?? DEFAULT_DURATION, '时长');
  }
  const resolutionOptions = schema.resolution?.options ?? [];
  if (resolutionOptions.length > 0 && nextParams.resolution !== undefined) {
    const canonicalResolution = optionValue(
      nextParams.resolution,
      resolutionOptions,
      schema.resolution?.defaultValue ?? resolutionOptions[0]!.value,
      schema.resolution?.caseInsensitive === true,
    );
    suggestAdjustment('resolution', canonicalResolution, '清晰度');
  } else if (resolutionOptions.length > 0 && nextParams.resolution === undefined) {
    suggestAdjustment('resolution', schema.resolution?.defaultValue ?? resolutionOptions[0]!.value, '清晰度');
  }

  for (const [field, label] of BOOLEAN_FIELDS) {
    const definition = schema[field];
    if (definition?.supported && typeof nextParams[field] !== 'boolean') {
      suggestAdjustment(field, definition.defaultValue, label);
    }
  }
  for (const [field, label] of ENUM_FIELDS) {
    const definition = schema[field];
    if (definition?.options?.length && !definition.options.some((option) => Object.is(option.value, nextParams[field]))) {
      suggestAdjustment(field, definition.defaultValue ?? definition.options[0]?.value, label);
    }
  }
  if (schema.seed && nextParams.seed !== undefined && !integerIsValid(nextParams.seed, schema.seed)) {
    suggestAdjustment('seed', schema.seed.range?.min ?? 0, '随机种子');
  }

  const pending = notices.length > 0 ? { suggestedParams, originalParams, notices } : undefined;
  return {
    params: pending ? { ...nextParams, [PENDING_ADJUSTMENT_KEY]: pending } : nextParams,
    ...(pending ? { pending } : {}),
    notices,
  };
}

/** Existing callers that only need the selected values retain this convenience shape. */
export function validateAndFallbackVideoParams(
  oldParams: Record<string, unknown>,
  targetModelItem: CapabilityModelItem | undefined,
  opts: Parameters<typeof buildVideoParamTransition>[2] = {},
): Record<string, unknown> {
  return buildVideoParamTransition(oldParams, targetModelItem, opts).params;
}

function urlIsHttp(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

const DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  pdf: 'application/pdf',
  txt: 'text/plain',
  key: 'application/vnd.apple.keynote',
  pages: 'application/vnd.apple.pages',
  numbers: 'application/vnd.apple.numbers',
  md: 'text/markdown',
};

function documentUrlMatchesSlot(value: string, allowedMimes: string[] | undefined): boolean {
  if (!allowedMimes?.length) return true;
  try {
    const extension = new URL(value).pathname.split('.').pop()?.toLowerCase() ?? '';
    const mime = DOCUMENT_MIME_BY_EXTENSION[extension];
    return Boolean(mime && allowedMimes.includes(mime));
  } catch {
    return false;
  }
}

/** Immediate client-side validation; the hub repeats authoritative checks. */
export function validateVideoParamsForUi(input: {
  prompt?: string;
  /** Raw persisted values are required to validate kept incompatible fields. */
  rawParams?: Record<string, unknown>;
  params: EffectiveVideoParams;
  upstreams?: UpstreamMediaSnapshot[];
}): string[] {
  const { params } = input;
  const errors: string[] = [];
  const declaredFailure = findDeclaredParameterFailure(
    (input.rawParams ?? params) as Record<string, unknown>,
    params.schema as Record<string, unknown>,
    undefined,
  );
  if (declaredFailure) errors.push(declaredFailure.message);
  const prompt = resolveGenerationPrompt(input, (input.upstreams ?? []).filter((item) => item.materialType === 'text').map((item) => item.textContent));
  const operation = params.effectiveOperations.find((entry) => entry.id === params.operation);
  const promptSlot = operation?.slots.find((slot) => slot.type === 'text' || slot.role === 'prompt');
  const promptLength = Array.from(prompt).length;
  if ((promptSlot?.min ?? 0) > 0 && prompt.trim().length === 0) {
    errors.push('当前生成方式需要提示词');
  }
  if (
    promptLength > 0
    && typeof params.schema.prompt?.minLength === 'number'
    && promptLength < params.schema.prompt.minLength
  ) {
    errors.push(`提示词至少 ${params.schema.prompt.minLength} 个字符`);
  }
  if (typeof params.schema.prompt?.maxLength === 'number' && promptLength > params.schema.prompt.maxLength) {
    errors.push(`提示词最多 ${params.schema.prompt.maxLength} 个字符`);
  }

  const requiredUpstreamSlots = operation?.slots.filter(
    (slot) => slot.source === 'upstream_edge' && slot.min > 0,
  ) ?? [];
  if (operation && !operation.ready && requiredUpstreamSlots.length > 0) {
    errors.push(`请补齐当前方式的必填素材：${requiredUpstreamSlots.map((slot) => slot.role || slot.slot).join('、')}`);
  }
  const fileSlot = operation?.slots.find((slot) => slot.slot === 'file_url');
  if (fileSlot?.min) {
    const fileUrl = params.fileUrl?.trim() ?? '';
    if (!fileUrl || !urlIsHttp(fileUrl)) {
      errors.push('请输入有效的文档 URL');
    } else if (!documentUrlMatchesSlot(fileUrl, fileSlot.allowedMimes)) {
      errors.push('文档格式不在当前模型支持列表');
    }
  }
  const linkSlot = operation?.slots.find((slot) => slot.slot === 'link_url');
  if (linkSlot?.min && (!params.linkUrl?.trim() || !urlIsHttp(params.linkUrl.trim()))) {
    errors.push('请输入有效的网页 URL');
  }

  if (operation && typeof params.duration === 'number' && params.duration >= 0) {
    for (const slot of operation.slots) {
      if (!Number.isFinite(slot.combinedOutputMaxDurationSec)) continue;
      const bindings = operation.bindings.filter((binding) => binding.slot === slot.slot);
      const durations = bindings.map((binding) => {
        const upstream = (input.upstreams ?? []).find((candidate) =>
          binding.edgeId
            ? candidate.edgeId === binding.edgeId
            : candidate.nodeId === binding.sourceNodeId,
        );
        const duration = upstream?.durationSec ?? upstream?.duration;
        return typeof duration === 'number' && Number.isFinite(duration) ? duration : undefined;
      });
      if (durations.some((duration) => duration === undefined)) continue;
      const totalInputDuration = durations.reduce<number>((sum, duration) => sum + (duration ?? 0), 0);
      const max = slot.combinedOutputMaxDurationSec as number;
      if (totalInputDuration + params.duration > max) {
        errors.push(`参考视频与输出时长合计不能超过 ${max} 秒`);
      }
    }
  }
  return [...new Set(errors)];
}
