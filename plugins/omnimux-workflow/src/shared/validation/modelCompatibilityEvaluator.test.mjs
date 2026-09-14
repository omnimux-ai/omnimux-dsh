/**
 * Phase 2 + Issue #466: Model Compatibility Evaluator tests.
 *
 * The BUILTIN_MODEL_CAPABILITIES table is strangled — capability resolution
 * is catalog-driven and fail-closed. Legacy level semantics (available /
 * degraded / disabled) are preserved for known capabilities.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateModelCompatibility,
  resolveModelInputCapability,
} from './modelCompatibilityEvaluator.ts';
import { createCompatTestCatalog } from './compatTestCatalog.ts';

test('单图模型(max1) + 2张图 → disabled', () => {
  const modelCap = {
    modalities: ['text', 'image'],
    referenceImages: { min: 0, max: 1 },
  };
  const upstreams = [
    { type: 'image' },
    { type: 'image' },
  ];
  const result = evaluateModelCompatibility('gpt-image-2.5', modelCap, upstreams);

  assert.equal(result.level, 'disabled');
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /超出模型最大参考图数量/);
  assert.match(result.reasons[0], /1/);
  assert.deepEqual(result.reasonCodes, ['slot_capacity']);
  assert.ok(result.adaptationAdvice);
  assert.match(result.adaptationAdvice, /截取前 1 张或更换模型/);
});

test('多图模型(max4) + 2张图 → available', () => {
  const modelCap = {
    modalities: ['text', 'image'],
    referenceImages: { min: 0, max: 4 },
  };
  const upstreams = [
    { type: 'image' },
    { type: 'image' },
  ];
  const result = evaluateModelCompatibility('nanobanana-2', modelCap, upstreams);

  assert.equal(result.level, 'available');
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.reasonCodes, []);
  assert.equal(result.adaptationAdvice, undefined);
});

test('超限量(max8) + 9张图 → disabled', () => {
  const modelCap = {
    modalities: ['text', 'image'],
    referenceImages: { min: 0, max: 8 },
  };
  const upstreams = Array.from({ length: 9 }, () => ({ type: 'image' }));
  const result = evaluateModelCompatibility('seedream-5.0-pro', modelCap, upstreams);

  assert.equal(result.level, 'disabled');
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /超出模型最大参考图数量/);
  assert.match(result.reasons[0], /8/);
  assert.ok(result.adaptationAdvice);
});

test('未知模型 / 无 inputCapability → disabled + contract_missing（fail closed，绞杀宽松回退）', () => {
  const upstreams = [
    { type: 'image' },
    { type: 'image' },
    { type: 'video' },
  ];
  const result = evaluateModelCompatibility('custom-unknown-model', undefined, upstreams);

  assert.equal(result.level, 'disabled');
  assert.deepEqual(result.reasonCodes, ['contract_missing']);
  assert.equal(result.reasons.length, 1);
});

test('推荐配额 (min, max] 且 min > 0 → degraded', () => {
  const modelCap = {
    modalities: ['text', 'image'],
    referenceImages: { min: 1, max: 4 },
  };
  const upstreams = [
    { type: 'image' },
    { type: 'image' },
  ];
  const result = evaluateModelCompatibility('custom-model', modelCap, upstreams);

  assert.equal(result.level, 'degraded');
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /超出推荐配额/);
  assert.ok(result.adaptationAdvice);
  assert.match(result.adaptationAdvice, /按前 4 张处理/);
});

test('max === 0 且存在非 text 上游 → disabled（不支持参考素材）', () => {
  const modelCap = {
    modalities: ['text'],
  };
  const upstreams = [
    { type: 'image' },
  ];
  const result = evaluateModelCompatibility('claude-opus-5', modelCap, upstreams);

  assert.equal(result.level, 'disabled');
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /该模型不支持参考素材/);
  assert.ok(result.reasonCodes.includes('model_incompatible'));
});

test('视频参考容量校验：超出 max -> disabled', () => {
  const modelCap = {
    modalities: ['text', 'image', 'video'],
    referenceVideos: { min: 0, max: 1 },
  };
  const upstreams = [
    { type: 'video' },
    { type: 'video' },
  ];
  const result = evaluateModelCompatibility('gemini-3.7-flash', modelCap, upstreams);

  assert.equal(result.level, 'disabled');
  assert.match(result.reasons[0], /超出模型最大参考视频数量/);
});

test('音频参考容量校验：超出 max -> disabled', () => {
  const modelCap = {
    modalities: ['text', 'image', 'audio'],
    referenceAudios: { min: 0, max: 1 },
  };
  const upstreams = [
    { type: 'audio' },
    { type: 'audio' },
  ];
  const result = evaluateModelCompatibility('minimax-h3', modelCap, upstreams);

  assert.equal(result.level, 'disabled');
  assert.match(result.reasons[0], /超出模型最大参考音频数量/);
});

test('MIME 不允许 → disabled + mime_unsupported', () => {
  const modelCap = {
    modalities: ['text', 'image'],
    referenceImages: { min: 0, max: 4, allowedMimeTypes: ['image/png'] },
  };
  const result = evaluateModelCompatibility('any-model', modelCap, [
    { type: 'image', mimeType: 'image/gif' },
  ]);
  assert.equal(result.level, 'disabled');
  assert.ok(result.reasonCodes.includes('mime_unsupported'));
});

// ============================================================================
// Catalog-driven resolution（BUILTIN 硬编码表已绞杀）
// ============================================================================

test('resolveModelInputCapability：Catalog v1.1 models[] 派生（含 alias 归一）', () => {
  const catalog = createCompatTestCatalog();
  const cap = resolveModelInputCapability('img-ref', catalog);
  assert.ok(cap);
  assert.ok(cap.modalities.includes('image'));
  assert.equal(cap.referenceImages?.max, 2);
  assert.deepEqual(cap.referenceImages?.allowedMimeTypes, ['image/png', 'image/jpeg']);

  const viaAlias = resolveModelInputCapability('alias-img-wire', catalog);
  assert.equal(viaAlias?.referenceImages?.max, 4);
});

test('resolveModelInputCapability：未知模型 / 无目录 → undefined（无 BUILTIN 兜底）', () => {
  const catalog = createCompatTestCatalog();
  // 目录不供给的 id 一律 undefined（无 BUILTIN 兜底）；历史上的 BUILTIN 键
  // gpt-image-2 已从契约下架，同样不得有兜底能力。
  assert.equal(resolveModelInputCapability('gpt-image-2', catalog), undefined);
  assert.equal(resolveModelInputCapability('nanobanana-2', catalog), undefined);
  assert.equal(resolveModelInputCapability('seedance-2.0-fast', catalog), undefined);
  assert.equal(resolveModelInputCapability('img-ref', null), undefined);
  assert.equal(resolveModelInputCapability('', catalog), undefined);
});

test('resolveModelInputCapability：无 models[] 的旧 DTO 走桶行 inputCapability', () => {
  const legacy = {
    source: 'static-stub',
    text: [],
    image: [
      {
        id: 'legacy-img',
        label: 'Legacy',
        inputCapability: {
          modalities: ['text', 'image'],
          referenceImages: { min: 0, max: 3, allowedMimeTypes: ['image/png'], supportedRoles: ['reference'] },
        },
      },
    ],
    video: [],
    audio: [],
  };
  const cap = resolveModelInputCapability('legacy-img', legacy);
  assert.equal(cap?.referenceImages?.max, 3);
  assert.equal(resolveModelInputCapability('unknown-xyz-999', legacy), undefined);
});
