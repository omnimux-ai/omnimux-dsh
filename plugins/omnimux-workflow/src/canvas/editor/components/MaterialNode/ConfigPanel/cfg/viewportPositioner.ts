/**
 * Viewport Positioner Algorithm
 *
 * 视口自适应弹性定位、边界碰撞与动态限高纯函数算法。
 * 遵循设计文档规格：
 * - PANEL_WIDTH = 360（设计宽；实际宽度由 resolvePanelWidth 按视口夹紧）
 * - PANEL_DEFAULT_MAX_HEIGHT = 480
 * - PANEL_MIN_HEIGHT = 200
 * - GAP = 8
 * - VIEWPORT_PADDING = 12
 *
 * 自 videoParams 原样迁入 cfg/，视频 / 图像 / 音频浮层共用。
 */

import type { PopoverPlacement, PopoverPosition, RectLike, ViewportSize } from './types.ts';

export const PANEL_WIDTH = 360;
export const PANEL_DEFAULT_MAX_HEIGHT = 480;
export const PANEL_MIN_HEIGHT = 200;
export const GAP = 8;
export const VIEWPORT_PADDING = 12;

/**
 * 浮层实际宽度：min(preferredWidth, viewport - 24)，默认设计宽度 360px。
 * 与 CSS `max-width: calc(100vw - 24px)` 保持一致，窄视口下面板左右各留 12px 安全边距。
 */
export function resolvePanelWidth(viewportWidth: number, preferredWidth: number = PANEL_WIDTH): number {
  return Math.min(preferredWidth, Math.max(0, viewportWidth - VIEWPORT_PADDING * 2));
}

/**
 * 计算参数 Popover 浮层基于视口（Screen / Viewport CSS Pixels）的绝对定位与弹性高度。
 *
 * @param triggerRect 触发器元素在视口中的外接矩形 (getBoundingClientRect)
 * @param viewport 视口尺寸 (window.innerWidth / window.innerHeight)
 * @param preferredWidth 浮层目标 border-box 宽度，参与视口夹紧和边缘避让
 * @returns PopoverPosition 包含 placement、坐标与弹性限高
 */
export function calculatePopoverPosition(
  triggerRect: RectLike | DOMRect,
  viewport: ViewportSize | { width: number; height: number },
  preferredWidth: number = PANEL_WIDTH,
): PopoverPosition {
  const vWidth = viewport?.width ?? 0;
  const vHeight = viewport?.height ?? 0;

  // 1. 计算上下两端在视口安全边界内的剩余可用垂直空间
  const spaceAbove = triggerRect.top - VIEWPORT_PADDING - GAP;
  const spaceBelow = vHeight - triggerRect.bottom - VIEWPORT_PADDING - GAP;

  let placement: PopoverPlacement = 'top';
  let maxHeight = PANEL_DEFAULT_MAX_HEIGHT;
  let top: number | undefined;
  let bottom: number | undefined;

  // 2. 纵向弹出策略判定：
  // 优先向上弹出。只要上方空间满足最低高度要求 (>= 200px) 或者上方空间不小于下方空间，就保持 top 弹出；
  // 仅当极度贴近视口顶部（spaceAbove < 200px）且下方空间更充裕时，自动翻转为 bottom 弹出。
  if (spaceAbove >= PANEL_MIN_HEIGHT || spaceAbove >= spaceBelow) {
    placement = 'top';
    maxHeight = Math.min(PANEL_DEFAULT_MAX_HEIGHT, Math.max(PANEL_MIN_HEIGHT, spaceAbove));
    bottom = vHeight - triggerRect.top + GAP;
    top = undefined;
  } else {
    placement = 'bottom';
    maxHeight = Math.min(PANEL_DEFAULT_MAX_HEIGHT, Math.max(PANEL_MIN_HEIGHT, spaceBelow));
    top = triggerRect.bottom + GAP;
    bottom = undefined;
  }

  // 3. 按真实渲染宽度避让，定位后不再单独缩窄浮层。
  const width = resolvePanelWidth(vWidth, preferredWidth);
  let left = triggerRect.left;

  // 靠右边缘溢出防御：向左推移
  if (left + width > vWidth - VIEWPORT_PADDING) {
    left = vWidth - VIEWPORT_PADDING - width;
  }

  // 靠左边缘溢出防御：向右纠偏至安全边距
  if (left < VIEWPORT_PADDING) {
    left = VIEWPORT_PADDING;
  }

  const result: PopoverPosition = {
    placement,
    left,
    maxHeight,
    width,
  };

  if (top !== undefined) {
    result.top = top;
  }
  if (bottom !== undefined) {
    result.bottom = bottom;
  }

  return result;
}
