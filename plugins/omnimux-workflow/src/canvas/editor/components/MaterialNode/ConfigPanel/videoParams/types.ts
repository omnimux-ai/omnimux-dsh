/**
 * VideoParams Types & Contracts (Issue 467 / W2).
 *
 * Generation mode is an open-string Catalog operation id (`params.operation`).
 * retired from the write path; legacy values are read-time migrated only.
 *
 * 2026-09-07 全模态收敛（T01）：Cfg* / Popover* / RectLike / ViewportSize /
 * AspectRatioGeometry 等无材质语义的契约已升格至 ../cfg/types.ts，此处
 * re-export 保持既有引用路径不报错。VideoParamWriteKey 与断言仍留在本文件。
 */

import type { ReactNode } from 'react';
import type { ModelParameterSchema } from '../../../../../../shared/api.ts';
import type { OperationUiOption } from '../../../../../../shared/validation/operationUi.ts';

export type {
  AspectRatioGeometry,
  CfgControlKind,
  CfgSummaryItem,
  CfgSummarySlot,
  CfgSummarySlotId,
  CfgSummaryVisibleState,
  PopoverPlacement,
  PopoverPosition,
  RectLike,
  ViewportSize,
} from '../cfg/types.ts';

import type { PopoverPlacement, RectLike } from '../cfg/types.ts';

export interface PendingVideoParamAdjustment {
  suggestedParams: Record<string, unknown>;
  /** Values observed when each suggestion was created; protects later edits. */
  originalParams: Record<string, unknown>;
  notices: string[];
}

/**
 * 存放于 nodeData.params 中的视频参数原始/持久化结构
 */
export interface VideoNodeParams {
  model?: string;
  /** Canonical operation id from the Catalog DTO. */
  operation?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number | string;
  sound?: boolean;
  seed?: number;
  watermark?: boolean;
  outputFormat?: string;
  referenceTaskType?: string;
  generationType?: string;
  returnLastFrame?: boolean;
  webSearch?: boolean;
  nsfwCheck?: boolean;
  /** Suggested parameter replacements that require explicit user confirmation. */
  pendingVideoParamAdjustment?: PendingVideoParamAdjustment;
  fileUrl?: string;
  linkUrl?: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  [key: string]: unknown;
}

/**
 * 经清洗、校验后，当前实际生效的完整视频参数字段
 */
export interface EffectiveVideoParams {
  model: string;
  /** Canonical operation id (may be '' when zero effective ops). */
  operation: string;
  /** Resolved label for the current operation ('' when mode UI hidden). */
  operationLabel: string;
  /** Effective operations (≥2 → mode selector visible). */
  effectiveOperations: OperationUiOption[];
  /** True when the mode segment / TriggerBar mode text must render. */
  showModeUi: boolean;
  /** Model schema merged with the selected operation override. */
  schema: ModelParameterSchema;
  aspectRatio: string;
  resolution?: string;
  duration: number | string;
  sound: boolean;
  hasSoundSupport: boolean;
  seed?: number;
  watermark?: boolean;
  outputFormat?: string;
  referenceTaskType?: string;
  generationType?: string;
  returnLastFrame?: boolean;
  webSearch?: boolean;
  nsfwCheck?: boolean;
  /** Suggested parameter replacements that require explicit user confirmation. */
  pendingVideoParamAdjustment?: PendingVideoParamAdjustment;
  fileUrl?: string;
  linkUrl?: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
}

/**
 * 视频参数触发条（TriggerBar）组件属性
 */
export interface VideoTriggerBarProps {
  params: EffectiveVideoParams;
  isOpen: boolean;
  onToggle: () => void;
  disabled?: boolean;
  triggerRef?: React.Ref<HTMLElement>;
  className?: string;
}

/**
 * 视频参数设置弹层（VideoParamPopover）组件属性
 */
export interface VideoParamPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRect: RectLike | null;
  params: EffectiveVideoParams;
  onUpdateParams: (updates: Partial<VideoNodeParams>) => void;
  catalog?: unknown;
  schema?: unknown;
  modelItem?: unknown;
  className?: string;
  children?: ReactNode;
}

/** PopoverPlacement re-export 消费点（保持类型引用不退化） */
export type { PopoverPlacement as VideoPopoverPlacement };

export type { VideoSummaryFormatResult } from './summaryFormatter.ts';

/** 本迭代允许从浮层写入的 key。新增 UI 控件不得扩大此集合。 */
export type VideoParamWriteKey =
  | 'operation'
  | 'aspectRatio'
  | 'resolution'
  | 'duration'
  | 'sound'
  | 'seed'
  | 'watermark'
  | 'outputFormat'
  | 'referenceTaskType'
  | 'generationType'
  | 'returnLastFrame'
  | 'webSearch'
  | 'nsfwCheck'
  | 'fileUrl'
  | 'linkUrl';

/** 运行期断言：禁止 generationMode 与未知 key 进入写入路径。 */
export function assertVideoParamWriteKey(key: string): asserts key is VideoParamWriteKey {
  const allowed: readonly string[] = [
    'operation', 'aspectRatio', 'resolution', 'duration', 'sound',
    'seed', 'watermark', 'outputFormat', 'referenceTaskType', 'generationType',
    'returnLastFrame', 'webSearch', 'nsfwCheck', 'fileUrl', 'linkUrl',
  ];
  if (key === 'generationMode') {
    throw new Error('UI must not write params.generationMode');
  }
  if (!allowed.includes(key)) {
    throw new Error(`UI must not write params.${key}`);
  }
}
