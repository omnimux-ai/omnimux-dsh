/**
 * Aspect Ratio Geometry Specifications
 *
 * 定义全量画幅选项的精准几何线框矢量规格：
 * - 标准 24x24 视口 (viewBox="0 0 24 24")
 * - 统一圆角 rx=2, ry=2
 * - 描边 strokeWidth=1.5px
 *
 * 比例规格表：
 * - 16:9:  宽 22,   高 12.4, x 1,   y 5.8
 * - 9:16:  宽 12.4, 高 22,   x 5.8, y 1
 * - 1:1:   宽 18,   高 18,   x 3,   y 3
 * - 4:3:   宽 20,   高 15,   x 2,   y 4.5
 * - 3:4:   宽 15,   高 20,   x 4.5, y 2
 * - 21:9:  宽 22,   高 9.4,  x 1,   y 7.3
 * - auto:  宽 18,   高 18,   x 3,   y 3, 虚线 strokeDasharray="2 2"
 */

import React from 'react';
import type { AspectRatioGeometry } from './types.ts';

export type { AspectRatioGeometry };

/**
 * 默认基础几何参数
 */
const DEFAULT_VIEWBOX = '0 0 24 24';
const DEFAULT_RX = 2;
const DEFAULT_RY = 2;
const DEFAULT_STROKE_WIDTH = 1.5;

/**
 * 默认 16:9 几何线框规格（基准 Fallback）
 */
export const DEFAULT_ASPECT_RATIO_GEOMETRY: AspectRatioGeometry = {
  ratio: '16:9',
  label: '16:9',
  width: 22,
  height: 12.4,
  rectWidth: 22,
  rectHeight: 12.4,
  x: 1,
  y: 5.8,
  rx: DEFAULT_RX,
  ry: DEFAULT_RY,
  strokeWidth: DEFAULT_STROKE_WIDTH,
  isDashed: false,
  viewBox: DEFAULT_VIEWBOX,
};

/**
 * 全量支持的画幅几何字典映射
 */
export const ASPECT_RATIO_GEOMETRIES: Record<string, AspectRatioGeometry> = {
  '16:9': DEFAULT_ASPECT_RATIO_GEOMETRY,
  '9:16': {
    ratio: '9:16',
    label: '9:16',
    width: 12.4,
    height: 22,
    rectWidth: 12.4,
    rectHeight: 22,
    x: 5.8,
    y: 1,
    rx: DEFAULT_RX,
    ry: DEFAULT_RY,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    isDashed: false,
    viewBox: DEFAULT_VIEWBOX,
  },
  '1:1': {
    ratio: '1:1',
    label: '1:1',
    width: 18,
    height: 18,
    rectWidth: 18,
    rectHeight: 18,
    x: 3,
    y: 3,
    rx: DEFAULT_RX,
    ry: DEFAULT_RY,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    isDashed: false,
    viewBox: DEFAULT_VIEWBOX,
  },
  '4:3': {
    ratio: '4:3',
    label: '4:3',
    width: 20,
    height: 15,
    rectWidth: 20,
    rectHeight: 15,
    x: 2,
    y: 4.5,
    rx: DEFAULT_RX,
    ry: DEFAULT_RY,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    isDashed: false,
    viewBox: DEFAULT_VIEWBOX,
  },
  '3:4': {
    ratio: '3:4',
    label: '3:4',
    width: 15,
    height: 20,
    rectWidth: 15,
    rectHeight: 20,
    x: 4.5,
    y: 2,
    rx: DEFAULT_RX,
    ry: DEFAULT_RY,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    isDashed: false,
    viewBox: DEFAULT_VIEWBOX,
  },
  '21:9': {
    ratio: '21:9',
    label: '21:9',
    width: 22,
    height: 9.4,
    rectWidth: 22,
    rectHeight: 9.4,
    x: 1,
    y: 7.3,
    rx: DEFAULT_RX,
    ry: DEFAULT_RY,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    isDashed: false,
    viewBox: DEFAULT_VIEWBOX,
  },
  auto: {
    ratio: 'auto',
    label: '自适应',
    width: 18,
    height: 18,
    rectWidth: 18,
    rectHeight: 18,
    x: 3,
    y: 3,
    rx: DEFAULT_RX,
    ry: DEFAULT_RY,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    strokeDasharray: '2 2',
    isDashed: true,
    viewBox: DEFAULT_VIEWBOX,
  },
};

/**
 * 全量画幅比例键名数组
 */
export const SUPPORTED_ASPECT_RATIOS = Object.keys(ASPECT_RATIO_GEOMETRIES) as readonly string[];

/**
 * 获取指定比例的矢量几何规格。
 * 若遇到未知比例，优雅降级返回 16:9 标准规格。
 */
export function getAspectRatioGeometry(ratio: string): AspectRatioGeometry {
  if (!ratio) {
    return DEFAULT_ASPECT_RATIO_GEOMETRY;
  }
  const normalized = ratio.trim().toLowerCase();
  if (normalized === 'auto') {
    return ASPECT_RATIO_GEOMETRIES['auto'] ?? DEFAULT_ASPECT_RATIO_GEOMETRY;
  }
  return ASPECT_RATIO_GEOMETRIES[ratio] ?? ASPECT_RATIO_GEOMETRIES[normalized] ?? DEFAULT_ASPECT_RATIO_GEOMETRY;
}

/**
 * 生成原生 SVG 字符串代码（非 React 环境或纯 HTML 渲染时使用）
 */
export function getAspectRatioSvgString(
  ratio: string,
  options: { size?: number | string; stroke?: string; className?: string } = {},
): string {
  const { size = 20, stroke = 'currentColor', className = '' } = options;
  const geo = getAspectRatioGeometry(ratio);
  const dashAttr = geo.strokeDasharray ? ` stroke-dasharray="${geo.strokeDasharray}"` : '';
  const classAttr = className ? ` class="${className}"` : '';

  return `<svg width="${size}" height="${size}" viewBox="${geo.viewBox}" fill="none" stroke="${stroke}" stroke-width="${geo.strokeWidth}"${classAttr}><rect x="${geo.x}" y="${geo.y}" width="${geo.width}" height="${geo.height}" rx="${geo.rx}" ry="${geo.ry}"${dashAttr}/></svg>`;
}

/**
 * AspectRatioIcon 组件属性
 */
export interface AspectRatioIconProps extends React.SVGProps<SVGSVGElement> {
  ratio: string;
  size?: number | string;
  stroke?: string;
  className?: string;
}

/**
 * 渲染画幅矢量几何线框的纯 SVG 图标组件 (纯 TS 兼容 React.createElement)
 */
export const AspectRatioIcon: React.FC<AspectRatioIconProps> = ({
  ratio,
  size = 20,
  stroke = 'currentColor',
  className,
  style,
  ...rest
}) => {
  const geo = getAspectRatioGeometry(ratio);

  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: geo.viewBox,
      fill: 'none',
      stroke,
      strokeWidth: geo.strokeWidth,
      className,
      style: { display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style },
      ...rest,
    },
    React.createElement('rect', {
      x: geo.x,
      y: geo.y,
      width: geo.width,
      height: geo.height,
      rx: geo.rx,
      ry: geo.ry,
      strokeDasharray: geo.strokeDasharray,
    }),
  );
};
