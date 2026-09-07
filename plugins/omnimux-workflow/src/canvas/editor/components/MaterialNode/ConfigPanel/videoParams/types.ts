/**
 * VideoParams Types & Contracts (Issue 467 / W2).
 *
 * Generation mode is an open-string Catalog operation id (`params.operation`).
 * retired from the write path; legacy values are read-time migrated only.
 */

import type { ReactNode, Ref } from 'react';
import type { ModelParameterSchema } from '../../../../../../shared/api.ts';
import type { OperationUiOption } from '../../../../../../shared/validation/operationUi.ts';

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
 * Popover 浮层弹出方位：
 * - top: 优先向上贴合弹出（自适应限高 200px ~ 480px）
 * - bottom: 顶部空间极端狭窄时向下翻转
 */
export type PopoverPlacement = 'top' | 'bottom';

/**
 * Popover 浮层绝对定位计算结果
 */
export interface PopoverPosition {
  placement: PopoverPlacement;
  top?: number;
  bottom?: number;
  left: number;
  maxHeight: number;
  width: number;
}

/**
 * 通用矩形边界对象定义（兼容 DOMRect）
 */
export interface RectLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

/**
 * 视口尺寸定义
 */
export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * 画幅比例矢量几何信息定义
 */
export interface AspectRatioGeometry {
  ratio: string;
  label: string;
  width: number;
  height: number;
  rectWidth: number;
  rectHeight: number;
  x: number;
  y: number;
  rx: number;
  ry: number;
  strokeWidth: number;
  strokeDasharray?: string;
  isDashed?: boolean;
  viewBox: string;
}

/**
 * 视频参数触发条（TriggerBar）组件属性
 */
export interface VideoTriggerBarProps {
  params: EffectiveVideoParams;
  isOpen: boolean;
  onToggle: () => void;
  disabled?: boolean;
  triggerRef?: Ref<HTMLElement>;
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

export type { VideoSummaryFormatResult } from './summaryFormatter.ts';

/* ------------------------------------------------------------------ */
/* Cfg 控件契约（2026-09-07 配置面板 UI 收敛 / T01）                     */
/* 仅追加类型与防御性断言，不改动 VideoNodeParams / EffectiveVideoParams */
/* ------------------------------------------------------------------ */

/** 控件选型矩阵允许的全部控件形态 */
export type CfgControlKind =
  | 'summary-bar'
  | 'segment'
  | 'choice-tile'
  | 'aspect-grid'
  | 'quick-pills'
  | 'slider'
  | 'inline-switch'
  | 'compact-toggle'
  | 'select'
  | 'text-field';

/** 摘要条槽位 id */
export type CfgSummarySlotId = 'mode' | 'ratio' | 'resolution' | 'duration' | 'sound' | 'chevron';

/** 摘要条单个槽位（折叠协议输入） */
export interface CfgSummarySlot {
  id: CfgSummarySlotId;
  text: string;
  hasIcon: boolean;
  /** hide=整段丢弃；icon-only=丢文字留图标；ellipsis=数值省略；never=永不丢弃 */
  dropPolicy: 'hide' | 'icon-only' | 'ellipsis' | 'never';
  /** 含自身 gap 的估算宽度（调用方按 12px 字 + 14px 图标估算） */
  estimatePx: number;
}

/** 摘要折叠结果：三个集合互斥描述每个槽位的可见态 */
export interface CfgSummaryVisibleState {
  hidden: ReadonlySet<CfgSummarySlotId>;
  iconOnly: ReadonlySet<CfgSummarySlotId>;
  ellipsis: ReadonlySet<CfgSummarySlotId>;
}

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
