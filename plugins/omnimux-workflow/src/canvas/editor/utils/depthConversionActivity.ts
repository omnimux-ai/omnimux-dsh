/**
 * 深度视频转换的跨组件活跃登记（Issue #3586）。
 *
 * 深度转换是一次同步请求，只有发起它的当前渲染器能拿到结果；页面重载或宿主
 * 重启后，画布上遗留的 `executionStatus: 'running'` 节点不会再有结果回来。
 * 这里维护「本渲染器正在执行的深度节点」集合：
 * - 请求开始登记、`finally` 释放；
 * - 派生节点挂载时用它判断 running 是否已失联（失联则收敛为可重试错误）；
 * - 分区/预建逻辑用它区分「真在跑（noop 防抖）」与「失联（重新开始）」。
 */

import { VIDEO_DEPTH_ORIGIN } from './planVideoDepthDownstream.ts';

const activeDepthTargets = new Set<string>();

export function registerDepthConversion(nodeId: string): void {
  if (nodeId) activeDepthTargets.add(nodeId);
}

export function releaseDepthConversion(nodeId: string): void {
  if (nodeId) activeDepthTargets.delete(nodeId);
}

export function isDepthConversionActive(nodeId: string): boolean {
  return activeDepthTargets.has(nodeId);
}

/** Test-only: forget all in-flight registrations. */
export function clearDepthConversionActivity(): void {
  activeDepthTargets.clear();
}

/**
 * 持久化的深度节点是否「失联」：仍在 running，但当前渲染器没有在跑它。
 * 只命中 `origin === 'video_depth'` 的派生节点，源视频节点不受影响。
 */
export function shouldSelfHealDepthNode(
  data: Record<string, unknown> | undefined,
  nodeId: string,
): boolean {
  if (!data) return false;
  if (data.origin !== VIDEO_DEPTH_ORIGIN) return false;
  if (data.executionStatus !== 'running') return false;
  return !activeDepthTargets.has(nodeId);
}
