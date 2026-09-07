/**
 * Cfg Types & Contracts — 全模态配置面板表现层公共契约（2026-09-07 全模态收敛 / T01）。
 *
 * 无材质语义：视频 / 图像 / 音频门面共用本文件的控件选型、摘要折叠、
 * 浮层定位与画幅几何类型。材质专属类型（EffectiveVideoParams 等）
 * 仍留在各材质目录的 types.ts。
 */

import type { ReactNode } from 'react';

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

/** 摘要条槽位 id（全模态并集；各材质只用子集） */
export type CfgSummarySlotId =
  | 'mode'
  | 'ratio'
  | 'resolution'
  | 'duration'
  | 'sound'
  | 'voice'
  | 'format'
  | 'chevron';

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

/** CfgSummaryBar 渲染用槽位（折叠协议输入 + 图标与附加类名） */
export interface CfgSummaryItem {
  id: CfgSummarySlotId;
  text: string;
  /** 前置图标（14px 矢量）；chevron 槽必传 */
  icon?: ReactNode;
  dropPolicy: CfgSummarySlot['dropPolicy'];
  /** 含 gap 的估算宽；门面按 12px 字 + 14px 图标计算 */
  estimatePx: number;
  /** 追加在槽位容器上的类名（如视频门面的 wf-video-trigger-bar__slot 双锁） */
  className?: string;
  /** 追加在文本 span 上的类名 */
  textClassName?: string;
  /** 槽位进入 ellipsis 态时追加的类名 */
  ellipsisClassName?: string;
}

/**
 * Popover 浮层弹出方位：
 * - top: 优先向上贴合弹出（自适应限高 200px ~ 480px）
 * - bottom: 顶部空间极端狭窄时向下翻转
 */
export type PopoverPlacement = 'top' | 'bottom';

/** Popover 浮层绝对定位计算结果 */
export interface PopoverPosition {
  placement: PopoverPlacement;
  top?: number;
  bottom?: number;
  left: number;
  maxHeight: number;
  width: number;
}

/** 通用矩形边界对象定义（兼容 DOMRect） */
export interface RectLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

/** 视口尺寸定义 */
export interface ViewportSize {
  width: number;
  height: number;
}

/** 画幅比例矢量几何信息定义 */
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
