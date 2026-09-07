/**
 * Unit tests for imageParamAdapter（2026-09-07 全模态收敛 / T04）。
 *
 * 真值断言（非源码正则）：
 * - 非法 aspectRatio / resolution 展示回退 schema default，且不回写 params；
 * - resolution 无 options → undefined（摘要与浮层都不渲染该槽）；
 * - quality 仅当无 resolution.options 时占据清晰度槽；
 * - effectiveOps ≤ 1 → showModeUi false / modeText 空；
 * - fullText 空格拼接、无中点 `·`；
 * - assertImageParamWriteKey 白名单防御（generationMode / 未知 key 抛错）。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCompatTestCatalog } from '../../../../../../shared/validation/compatTestCatalog.ts';
import {
  assertImageParamWriteKey,
  formatImageSummary,
  resolveEffectiveImageParams,
} from './imageParamAdapter.ts';

const catalog = createCompatTestCatalog();

const IMAGE_SCHEMA = {
  aspectRatio: {
    options: [
      { value: 'auto', label: '自适应' },
      { value: '1:1', label: '1:1' },
      { value: '16:9', label: '16:9' },
      { value: '9:16', label: '9:16' },
    ],
    defaultValue: '16:9',
  },
  resolution: {
    options: [{ value: '2K', label: '2K' }, { value: '1K', label: '1K' }],
    defaultValue: '2K',
  },
};

describe('imageParamAdapter - 读侧清洗回退', () => {
  it('合法 aspectRatio 保留；非法值展示回退 schema default（不回写 params）', () => {
    const kept = resolveEffectiveImageParams({
      params: { model: 'img-prompt-only', aspectRatio: '9:16' },
      schema: IMAGE_SCHEMA,
      modelItem: { id: 'img-prompt-only', label: 'img-prompt-only' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(kept.aspectRatio, '9:16');

    const rawParams = { model: 'img-prompt-only', aspectRatio: '9:9' };
    const fallback = resolveEffectiveImageParams({
      params: rawParams,
      schema: IMAGE_SCHEMA,
      modelItem: { id: 'img-prompt-only', label: 'img-prompt-only' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(fallback.aspectRatio, '16:9');
    // 展示回退不得改提交载荷：原始 params 保持原样
    assert.equal(rawParams.aspectRatio, '9:9');
  });

  it('缺省 aspectRatio → schema default；无 schema → 16:9 兜底', () => {
    const resolved = resolveEffectiveImageParams({
      params: { model: 'img-prompt-only' },
      schema: IMAGE_SCHEMA,
      modelItem: { id: 'img-prompt-only', label: 'img-prompt-only' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(resolved.aspectRatio, '16:9');

    const bare = resolveEffectiveImageParams({
      params: undefined,
      schema: undefined,
      modelItem: undefined,
      catalog: null,
    });
    assert.equal(bare.aspectRatio, '16:9');
    assert.equal(bare.showModeUi, false);
    assert.equal(bare.effectiveOperations.length, 0);
  });

  it('resolution：无 options → undefined；非法值 → defaultValue', () => {
    const noResolution = resolveEffectiveImageParams({
      params: { model: 'img-prompt-only', resolution: '4K' },
      schema: { aspectRatio: IMAGE_SCHEMA.aspectRatio },
      modelItem: { id: 'img-prompt-only', label: 'img-prompt-only' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(noResolution.resolution, undefined);

    const invalid = resolveEffectiveImageParams({
      params: { model: 'img-prompt-only', resolution: '8K' },
      schema: IMAGE_SCHEMA,
      modelItem: { id: 'img-prompt-only', label: 'img-prompt-only' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(invalid.resolution, '2K');

    const kept = resolveEffectiveImageParams({
      params: { model: 'img-prompt-only', resolution: '1k' === '1k' ? '1K' : '2K' },
      schema: IMAGE_SCHEMA,
      modelItem: { id: 'img-prompt-only', label: 'img-prompt-only' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(kept.resolution, '1K');
  });

  it('quality 仅当无 resolution.options 时解析（清晰度槽避让）', () => {
    const withResolution = resolveEffectiveImageParams({
      params: { model: 'img-prompt-only', quality: 'hd' },
      schema: {
        ...IMAGE_SCHEMA,
        quality: { options: [{ value: 'hd', label: 'HD' }], defaultValue: 'hd' },
      },
      modelItem: { id: 'img-prompt-only', label: 'img-prompt-only' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(withResolution.quality, undefined);

    const noResolution = resolveEffectiveImageParams({
      params: { model: 'img-prompt-only', quality: 'bogus' },
      schema: {
        aspectRatio: IMAGE_SCHEMA.aspectRatio,
        quality: { options: [{ value: 'hd', label: 'HD' }], defaultValue: 'hd' },
      },
      modelItem: { id: 'img-prompt-only', label: 'img-prompt-only' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(noResolution.quality, 'hd');
  });

  it('ops ≥ 2 → showModeUi true 且 modeText 来自 operation label；ops ≤ 1 → 无 mode', () => {
    const twoOps = resolveEffectiveImageParams({
      params: { model: 'img-ref' },
      schema: IMAGE_SCHEMA,
      modelItem: { id: 'img-ref', label: 'img-ref' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(twoOps.showModeUi, true);
    assert.ok(twoOps.effectiveOperations.length >= 2);
    const twoSummary = formatImageSummary(twoOps);
    assert.ok(twoSummary.modeText.length > 0);

    const oneOp = resolveEffectiveImageParams({
      params: { model: 'img-prompt-only' },
      schema: IMAGE_SCHEMA,
      modelItem: { id: 'img-prompt-only', label: 'img-prompt-only' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(oneOp.showModeUi, false);
    assert.equal(formatImageSummary(oneOp).modeText, '');
  });
});

describe('formatImageSummary - 摘要格式化', () => {
  it('fullText 空格拼接、无中点；auto 比例显示「自适应」；resolution 大写', () => {
    const resolved = resolveEffectiveImageParams({
      params: { model: 'img-ref', aspectRatio: 'auto', resolution: '1K' },
      schema: IMAGE_SCHEMA,
      modelItem: { id: 'img-ref', label: 'img-ref' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    const summary = formatImageSummary(resolved);
    assert.equal(summary.ratioText, '自适应');
    assert.equal(summary.resolutionText, '1K');
    assert.ok(!summary.fullText.includes('·'));
    assert.ok(!summary.fullText.includes('  '));
    const parts = summary.fullText.split(' ');
    assert.ok(parts.includes('自适应'));
    assert.ok(parts.includes('1K'));
  });

  it('无 resolution 槽时 fullText 不含清晰度段', () => {
    const resolved = resolveEffectiveImageParams({
      params: { model: 'img-prompt-only', aspectRatio: '1:1' },
      schema: { aspectRatio: IMAGE_SCHEMA.aspectRatio },
      modelItem: { id: 'img-prompt-only', label: 'img-prompt-only' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    const summary = formatImageSummary(resolved);
    assert.equal(summary.resolutionText, null);
    assert.equal(summary.fullText, '1:1');
  });
});

describe('assertImageParamWriteKey - 写入白名单防御', () => {
  it('白名单 key 不抛错', () => {
    for (const key of ['operation', 'aspectRatio', 'resolution', 'quality', 'seed']) {
      assert.doesNotThrow(() => assertImageParamWriteKey(key));
    }
  });

  it('generationMode 被明确禁止', () => {
    assert.throws(() => assertImageParamWriteKey('generationMode'), /generationMode/);
  });

  it('未知 key 抛错', () => {
    assert.throws(() => assertImageParamWriteKey('duration'), /duration/);
    assert.throws(() => assertImageParamWriteKey('bogusField'), /bogusField/);
  });
});
