/**
 * AudioParams Types & Contracts（2026-09-07 全模态收敛 / T05；Issue #763 精简）。
 *
 * 音频（非 ASR）节点只读参数契约：Adapter 只做读侧清洗与展示回退，
 * 写路径仍走现网 updateParam（params.* 字段名冻结）。ASR（audio-transcription）
 * 由宿主不挂载本组件群，组件内部不猜测工具身份。
 *
 * Issue #763：时长由文本长度决定，TriggerBar / Popover 及其 Props、
 * 摘要结构化结果类型已随底栏精简移除。
 */

import type { ModelParameterSchema } from '../../../../../../shared/api.ts';
import type { OperationUiOption } from '../../../../../../shared/validation/operationUi.ts';

/** 存放于 nodeData.params 中的音频参数原始/持久化结构 */
export interface AudioNodeParams {
  model?: string;
  /** Canonical operation id from the Catalog DTO. */
  operation?: string;
  duration?: number | string;
  voice?: string;
  instrumental?: boolean;
  outputFormat?: string;
  seed?: number;
  [key: string]: unknown;
}

/** 经读侧清洗后，当前实际生效的音频参数字段（展示回退，不回写 nodeData） */
export interface EffectiveAudioParams {
  model: string;
  /** Canonical operation id (may be '' when zero effective ops). */
  operation: string;
  /** Resolved label for the current operation ('' when mode UI hidden). */
  operationLabel: string;
  /** Effective operations (≥2 → mode selector visible). */
  effectiveOperations: OperationUiOption[];
  /** True when the mode Tile/Segment UI must render. */
  showModeUi: boolean;
  /** 当前选定模型的参数 Schema（读侧真源） */
  schema: ModelParameterSchema;
  /** 时长（含 allowAuto 的 -1） */
  duration: number;
  /** 无 schema.voice.options 时为 undefined（音色触发胶囊不渲染） */
  voice?: string;
  hasVoiceOptions: boolean;
  instrumental: boolean;
  /** schema.instrumental.supported 才为 true（显隐真源是 schema，不是 operation id） */
  hasInstrumentalSupport: boolean;
  /** 无 schema.outputFormat.options 时为 undefined */
  outputFormat?: string;
  seed?: number;
}
