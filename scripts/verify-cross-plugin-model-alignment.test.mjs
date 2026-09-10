import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  verifyCrossPluginModelAlignment,
  formatCrossPluginImpactNotice,
} from './verify-cross-plugin-model-alignment.mjs';
import {
  loadCatalogDefaults,
} from '../plugins/omnimux/src/catalog/contract/index.js';
import { DEFAULT_MEDIA } from '../plugins/omnimux/src/media/route.js';
import { CANVAS_GENERATION_POLICY } from '../plugins/omnimux-workflow/src/shared/generationPolicy.ts';
import { ASPECT_RATIO_GEOMETRIES } from '../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/cfg/aspectRatioGeometry.ts';

test('baseline repository contracts pass cross-plugin model alignment verification', () => {
  const report = verifyCrossPluginModelAlignment();
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  assert.equal(report.exitCode, 0);
  assert.equal(report.issues.length, 0);
  assert.equal(report.alignment.whitelistModelsChecked, 19);
  assert.equal(report.alignment.defaultModelsChecked, 4);
  assert.ok(report.alignment.aspectRatiosChecked >= 8);
});

test('fails when a canvas default model is unlisted in hub specs', () => {
  const policy = structuredClone(CANVAS_GENERATION_POLICY);
  // Set defaultModelId to unlisted model suno
  policy.audio.defaultModelId = 'suno';

  const report = verifyCrossPluginModelAlignment({ policy });
  assert.equal(report.ok, false);
  assert.equal(report.exitCode, 1);
  assert.ok(
    report.issues.some((i) => i.code === 'cross_plugin_default_model_unlisted' && i.modelId === 'suno'),
    JSON.stringify(report.issues),
  );
});

test('fails when a canvas whitelist model is unlisted without manifest exemption', () => {
  const policy = structuredClone(CANVAS_GENERATION_POLICY);
  // Add canonical seed-audio-1.0 to image allowedModelIds (not listed for image modality)
  policy.image.allowedModelIds = [...policy.image.allowedModelIds, 'seed-audio-1.0'];

  const report = verifyCrossPluginModelAlignment({ policy });
  assert.equal(report.ok, false);
  assert.equal(report.exitCode, 1);
  assert.ok(
    report.issues.some((i) => i.code === 'cross_plugin_whitelist_unlisted' && i.modelId === 'seed-audio-1.0'),
    JSON.stringify(report.issues),
  );
});

test('fails when a canvas model is not canonical (alias or unknown)', () => {
  const policy = structuredClone(CANVAS_GENERATION_POLICY);
  // Use wire alias gpt-image-2-5 instead of canonical gpt-image-2.5
  policy.image.allowedModelIds = ['gpt-image-2-5', 'grok-imagine-image-2', 'gpt-image-2'];

  const report = verifyCrossPluginModelAlignment({ policy });
  assert.equal(report.ok, false);
  assert.ok(
    report.issues.some((i) => i.code === 'cross_plugin_whitelist_not_canonical' && i.modelId === 'gpt-image-2-5'),
    JSON.stringify(report.issues),
  );
});

test('fails when catalog-defaults and canvas generationPolicy default models diverge', () => {
  const catalogDefaults = structuredClone(loadCatalogDefaults());
  catalogDefaults.byOperation.text_to_image = 'grok-imagine-image-2';

  const report = verifyCrossPluginModelAlignment({ catalogDefaults });
  assert.equal(report.ok, false);
  assert.ok(
    report.issues.some((i) => i.code === 'cross_plugin_default_mismatch'),
    JSON.stringify(report.issues),
  );
});

test('fails when media route and catalog-defaults diverge', () => {
  const mediaConfig = structuredClone(DEFAULT_MEDIA);
  mediaConfig.providers.omnimux.models.image = 'grok-imagine-image-2';

  const report = verifyCrossPluginModelAlignment({ mediaConfig });
  assert.equal(report.ok, false);
  assert.ok(
    report.issues.some((i) => i.code === 'cross_plugin_media_route_mismatch'),
    JSON.stringify(report.issues),
  );
});

test('fails when listed model declares an aspect ratio without SVG geometry in canvas', () => {
  const geometries = { ...ASPECT_RATIO_GEOMETRIES };
  delete geometries['16:9'];

  const report = verifyCrossPluginModelAlignment({ aspectRatioGeometries: geometries });
  assert.equal(report.ok, false);
  assert.ok(
    report.issues.some((i) => i.code === 'cross_plugin_aspect_ratio_geometry_missing'),
    JSON.stringify(report.issues),
  );
});

test('formatCrossPluginImpactNotice produces readable actionable guidance', () => {
  const notice = formatCrossPluginImpactNotice(['plugins/omnimux/src/catalog/specs/image-models.yaml']);
  assert.ok(notice.includes('MODEL CHANGE DETECTED'));
  assert.ok(notice.includes('image-models.yaml'));
  assert.ok(notice.includes('generationPolicy.ts'));
  assert.ok(notice.includes('aspectRatioGeometry.ts'));
  assert.ok(notice.includes('catalog-defaults.json'));
});

test('strict model-contract CLI combines cross-plugin failure in report issues', async () => {
  const { runVerify } = await import('./verify-model-contracts.mjs');
  const fakeCrossPlugin = () => ({
    ok: false,
    exitCode: 1,
    source: 'cross-plugin-model-alignment',
    issues: [{ level: 'error', code: 'cross_plugin_test_fail', message: 'test failure' }],
    notice: null,
    alignment: { whitelistModelsChecked: 0, defaultModelsChecked: 0, aspectRatiosChecked: 0 },
  });
  const original = process.stdout.write;
  process.stdout.write = () => true;
  try {
    const report = await runVerify(
      { mode: 'strict', strict: true, json: true },
      {
        verifyContracts: () => ({ ok: true, exitCode: 0, mode: 'strict', issues: [] }),
        verifyAutoServing: () => ({ ok: true, exitCode: 0, issues: [] }),
        verifyCrossPluginModelAlignment: fakeCrossPlugin,
      },
    );
    assert.equal(report.exitCode, 1);
    assert.equal(report.ok, false);
    assert.ok(report.issues.some((i) => i.code === 'cross_plugin_test_fail'));
  } finally {
    process.stdout.write = original;
  }
});

