/**
 * ImageParams Types & Contracts（2026-09-07 全模态收敛 / T04）。
 *
 * 图像节点只读参数契约：Adapter 只做读侧清洗与摘要展示回退，
 * 写路径仍走现网 updateParam（params.* 字段名冻结）。
 */

import type { RefObject } from 'react';
import type { ModelParameterSchema } from '../../../../../../shared/api.ts';
import type { OperationUiOption } from '../../../../../../shared/validation/operationUi.ts';

/** 存放于 nodeData.params 中的图像参数原始/持久化结构 */
export interface ImageNodeParams {
  model?: string;
  /** Canonical operation id from the Catalog DTO. */
  operation?: string;
  aspectRatio?: string;
  resolution?: string;
  quality?: string;
  seed?: number;
  [key: string]: unknown;
}

/** 经读侧清洗后，当前实际生效的图像参数字段（展示回退，不回写 nodeData） */
export interface EffectiveImageParams {
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
  aspectRatio: string;
  /** 无 schema.resolution.options 时为 undefined（摘要与浮层均不渲染该槽） */
  resolution?: string;
  /** 无 schema.quality.options 时为 undefined（独立质量槽支持） */
  quality?: string;
  seed?: number;
}

/** 图像摘要结构化格式化结果 */
export interface ImageSummaryFormatResult {
  /** 生成方式文案。effectiveOps < 2 时为空串（TriggerBar 不渲染 mode 段） */
  modeText: string;
  /** 画幅比例文案，如 '16:9'、'1:1'、'自适应' */
  ratioText: string;
  /** 清晰度文案，如 '2K'、'1K'；无分辨率选项时为 null */
  resolutionText: string | null;
  /** 由空格分隔的紧凑完整文本（a11y 用；视觉分隔由 CSS 竖线承担，禁止中点 `·`） */
  fullText: string;
}

/** ImageTriggerBar 属性 */
export interface ImageTriggerBarProps {
  /** 当前生效的图像参数（读侧清洗） */
  params: EffectiveImageParams;
  /** 浮层是否打开 */
  isOpen: boolean;
  /** 禁用态 */
  disabled?: boolean;
  /** 点击切换浮层开合 */
  onToggle: () => void;
}

/** ImageParamPopover 属性 */
export interface ImageParamPopoverProps {
  /** 触发条按钮的 ref（用于定位与外部点击判定） */
  triggerRef: RefObject<HTMLElement | null>;
  /** 当前生效的图像参数（读侧清洗） */
  params: EffectiveImageParams;
  /** 浮层是否打开 */
  isOpen: boolean;
  /** 关闭浮层回调 */
  onClose: () => void;
  /** 参数变更回调（内部先 assertImageParamWriteKey 再透传宿主 updateParam） */
  onParamChange: (key: string, value: unknown) => void;
}
