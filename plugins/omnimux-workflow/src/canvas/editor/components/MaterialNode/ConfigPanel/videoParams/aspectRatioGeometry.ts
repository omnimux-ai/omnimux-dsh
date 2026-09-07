/**
 * videoParams/aspectRatioGeometry — re-export（2026-09-07 全模态收敛 / T01）。
 * 实现已升格至 ../cfg/aspectRatioGeometry.ts（图像与视频共用画幅几何），
 * 本文件仅保持既有引用路径。
 */

export {
  ASPECT_RATIO_GEOMETRIES,
  AspectRatioIcon,
  DEFAULT_ASPECT_RATIO_GEOMETRY,
  SUPPORTED_ASPECT_RATIOS,
  getAspectRatioGeometry,
  getAspectRatioSvgString,
} from '../cfg/aspectRatioGeometry.ts';
export type { AspectRatioIconProps } from '../cfg/aspectRatioGeometry.ts';
export type { AspectRatioGeometry } from '../cfg/types.ts';
