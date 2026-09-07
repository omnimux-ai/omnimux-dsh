/**
 * Issue #467 / W2 — contract-driven operation UI + filtered model list.
 *
 * Covers:
 *   - effectiveOps 0/1/2+ visibility + blockGenerate
 *   - filtered models: incompatible / unlisted never enter the option list
 *   - Whisper-not-listed stays hidden; ASR zero-candidate empty state
 *   - params.operation is the sole operation contract
 *   - unknown media metadata stays null/undefined (never 0 / octet-stream)
 *   - image / video / audio / text each have at least one path
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCompatTestCatalog } from './compatTestCatalog.ts';
import {
  buildEffectiveOpsUiState,
  buildFilteredModelOptions,
  buildUiUpstreamFingerprint,
  isZeroCandidateEmptyState,
  setParamsOperation,
  readPreferredOperationId,
  resolveTriggerModeText,
  shouldRenderModeUi,
  assetFromUpstreamSnapshot,
  readOptionalMediaNumber,
  readOptionalMime,
} from './operationUi.ts';

const catalog = createCompatTestCatalog();

function fp(upstreams = [], prompt = 'hello') {
  return buildUiUpstreamFingerprint({ prompt, upstreams });
}

function urlRequiredCatalog() {
  return {
    source: 'omnimux',
    text: [], image: [], audio: [],
    video: [{ id: 'url-video', label: 'URL Video' }],
    models: [{
      id: 'url-video',
      label: 'URL Video',
      operations: [
        {
          id: 'document_to_video', label: '文档参考生视频', listed: true, output: { type: 'video' }, inputs: [
            { slot: 'file_url', type: 'document', role: 'document', source: 'node_field', min: 1, max: 1 },
          ],
        },
        {
          id: 'webpage_to_video', label: '网页参考生视频', listed: true, output: { type: 'video' }, inputs: [
            { slot: 'link_url', type: 'document', role: 'webpage', source: 'node_field', min: 1, max: 1 },
          ],
        },
      ],
    }],
  };
}

describe('effectiveOps UI state (0 / 1 / ≥2)', () => {
  it('0 effective ops → hide mode UI + block generate + typed reason', () => {
    // img-prompt-only cannot absorb a reference image.
    const state = buildEffectiveOpsUiState({
      catalog,
      modelId: 'img-prompt-only',
      fingerprint: fp([{ nodeId: 's1', materialType: 'image', mimeType: 'image/png', sizeBytes: 1024 }]),
      outputType: 'image',
    });
    assert.equal(state.count, 0);
    assert.equal(state.visibility, 'hidden');
    assert.equal(state.blockGenerate, true);
    assert.equal(shouldRenderModeUi(state), false);
    assert.ok(state.reasonCode);
    assert.ok(state.reasonMessage);
  });

  it('1 effective op → hide mode UI, implicit sole operation, allow generate', () => {
    // No media upstream → text_to_image is the sole effective op for img-prompt-only.
    const state = buildEffectiveOpsUiState({
      catalog,
      modelId: 'img-prompt-only',
      fingerprint: fp([]),
      outputType: 'image',
    });
    assert.equal(state.count, 1);
    assert.equal(state.visibility, 'hidden');
    assert.equal(state.blockGenerate, false);
    assert.equal(shouldRenderModeUi(state), false);
    assert.equal(state.implicitOperationId, 'text_to_image');
    assert.equal(state.selectedOperationId, 'text_to_image');
    assert.equal(resolveTriggerModeText(state), '');
  });

  it('≥2 effective ops → selector visibility, only effective ids, mode text from label', () => {
    // img-ref with no media: text_to_image is effective; image_to_image needs min=1 so not effective.
    // With one reference image both text_to_image? no — text_to_image has no image slot so
    // a media asset makes it reject; image_to_image accepts. Still 1.
    // Force ≥2 by using vid-frames with no media: text_to_video only (first_last needs frames).
    // Build a catalog-local multi-op by evaluating img-ref without media:
    const noMedia = buildEffectiveOpsUiState({
      catalog,
      modelId: 'img-ref',
      fingerprint: fp([]),
      outputType: 'image',
    });
    // img-ref listed ops that accept empty media: text_to_image (image_to_image min=1 pending but accepts?).
    // matchOperationInputs: min unsatisfied → accepts=true, ready=false. So both accept.
    assert.ok(noMedia.count >= 2, `expected ≥2 effective ops, got ${noMedia.count}`);
    assert.equal(noMedia.visibility, 'selector');
    assert.equal(shouldRenderModeUi(noMedia), true);
    assert.equal(noMedia.blockGenerate, false);
    for (const op of noMedia.effectiveOps) {
      assert.equal(typeof op.id, 'string');
      assert.ok(op.id.length > 0);
      assert.equal(typeof op.label, 'string');
      assert.equal(op.effective, true);
    }
    const modeText = resolveTriggerModeText(noMedia, noMedia.selectedOperationId);
    assert.ok(modeText.length > 0);
  });

  it('unknown future operation id does not crash (open string)', () => {
    const state = buildEffectiveOpsUiState({
      catalog,
      modelId: 'img-ref',
      fingerprint: fp([]),
      preferredOperationId: 'future_unknown_op_xyz',
      outputType: 'image',
    });
    // Unknown ids remain open strings, but a persisted value is no longer
    // silently replaced by an implicit operation.
    assert.ok(state.count >= 1);
    assert.equal(state.selectedOperationId, 'future_unknown_op_xyz');
    assert.equal(state.blockGenerate, true);
    assert.equal(state.reasonCode, 'operation_incompatible');
  });

  it('selected URL operation blocks generate until its required node field is valid', () => {
    const urlCatalog = urlRequiredCatalog();
    const documentMissing = buildEffectiveOpsUiState({
      catalog: urlCatalog,
      modelId: 'url-video',
      fingerprint: buildUiUpstreamFingerprint({ prompt: '生成视频', nodeFields: { operation: 'document_to_video' } }),
      preferredOperationId: 'document_to_video',
      outputType: 'video',
    });
    assert.equal(documentMissing.blockGenerate, true);
    assert.equal(documentMissing.reasonCode, 'metadata_required');

    const webpageMissing = buildEffectiveOpsUiState({
      catalog: urlCatalog,
      modelId: 'url-video',
      fingerprint: buildUiUpstreamFingerprint({ prompt: '生成视频', nodeFields: { operation: 'webpage_to_video' } }),
      preferredOperationId: 'webpage_to_video',
      outputType: 'video',
    });
    assert.equal(webpageMissing.blockGenerate, true);
    assert.equal(webpageMissing.reasonCode, 'metadata_required');

    const documentReady = buildEffectiveOpsUiState({
      catalog: urlCatalog,
      modelId: 'url-video',
      fingerprint: buildUiUpstreamFingerprint({
        prompt: '生成视频',
        nodeFields: { operation: 'document_to_video', fileUrl: 'https://cdn.example.com/deck.pdf' },
      }),
      preferredOperationId: 'document_to_video',
      outputType: 'video',
    });
    assert.equal(documentReady.blockGenerate, false);
  });
});

describe('filtered model list (Hide, Don\'t Grey)', () => {
  it('only compatible models appear; incompatible / unlisted stay out', () => {
    const result = buildFilteredModelOptions({
      catalog,
      fingerprint: fp([{ nodeId: 's1', materialType: 'image', mimeType: 'image/png', sizeBytes: 1024 }]),
      outputType: 'image',
    });
    assert.equal(result.catalogAvailable, true);
    assert.equal(result.zeroCandidates, false);
    const ids = result.options.map((o) => o.id);
    // img-prompt-only cannot absorb image → hidden
    assert.ok(!ids.includes('img-prompt-only'));
    // unlisted-model has zero listed ops → hidden
    assert.ok(!ids.includes('unlisted-model'));
    // img-ref / img-hd / alias-img can absorb → present
    assert.ok(ids.includes('img-ref'));
    assert.ok(ids.includes('img-hd') || ids.includes('alias-img'));
    // No disabled flag concept — options are the DOM set.
    for (const opt of result.options) {
      assert.equal(opt.verdict.acceptsCurrentInputs, true);
    }
  });

  it('video node filters to video-output models only', () => {
    const result = buildFilteredModelOptions({
      catalog,
      fingerprint: fp([]),
      outputType: 'video',
    });
    const ids = result.options.map((o) => o.id);
    assert.deepEqual(ids, ['vid-frames', 'vid-endframe']);
    assert.ok(!ids.includes('img-ref'));
    assert.ok(!ids.includes('aud-tts'));
  });

  it('audio node filters to audio-output models', () => {
    const result = buildFilteredModelOptions({
      catalog,
      fingerprint: fp([]),
      outputType: 'audio',
    });
    const ids = result.options.map((o) => o.id);
    assert.deepEqual(ids, ['aud-tts']);
  });

  it('text node with empty catalog bucket still evaluates models[] by outputType', () => {
    const result = buildFilteredModelOptions({
      catalog,
      fingerprint: fp([]),
      outputType: 'text',
    });
    // Fixture has no text-output listed ops → zero candidates empty state.
    assert.equal(result.zeroCandidates, true);
    assert.equal(isZeroCandidateEmptyState(result), true);
    assert.equal(result.options.length, 0);
  });

  it('Whisper / speech_to_text stays hidden when not listed', () => {
    // Inject an unlisted whisper row into a cloned catalog.
    const withWhisper = {
      ...catalog,
      models: [
        ...(catalog.models ?? []),
        {
          id: 'whisper-1',
          label: 'Whisper',
          family: 'openai',
          operations: [
            {
              id: 'speech_to_text',
              label: '语音转写',
              output: { type: 'text' },
              inputs: [
                {
                  slot: 'audio',
                  type: 'audio',
                  role: 'source',
                  source: 'upstream_edge',
                  min: 1,
                  max: 1,
                  allowedMimes: ['audio/mpeg', 'audio/wav'],
                },
              ],
              listed: false,
              research: { status: 'draft' },
              execution: { status: 'none' },
            },
          ],
          listed: false,
          listedOperations: [],
        },
      ],
      text: [...(catalog.text ?? []), { id: 'whisper-1', label: 'Whisper' }],
    };
    const result = buildFilteredModelOptions({
      catalog: withWhisper,
      fingerprint: fp([
        { nodeId: 'a1', materialType: 'audio', mimeType: 'audio/mpeg', sizeBytes: 2048 },
      ]),
      outputType: 'text',
    });
    const ids = result.options.map((o) => o.id);
    assert.ok(!ids.includes('whisper-1'), 'unlisted Whisper must not enter DOM');
    assert.equal(result.zeroCandidates, true);
  });

  it('picker options parity with evaluateCatalogCompat compatible set (connection gate)', async () => {
    const { evaluateCatalogCompat } = await import('./compatKernel.ts');
    const fingerprint = fp([
      { nodeId: 's1', materialType: 'image', mimeType: 'image/png', sizeBytes: 1024 },
    ]);
    const evaluation = evaluateCatalogCompat(catalog, fingerprint, { outputType: 'image' });
    const picker = buildFilteredModelOptions({ catalog, fingerprint, outputType: 'image' });
    assert.equal(evaluation.zeroCandidates, false);
    assert.equal(picker.zeroCandidates, false);
    assert.deepEqual(
      picker.options.map((o) => o.id).sort(),
      evaluation.compatible.map((v) => v.modelId).sort(),
    );
  });

  it('image node with connected image material keeps image models available even when catalog models only list text_to_image', () => {
    // Production catalog scenario: image models only list text_to_image (multi_reference is draft/unlisted).
    const prodCatalog = {
      source: 'static-stub',
      defaults: { image: 'nanobanana-2' },
      image: [
        { id: 'nanobanana-2', label: 'NanoBanana 2', family: 'nanobanana' },
        { id: 'gpt-image-2', label: 'GPT Image 2', family: 'openai' },
        { id: 'midjourney', label: 'Midjourney', family: 'midjourney' },
      ],
      models: [
        {
          id: 'nanobanana-2',
          label: 'NanoBanana 2',
          family: 'nanobanana',
          operations: [
            { id: 'text_to_image', listed: true, output: { type: 'image' }, inputs: [] },
          ],
        },
        {
          id: 'gpt-image-2',
          label: 'GPT Image 2',
          family: 'openai',
          operations: [
            { id: 'text_to_image', listed: true, output: { type: 'image' }, inputs: [] },
          ],
        },
        {
          id: 'midjourney',
          label: 'Midjourney',
          family: 'midjourney',
          operations: [
            { id: 'text_to_image', listed: true, output: { type: 'image' }, inputs: [] },
          ],
        },
      ],
    };

    const fingerprint = fp([
      { nodeId: 'upstream-image', materialType: 'image', mimeType: 'image/png', sizeBytes: 2048 },
    ]);

    const result = buildFilteredModelOptions({
      catalog: prodCatalog,
      fingerprint,
      outputType: 'image',
    });

    assert.equal(result.catalogAvailable, true);
    assert.equal(result.zeroCandidates, false, 'zeroCandidates must be false to avoid "no compatible model" false positive');
    const ids = result.options.map((o) => o.id);
    assert.ok(ids.includes('nanobanana-2'), 'NanoBanana 2 should be present');
    assert.ok(ids.includes('gpt-image-2'), 'GPT Image 2 should be present');
    assert.ok(ids.includes('midjourney'), 'Midjourney should be present');
    for (const opt of result.options) {
      assert.equal(opt.verdict.acceptsCurrentInputs, true);
    }
  });

  it('audio node surfaces listed TTS models even when the kernel yields zero candidates (Issue #746)', () => {
    // Production scenario: seed-audio-1.0 is listed with text_to_speech, but the
    // current fingerprint (e.g. an audio upstream the TTS op cannot absorb) makes
    // the kernel reject everything. The picker must still show the legal audio
    // models instead of crying "暂无兼容模型".
    const prodCatalog = {
      source: 'static-stub',
      defaults: { audio: 'seed-audio-1.0' },
      audio: [
        { id: 'seed-audio-1.0', label: 'Seed Audio 1.0', family: 'seed' },
        { id: 'suno', label: 'Suno', family: 'suno' },
      ],
      models: [
        {
          id: 'seed-audio-1.0',
          label: 'Seed Audio 1.0',
          family: 'seed',
          operations: [
            { id: 'text_to_speech', listed: true, output: { type: 'audio' }, inputs: [
              { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 },
            ] },
          ],
        },
        {
          id: 'suno',
          label: 'Suno',
          family: 'suno',
          operations: [
            { id: 'text_to_music', listed: true, output: { type: 'audio' }, inputs: [] },
          ],
        },
      ],
    };

    const fingerprint = fp([
      { nodeId: 'upstream-audio', materialType: 'audio', mimeType: 'audio/mpeg', sizeBytes: 2048 },
    ]);

    const result = buildFilteredModelOptions({
      catalog: prodCatalog,
      fingerprint,
      outputType: 'audio',
    });

    assert.equal(result.catalogAvailable, true);
    assert.equal(result.zeroCandidates, false, 'zeroCandidates must be false to avoid "no compatible model" false positive');
    const ids = result.options.map((o) => o.id);
    assert.ok(ids.includes('seed-audio-1.0'), 'seed-audio-1.0 should be present');
    assert.ok(ids.includes('suno'), 'Suno should be present');
    for (const opt of result.options) {
      assert.equal(opt.verdict.acceptsCurrentInputs, true);
    }
  });
});

describe('canonical preferred operation', () => {
  it('reads only params.operation', () => {
    assert.equal(readPreferredOperationId({ operation: 'first_last_frame' }), 'first_last_frame');
    assert.equal(readPreferredOperationId({}), undefined);
  });

  it('setParamsOperation writes an explicit canonical operation id', () => {
    const next = setParamsOperation(
      { model: 'vid-frames', aspectRatio: '16:9' },
      'first_last_frame',
    );
    assert.equal(next.operation, 'first_last_frame');
    assert.equal(next.aspectRatio, '16:9');
  });
});

describe('media metadata unknown semantics', () => {
  it('readOptionalMediaNumber never invents 0 from null/undefined/NaN', () => {
    assert.equal(readOptionalMediaNumber(null), undefined);
    assert.equal(readOptionalMediaNumber(undefined), undefined);
    assert.equal(readOptionalMediaNumber(Number.NaN), undefined);
    assert.equal(readOptionalMediaNumber('nope'), undefined);
    assert.equal(readOptionalMediaNumber(0), 0); // measured zero is kept
    assert.equal(readOptionalMediaNumber(12.5), 12.5);
  });

  it('readOptionalMime rejects unknown / octet-stream / empty', () => {
    assert.equal(readOptionalMime(null), undefined);
    assert.equal(readOptionalMime(''), undefined);
    assert.equal(readOptionalMime('unknown'), undefined);
    assert.equal(readOptionalMime('application/octet-stream'), undefined);
    assert.equal(readOptionalMime('image/png'), 'image/png');
  });

  it('assetFromUpstreamSnapshot omits unknown fields (no 0 / no catch-all MIME)', () => {
    const asset = assetFromUpstreamSnapshot({
      nodeId: 'n1',
      materialType: 'video',
      mimeType: 'unknown',
      sizeBytes: null,
      durationSec: undefined,
    });
    assert.equal(asset.sourceNodeId, 'n1');
    assert.equal(asset.type, 'video');
    assert.equal('mimeType' in asset, false);
    assert.equal('sizeBytes' in asset, false);
    assert.equal('durationSec' in asset, false);
  });
});

describe('catalog missing / fail-closed', () => {
  it('null catalog → block generate + catalog_unavailable', () => {
    const state = buildEffectiveOpsUiState({
      catalog: null,
      modelId: 'img-ref',
      fingerprint: fp([]),
    });
    assert.equal(state.blockGenerate, true);
    assert.equal(state.reasonCode, 'catalog_unavailable');
    const models = buildFilteredModelOptions({ catalog: null, fingerprint: fp([]) });
    assert.equal(models.catalogAvailable, false);
    assert.equal(models.zeroCandidates, true);
  });

  it('catalog ready but no selected model → model_unselected', () => {
    const state = buildEffectiveOpsUiState({
      catalog,
      modelId: '',
      fingerprint: fp([]),
      outputType: 'video',
    });
    assert.equal(state.blockGenerate, true);
    assert.equal(state.reasonCode, 'model_unselected');
    assert.equal(state.reasonMessage, '请先选择模型');
  });
});

describe('video operation selection gate', () => {
  const multiVideoCatalog = {
    source: 'omnimux', text: [], image: [], audio: [], video: [],
    models: [{
      id: 'multi-video', label: 'Multi video', listed: true,
      operations: [
        { id: 'text_to_video', label: 'Text', listed: true, output: { type: 'video' }, inputs: [] },
        { id: 'video_edit', label: 'Edit', listed: true, output: { type: 'video' }, inputs: [] },
      ],
    }],
  };

  it('requires an explicit persisted choice only when video has multiple effective operations', () => {
    const state = buildEffectiveOpsUiState({
      catalog: multiVideoCatalog,
      modelId: 'multi-video',
      fingerprint: fp([]),
      outputType: 'video',
      });
    assert.equal(state.count, 2);
    assert.equal(state.visibility, 'selector');
    assert.equal(state.selectedOperationId, undefined);
    assert.equal(state.blockGenerate, true);
    assert.equal(state.reasonCode, 'operation_incompatible');
    assert.equal(state.reasonMessage, '请选择生成方式');
  });

  it('allows a listed effective video choice and blocks a stale one', () => {
    const ready = buildEffectiveOpsUiState({
      catalog: multiVideoCatalog,
      modelId: 'multi-video',
      fingerprint: fp([]),
      outputType: 'video',
        preferredOperationId: 'video_edit',
    });
    assert.equal(ready.selectedOperationId, 'video_edit');
    assert.equal(ready.blockGenerate, false);

    const stale = buildEffectiveOpsUiState({
      catalog: multiVideoCatalog,
      modelId: 'multi-video',
      fingerprint: fp([]),
      outputType: 'video',
        preferredOperationId: 'removed_operation',
    });
    assert.equal(stale.selectedOperationId, 'removed_operation');
    assert.equal(stale.blockGenerate, true);
    assert.equal(stale.reasonCode, 'operation_incompatible');
  });
});


describe('generation-node mode presentation', () => {
  function multimodeCatalog(outputType) {
    const prompt = { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 };
    return {
      source: 'omnimux', text: [], image: [], video: [], audio: [],
      models: [{
        id: 'multi', label: 'Multi', listed: true,
        operations: [
          { id: 'with_image', label: 'With image', listed: true, output: { type: outputType }, inputs: [prompt,
            { slot: 'images', type: 'image', role: 'reference', source: 'upstream_edge', min: 1, max: 4 },
          ] },
          { id: 'text_only', label: 'Text only', listed: true, output: { type: outputType }, inputs: [prompt] },
        ],
      }],
    };
  }

  it('text hides multiple modes and picks the ready operation over an empty image mode', () => {
    const state = buildEffectiveOpsUiState({ catalog: multimodeCatalog('text'), modelId: 'multi', fingerprint: fp(), outputType: 'text' });
    assert.equal(state.count, 2);
    assert.equal(shouldRenderModeUi(state), false);
    assert.equal(state.selectedOperationId, 'text_only');
    assert.equal(state.blockGenerate, false);
    assert.equal(resolveTriggerModeText(state), '');
  });

  it('text replaces a persisted text-only operation after an image is connected', () => {
    const state = buildEffectiveOpsUiState({
      catalog: multimodeCatalog('text'), modelId: 'multi', outputType: 'text', preferredOperationId: 'text_only',
      fingerprint: fp([{ nodeId: 'image', materialType: 'image' }]),
    });
    assert.equal(state.selectedOperationId, 'with_image');
    assert.equal(state.blockGenerate, false);
    assert.equal(shouldRenderModeUi(state), false);
  });

  it('image and audio only expose multiple effective operations declared by their selected model', () => {
    for (const outputType of ['image', 'audio']) {
      const multi = multimodeCatalog(outputType);
      const state = buildEffectiveOpsUiState({ catalog: multi, modelId: 'multi', fingerprint: fp(), outputType });
      assert.equal(shouldRenderModeUi(state), true);
      multi.models[0].operations = multi.models[0].operations.slice(1);
      const single = buildEffectiveOpsUiState({ catalog: multi, modelId: 'multi', fingerprint: fp(), outputType });
      assert.equal(shouldRenderModeUi(single), false);
    }
  });

  it('upstream text and local instructions both participate in prompt readiness', () => {
    const upstreams = [{ nodeId: 'source', materialType: 'text', textContent: 'Upstream text' }];
    for (const input of [
      { prompt: '', upstreams },
      { prompt: '', content: 'Saved content' },
    ]) {
      const fingerprint = buildUiUpstreamFingerprint(input);
      const state = buildEffectiveOpsUiState({ catalog: multimodeCatalog('text'), modelId: 'multi', fingerprint, outputType: 'text' });
      assert.equal(state.blockGenerate, false);
    }
    assert.equal(buildUiUpstreamFingerprint({ prompt: 'Explicit', content: 'Saved', upstreams }).prompt, '来源 1：\nUpstream text\n\n补充要求：\nExplicit');
    assert.equal(buildUiUpstreamFingerprint({ prompt: '', content: 'Saved', upstreams }).prompt, '来源 1：\nUpstream text\n\n补充要求：\nSaved');
  });

  it('empty text keeps a typed input reason without inventing readiness', () => {
    const text = multimodeCatalog('text');
    text.models[0].operations = text.models[0].operations.slice(1);
    const state = buildEffectiveOpsUiState({ catalog: text, modelId: 'multi', fingerprint: fp([], ''), outputType: 'text' });
    assert.equal(state.blockGenerate, true);
    assert.equal(state.reasonCode, 'prompt_required');
    assert.equal(state.reason.code, 'prompt_required');
    assert.equal(shouldRenderModeUi(state), false);
  });
});
