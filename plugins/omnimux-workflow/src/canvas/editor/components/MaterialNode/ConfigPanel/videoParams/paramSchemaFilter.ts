/**
 * paramSchemaFilter — 声明式参数白名单投影（Feed-Slot 阶段二 / T04）。
 *
 * 三层半结构（trigger / popover / advanced + hidden）来自 paramControlTable，
 * 本模块把它与当前模型的 ModelParameterSchema 支持度取交集：
 * 白名单声明"允许出现"，schema 决定"真的出现"；hidden（如 generationMode）
 * 永不出现也永不写入。UI 写入统一经 filterWrite 收口，断言用
 * assertVideoParamWriteKey 硬闸（测试 / 开发期防回归）。
 */

import type { ModelParameterSchema } from '../../../../../../shared/api.ts';
import {
  DEFAULT_PARAM_CONTROL_POLICY,
  PARAM_CONTROL_TABLE,
  type ParamControlPolicy,
  type ParamLayer,
  type VideoParamWriteKey,
} from './paramControlTable.ts';

export interface ParamControlQuery {
  /** 当前 operation id（开放字符串；未知模式回落默认策略）。 */
  operationId?: string | null;
  /** 当前模型参数 Schema（支持度真源）。 */
  schema?: ModelParameterSchema | null;
  /** 有效 operation 数；< 2 时 mode 段不进入可见集。 */
  operationCount?: number;
}

export interface ProjectedParamControl {
  /** TriggerBar 核心四段：operation / aspectRatio / resolution / duration。 */
  trigger: string[];
  /** Popover 常规项（trigger + sound 等）。 */
  popover: string[];
  /** Advanced 高级项。 */
  advanced: string[];
  /** 隐藏项：声明式屏蔽，不参与渲染与写入。 */
  hidden: string[];
}

export function resolveParamControlPolicy(operationId?: string | null): ParamControlPolicy {
  return (operationId && PARAM_CONTROL_TABLE[operationId]) || DEFAULT_PARAM_CONTROL_POLICY;
}

/** schema 支持度判定：无选项 / 未声明支持即不可见。 */
export function schemaSupportsParam(schema: ModelParameterSchema | null | undefined, key: string): boolean {
  if (!schema) return false;
  switch (key) {
    case 'operation':
      return true;
    case 'aspectRatio':
      return (schema.aspectRatio?.options?.length ?? 0) > 0;
    case 'resolution':
      return (schema.resolution?.options?.length ?? 0) > 0;
    case 'duration':
      return Boolean(schema.duration && ((schema.duration.options?.length ?? 0) > 0 || schema.duration.range));
    case 'sound':
      return schema.sound?.supported === true;
    case 'seed':
      return Boolean(schema.seed);
    case 'watermark':
    case 'returnLastFrame':
    case 'webSearch':
    case 'nsfwCheck':
      return schema[key]?.supported === true;
    case 'outputFormat':
    case 'referenceTaskType':
    case 'generationType':
      return (schema[key]?.options?.length ?? 0) > 0;
    case 'fileUrl':
    case 'linkUrl':
      // URL 输入由 operation slot 驱动（file_url / link_url），schema 无对应声明。
      return true;
    default:
      return false;
  }
}

/** 白名单 ∩ schema 支持度 → 各层可见键。 */
export function projectParamControl(query: ParamControlQuery = {}): ProjectedParamControl {
  const policy = resolveParamControlPolicy(query.operationId);
  const operationCount = query.operationCount ?? 2;
  const project = (keys: readonly string[]): string[] => keys.filter((key) => {
    if (key === 'operation') return operationCount >= 2;
    return schemaSupportsParam(query.schema, key);
  });
  return {
    trigger: project(policy.trigger),
    popover: project(policy.popover),
    advanced: project(policy.advanced),
    hidden: [...policy.hidden],
  };
}

/** 某一层的可见键（trigger / popover / advanced）。 */
export function visibleKeys(layer: Exclude<ParamLayer, 'hidden'>, query: ParamControlQuery = {}): string[] {
  return projectParamControl(query)[layer];
}

/** 写入硬闸：隐藏或非白名单键直接抛错（测试 / 开发期断言用）。 */
export function assertVideoParamWriteKey(key: string, operationId?: string | null): asserts key is VideoParamWriteKey {
  const policy = resolveParamControlPolicy(operationId);
  if ((policy.hidden as readonly string[]).includes(key)) {
    throw new Error(`video param "${key}" is hidden by the control table and must never be written`);
  }
  if (!(policy.writeAllowlist as readonly string[]).includes(key)) {
    throw new Error(`video param "${key}" is outside the write allowlist for operation "${operationId ?? 'default'}"`);
  }
}

/** 运行时写入门卫：丢弃隐藏 / 非白名单键，保留其余键值（不抛错）。 */
export function filterWrite(
  patch: Record<string, unknown>,
  operationId?: string | null,
): Record<string, unknown> {
  const policy = resolveParamControlPolicy(operationId);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if ((policy.hidden as readonly string[]).includes(key)) continue;
    if (!(policy.writeAllowlist as readonly string[]).includes(key)) continue;
    out[key] = value;
  }
  return out;
}
