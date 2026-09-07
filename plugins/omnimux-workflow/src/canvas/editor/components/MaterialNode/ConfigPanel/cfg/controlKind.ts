/**
 * Control Kind Resolver — 控件选型矩阵纯函数（2026-09-07 全模态收敛 / T01）。
 *
 * 密度由「选项基数 × 标签长度」驱动控件选型，而不是所有枚举都进 Segment。
 * 无 React、无 DOM，单测不挂浏览器。自 videoParams 原样迁入 cfg/。
 */

import type { CfgControlKind } from './types.ts';

/** 超过 4 个汉字的标签视为长标签（触发 Choice Tile 升级） */
export const CJK_LONG_THRESHOLD = 4;

/** 选型输入 */
export interface ControlKindInput {
  /** 选项基数 */
  cardinality: number;
  /** 选项标签列表 */
  labels: string[];
  /** 有几何语义（比例 / 构图） → aspect-grid */
  geometric?: boolean;
  /** 两态布尔 → compact-toggle / inline-switch */
  boolean?: boolean;
  /** 连续数值（schema.range 且 options 为空） → slider */
  continuous?: boolean;
  /** 容器可用宽度，缺省按 360 - 32 = 328 */
  containerPx?: number;
}

/** 估算文本渲染宽度：CJK 12px/字，ASCII 7px/字（12px 字号线索） */
export function estimateTextPx(text: string): number {
  let px = 0;
  for (const ch of text) {
    px += (ch.codePointAt(0) ?? 0) > 255 ? 12 : 7;
  }
  return px;
}

/**
 * Segment 单行溢出检测（实现契约）：
 * sum(itemIntrinsicWidth) + 4 > containerWidth 视为溢出。
 * itemIntrinsicWidth ≈ 文本宽 + 左右 padding 16px。
 */
export function estimateSegmentOverflow(labels: readonly string[], containerPx: number): boolean {
  const total = labels.reduce((sum, label) => sum + estimateTextPx(label) + 16, 0);
  return total + 4 > containerPx;
}

/**
 * 控件选型矩阵（强制）：
 * - 两态布尔 → compact-toggle（基数 2）/ inline-switch
 * - 几何语义 → aspect-grid
 * - 连续数值 → slider
 * - 长标签（>4 汉字）或（基数 ≥4 且单行溢出） → choice-tile（禁止中文断词折行）
 * - 基数 ≥6 的低频枚举 → select
 * - 其余短标签互斥枚举 → segment
 */
export function resolveControlKind(input: ControlKindInput): CfgControlKind {
  if (input.boolean) {
    return input.cardinality === 2 ? 'compact-toggle' : 'inline-switch';
  }
  if (input.geometric) {
    return 'aspect-grid';
  }
  if (input.continuous) {
    return 'slider';
  }
  const labels = input.labels ?? [];
  const hasLongLabel = labels.some((label) => [...label].length > CJK_LONG_THRESHOLD);
  const overflow = estimateSegmentOverflow(labels, input.containerPx ?? 328);
  if (hasLongLabel || (input.cardinality >= 4 && overflow)) {
    return 'choice-tile';
  }
  if (input.cardinality >= 6) {
    return 'select';
  }
  return 'segment';
}
