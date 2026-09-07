/**
 * AudioParams Types & Contracts（2026-09-07 全模态收敛 / T05）。
 *
 * 音频（非 ASR）节点只读参数契约：Adapter 只做读侧清洗与摘要展示回退，
 * 写路径仍走现网 updateParam（params.* 字段名冻结）。ASR（audio-transcription）
 * 由宿主不挂载本组件群，组件内部不猜测工具身份。
 */

import type { RefObject } from 'react';
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
  /** True when the mode Tile/Segment / TriggerBar mode text must render. */
  showModeUi: boolean;
  /** 当前选定模型的参数 Schema（读侧真源） */
  schema: ModelParameterSchema;
  /** 时长（含 allowAuto 的 -1） */
  duration: number;
  /** 无 schema.voice.options 时为 undefined（摘要与浮层均不渲染音色槽） */
  voice?: string;
  hasVoiceOptions: boolean;
  instrumental: boolean;
  /** schema.instrumental.supported 才为 true（显隐真源是 schema，不是 operation id） */
  hasInstrumentalSupport: boolean;
  /** 无 schema.outputFormat.options 时为 undefined */
  outputFormat?: string;
  seed?: number;
}

/** 音频摘要结构化格式化结果 */
export interface AudioSummaryFormatResult {
  /** 生成方式文案。effectiveOps < 2 时为空串（TriggerBar 不渲染 mode 段） */
  modeText: string;
  /** 时长文案，如 '60s'、'自动' */
  durationText: string;
  /** 输出格式文案，如 'MP3'；无格式选项时为 null */
  formatText: string | null;
  /** 由空格分隔的紧凑完整文本（a11y 用；视觉分隔由 CSS 竖线承担，禁止中点 `·`） */
  fullText: string;
}

/** AudioTriggerBar 属性 */
export interface AudioTriggerBarProps {
  /** 当前生效的音频参数（读侧清洗） */
  params: EffectiveAudioParams;
  /** 浮层是否打开 */
  isOpen: boolean;
  /** 禁用态 */
  disabled?: boolean;
  /** 点击切换浮层开合 */
  onToggle: () => void;
}

/** AudioParamPopover 属性 */
export interface AudioParamPopoverProps {
  /** 触发条按钮的 ref（用于定位与外部点击判定） */
  triggerRef: RefObject<HTMLElement | null>;
  /** 当前生效的音频参数（读侧清洗） */
  params: EffectiveAudioParams;
  /** 浮层是否打开 */
  isOpen: boolean;
  /** 关闭浮层回调 */
  onClose: () => void;
  /** 参数变更回调（内部先 assertAudioParamWriteKey 再透传宿主 updateParam） */
  onParamChange: (key: string, value: unknown) => void;
}
