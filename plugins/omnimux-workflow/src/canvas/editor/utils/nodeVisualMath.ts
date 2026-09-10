/**
 * 节点视觉纯逻辑（W1）：反缩放公式 + 节点执行态 → GSC 状态映射。
 *
 * 抽成无 React 依赖的纯函数，供 node:test 直接断言（计划 §8）。
 */

import type { MaterialStatus } from '../../types/materialNode';
import type { NodeExecutionApiStatus } from '../../../shared/api';

/** GenerationStateContainer 状态机（对齐 Gxgen GenerationStatus）。 */
export type GenerationStatus = 'pending' | 'generating' | 'completed' | 'failed';

/**
 * 反缩放公式（Gxgen NodeHeader）：zoom=1 → 1，zoom=0.5 → 2。
 * xyflow useViewport 返回倍率，一律 1/zoom —— 禁止抄 Gxgen 个别组件的
 * scale(100/zoom)（那是其 useZoom 百分比坐标系，计划 §9 坑#5）。
 */
export function inverseScaleForZoom(zoom: number): number {
  return zoom > 0 ? 1 / zoom : 1;
}

/**
 * 配置面板可见性（单一闸门）：单选生成节点且 selected 时始终展开。
 * 没有独立 dismiss / click-outside / Esc 收起通道——面板随选中态出现与消失。
 * 导入节点永不展开：替换走卡片右上角按钮 / 空态胶囊，不占用配置底栏。
 * 多选态（isMultiSelected=true，≥2 节点）强制收起，由 FloatingSelectionToolbar 接管。
 * 执行中（running）保持不展开。
 * SRT 字幕文本节点（contentFormat === 'srt'，Issue 744）防御性不展开：
 * 其 nodeKind 本就为 import，此闸为双保险。
 */
export function isConfigPanelVisible(
  selected: boolean | undefined,
  executionStatus: NodeExecutionApiStatus | undefined,
  nodeKind?: 'generate' | 'import',
  isMultiSelected?: boolean,
  contentFormat?: string,
  localStatus?: MaterialStatus,
): boolean {
  if (isMultiSelected || nodeKind === 'import' || contentFormat === 'srt') return false;
  if (localStatus === 'generating') return false;
  return Boolean(selected) && executionStatus !== 'running';
}

/**
 * 节点数据 → GSC 状态映射：
 * - executionStatus（SSE 写入）优先：running→generating、error→failed、
 *   completed→completed；
 * - 回退 M2 本地 status：generating→generating、failed→failed、
 *   completed→completed；
 * - 无执行态但有媒体结果 → completed（reload 恢复快照场景）；
 * - 返回 null 表示空态：不渲染 GSC，走空素材占位。
 */
export function mapNodeToGenerationStatus(
  executionStatus: NodeExecutionApiStatus | undefined,
  localStatus: MaterialStatus | undefined,
  hasMedia: boolean,
): GenerationStatus | null {
  switch (executionStatus) {
    case 'running':
      return 'generating';
    case 'error':
      return 'failed';
    case 'completed':
      return 'completed';
    default:
      break;
  }
  switch (localStatus) {
    case 'generating':
      return 'generating';
    case 'failed':
      return 'failed';
    case 'completed':
      return 'completed';
    default:
      break;
  }
  return hasMedia ? 'completed' : null;
}

export interface RectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NodeSpatialInfo {
  id?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
  data?: Record<string, unknown>;
  type?: string;
  style?: unknown;
}

export const DEFAULT_GROUP_PADDING = 32;
export const DEFAULT_NODE_FALLBACK_WIDTH = 350;
export const DEFAULT_NODE_FALLBACK_HEIGHT = 280;

/** 新建组默认不注入自定义强调色，走 `--wb-node-ring` 中性描边。 */
export const DEFAULT_GROUP_COLOR = '';
/** 历史默认蓝：读档时视为未自定义，避免继续当强调色渲染。 */
export const LEGACY_DEFAULT_GROUP_COLORS = ['#3b82f6'];
export const GROUP_HEADER_HEIGHT = 28;
export const GROUP_HEADER_EXTERNAL_GAP = 8;
export const GROUP_CHROME_INSET = 12;

export type GroupHeaderPlacement = 'external' | 'internal';

export interface GroupHeaderLayout {
  placement: GroupHeaderPlacement;
  top: number;
  left: number;
  transform: string;
  transformOrigin: string;
}

export interface GroupTopBarLayout {
  top: number;
  left: string;
  right: number | 'auto';
  transform: string;
  transformOrigin: string;
}

export type GroupAccentStyle = { '--wf-group-accent': string };

function safeInverseScale(inverseScale: number): number {
  return typeof inverseScale === 'number' && Number.isFinite(inverseScale) && inverseScale > 0
    ? inverseScale
    : 1;
}

const THEME_ACCENT_TOKEN = 'var(--wb-accent)';

/**
 * 自定义强调色：非空且不是遗留默认蓝 / 主题 accent token。
 * 空串 / 未定义 / `#3b82f6` / `var(--wb-accent)` 一律走中性黑白。
 */
export function isCustomGroupAccent(color: unknown): boolean {
  if (typeof color !== 'string') return false;
  const trimmed = color.trim();
  if (!trimmed) return false;
  const normalized = trimmed.toLowerCase();
  if (normalized === THEME_ACCENT_TOKEN) return false;
  return !LEGACY_DEFAULT_GROUP_COLORS.some((legacy) => legacy.toLowerCase() === normalized);
}

/** 非自定义时不注入 `--wf-group-accent`，让 CSS 回落到 `--wb-node-ring`。 */
export function resolveGroupAccentStyle(color: unknown): GroupAccentStyle | Record<string, never> {
  if (!isCustomGroupAccent(color)) return {};
  return { '--wf-group-accent': String(color).trim() };
}

/**
 * 组标题胶囊定位：展开态外挂在容器上方并反缩放；折叠态内置于胶囊内。
 */
export function resolveGroupHeaderLayout(options: {
  isCollapsed: boolean;
  inverseScale: number;
}): GroupHeaderLayout {
  const inverseScale = safeInverseScale(options.inverseScale);
  if (options.isCollapsed) {
    return {
      placement: 'internal',
      top: GROUP_HEADER_EXTERNAL_GAP,
      left: GROUP_CHROME_INSET,
      transform: `scale(${inverseScale})`,
      transformOrigin: 'left center',
    };
  }
  return {
    placement: 'external',
    top: -(GROUP_HEADER_HEIGHT + GROUP_HEADER_EXTERNAL_GAP * inverseScale),
    left: GROUP_CHROME_INSET,
    transform: `scale(${inverseScale})`,
    transformOrigin: 'bottom left',
  };
}

/**
 * 组顶栏定位：展开态贴右侧避让外挂标题；折叠态水平居中。
 */
export function resolveGroupTopBarLayout(options: {
  isCollapsed: boolean;
  inverseScale: number;
}): GroupTopBarLayout {
  const inverseScale = safeInverseScale(options.inverseScale);
  const top = -(GROUP_CHROME_INSET * inverseScale);
  if (options.isCollapsed) {
    return {
      top,
      left: '50%',
      right: 'auto',
      transform: `translate(-50%, -100%) scale(${inverseScale})`,
      transformOrigin: 'bottom center',
    };
  }
  return {
    top,
    left: 'auto',
    right: GROUP_CHROME_INSET,
    transform: `translate(0, -100%) scale(${inverseScale})`,
    transformOrigin: 'bottom right',
  };
}

/**
 * 解析节点的真实可视尺寸与外挂标题栏偏移高度
 */
export function resolveNodeDimensions(node: NodeSpatialInfo): {
  width: number;
  height: number;
  headerOffset: number;
} {
  const data = (node.data || {}) as Record<string, unknown>;
  const materialType = (data.materialType as string) || (node.type === 'material' ? 'text' : undefined);

  // 默认规格对齐 nodeSizeConfig.ts
  let defaultWidth = DEFAULT_NODE_FALLBACK_WIDTH;
  let defaultHeight = DEFAULT_NODE_FALLBACK_HEIGHT;
  let headerOffset = 0;

  if (node.type === 'material' || materialType) {
    headerOffset = 28; // NodeHeader 约 24px + 4px gap
    if (materialType === 'text') {
      defaultWidth = 350;
      defaultHeight = 500;
    } else if (materialType === 'image') {
      defaultWidth = 350;
      defaultHeight = 350;
    } else if (materialType === 'video') {
      defaultWidth = 350;
      defaultHeight = 280;
    } else if (materialType === 'audio') {
      defaultWidth = 350;
      defaultHeight = 150;
    }
  } else if (node.type === 'table') {
    headerOffset = 28;
    defaultWidth = 380;
    defaultHeight = 280;
  } else if (node.type === 'video_composition') {
    headerOffset = 28;
    defaultWidth = 350;
    defaultHeight = 440;
  } else if (node.type === 'group') {
    defaultWidth = 400;
    defaultHeight = 300;
    headerOffset = 0;
  }

  // 优先级：node.measured (真实 DOM 测量) > node.width/height > data.nodeWidth/nodeHeight > 默认几何规格
  const width =
    (typeof node.measured?.width === 'number' && Number.isFinite(node.measured.width) && node.measured.width > 0)
      ? node.measured.width
      : (typeof node.width === 'number' && Number.isFinite(node.width) && node.width > 0)
        ? node.width
        : (typeof data.nodeWidth === 'number' && Number.isFinite(data.nodeWidth as number) && (data.nodeWidth as number) > 0)
          ? (data.nodeWidth as number)
          : defaultWidth;

  const height =
    (typeof node.measured?.height === 'number' && Number.isFinite(node.measured.height) && node.measured.height > 0)
      ? node.measured.height
      : (typeof node.height === 'number' && Number.isFinite(node.height) && node.height > 0)
        ? node.height
        : (typeof data.nodeHeight === 'number' && Number.isFinite(data.nodeHeight as number) && (data.nodeHeight as number) > 0)
          ? (data.nodeHeight as number)
          : defaultHeight;

  return { width, height, headerOffset };
}

/**
 * 计算多个节点在画布中的最小包围盒（含 Padding 留白与外挂标题栏）。
 * 具备防御性校验：过滤 NaN / undefined / 非数字坐标，确保在任何异常数据下均返回安全有限数值。
 */
export function calculateGroupBounds(
  nodes: NodeSpatialInfo[],
  padding = DEFAULT_GROUP_PADDING,
  options?: { includeHeaderOffset?: boolean },
): RectBounds & { minWidth: number; minHeight: number } {
  if (!nodes || nodes.length === 0) {
    return {
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      minWidth: 200,
      minHeight: 150,
    };
  }

  const includeHeader = options?.includeHeaderOffset ?? true;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const nx =
      typeof node?.position?.x === 'number' && Number.isFinite(node.position.x)
        ? node.position.x
        : 0;
    const ny =
      typeof node?.position?.y === 'number' && Number.isFinite(node.position.y)
        ? node.position.y
        : 0;
    const { width: nw, height: nh, headerOffset } = resolveNodeDimensions(node);
    const topY = includeHeader ? ny - headerOffset : ny;

    if (nx < minX) minX = nx;
    if (topY < minY) minY = topY;
    if (nx + nw > maxX) maxX = nx + nw;
    if (ny + nh > maxY) maxY = ny + nh;
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return {
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      minWidth: 200,
      minHeight: 150,
    };
  }

  const safePadding = Number.isFinite(padding) && padding >= 0 ? padding : DEFAULT_GROUP_PADDING;
  const x = minX - safePadding;
  const y = minY - safePadding;
  const width = Math.max(120, maxX - minX + safePadding * 2);
  const height = Math.max(80, maxY - minY + safePadding * 2);

  return {
    x,
    y,
    width,
    height,
    minWidth: width,
    minHeight: height,
  };
}

/**
 * 将绝对画布坐标转换为组内局部相对坐标。
 */
export function toRelativeCoordinates(
  nodePosition: { x: number; y: number },
  groupPosition: { x: number; y: number },
): { x: number; y: number } {
  const nx = typeof nodePosition?.x === 'number' && Number.isFinite(nodePosition.x) ? nodePosition.x : 0;
  const ny = typeof nodePosition?.y === 'number' && Number.isFinite(nodePosition.y) ? nodePosition.y : 0;
  const gx = typeof groupPosition?.x === 'number' && Number.isFinite(groupPosition.x) ? groupPosition.x : 0;
  const gy = typeof groupPosition?.y === 'number' && Number.isFinite(groupPosition.y) ? groupPosition.y : 0;
  return {
    x: nx - gx,
    y: ny - gy,
  };
}

/**
 * 将组内局部相对坐标还原为绝对画布坐标。
 */
export function toAbsoluteCoordinates(
  relativePosition: { x: number; y: number },
  groupPosition: { x: number; y: number },
): { x: number; y: number } {
  const rx = typeof relativePosition?.x === 'number' && Number.isFinite(relativePosition.x) ? relativePosition.x : 0;
  const ry = typeof relativePosition?.y === 'number' && Number.isFinite(relativePosition.y) ? relativePosition.y : 0;
  const gx = typeof groupPosition?.x === 'number' && Number.isFinite(groupPosition.x) ? groupPosition.x : 0;
  const gy = typeof groupPosition?.y === 'number' && Number.isFinite(groupPosition.y) ? groupPosition.y : 0;
  return {
    x: rx + gx,
    y: ry + gy,
  };
}

export type ResizeHandleDirection = 'nw' | 'ne' | 'se' | 'sw' | 'n' | 'e' | 's' | 'w';

/**
 * 8轴手柄尺寸计算器：
 * 根据拖拽方向与位移量计算新边界，强制阻止边界穿透子节点最小包围范围。
 */
export function clampGroupResize(
  handle: ResizeHandleDirection,
  current: RectBounds,
  delta: { dx: number; dy: number },
  minAllowed: { minWidth: number; minHeight: number },
): RectBounds {
  let { x, y, width, height } = current;
  const { dx, dy } = delta;

  switch (handle) {
    case 'se': {
      width = Math.max(minAllowed.minWidth, width + dx);
      height = Math.max(minAllowed.minHeight, height + dy);
      break;
    }
    case 'e': {
      width = Math.max(minAllowed.minWidth, width + dx);
      break;
    }
    case 's': {
      height = Math.max(minAllowed.minHeight, height + dy);
      break;
    }
    case 'nw': {
      const newWidth = width - dx;
      if (newWidth >= minAllowed.minWidth) {
        x += dx;
        width = newWidth;
      } else {
        x += width - minAllowed.minWidth;
        width = minAllowed.minWidth;
      }
      const newHeight = height - dy;
      if (newHeight >= minAllowed.minHeight) {
        y += dy;
        height = newHeight;
      } else {
        y += height - minAllowed.minHeight;
        height = minAllowed.minHeight;
      }
      break;
    }
    case 'w': {
      const newWidth = width - dx;
      if (newWidth >= minAllowed.minWidth) {
        x += dx;
        width = newWidth;
      } else {
        x += width - minAllowed.minWidth;
        width = minAllowed.minWidth;
      }
      break;
    }
    case 'n': {
      const newHeight = height - dy;
      if (newHeight >= minAllowed.minHeight) {
        y += dy;
        height = newHeight;
      } else {
        y += height - minAllowed.minHeight;
        height = minAllowed.minHeight;
      }
      break;
    }
    case 'ne': {
      width = Math.max(minAllowed.minWidth, width + dx);
      const newHeight = height - dy;
      if (newHeight >= minAllowed.minHeight) {
        y += dy;
        height = newHeight;
      } else {
        y += height - minAllowed.minHeight;
        height = minAllowed.minHeight;
      }
      break;
    }
    case 'sw': {
      height = Math.max(minAllowed.minHeight, height + dy);
      const newWidth = width - dx;
      if (newWidth >= minAllowed.minWidth) {
        x += dx;
        width = newWidth;
      } else {
        x += width - minAllowed.minWidth;
        width = minAllowed.minWidth;
      }
      break;
    }
  }

  return { x, y, width, height };
}

/** Convert a screen-space pointer delta into flow units for the current zoom. */
export function screenDeltaToFlowDelta(
  dx: number,
  dy: number,
  zoom: number,
): { dx: number; dy: number } {
  const scale = zoom > 0 ? zoom : 1;
  return { dx: dx / scale, dy: dy / scale };
}

export function childIdsOfGroup(nodes: Array<{ id: string; type?: string; parentId?: string }>, groupId: string): string[] {
  return nodes
    .filter((node) => node.parentId === groupId && node.type !== 'group')
    .map((node) => node.id);
}

export const COLLAPSED_GROUP_WIDTH = 220;
export const COLLAPSED_GROUP_HEIGHT = 44;

/**
 * 纯逻辑：将指定节点打组为 GroupNode 并将子节点转为相对坐标。
 */
export function planGroupNodes(
  currentNodes: any[],
  nodeIds: string[],
  title?: string,
  color = DEFAULT_GROUP_COLOR,
): { groupId: string; nodes: any[] } | null {
  const targetNodes = currentNodes.filter((n) => (
    nodeIds.includes(n.id)
    && n.type !== 'group'
    && !n.parentId
  ));
  if (targetNodes.length < 2) return null;

  const defaultTitle = title && title !== '新建组' ? title : `编组 ${targetNodes.length} 个节点`;
  const bounds = calculateGroupBounds(targetNodes, 32);
  const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const groupNode = {
    id: groupId,
    type: 'group',
    position: { x: bounds.x, y: bounds.y },
    width: bounds.width,
    height: bounds.height,
    selected: true,
    style: {
      width: bounds.width,
      height: bounds.height,
      zIndex: 0,
    },
    data: {
      title: defaultTitle,
      color,
      isCollapsed: false,
      expandedBounds: {
        width: bounds.width,
        height: bounds.height,
      },
      minWidth: bounds.minWidth,
      minHeight: bounds.minHeight,
      padding: 32,
      nodeIds: targetNodes.map((n) => n.id),
    },
  };

  const groupedIds = new Set(targetNodes.map((n) => n.id));

  const updatedChildren = currentNodes.map((node) => {
    if (!groupedIds.has(node.id) || node.type === 'group') return node;
    const relPos = toRelativeCoordinates(node.position, { x: bounds.x, y: bounds.y });
    return {
      ...node,
      parentId: groupId,
      position: relPos,
      selected: false,
      extent: 'parent',
    };
  });

  return {
    groupId,
    nodes: [groupNode, ...updatedChildren],
  };
}

/**
 * 纯逻辑：切换组的收起/展开状态。
 * 收起时：
 * 1. 记录 expandedBounds（如果未记录或有变更）；
 * 2. 组尺寸变为紧凑胶囊尺寸（220x44）；
 * 3. 组内所有子节点设为 hidden: true（隐藏子节点）；
 * 展开时：
 * 1. 还原 groupNode.width 和 groupNode.height 为 expandedBounds；
 * 2. 组内所有子节点恢复 hidden: false。
 */
export function planToggleGroupCollapse(
  currentNodes: any[],
  groupId: string,
): any[] | null {
  const groupNode = currentNodes.find((n) => n.id === groupId && n.type === 'group');
  if (!groupNode) return null;

  const currentData = (groupNode.data || {}) as Record<string, unknown>;
  const isCurrentlyCollapsed = Boolean(currentData.isCollapsed);
  const willCollapse = !isCurrentlyCollapsed;

  const expandedBounds =
    (currentData.expandedBounds as { width: number; height: number }) || {
      width: groupNode.width || 400,
      height: groupNode.height || 300,
    };

  const nextWidth = willCollapse ? COLLAPSED_GROUP_WIDTH : expandedBounds.width;
  const nextHeight = willCollapse ? COLLAPSED_GROUP_HEIGHT : expandedBounds.height;

  return currentNodes.map((node) => {
    if (node.id === groupId) {
      return {
        ...node,
        width: nextWidth,
        height: nextHeight,
        style: {
          ...node.style,
          width: nextWidth,
          height: nextHeight,
        },
        data: {
          ...currentData,
          isCollapsed: willCollapse,
          expandedBounds: willCollapse
            ? { width: groupNode.width || expandedBounds.width, height: groupNode.height || expandedBounds.height }
            : expandedBounds,
        },
      };
    }
    if (node.parentId === groupId) {
      return {
        ...node,
        hidden: willCollapse,
      };
    }
    return node;
  });
}

/**
 * 纯逻辑：解除组，将组内节点还原为绝对坐标。
 */
export function planUngroupNode(currentNodes: any[], groupId: string): any[] | null {
  const groupNode = currentNodes.find((n) => n.id === groupId && n.type === 'group');
  if (!groupNode) return null;

  const groupPos = groupNode.position;
  return currentNodes
    .filter((n) => n.id !== groupId)
    .map((node) => {
      if (node.parentId !== groupId) return node;
      const absPos = toAbsoluteCoordinates(node.position, groupPos);
      const { parentId, extent, ...rest } = node;
      return {
        ...rest,
        position: absPos,
        selected: true,
      };
    });
}

export type AlignLayoutType = 'horizontal' | 'vertical' | 'grid';

export interface PlanAlignLayoutOptions {
  gap?: number;
  columns?: number;
}

/**
 * 纯逻辑：根据节点的真实几何尺寸（measured/显式宽高/默认规格）与外挂标题栏偏移，
 * 精确计算水平、垂直、网格紧凑排列坐标，彻底杜绝节点重叠与尺寸丢失。
 */
export function planAlignLayout<T extends NodeSpatialInfo>(
  nodes: T[],
  layoutType: AlignLayoutType,
  options?: PlanAlignLayoutOptions,
): T[] {
  if (!nodes || nodes.length < 2) return nodes || [];

  const gap = typeof options?.gap === 'number' ? options.gap : 40;

  // 1. 垂直排列 Vertical:
  // - 按当前 y 坐标升序排列（从上到下）
  // - 锁定共同最左 x (minX)
  // - 起始 y 锚点：minTopY (首个节点的整体顶部，包含外挂标题栏)
  // - 逐项累加: nextX = minX, nextY = currentTopY + headerOffset, currentTopY = nextY + height + gap
  if (layoutType === 'vertical') {
    const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);
    const minX = Math.min(...nodes.map((n) => n.position.x));
    const minTopY = Math.min(
      ...nodes.map((n) => {
        const { headerOffset } = resolveNodeDimensions(n);
        return n.position.y - headerOffset;
      }),
    );

    let currentTopY = minTopY;

    const layoutResult = sorted.map((node) => {
      const { height, headerOffset } = resolveNodeDimensions(node);
      const nextX = minX;
      const nextY = currentTopY + headerOffset;
      currentTopY = nextY + height + gap;
      return {
        ...node,
        position: { x: nextX, y: nextY },
      };
    });

    const resultMap = new Map(layoutResult.map((n) => [n.id || '', n]));
    return nodes.map((n) => (n.id && resultMap.has(n.id) ? (resultMap.get(n.id) as T) : n));
  }

  // 2. 水平排列 Horizontal:
  // - 按当前 x 坐标升序排列（从左到右）
  // - 锁定共同顶部 y (minTopY，使得外挂标题栏平齐)
  // - 起始 x 锚点: minX
  // - 逐项累加: nextX = currentLeftX, nextY = minTopY + headerOffset, currentLeftX = nextX + width + gap
  if (layoutType === 'horizontal') {
    const sorted = [...nodes].sort((a, b) => a.position.x - b.position.x);
    const minTopY = Math.min(
      ...nodes.map((n) => {
        const { headerOffset } = resolveNodeDimensions(n);
        return n.position.y - headerOffset;
      }),
    );
    const minX = Math.min(...nodes.map((n) => n.position.x));

    let currentLeftX = minX;

    const layoutResult = sorted.map((node) => {
      const { width, headerOffset } = resolveNodeDimensions(node);
      const nextX = currentLeftX;
      const nextY = minTopY + headerOffset;
      currentLeftX = nextX + width + gap;
      return {
        ...node,
        position: { x: nextX, y: nextY },
      };
    });

    const resultMap = new Map(layoutResult.map((n) => [n.id || '', n]));
    return nodes.map((n) => (n.id && resultMap.has(n.id) ? (resultMap.get(n.id) as T) : n));
  }

  // 3. 网格紧凑排列 Grid:
  // - 先按 y (阈值分行) 再按 x 升序排序
  // - 列数 cols: 动态计算，默认 clamp(ceil(sqrt(N)), 2, 4)
  // - 动态计算各列最大宽度与各行最大高度（含 headerOffset）
  // - 各单元格自动撑开并按最大尺寸对齐
  if (layoutType === 'grid') {
    const cols = options?.columns || Math.min(4, Math.max(2, Math.ceil(Math.sqrt(nodes.length))));
    const sorted = [...nodes].sort((a, b) => {
      const dy = a.position.y - b.position.y;
      if (Math.abs(dy) > 120) return dy;
      return a.position.x - b.position.x;
    });

    const minX = Math.min(...nodes.map((n) => n.position.x));
    const minTopY = Math.min(
      ...nodes.map((n) => {
        const { headerOffset } = resolveNodeDimensions(n);
        return n.position.y - headerOffset;
      }),
    );

    const rows = Math.ceil(sorted.length / cols);
    const colWidths = new Array<number>(cols).fill(0);
    const rowHeights = new Array<number>(rows).fill(0);

    // 收集各行列的最大尺寸
    sorted.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const { width, height, headerOffset } = resolveNodeDimensions(node);
      const totalH = height + headerOffset;
      if (width > (colWidths[col] ?? 0)) colWidths[col] = width;
      if (totalH > (rowHeights[row] ?? 0)) rowHeights[row] = totalH;
    });

    // 计算各列的 X 起始偏移
    const colStartX = new Array<number>(cols).fill(0);
    let curX = minX;
    for (let c = 0; c < cols; c++) {
      colStartX[c] = curX;
      curX += (colWidths[c] ?? 0) + gap;
    }

    // 计算各行的 TopY 起始偏移
    const rowStartTopY = new Array<number>(rows).fill(0);
    let curTopY = minTopY;
    for (let r = 0; r < rows; r++) {
      rowStartTopY[r] = curTopY;
      curTopY += (rowHeights[r] ?? 0) + gap;
    }

    const layoutResult = sorted.map((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const { headerOffset } = resolveNodeDimensions(node);
      const nextX = colStartX[col] ?? minX;
      const nextY = (rowStartTopY[row] ?? minTopY) + headerOffset;
      return {
        ...node,
        position: { x: nextX, y: nextY },
      };
    });

    const resultMap = new Map(layoutResult.map((n) => [n.id || '', n]));
    return nodes.map((n) => (n.id && resultMap.has(n.id) ? (resultMap.get(n.id) as T) : n));
  }

  return nodes;
}


