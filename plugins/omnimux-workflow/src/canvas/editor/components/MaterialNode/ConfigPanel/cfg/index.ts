/**
 * cfg/ — 全模态配置面板表现层底座公共出口（2026-09-07 全模态收敛）。
 *
 * 无材质语义的控件（SummaryBar / PopoverShell / ChoiceTile / AspectGrid /
 * DurationGrid / CompactToggle / Segment）与纯函数（controlKind /
 * summaryCollapse / viewportPositioner / aspectRatioGeometry）统一由此导出。
 */

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
} from './types.ts';

export {
  CJK_LONG_THRESHOLD,
  estimateSegmentOverflow,
  estimateTextPx,
  resolveControlKind,
} from './controlKind.ts';
export type { ControlKindInput } from './controlKind.ts';

export {
  AUDIO_COLLAPSE_ORDER,
  COLLAPSE_ORDER,
  DEFAULT_COLLAPSE_ORDER,
  IMAGE_COLLAPSE_ORDER,
  collapseSummary,
  estimateSummaryTextPx,
} from './summaryCollapse.ts';

export {
  GAP,
  PANEL_DEFAULT_MAX_HEIGHT,
  PANEL_MIN_HEIGHT,
  PANEL_WIDTH,
  VIEWPORT_PADDING,
  calculatePopoverPosition,
  resolvePanelWidth,
} from './viewportPositioner.ts';

export {
  ASPECT_RATIO_GEOMETRIES,
  AspectRatioIcon,
  DEFAULT_ASPECT_RATIO_GEOMETRY,
  SUPPORTED_ASPECT_RATIOS,
  getAspectRatioGeometry,
  getAspectRatioSvgString,
} from './aspectRatioGeometry.ts';
export type { AspectRatioIconProps } from './aspectRatioGeometry.ts';

export { CfgSummaryBar } from './CfgSummaryBar.tsx';
export type { CfgSummaryBarProps } from './CfgSummaryBar.tsx';

export { CfgPopoverShell } from './CfgPopoverShell.tsx';
export type { CfgPopoverShellProps } from './CfgPopoverShell.tsx';

export { CfgChoiceTile } from './CfgChoiceTile.tsx';
export type { CfgChoiceTileProps } from './CfgChoiceTile.tsx';

export { CfgSegment } from './CfgSegment.tsx';
export type { CfgSegmentOption, CfgSegmentProps } from './CfgSegment.tsx';

export { CfgCompactToggle } from './CfgCompactToggle.tsx';
export type { CfgCompactToggleProps } from './CfgCompactToggle.tsx';

export { CfgAspectGrid } from './CfgAspectGrid.tsx';
export type { CfgAspectGridProps } from './CfgAspectGrid.tsx';

export { CfgDurationGrid } from './CfgDurationGrid.tsx';
export type { CfgDurationGridProps } from './CfgDurationGrid.tsx';
