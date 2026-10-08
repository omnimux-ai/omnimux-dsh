import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  verifyCrossPluginModelAlignment,
  formatCrossPluginImpactNotice,
} from './verify-cross-plugin-model-alignment.mjs';
import {
  loadCatalogDefaults,
  getContractIndex,
  resolveModelId,
} from '../plugins/omnimux/src/catalog/contract/index.js';
import { DEFAULT_MEDIA } from '../plugins/omnimux/src/media/route.js';
import { CANVAS_GENERATION_POLICY } from '../plugins/omnimux-workflow/src/shared/generationPolicy.ts';
import { ASPECT_RATIO_GEOMETRIES } from '../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/cfg/aspectRatioGeometry.ts';
import { MODEL_CHANNEL_GROUPS as HUB_CHANNEL_GROUPS } from '../plugins/omnimux/src/catalog/serving/channel-groups.js';
import { MODEL_CHANNEL_GROUPS as PICKER_CHANNEL_GROUPS } from '../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts';

const selectedGroup = (groups) => groups['gpt-image-2.5'].find((group) => group.id === 'standard');

for (const [name, mutate] of [
  ['reference image limit', (group) => { group.constraints.inputs = { image: { max: 2 } }; }],
  ['nested resolution constraint', (group) => { group.constraints.parameters.resolution.fixed = '2K'; }],
  ['removed parameter constraint', (group) => { delete group.constraints.parameters.n; }],
  ['operation eligibility', (group) => { group.constraints.operations = ['text_to_image']; }],
]) {
  test(`fails when picker channel ${name} differs from hub`, () => {
    const pickerChannelGroups = structuredClone(PICKER_CHANNEL_GROUPS);
    mutate(selectedGroup(pickerChannelGroups));
    const report = verifyCrossPluginModelAlignment({ pickerChannelGroups, changedFiles: [] });
    assert.equal(report.ok, false);
    assert.ok(report.issues.some((issue) => issue.code === 'cross_plugin_channel_field_drift'
      && issue.modelId === 'gpt-image-2.5' && issue.message.includes('constraints')),
    JSON.stringify(report.issues));
    assert.ok(report.alignment.channelGroupsChecked > 0);
  });
}

test('equal nested constraints with different object key order pass', () => {
  const pickerChannelGroups = structuredClone(PICKER_CHANNEL_GROUPS);
  const hubParameters = selectedGroup(HUB_CHANNEL_GROUPS).constraints.parameters;
  const reordered = Object.fromEntries(Object.entries(hubParameters).reverse());
  selectedGroup(pickerChannelGroups).constraints = { parameters: reordered };
  const report = verifyCrossPluginModelAlignment({ pickerChannelGroups, changedFiles: [] });
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  assert.ok(report.alignment.channelGroupsChecked > 0);
});

test('constraints absent on both sides pass; explicitly empty constraints are distinct', () => {
  const hubChannelGroups = structuredClone(HUB_CHANNEL_GROUPS);
  const pickerChannelGroups = structuredClone(PICKER_CHANNEL_GROUPS);
  delete selectedGroup(hubChannelGroups).constraints;
  delete selectedGroup(pickerChannelGroups).constraints;
  assert.equal(verifyCrossPluginModelAlignment({ hubChannelGroups, pickerChannelGroups, changedFiles: [] }).ok, true);
  selectedGroup(pickerChannelGroups).constraints = {};
  const report = verifyCrossPluginModelAlignment({ hubChannelGroups, pickerChannelGroups, changedFiles: [] });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.message.includes('constraints')));
});

test('baseline repository contracts pass cross-plugin model alignment verification', () => {
  const report = verifyCrossPluginModelAlignment();
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  assert.equal(report.exitCode, 0);
  assert.equal(report.issues.length, 0);
  // #2256: index-tts joins the canvas audio whitelist
  // #2801: gemini-3.8-flash-tts joins the canvas audio whitelist
  // #3148: seedream-5-0-pro joins the canvas image whitelist
  // #3152: seedance-2-0-fast / seedance-2-0-mini join the canvas video whitelist
  // #3167: google-vids-omni joins the canvas video whitelist
  // #3209: Google Vids 下线，该模型移出画布视频白名单 → 15−1
  assert.equal(report.alignment.whitelistModelsChecked, 14);
  assert.equal(report.alignment.defaultModelsChecked, 4);
  assert.ok(report.alignment.aspectRatiosChecked >= 8);
  // #1789: the capability seam behind audio transcription admits the two ASR contracts.
  assert.equal(report.alignment.capabilityModelsChecked, 2);
});

test('fails when a capability-seam model is not canonical in hub dispositions', () => {
  // The seam admits every listed speech model; an alias row on that seam would publish a
  // duplicate card, and a tombstone would resurrect a withdrawn model.
  const operations = [{ id: 'speech_to_text', listed: true, implementation: { seam: 'speechToText' } }];
  const index = {
    get: (id) => (id === 'seedasr-auc' ? { id, operations } : undefined),
    all: () => [{ id: 'seedasr-auc', operations }],
  };
  const report = verifyCrossPluginModelAlignment({
    index,
    dispositions: { dispositions: [{ id: 'seedasr-auc', disposition: 'alias', target: 'doubao-asr-bigmodel' }] },
    changedFiles: [],
  });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === 'cross_plugin_capability_not_canonical'), JSON.stringify(report.issues));
});

test('fails when a capability tool declares a seam no admission rule consumes', () => {
  const report = verifyCrossPluginModelAlignment({
    capabilityTools: { 'audio-transcription': 'speechToText', 'ghost-tool': 'ghostSeam' },
    capabilitySeams: ['speechToText'],
    changedFiles: [],
  });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === 'cross_plugin_capability_tool_unknown_seam'), JSON.stringify(report.issues));
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
  // 两个负例口径不同、都必须被拒：gpt-image-2-5 现在连别名都不是（2026-09-14 评审次要-2 撤销该
  // 拼写），而 grok-imagine-image-2 仍是改名后保留的线内别名。
  policy.image.allowedModelIds = ['gpt-image-2-5', 'grok-imagine-image-2'];

  const index = getContractIndex();
  assert.equal(index.get('gpt-image-2-5'), undefined);
  assert.equal(resolveModelId(index, 'gpt-image-2-5'), undefined);
  assert.equal(resolveModelId(index, 'grok-imagine-image-2'), 'grok-imagine-image-2-0');

  const report = verifyCrossPluginModelAlignment({ policy });
  assert.equal(report.ok, false);
  assert.ok(
    report.issues.some((i) => i.code === 'cross_plugin_whitelist_not_canonical' && i.modelId === 'gpt-image-2-5'),
    JSON.stringify(report.issues),
  );
  assert.ok(
    report.issues.some((i) => i.code === 'cross_plugin_whitelist_not_canonical' && i.modelId === 'grok-imagine-image-2'),
    JSON.stringify(report.issues),
  );
});

test('fails when catalog-defaults and canvas generationPolicy default models diverge', () => {
  const catalogDefaults = structuredClone(loadCatalogDefaults());
  catalogDefaults.byOperation.text_to_image = 'grok-imagine-image-2-0';

  const report = verifyCrossPluginModelAlignment({ catalogDefaults });
  assert.equal(report.ok, false);
  assert.ok(
    report.issues.some((i) => i.code === 'cross_plugin_default_mismatch'),
    JSON.stringify(report.issues),
  );
});

test('fails when media route and catalog-defaults diverge', () => {
  const mediaConfig = structuredClone(DEFAULT_MEDIA);
  mediaConfig.providers.omnimux.models.image = 'grok-imagine-image-2-0';

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

test('all channel groups pass pricing points integrity verification (Three Defenses)', async () => {
  const { execSync } = await import('node:child_process');
  assert.doesNotThrow(() => {
    execSync('node scripts/verify-pricing-points-integrity.test.mjs', { stdio: 'pipe' });
  });
});

