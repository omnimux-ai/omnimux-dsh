/**
 * videoParams/controlKind — re-export（2026-09-07 全模态收敛 / T01）。
 * 实现已升格至 ../cfg/controlKind.ts，本文件仅保持既有引用路径。
 */

export {
  CJK_LONG_THRESHOLD,
  estimateSegmentOverflow,
  estimateTextPx,
  resolveControlKind,
} from '../cfg/controlKind.ts';
export type { ControlKindInput } from '../cfg/controlKind.ts';
