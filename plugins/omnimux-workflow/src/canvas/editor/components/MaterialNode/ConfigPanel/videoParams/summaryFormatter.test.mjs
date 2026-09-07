/**
 * Unit tests for summaryFormatter (Issue #467 / W2, Feed-Slot 阶段二 / T04)。
 *
 * 严格四段式：[ 生成模式 比例 质量 时长 ]。
 * 声音开关只属于 Popover，绝不拼入 TriggerBar 胶囊文字。
 * fullText 以空格拼接（视觉分隔由 CSS 竖线承担），字符串中禁止出现中点。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatVideoSummary } from './summaryFormatter.ts';

function base(overrides = {}) {
  return {
    model: 'm',
    operation: 'text_to_video',
    operationLabel: '文生视频',
    effectiveOperations: [],
    showModeUi: false,
    aspectRatio: '16:9',
    duration: 5,
    sound: false,
    hasSoundSupport: false,
    ...overrides,
  };
}

describe('summaryFormatter - 胶囊摘要格式化引擎（严格四段式）', () => {
  it('单 operation（showModeUi=false）→ 无 mode 文案、无多余分隔符', () => {
    const result = formatVideoSummary(base({
      resolution: '2K',
      duration: 8,
      sound: true,
      hasSoundSupport: true,
    }));
    assert.equal(result.modeText, '');
    assert.equal(result.ratioText, '16:9');
    assert.equal(result.resolutionText, '2K');
    assert.equal(result.durationText, '8s');
    assert.equal(result.fullText, '16:9 2K 8s');
    assert.ok(!result.fullText.includes('·'), 'fullText 不得包含中点 ·');
    assert.ok(!result.fullText.includes('全能参考'));
    assert.ok(!result.fullText.includes('有声'));
  });

  it('声音开关绝不拼入胶囊（sound=true 也不出现"有声"）', () => {
    const result = formatVideoSummary(base({ sound: true, hasSoundSupport: true }));
    assert.equal(result.fullText, '16:9 5s');
    assert.ok(!result.fullText.includes('有声'));
    assert.equal('soundText' in result, false, '结构化结果不再携带 soundText 字段');
  });

  it('无分辨率无音效 + 单 op → 仅 比例 时长', () => {
    const result = formatVideoSummary(base());
    assert.equal(result.modeText, '');
    assert.equal(result.fullText, '16:9 5s');
  });

  it('多 operation（showModeUi=true）→ 使用 Catalog label 作为 mode 文案', () => {
    const result = formatVideoSummary(base({
      showModeUi: true,
      operation: 'first_last_frame',
      operationLabel: '首尾帧',
      aspectRatio: '9:16',
      duration: 5,
    }));
    assert.equal(result.modeText, '首尾帧');
    assert.equal(result.fullText, '首尾帧 9:16 5s');
  });

  it('fullText 无中点、无连续空白、段数以单个空格连接（含声音开启样本）', () => {
    const samples = [
      base({ showModeUi: true, operationLabel: '全能参考', resolution: '1080P', duration: 10, sound: true, hasSoundSupport: true }),
      base({ showModeUi: false, aspectRatio: '9:16', duration: 8 }),
      base({ showModeUi: true, operationLabel: '参考', aspectRatio: '1:1', resolution: '4K', duration: 5, sound: true, hasSoundSupport: true }),
    ];
    for (const sample of samples) {
      const result = formatVideoSummary(sample);
      assert.ok(!result.fullText.includes('·'), `不应存在中点: ${result.fullText}`);
      assert.ok(!result.fullText.startsWith(' '), `不应以空白开头: ${result.fullText}`);
      assert.ok(!result.fullText.endsWith(' '), `不应以空白结尾: ${result.fullText}`);
      assert.ok(!result.fullText.includes('  '), `不应存在连续空白: ${result.fullText}`);
      const expectedSegments = [
        result.modeText,
        result.ratioText,
        result.resolutionText,
        result.durationText,
      ].filter((s) => s !== null && s !== undefined && String(s).trim() !== '');
      assert.equal(
        result.fullText,
        expectedSegments.join(' '),
        `fullText 应为各段空格拼接: ${result.fullText}`,
      );
    }
  });

  it('分辨率小写自动标准化为大写', () => {
    const result = formatVideoSummary(base({ resolution: '1080p' }));
    assert.equal(result.resolutionText, '1080P');
    assert.ok(result.fullText.includes('1080P'));
  });
});


describe('summaryFormatter - 自动时长', () => {
  it('duration -1 displays the existing automatic-duration label', () => {
    const result = formatVideoSummary(base({ duration: -1 }));
    assert.equal(result.durationText, '自动');
    assert.equal(result.fullText, '16:9 自动');
  });
});
