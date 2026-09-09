/**
 * video_composition 节点状态映射纯函数模块（T1）。
 *
 * 从 videoComposition.tsx 中剥离出的零依赖纯逻辑：
 * 1. VideoCompositionStatus → StatusBadge / GenerationStateContainer / 视图分支
 *    的三条映射矩阵；
 * 2. 迁移自旧节点的格式化工具（formatDuration / formatResolution /
 *    projectFileName），供主节点与产物态组件共用。
 *
 * 全模块不依赖 React / DOM / zustand，可直接被 node:test 断言
 * （见 videoCompositionStatus.test.mjs）。
 */

import type { VideoCompositionStatus } from '../../bridge/clipEvents';

/** StatusBadge 可消费的状态（MaterialStatus 子集）。 */
export type VideoCompositionBadgeStatus = 'completed' | 'generating' | 'failed';
/** GenerationStateContainer 可消费的状态（GenerationStatus 子集，null = 空态）。 */
export type VideoCompositionGenerationStatus = 'completed' | 'generating' | 'failed' | null;
/** 主节点视图。成片预览由下游素材节点承载，本节点不切 result。 */
export type VideoCompositionView = 'rendering' | 'error' | 'launcher';

/**
 * 节点状态 → StatusBadge 语义（节点外置标题栏尾缀徽标）。
 *
 * 矩阵：
 * - completed      → completed（实心绿点）
 * - rendering      → generating（脉冲转点：仅在真正后台合成渲染中才视为"运行中"并展示旋转徽标）
 * - editing / idle → undefined（未运行 / 编辑时间轴等静态交互态，不展示运行中徽标）
 * - error          → failed（红点）
 */
export function mapVideoCompositionToBadge(
  status: VideoCompositionStatus,
): VideoCompositionBadgeStatus | undefined {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'rendering':
      return 'generating';
    case 'editing':
    case 'idle':
      return undefined;
    case 'error':
      return 'failed';
  }
}

/**
 * 节点状态 → GenerationStateContainer 状态机输入。
 *
 * - completed → 'completed'（GSC 淡入产物）；rendering → 'generating'；
 * - error → 'failed'；idle / editing → null（未运行或编辑态不进 GSC，走 launcher 空态）。
 */
export function mapVideoCompositionToGeneration(
  status: VideoCompositionStatus,
): VideoCompositionGenerationStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'rendering':
      return 'generating';
    case 'editing':
    case 'idle':
      return null;
    case 'error':
      return 'failed';
  }
}

/**
 * 节点状态 → 主卡片视图（rendering / error / launcher）。
 *
 * 成片预览落在下游视频素材节点上，本节点始终保持 launcher（打开剪辑），
 * 仅在导出中 / 失败时切到 GSC。hasOutput 不再分流 result。
 */
export function mapVideoCompositionToView(
  status: VideoCompositionStatus,
  _hasOutput = false,
): VideoCompositionView {
  if (status === 'error') return 'error';
  if (status === 'rendering') return 'rendering';
  return 'launcher';
}

/**
 * 时长毫秒 → "MM:SS.mmm" Mono 文案（旧节点原样迁移）。
 * 非法输入（undefined / NaN / 负值）返回占位符 '—'。
 */
export function formatDuration(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const total = Math.round(ms);
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/**
 * 宽高 → "W×H" 分辨率文案（旧节点原样迁移）。
 * 任一维度缺失/为零返回占位符 '—'。
 */
export function formatResolution(width?: number, height?: number): string {
  if (!width || !height) return '—';
  return `${width}×${height}`;
}

/**
 * 标题 → 安全下载文件名（旧节点原样迁移）。
 * 非法字符折叠为下划线，截断 48 字符；空结果兜底 'clip'。
 */
export function projectFileName(title: string): string {
  const cleaned = title.replace(/[^\w\u4e00-\u9fff.-]+/g, '_').slice(0, 48);
  return cleaned || 'clip';
}