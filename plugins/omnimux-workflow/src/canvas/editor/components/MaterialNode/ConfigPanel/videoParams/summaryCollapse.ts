/**
 * Summary Collapse — 摘要条 5 步折叠协议纯函数（2026-09-07 配置面板 UI 收敛 / T01）。
 *
 * 截断是设计行为，不是 CSS 意外。当摘要估算总宽超过可用宽度时，按
 * COLLAPSE_ORDER 从低优先级到高优先级依次丢弃，每步后复测：
 *   1. 隐藏 Mode 文本（整段）
 *   2. 隐藏有声文字，仅留 Volume 图标
 *   3. 隐藏比例文字，仅留几何图标
 *   4. 隐藏清晰度
 *   5. 仍溢出 → 时长数值进入 ellipsis（图标保留）
 * 不变量：chevron 的 dropPolicy 必须是 'never'，永不进入 hidden。
 * 无 React、无 DOM，协议本身不读浏览器。
 */

import { estimateTextPx } from './controlKind.ts';
import type { CfgSummarySlot, CfgSummarySlotId, CfgSummaryVisibleState } from './types.ts';

/** 折叠优先级（从低到高丢弃） */
export const COLLAPSE_ORDER: readonly CfgSummarySlotId[] = [
  'mode',
  'sound',
  'ratio',
  'resolution',
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
 */
export function collapseSummary(
  slots: readonly CfgSummarySlot[],
  availablePx: number,
): CfgSummaryVisibleState {
  const hidden = new Set<CfgSummarySlotId>();
  const iconOnly = new Set<CfgSummarySlotId>();
  const ellipsis = new Set<CfgSummarySlotId>();

  const chevron = slots.find((slot) => slot.id === 'chevron');
  if (chevron && chevron.dropPolicy !== 'never') {
    throw new Error("chevron slot dropPolicy must be 'never'");
  }

  let used = totalVisiblePx(slots, hidden, iconOnly);

  for (const id of COLLAPSE_ORDER) {
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

  // 第 5 步：1–4 步后仍溢出 → 时长数值 ellipsis（图标保留，绝不出半截汉字）
  if (used > availablePx) {
    const duration = slots.find((slot) => slot.id === 'duration');
    if (duration && duration.dropPolicy === 'ellipsis') {
      ellipsis.add('duration');
    }
  }

  return { hidden, iconOnly, ellipsis };
}
