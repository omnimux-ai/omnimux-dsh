/**
 * Unit tests for cfg/summaryCollapse（2026-09-07 全模态收敛 / T01）。
 *
 * 5 步折叠协议夹具：
 * - 视频序（默认两参调用 ≡ 旧行为）：mode → sound 文字 → ratio 文字 → resolution，
 *   duration 最后 ellipsis；chevron 始终可见。
 * - 图像序（IMAGE_COLLAPSE_ORDER）：mode → ratio 文字 → resolution。
 * - 音频序（AUDIO_COLLAPSE_ORDER）：mode → format；duration 走 ellipsis 兜底。
 * 纯函数真值断言，非源码正则。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUDIO_COLLAPSE_ORDER,
  COLLAPSE_ORDER,
  DEFAULT_COLLAPSE_ORDER,
  IMAGE_COLLAPSE_ORDER,
  collapseSummary,
  estimateSummaryTextPx,
} from './summaryCollapse.ts';

/**
 * 视频夹具：估算宽度固定，便于精确推演每一步。
 * mode 90 / ratio 52(icon18+text28+gap6) / resolution 26 / duration 50 / sound 48 / chevron 20
 * 全量总计 286。
 */
function fixtureSlots() {
  return [
    { id: 'mode', text: '全能参考生视频', hasIcon: false, dropPolicy: 'hide', estimatePx: 90 },
    { id: 'ratio', text: '16:9', hasIcon: true, dropPolicy: 'icon-only', estimatePx: 52 },
    { id: 'resolution', text: '2K', hasIcon: false, dropPolicy: 'hide', estimatePx: 26 },
    { id: 'duration', text: '8s', hasIcon: true, dropPolicy: 'ellipsis', estimatePx: 50 },
    { id: 'sound', text: '有声', hasIcon: true, dropPolicy: 'icon-only', estimatePx: 48 },
    { id: 'chevron', text: '', hasIcon: true, dropPolicy: 'never', estimatePx: 20 },
  ];
}

/** 图像夹具：mode 66 / ratio 52 / resolution 26 / chevron 20，全量 164 */
function imageFixtureSlots() {
  return [
    { id: 'mode', text: '文生图', hasIcon: false, dropPolicy: 'hide', estimatePx: 66 },
    { id: 'ratio', text: '16:9', hasIcon: true, dropPolicy: 'icon-only', estimatePx: 52 },
    { id: 'resolution', text: '2K', hasIcon: false, dropPolicy: 'hide', estimatePx: 26 },
    { id: 'chevron', text: '', hasIcon: true, dropPolicy: 'never', estimatePx: 20 },
  ];
}

/** 音频夹具：mode 66 / format 32 / duration 50 / chevron 20，全量 168 */
function audioFixtureSlots() {
  return [
    { id: 'mode', text: '纯音乐', hasIcon: false, dropPolicy: 'hide', estimatePx: 66 },
    { id: 'format', text: 'MP3', hasIcon: false, dropPolicy: 'hide', estimatePx: 32 },
    { id: 'duration', text: '60s', hasIcon: true, dropPolicy: 'ellipsis', estimatePx: 50 },
    { id: 'chevron', text: '', hasIcon: true, dropPolicy: 'never', estimatePx: 20 },
  ];
}

describe('cfg/summaryCollapse - 视频序（默认，向后兼容）', () => {
  it('折叠顺序锁定为 mode → sound → ratio → resolution', () => {
    assert.deepEqual([...COLLAPSE_ORDER], ['mode', 'sound', 'ratio', 'resolution']);
    assert.deepEqual([...DEFAULT_COLLAPSE_ORDER], ['mode', 'sound', 'ratio', 'resolution']);
  });

  it('宽度充裕（≥286）→ 全部可见，无任何折叠', () => {
    const state = collapseSummary(fixtureSlots(), 400);
    assert.equal(state.hidden.size, 0);
    assert.equal(state.iconOnly.size, 0);
    assert.equal(state.ellipsis.size, 0);
  });

  it('第 1 步：先丢 mode 整段（286-90=196 ≤ 250）', () => {
    const state = collapseSummary(fixtureSlots(), 250);
    assert.deepEqual([...state.hidden], ['mode']);
    assert.equal(state.iconOnly.size, 0);
    assert.equal(state.ellipsis.size, 0);
  });

  it('第 2 步：再丢 sound 文字留图标（196-24=172 ≤ 190）', () => {
    const state = collapseSummary(fixtureSlots(), 190);
    assert.deepEqual([...state.hidden], ['mode']);
    assert.deepEqual([...state.iconOnly], ['sound']);
    assert.equal(state.ellipsis.size, 0);
  });

  it('第 3 步：再丢 ratio 文字留几何图标（172-28=144 ≤ 165）', () => {
    const state = collapseSummary(fixtureSlots(), 165);
    assert.deepEqual([...state.hidden], ['mode']);
    assert.deepEqual([...state.iconOnly], ['sound', 'ratio']);
    assert.equal(state.ellipsis.size, 0);
  });

  it('第 4 步：再丢 resolution 整段（144-26=118 ≤ 140）', () => {
    const state = collapseSummary(fixtureSlots(), 140);
    assert.deepEqual([...state.hidden], ['mode', 'resolution']);
    assert.deepEqual([...state.iconOnly], ['sound', 'ratio']);
    assert.equal(state.ellipsis.size, 0);
  });

  it('第 5 步：仍溢出 → duration 数值 ellipsis；chevron 永不丢', () => {
    const state = collapseSummary(fixtureSlots(), 100);
    assert.deepEqual([...state.hidden], ['mode', 'resolution']);
    assert.deepEqual([...state.iconOnly], ['sound', 'ratio']);
    assert.deepEqual([...state.ellipsis], ['duration']);
    assert.ok(!state.hidden.has('chevron'));
    assert.ok(!state.iconOnly.has('chevron'));
    assert.ok(!state.ellipsis.has('chevron'));
  });

  it('极端窄（10px）：chevron 仍可见，duration 仅 ellipsis 不消失', () => {
    const state = collapseSummary(fixtureSlots(), 10);
    assert.ok(!state.hidden.has('chevron'));
    assert.ok(!state.hidden.has('duration'));
    assert.ok(state.ellipsis.has('duration'));
  });

  it('chevron dropPolicy 非 never → 抛错（不变量防御）', () => {
    const bad = fixtureSlots().map((slot) => (
      slot.id === 'chevron' ? { ...slot, dropPolicy: 'hide' } : slot
    ));
    assert.throws(() => collapseSummary(bad, 100), /never/);
  });

  it('无声槽缺省时第 2 步自动跳到 ratio（Hide, Don\'t Grey）', () => {
    const slots = fixtureSlots().filter((slot) => slot.id !== 'sound');
    const state = collapseSummary(slots, 200);
    assert.deepEqual([...state.hidden], ['mode']);
    assert.equal(state.iconOnly.size, 0);
    const tighter = collapseSummary(slots, 140);
    assert.deepEqual([...tighter.iconOnly], ['ratio']);
  });

  it('无 mode 槽（showModeUi=false）时第 1 步直接跳过', () => {
    const slots = fixtureSlots().filter((slot) => slot.id !== 'mode');
    const state = collapseSummary(slots, 180);
    assert.equal(state.hidden.size, 0);
    assert.deepEqual([...state.iconOnly], ['sound']);
  });

  it('estimateSummaryTextPx 与 controlKind 字号线索一致', () => {
    assert.equal(estimateSummaryTextPx('有声'), 24);
    assert.equal(estimateSummaryTextPx('16:9'), 28);
  });
});

describe('cfg/summaryCollapse - 图像序（IMAGE_COLLAPSE_ORDER）', () => {
  it('图像折叠顺序锁定为 mode → ratio → resolution', () => {
    assert.deepEqual([...IMAGE_COLLAPSE_ORDER], ['mode', 'ratio', 'resolution']);
  });

  it('宽度充裕（≥164）→ 全部可见', () => {
    const state = collapseSummary(imageFixtureSlots(), 200, IMAGE_COLLAPSE_ORDER);
    assert.equal(state.hidden.size, 0);
    assert.equal(state.iconOnly.size, 0);
    assert.equal(state.ellipsis.size, 0);
  });

  it('第 1 步丢 mode（164-66=98 ≤ 120）', () => {
    const state = collapseSummary(imageFixtureSlots(), 120, IMAGE_COLLAPSE_ORDER);
    assert.deepEqual([...state.hidden], ['mode']);
    assert.equal(state.iconOnly.size, 0);
  });

  it('第 2 步 ratio 丢文字留几何图标（98-28=70 ≤ 90）', () => {
    const state = collapseSummary(imageFixtureSlots(), 90, IMAGE_COLLAPSE_ORDER);
    assert.deepEqual([...state.hidden], ['mode']);
    assert.deepEqual([...state.iconOnly], ['ratio']);
  });

  it('第 3 步丢 resolution（70-26=44 ≤ 60）；极窄时仅剩图标 + chevron，无半截汉字', () => {
    const state = collapseSummary(imageFixtureSlots(), 60, IMAGE_COLLAPSE_ORDER);
    assert.deepEqual([...state.hidden], ['mode', 'resolution']);
    assert.deepEqual([...state.iconOnly], ['ratio']);
    assert.equal(state.ellipsis.size, 0);
    // 图像无 ellipsis 槽：极端窄也不允许整钮省略
    const extreme = collapseSummary(imageFixtureSlots(), 10, IMAGE_COLLAPSE_ORDER);
    assert.ok(!extreme.hidden.has('chevron'));
    assert.equal(extreme.ellipsis.size, 0);
  });
});

describe('cfg/summaryCollapse - 音频序（AUDIO_COLLAPSE_ORDER）', () => {
  it('音频折叠顺序锁定为 mode → format（duration 不进 hide 序）', () => {
    assert.deepEqual([...AUDIO_COLLAPSE_ORDER], ['mode', 'format']);
  });

  it('第 1 步丢 mode（168-66=102 ≤ 120）', () => {
    const state = collapseSummary(audioFixtureSlots(), 120, AUDIO_COLLAPSE_ORDER);
    assert.deepEqual([...state.hidden], ['mode']);
    assert.equal(state.ellipsis.size, 0);
  });

  it('第 2 步丢 format（102-32=70 ≤ 90）', () => {
    const state = collapseSummary(audioFixtureSlots(), 90, AUDIO_COLLAPSE_ORDER);
    assert.deepEqual([...state.hidden], ['mode', 'format']);
    assert.equal(state.ellipsis.size, 0);
  });

  it('hide 序走完仍溢出 → duration 数值 ellipsis（尽量保留时长）', () => {
    const state = collapseSummary(audioFixtureSlots(), 60, AUDIO_COLLAPSE_ORDER);
    assert.deepEqual([...state.hidden], ['mode', 'format']);
    assert.deepEqual([...state.ellipsis], ['duration']);
    assert.ok(!state.hidden.has('chevron'));
  });
});
