/**
 * Summary Collapse — 摘要条 5 步折叠协议纯函数（2026-09-07 全模态收敛 / T01）。
 *
 * 截断是设计行为，不是 CSS 意外。当摘要估算总宽超过可用宽度时，按注入的
 * 折叠顺序从低优先级到高优先级依次丢弃，每步后复测；hide/icon-only 走完
 * 仍溢出时，第一个 dropPolicy === 'ellipsis' 的槽进入数值省略（图标保留，
 * 绝不出半截汉字）。
 *
 * 折叠顺序参数化（order）：
 * - 视频（默认）：mode → sound 文字 → ratio 文字 → resolution；duration 兜底 ellipsis
 * - 图像：mode → ratio 文字 → resolution
 * - 音频：mode → format；duration 兜底 ellipsis
 *
 * 不变量：chevron 的 dropPolicy 必须是 'never'，永不进入 hidden。
 * 无 React、无 DOM，协议本身不读浏览器。
 */

import { estimateTextPx } from './controlKind.ts';
import type { CfgSummarySlot, CfgSummarySlotId, CfgSummaryVisibleState } from './types.ts';

/** 视频折叠优先级（从低到高丢弃），也是 collapseSummary 的默认顺序 */
export const DEFAULT_COLLAPSE_ORDER: readonly CfgSummarySlotId[] = [
  'mode',
  'sound',
  'ratio',
  'resolution',
];

/** 向后兼容别名：现网视频单测以 COLLAPSE_ORDER 锁定默认顺序 */
export const COLLAPSE_ORDER: readonly CfgSummarySlotId[] = DEFAULT_COLLAPSE_ORDER;

/** 图像折叠优先级：mode 整段 → ratio 文字 → resolution 整段 */
export const IMAGE_COLLAPSE_ORDER: readonly CfgSummarySlotId[] = [
  'mode',
  'ratio',
  'resolution',
];

/** 音频折叠优先级：mode → format；duration 不进 hide 序，走 ellipsis 兜底 */
export const AUDIO_COLLAPSE_ORDER: readonly CfgSummarySlotId[] = [
  'mode',
  'format',
];

/** 摘要槽位文本估算（委托 controlKind 的 12px 字号线索） */
export function estimateSummaryTextPx(text: string): number {
  return estimateTextPx(text);
}

function totalVisiblePx(
  slots: readonly CfgSummarySlot[],
  hidden: ReadonlySet<CfgSummarySlotId>,
  iconOnly: ReadonlySet<CfgSummarySlotId>,
): number {
  let total = 0;
  for (const slot of slots) {
    if (hidden.has(slot.id)) {
      continue;
    }
    total += iconOnly.has(slot.id)
      ? slot.estimatePx - estimateSummaryTextPx(slot.text)
      : slot.estimatePx;
  }
  return total;
}

/**
 * 计算给定可用宽度下的摘要可见态。
 *
 * @param slots 全部槽位（含 chevron，dropPolicy 必须为 'never'）
 * @param availablePx 触发条内容区可用宽度
 * @param order 折叠优先级（缺省 = 视频序，两参调用与旧行为完全一致）
 */
export function collapseSummary(
  slots: readonly CfgSummarySlot[],
  availablePx: number,
  order: readonly CfgSummarySlotId[] = DEFAULT_COLLAPSE_ORDER,
): CfgSummaryVisibleState {
  const hidden = new Set<CfgSummarySlotId>();
  const iconOnly = new Set<CfgSummarySlotId>();
  const ellipsis = new Set<CfgSummarySlotId>();

  const chevron = slots.find((slot) => slot.id === 'chevron');
  if (chevron && chevron.dropPolicy !== 'never') {
    throw new Error("chevron slot dropPolicy must be 'never'");
  }

  let used = totalVisiblePx(slots, hidden, iconOnly);

  for (const id of order) {
    if (used <= availablePx) {
      break;
    }
    const slot = slots.find((candidate) => candidate.id === id);
    if (!slot || hidden.has(id) || slot.dropPolicy === 'never') {
      continue;
    }
    if (slot.dropPolicy === 'hide') {
      hidden.add(id);
      used -= slot.estimatePx;
    } else if (slot.dropPolicy === 'icon-only') {
      iconOnly.add(id);
      used -= estimateSummaryTextPx(slot.text);
    }
  }

  // 第 5 步：hide/icon-only 走完仍溢出 → 第一个 ellipsis 槽数值省略（图标保留）
  if (used > availablePx) {
    const target = slots.find((slot) => slot.dropPolicy === 'ellipsis' && !hidden.has(slot.id));
    if (target) {
      ellipsis.add(target.id);
    }
  }

  return { hidden, iconOnly, ellipsis };
}
