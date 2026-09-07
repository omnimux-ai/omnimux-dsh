/**
 * Unit tests for audioParamAdapter（2026-09-07 全模态收敛 / T05）。
 *
 * 真值断言（非源码正则）：
 * - 时长 schema-driven：options 命中 / range+step 命中保留，非法展示回退
 *   defaultValue（兜底 60）；字符串 '8s' 可 parse；allowAuto 的 -1 合法；
 *   全程无 1–60 硬编码上限；
 * - voice / instrumental / outputFormat 显隐只看 schema；
 * - effectiveOps ≤ 1 → showModeUi false / modeText 空；
 * - fullText 空格拼接、无中点 `·`；
 * - assertAudioParamWriteKey 白名单防御。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCompatTestCatalog } from '../../../../../../shared/validation/compatTestCatalog.ts';
import {
  assertAudioParamWriteKey,
  durationIsValid,
  formatAudioSummary,
  resolveEffectiveAudioParams,
} from './audioParamAdapter.ts';

const catalog = createCompatTestCatalog();

/** 在测试目录上追加一个双 operation 音频模型（TTS + 音乐） */
const audioCatalog = {
  ...catalog,
  models: [
    ...(catalog.models ?? []),
    {
      id: 'aud-multi',
      label: 'aud-multi',
      operations: [
        { id: 'text_to_speech', label: '配音', listed: true, output: { type: 'audio' }, inputs: [] },
        { id: 'text_to_music', label: '纯音乐', listed: true, output: { type: 'audio' }, inputs: [] },
      ],
    },
  ],
};

const OPTIONS_SCHEMA = {
  duration: {
    options: [
      { value: 30, label: '30s' },
      { value: 60, label: '60s' },
      { value: 120, label: '120s' },
    ],
    defaultValue: 60,
    unit: 's',
  },
  voice: {
    options: [
      { value: 'alloy', label: 'Alloy' },
      { value: 'echo', label: 'Echo' },
    ],
    defaultValue: 'alloy',
  },
};

describe('audioParamAdapter - 时长（schema-driven）', () => {
  it('options 命中保留；非法值展示回退 defaultValue（不回写 params）', () => {
    const kept = resolveEffectiveAudioParams({
      params: { model: 'aud-tts', duration: 120 },
      schema: OPTIONS_SCHEMA,
      modelItem: { id: 'aud-tts', label: 'aud-tts' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(kept.duration, 120);

    const rawParams = { model: 'aud-tts', duration: 45 };
    const fallback = resolveEffectiveAudioParams({
      params: rawParams,
      schema: OPTIONS_SCHEMA,
      modelItem: { id: 'aud-tts', label: 'aud-tts' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(fallback.duration, 60);
    assert.equal(rawParams.duration, 45);
  });

  it("字符串 '8s' / '30' 可 parse 后校验", () => {
    assert.equal(durationIsValid(30, OPTIONS_SCHEMA.duration), true);
    const parsed = resolveEffectiveAudioParams({
      params: { model: 'aud-tts', duration: '30s' },
      schema: OPTIONS_SCHEMA,
      modelItem: { id: 'aud-tts', label: 'aud-tts' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(parsed.duration, 30);

    const bad = resolveEffectiveAudioParams({
      params: { model: 'aud-tts', duration: 'abc' },
      schema: OPTIONS_SCHEMA,
      modelItem: { id: 'aud-tts', label: 'aud-tts' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(bad.duration, 60);
  });

  it('range+step 命中保留；偏离 step 展示回退；无 1–60 硬编码（90s 合法）', () => {
    const rangeSchema = {
      duration: { range: { min: 5, max: 120, step: 5 }, defaultValue: 30 },
    };
    assert.equal(durationIsValid(90, rangeSchema.duration), true);
    assert.equal(durationIsValid(7, rangeSchema.duration), false);
    assert.equal(durationIsValid(200, rangeSchema.duration), false);
    const resolved = resolveEffectiveAudioParams({
      params: { model: 'aud-tts', duration: 90 },
      schema: rangeSchema,
      modelItem: { id: 'aud-tts', label: 'aud-tts' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(resolved.duration, 90);
  });

  it('allowAuto 的 -1 合法，摘要显示「自动」；无 schema 兜底 60', () => {
    const autoSchema = {
      duration: { range: { min: 5, max: 120 }, defaultValue: 30, allowAuto: true },
    };
    assert.equal(durationIsValid(-1, autoSchema.duration), true);
    const resolved = resolveEffectiveAudioParams({
      params: { model: 'aud-tts', duration: -1 },
      schema: autoSchema,
      modelItem: { id: 'aud-tts', label: 'aud-tts' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(resolved.duration, -1);
    assert.equal(formatAudioSummary(resolved).durationText, '自动');

    const bare = resolveEffectiveAudioParams({
      params: { model: 'aud-tts', duration: 45 },
      schema: undefined,
      modelItem: { id: 'aud-tts', label: 'aud-tts' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(bare.duration, 60);
  });
});

describe('audioParamAdapter - voice / instrumental / format（schema 为显隐真源）', () => {
  it('voice：无 options → hasVoiceOptions false 且不渲染；非法值回退 default', () => {
    const noVoice = resolveEffectiveAudioParams({
      params: { model: 'aud-tts', voice: 'nova' },
      schema: { duration: OPTIONS_SCHEMA.duration },
      modelItem: { id: 'aud-tts', label: 'aud-tts' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(noVoice.hasVoiceOptions, false);
    assert.equal(noVoice.voice, undefined);

    const invalid = resolveEffectiveAudioParams({
      params: { model: 'aud-tts', voice: 'bogus' },
      schema: OPTIONS_SCHEMA,
      modelItem: { id: 'aud-tts', label: 'aud-tts' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(invalid.hasVoiceOptions, true);
    assert.equal(invalid.voice, 'alloy');
  });

  it('instrumental：仅 supported 才暴露；值缺省用 defaultValue', () => {
    const schema = {
      ...OPTIONS_SCHEMA,
      instrumental: { supported: true, defaultValue: true },
    };
    const resolved = resolveEffectiveAudioParams({
      params: { model: 'aud-tts' },
      schema,
      modelItem: { id: 'aud-tts', label: 'aud-tts' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(resolved.hasInstrumentalSupport, true);
    assert.equal(resolved.instrumental, true);

    const kept = resolveEffectiveAudioParams({
      params: { model: 'aud-tts', instrumental: false },
      schema,
      modelItem: { id: 'aud-tts', label: 'aud-tts' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(kept.instrumental, false);

    const unsupported = resolveEffectiveAudioParams({
      params: { model: 'aud-tts', instrumental: true },
      schema: OPTIONS_SCHEMA,
      modelItem: { id: 'aud-tts', label: 'aud-tts' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(unsupported.hasInstrumentalSupport, false);
  });

  it('outputFormat：有 options 才解析，摘要大写；无则 null', () => {
    const schema = {
      ...OPTIONS_SCHEMA,
      outputFormat: { options: [{ value: 'mp3', label: 'mp3' }, { value: 'wav', label: 'wav' }], defaultValue: 'mp3' },
    };
    const resolved = resolveEffectiveAudioParams({
      params: { model: 'aud-tts', outputFormat: 'wav' },
      schema,
      modelItem: { id: 'aud-tts', label: 'aud-tts' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(resolved.outputFormat, 'wav');
    assert.equal(formatAudioSummary(resolved).formatText, 'WAV');

    const noFormat = resolveEffectiveAudioParams({
      params: { model: 'aud-tts' },
      schema: OPTIONS_SCHEMA,
      modelItem: { id: 'aud-tts', label: 'aud-tts' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(noFormat.outputFormat, undefined);
    assert.equal(formatAudioSummary(noFormat).formatText, null);
  });
});

describe('audioParamAdapter - 生成方式与摘要', () => {
  it('ops ≥ 2 → showModeUi true 且 modeText 来自 operation label；ops ≤ 1 → 无 mode', () => {
    const twoOps = resolveEffectiveAudioParams({
      params: { model: 'aud-multi' },
      schema: OPTIONS_SCHEMA,
      modelItem: { id: 'aud-multi', label: 'aud-multi' },
      catalog: audioCatalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(twoOps.showModeUi, true);
    assert.ok(twoOps.effectiveOperations.length >= 2);
    assert.ok(formatAudioSummary(twoOps).modeText.length > 0);

    const oneOp = resolveEffectiveAudioParams({
      params: { model: 'aud-tts' },
      schema: OPTIONS_SCHEMA,
      modelItem: { id: 'aud-tts', label: 'aud-tts' },
      catalog,
      upstreams: [],
      prompt: '',
    });
    assert.equal(oneOp.showModeUi, false);
    assert.equal(formatAudioSummary(oneOp).modeText, '');
  });

  it('fullText 空格拼接、无中点；顺序 mode → format → duration', () => {
    const schema = {
      ...OPTIONS_SCHEMA,
      outputFormat: { options: [{ value: 'mp3', label: 'mp3' }], defaultValue: 'mp3' },
    };
    const resolved = resolveEffectiveAudioParams({
      params: { model: 'aud-multi', duration: 30 },
      schema,
      modelItem: { id: 'aud-multi', label: 'aud-multi' },
      catalog: audioCatalog,
      upstreams: [],
      prompt: '',
    });
    const summary = formatAudioSummary(resolved);
    assert.equal(summary.durationText, '30s');
    assert.ok(!summary.fullText.includes('·'));
    assert.ok(summary.fullText.endsWith('MP3 30s') || summary.fullText.endsWith('mp3 30s'.toUpperCase()));
  });
});

describe('assertAudioParamWriteKey - 写入白名单防御', () => {
  it('白名单 key 不抛错', () => {
    for (const key of ['operation', 'duration', 'voice', 'instrumental', 'outputFormat', 'seed']) {
      assert.doesNotThrow(() => assertAudioParamWriteKey(key));
    }
  });

  it('generationMode 被明确禁止', () => {
    assert.throws(() => assertAudioParamWriteKey('generationMode'), /generationMode/);
  });

  it('未知 key 抛错', () => {
    assert.throws(() => assertAudioParamWriteKey('aspectRatio'), /aspectRatio/);
    assert.throws(() => assertAudioParamWriteKey('bogusField'), /bogusField/);
  });
});
