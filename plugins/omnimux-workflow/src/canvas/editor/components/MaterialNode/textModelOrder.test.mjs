/**
 * Issue #314: canvas catalog rows sort by display name (A–Z).
 * Issue #467: static MATERIAL_NODE_WHITELIST removed — model picker truth is
 * Catalog + compatibility kernel only (no second capability filter).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { sortCatalogRows } from '../../../../shared/sortCatalog.ts';
import {
  buildFilteredModelOptions,
  buildUiUpstreamFingerprint,
} from '../../../../shared/validation/operationUi.ts';
import { createCompatTestCatalog } from '../../../../shared/validation/compatTestCatalog.ts';
import { evaluateCatalogCompat } from '../../../../shared/validation/compatKernel.ts';

const here = dirname(fileURLToPath(import.meta.url));

test('sortCatalogRows：按 label A–Z，numeric collation，不改原数组', () => {
  const rows = [
    { id: 'b', label: 'Seedance 2.0' },
    { id: 'a', label: 'Claude Opus 4.6' },
    { id: 'c', label: 'Seedance 10' },
  ];
  const snapshot = rows.map((row) => row.id);
  assert.deepEqual(
    sortCatalogRows(rows).map((row) => row.label),
    ['Claude Opus 4.6', 'Seedance 2.0', 'Seedance 10'],
  );
  assert.deepEqual(rows.map((row) => row.id), snapshot);
  assert.deepEqual(sortCatalogRows([]), []);
  assert.deepEqual(sortCatalogRows(null), []);
});

test('静态 MATERIAL_NODE_WHITELIST / NODE_MODEL_WHITELIST 已删除（无第二 capability truth）', async () => {
  const materialNodeSrc = readFileSync(
    join(here, '../../../../shared/graph/materialNode.ts'),
    'utf8',
  );
  assert.doesNotMatch(materialNodeSrc, /MATERIAL_NODE_WHITELIST\s*=/);
  assert.doesNotMatch(materialNodeSrc, /NODE_MODEL_WHITELIST\s*=/);

  const typesExport = await import('../../../types/materialNode.ts');
  assert.equal('MATERIAL_NODE_WHITELIST' in typesExport, false);
  assert.equal('NODE_MODEL_WHITELIST' in typesExport, false);
});

// 模拟 ConfigPanel 内部的模型列表推导：catalog bucket 全量 + A-Z，无 whitelist 过滤
function deriveModelOptions(catalog, materialType, params = {}) {
  const rawRows = catalog?.[materialType] ?? [];
  const rows = sortCatalogRows(rawRows);
  const savedModel = typeof params.model === 'string' ? params.model.trim() : '';
  const orphan = savedModel && !rows.some((row) => row.id === savedModel)
    ? [{
        id: savedModel,
        label: rawRows.find((r) => r.id === savedModel)?.label ?? savedModel,
        deprecated: true,
      }]
    : [];
  const combined = [...orphan, ...rows.map((row) => ({ ...row, deprecated: false }))];
  return combined.map((row) => ({
    value: row.id,
    label: row.deprecated ? `${row.label} (deprecated)` : row.label,
    deprecated: row.deprecated,
  }));
}

// 模拟 ConfigPanel 内部的 modelValue 默认值推导：已选 > catalog defaults > 排序首项
function deriveModelValue(catalog, materialType, params = {}, modelOptions = []) {
  if (typeof params.model === 'string' && params.model.trim()) return params.model;
  const defaultId = catalog?.defaults?.[materialType];
  if (typeof defaultId === 'string' && defaultId.trim()) {
    if (modelOptions.some((row) => row.value === defaultId)) return defaultId;
  }
  return modelOptions[0]?.value;
}

test('文本模型：catalog 全量 A-Z，不再按静态白名单剔除', () => {
  const catalog = {
    text: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      { id: 'gpt-5.5', label: 'GPT 5.5' },
      { id: 'deepseek-v3', label: 'DeepSeek V3' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
    ],
  };

  const options = deriveModelOptions(catalog, 'text');
  // Sorted by label A–Z (numeric collation): Claude…, DeepSeek…, Gemini 3.1…,
  // Gemini 3.7…, GPT 5.5, GPT-4o
  assert.deepEqual(
    options.map((o) => o.label),
    [
      'Claude Opus 4.6',
      'DeepSeek V3',
      'Gemini 3.1 Pro Preview',
      'Gemini 3.7 Flash',
      'GPT 5.5',
      'GPT-4o',
    ],
  );
  assert.ok(options.every((o) => !o.deprecated));
});

test('图片模型：catalog 全量 A-Z，不在中枢的模型自然不存在', () => {
  const catalog = {
    image: [
      { id: 'dall-e-3', label: 'DALL-E 3' },
      { id: 'nanobanana-2', label: 'NanoBanana 2' },
      { id: 'seedream-5.0-pro', label: 'Seedream 5.0 Pro' },
      { id: 'midjourney-8.1', label: 'Midjourney 8.1' },
      { id: 'midjourney-7', label: 'Midjourney 7' },
      { id: 'gpt-image-2', label: 'GPT Image 2' },
      { id: 'stable-diffusion-xl', label: 'SDXL' },
      { id: 'seedream-4.5', label: 'Seedream 4.5' },
    ],
  };

  const options = deriveModelOptions(catalog, 'image');
  // Sorted by label A–Z: DALL-E 3, GPT Image 2, Midjourney 7/8.1, NanoBanana 2,
  // SDXL, Seedream 4.5/5.0 Pro
  assert.deepEqual(
    options.map((o) => o.label),
    [
      'DALL-E 3',
      'GPT Image 2',
      'Midjourney 7',
      'Midjourney 8.1',
      'NanoBanana 2',
      'SDXL',
      'Seedream 4.5',
      'Seedream 5.0 Pro',
    ],
  );
  assert.ok(options.every((o) => !o.deprecated));
});

test('存量已保存模型（params.model）不在 catalog bucket 时保留为 deprecated 孤儿项', () => {
  const catalog = {
    image: [
      { id: 'nanobanana-2', label: 'NanoBanana 2' },
      { id: 'seedream-5.0-pro', label: 'Seedream 5.0 Pro' },
    ],
  };

  const options1 = deriveModelOptions(catalog, 'image', { model: 'midjourney-6' });
  assert.equal(options1[0].value, 'midjourney-6');
  assert.equal(options1[0].label, 'midjourney-6 (deprecated)');
  assert.equal(options1[0].deprecated, true);
  assert.equal(options1.length, 3);

  const options2 = deriveModelOptions(catalog, 'image', { model: 'legacy-unknown-model' });
  assert.equal(options2[0].value, 'legacy-unknown-model');
  assert.equal(options2[0].deprecated, true);

  const options3 = deriveModelOptions(catalog, 'image', { model: 'nanobanana-2' });
  assert.ok(options3.every((o) => !o.deprecated));
  assert.equal(options3.length, 2);
});

test('video / audio：全量保留目录模型', () => {
  const catalog = {
    video: [
      { id: 'kling-o1', label: 'Kling O1' },
      { id: 'veo-3', label: 'Veo 3' },
      { id: 'wan-2.1', label: 'Wan 2.1' },
      { id: 'custom-video', label: 'Custom Video' },
    ],
    audio: [
      { id: 'eleven-multilingual', label: 'ElevenLabs' },
      { id: 'fish-speech', label: 'Fish Speech' },
    ],
  };

  const videoOptions = deriveModelOptions(catalog, 'video');
  assert.deepEqual(
    videoOptions.map((o) => o.value),
    ['custom-video', 'kling-o1', 'veo-3', 'wan-2.1'],
  );

  const audioOptions = deriveModelOptions(catalog, 'audio');
  assert.deepEqual(
    audioOptions.map((o) => o.value),
    ['eleven-multilingual', 'fish-speech'],
  );
});

test('modelValue 默认值优先级解析（优先已选 > catalog defaults > 排序首项）', () => {
  const catalog = {
    text: [
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
      { id: 'gpt-5.5', label: 'GPT 5.5' },
    ],
    image: [
      { id: 'midjourney-8.1', label: 'Midjourney 8.1' },
      { id: 'nanobanana-2', label: 'NanoBanana 2' },
      { id: 'seedream-5.0-pro', label: 'Seedream 5.0 Pro' },
    ],
    video: [
      { id: 'wan-2.1', label: 'Wan 2.1' },
      { id: 'kling-o1', label: 'Kling O1' },
    ],
  };

  const textOptions = deriveModelOptions(catalog, 'text');
  const imageOptions = deriveModelOptions(catalog, 'image');
  const videoOptions = deriveModelOptions(catalog, 'video');

  assert.equal(
    deriveModelValue(catalog, 'text', { model: 'gpt-4o' }, textOptions),
    'gpt-4o',
  );

  const catalogWithDefaults = {
    ...catalog,
    defaults: { text: 'gpt-5.5', image: 'seedream-5.0-pro' },
  };
  assert.equal(
    deriveModelValue(catalogWithDefaults, 'text', {}, textOptions),
    'gpt-5.5',
  );
  assert.equal(
    deriveModelValue(catalogWithDefaults, 'image', {}, imageOptions),
    'seedream-5.0-pro',
  );

  // 无 defaults → 排序首项
  assert.equal(
    deriveModelValue(catalog, 'text', {}, textOptions),
    'claude-opus-4-6',
  );
  assert.equal(
    deriveModelValue(catalog, 'image', {}, imageOptions),
    'midjourney-8.1',
  );
  assert.equal(
    deriveModelValue(catalog, 'video', {}, videoOptions),
    'kling-o1',
  );
});

test('ConfigPanel 源码契约：只消费 buildFilteredModelOptions，禁止 MATERIAL_NODE_WHITELIST', () => {
  const src = readFileSync(join(here, 'ConfigPanel/index.tsx'), 'utf8');
  assert.match(src, /buildFilteredModelOptions/);
  assert.match(src, /buildEffectiveOpsUiState/);
  assert.doesNotMatch(src, /MATERIAL_NODE_WHITELIST/);
  assert.doesNotMatch(src, /NODE_MODEL_WHITELIST/);
  assert.doesNotMatch(src, /productAllowlist/);
  assert.doesNotMatch(src, /orderTextModels/);
  assert.doesNotMatch(src, /nanobanana-2/);
  assert.doesNotMatch(src, /kling-o1/);
  assert.doesNotMatch(src, /defaults\?\.\[materialType\]/);
  assert.doesNotMatch(src, /evaluateModelCompatibility/);
  assert.doesNotMatch(src, /level === 'disabled'/);
});

test('parity：listed+compatible 与旧 whitelist 零交集时候选仍非空，且与 kernel 一致', () => {
  const catalog = createCompatTestCatalog();
  // 旧 image whitelist 与 fixture 模型 id 零交集（fixture 用 img-* / alias-*）
  const legacyImageWhitelist = [
    'nanobanana-2',
    'nano_banana_2',
    'nanobanana-pro',
    'nano_banana_pro',
    'seedream-5.0-pro',
    'seedream-4.5',
    'midjourney-8.1',
    'midjourney-7',
    'midjourney-niji-7',
    'gpt-image-2',
  ];
  const fingerprint = buildUiUpstreamFingerprint({
    prompt: 'hello',
    upstreams: [{ nodeId: 's1', materialType: 'image', mimeType: 'image/png', sizeBytes: 1024 }],
  });

  const evaluation = evaluateCatalogCompat(catalog, fingerprint, { outputType: 'image' });
  const filtered = buildFilteredModelOptions({
    catalog,
    fingerprint,
    outputType: 'image',
  });

  assert.equal(evaluation.zeroCandidates, false);
  assert.equal(filtered.zeroCandidates, false);
  assert.ok(filtered.options.length > 0, 'compatible image rows must remain listed');

  const kernelIds = evaluation.compatible.map((v) => v.modelId).sort();
  const pickerIds = filtered.options.map((o) => o.id).sort();
  assert.deepEqual(pickerIds, kernelIds, 'ConfigPanel options must parity gateway kernel set');

  for (const id of pickerIds) {
    assert.ok(
      !legacyImageWhitelist.includes(id),
      `${id} must demonstrate zero-intersection with legacy whitelist`,
    );
  }
  // 至少 img-ref / img-hd / alias-img 这类 listed+compatible 出现
  assert.ok(pickerIds.includes('img-ref') || pickerIds.includes('img-hd') || pickerIds.includes('alias-img'));
});

test('harness mock catalog 文本模型按 label A–Z', () => {
  const src = readFileSync(join(here, '../../../harness/harness.tsx'), 'utf8');
  const textBlock = src.slice(src.indexOf('text: ['), src.indexOf('image: ['));
  const labels = [...textBlock.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })));
});

test('seam capabilities 走 modelCatalog.list，不再引用 TEXT_MODEL_ORDER / SPECS', () => {
  const seamSrc = readFileSync(
    join(here, '../../../../workflow/seam/canvasCatalog.ts'),
    'utf8',
  );
  assert.match(seamSrc, /modelCatalog/);
  assert.match(seamSrc, /\.list\(/);
  assert.doesNotMatch(seamSrc, /TEXT_MODEL_ORDER/);
  assert.doesNotMatch(seamSrc, /IMAGE_MODEL_SPECS/);
  assert.doesNotMatch(seamSrc, /VIDEO_MODEL_SPECS/);
});
