import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describeVideoAnalyzeModelFailure,
  resolveVideoAnalyzeModel,
  selectVideoAnalyzeModel,
} from './analyzeModel.ts';

/** One text row with an explicit modality list. */
function row(id, modalities, executionStatus = 'ready') {
  return { id, executionStatus, inputCapability: { modalities } };
}

test('picks a ready row that declares video input', () => {
  const catalog = {
    text: [row('text-only', ['text']), row('vision', ['text', 'image', 'video'])],
    defaults: { analysis: 'text-only' },
  };
  assert.deepEqual(selectVideoAnalyzeModel(catalog), {
    ok: true,
    modelId: 'vision',
    source: 'video-modality',
    reason: '',
  });
});

test('honours the gateway analysis default when that row also accepts video', () => {
  const catalog = {
    text: [row('first-vision', ['text', 'video']), row('recommended', ['text', 'video'])],
    defaults: { analysis: 'recommended' },
  };
  const result = selectVideoAnalyzeModel(catalog);
  assert.equal(result.modelId, 'recommended');
  assert.equal(result.source, 'video-modality');
});

test('falls back to the analysis default when no row declares video', () => {
  const catalog = {
    text: [row('text-only', ['text'])],
    defaults: { analysis: 'text-only' },
  };
  assert.deepEqual(selectVideoAnalyzeModel(catalog), {
    ok: true,
    modelId: 'text-only',
    source: 'analysis-default',
    reason: '',
  });
});

test('refuses an unverified row even when it declares video', () => {
  const catalog = {
    text: [row('unverified-vision', ['text', 'video'], 'unverified'), row('ready-vision', ['text', 'video'])],
    defaults: {},
  };
  const result = selectVideoAnalyzeModel(catalog);
  assert.equal(result.modelId, 'ready-vision');
});

test('fails with no-video-model when every ready row is text-only and nothing is recommended', () => {
  const catalog = { text: [row('text-only', ['text'])], defaults: {} };
  assert.deepEqual(selectVideoAnalyzeModel(catalog), {
    ok: false,
    modelId: '',
    source: '',
    reason: 'no-video-model',
  });
});

test('fails with catalog-unavailable when there are no text rows at all', () => {
  assert.equal(selectVideoAnalyzeModel({ text: [], models: [] }).reason, 'catalog-unavailable');
  assert.equal(selectVideoAnalyzeModel(null).reason, 'catalog-unavailable');
  assert.equal(selectVideoAnalyzeModel(undefined).reason, 'catalog-unavailable');
});

test('reads text-output rows out of the flat models directory when the text bucket is empty', () => {
  const catalog = {
    models: [
      {
        id: 'image-model',
        operations: [{ id: 'text_to_image', output: { type: 'image' } }],
        inputCapability: { modalities: ['text', 'image', 'video'] },
      },
      {
        id: 'chat-model',
        operations: [{ id: 'chat', output: { type: 'text' } }],
        inputCapability: { modalities: ['text', 'video'] },
      },
    ],
    defaults: {},
  };
  const result = selectVideoAnalyzeModel(catalog);
  assert.equal(result.modelId, 'chat-model');
});

test('resolveVideoAnalyzeModel reads through the modelCatalog seam', () => {
  const getSeam = (name) => {
    if (name !== 'modelCatalog') return undefined;
    return { list: () => ({ text: [row('vision', ['text', 'video'])], defaults: {} }) };
  };
  assert.equal(resolveVideoAnalyzeModel(getSeam).modelId, 'vision');
});

test('resolveVideoAnalyzeModel reports catalog-unavailable when the seam is missing or throws', () => {
  assert.equal(resolveVideoAnalyzeModel().reason, 'catalog-unavailable');
  assert.equal(resolveVideoAnalyzeModel(() => undefined).reason, 'catalog-unavailable');
  assert.equal(
    resolveVideoAnalyzeModel(() => {
      throw new Error('seam boom');
    }).reason,
    'catalog-unavailable',
  );
  assert.equal(
    resolveVideoAnalyzeModel(() => ({
      list: () => {
        throw new Error('list boom');
      },
    })).reason,
    'catalog-unavailable',
  );
});

test('describeVideoAnalyzeModelFailure names an actionable fix for each reason', () => {
  assert.match(
    describeVideoAnalyzeModelFailure({ ok: false, modelId: '', source: '', reason: 'no-video-model' }),
    /支持视频输入的文本模型/,
  );
  assert.match(
    describeVideoAnalyzeModelFailure({ ok: false, modelId: '', source: '', reason: 'catalog-unavailable' }),
    /同步模型目录/,
  );
});