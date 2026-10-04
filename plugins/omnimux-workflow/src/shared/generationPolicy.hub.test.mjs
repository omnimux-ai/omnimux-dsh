import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildModelCatalog } from '../../../omnimux/src/catalog/list.js';
import { readCanvasCatalog } from '../workflow/seam/canvasCatalog.ts';
import { projectCanvasCatalog } from './generationPolicy.ts';
import { buildFilteredModelOptions, isZeroCandidateEmptyState } from './validation/operationUi.ts';
import { buildUpstreamFingerprint, planAutoAdaptation } from './validation/compatKernel.ts';

test('host catalog bridge preserves authoritative default operations and nested contract data', () => {
  const hub = buildModelCatalog({ env: {} });
  const canvas = readCanvasCatalog(name => name === 'modelCatalog' ? { list: () => hub } : undefined);
  assert.deepEqual(canvas.defaultOperations, hub.defaultOperations);
  for (const model of canvas.models) {
    const original = hub.models.find(row => row.id === model.id);
    assert.deepEqual(model.operations, original.operations.filter(op => op.listed === true));
    assert.ok(model.operations.every(op => op.listed === true), 'curation must not admit drafts');
    assert.deepEqual(model.routing, original.routing);
    assert.deepEqual(model.channelGroups, original.channelGroups);
  }
  assert.equal(canvas.fingerprint, projectCanvasCatalog(hub).fingerprint);
  assert.ok(canvas.fingerprint.startsWith(`${hub.fingerprint}:canvas:`));
});

test('readCanvasCatalog passes the hub preview_fingerprint through verbatim (#3058)', () => {
  const hub = buildModelCatalog({ env: {} });
  assert.match(hub.preview_fingerprint, /^[0-9a-f]{64}$/);
  const canvas = readCanvasCatalog(name => name === 'modelCatalog' ? { list: () => hub } : undefined);
  // The preview hash is a raw mapping hash, not a canvas-curated fingerprint.
  assert.equal(canvas.preview_fingerprint, hub.preview_fingerprint);
  assert.ok(!canvas.preview_fingerprint.includes(':canvas:'));
  // The public capabilities seam carries the same value through the spread projection.
  const projected = projectCanvasCatalog({ ...hub });
  assert.equal(projected.preview_fingerprint, hub.preview_fingerprint);
});

test('readCanvasCatalog tolerates catalogs without preview_fingerprint (old hub / static stubs)', () => {
  const hub = buildModelCatalog({ env: {} });
  const stripped = { ...hub };
  delete stripped.preview_fingerprint;
  const canvas = readCanvasCatalog(name => name === 'modelCatalog' ? { list: () => stripped } : undefined);
  assert.equal(canvas.preview_fingerprint, undefined);
  const stub = readCanvasCatalog(() => undefined);
  assert.equal(stub.source, 'static-stub');
  assert.equal(stub.preview_fingerprint, undefined);
  // Non-string values are never forwarded as a fingerprint.
  const weird = readCanvasCatalog(name => name === 'modelCatalog' ? { list: () => ({ ...hub, preview_fingerprint: null }) } : undefined);
  assert.equal(weird.preview_fingerprint, undefined);
});

test('real Hub catalog exposes the curated text models and selects Gemini 3.8 for video', () => {
  const catalog = projectCanvasCatalog(buildModelCatalog({ env: {} }));
  assert.deepEqual(catalog.text.map((row) => row.id), ['gemini-3.8-flash']);
  assert.equal(catalog.defaults.text, 'gemini-3.8-flash');
  const select = (assets = [], currentModelId) => planAutoAdaptation({ catalog, outputType: 'text', currentModelId,
    fingerprint: buildUpstreamFingerprint({ prompt: 'analyze', assets }) });
  assert.equal(select().modelId, 'gemini-3.8-flash');
  const pick = select([{ sourceNodeId: 'video', type: 'video', mimeType: 'video/mp4', sizeBytes: 1024 }], 'gemini-3.8-flash');
  assert.equal(pick.modelId, 'gemini-3.8-flash');
  assert.equal(pick.operationId, 'vision_chat');
  assert.equal(catalog.models.find((row) => row.id === pick.modelId).operations.find((op) => op.id === pick.operationId).execution.status, 'none');
});

test('real Hub catalog: both ASR contracts are selectable in the audio-transcription tool (#1789)', () => {
  const catalog = projectCanvasCatalog(buildModelCatalog({ env: {} }));
  const ASR = ['doubao-asr-bigmodel', 'seedasr-auc'];

  // Admission is contract-derived: a model enters only through its LISTED speech operation.
  for (const id of ASR) {
    const row = catalog.models.find((model) => model.id === id);
    assert.ok(row, `${id} must reach the canvas catalog`);
    assert.deepEqual(row.operations.map((op) => op.id), ['speech_to_text']);
    assert.deepEqual(row.listedOperations, [`${id}#speech_to_text`]);
  }
  // ...and never through a generative bucket: the chat whitelist stays chat-only.
  assert.deepEqual(catalog.text.map((row) => row.id), ['gemini-3.8-flash']);

  const withAudio = buildUpstreamFingerprint({
    prompt: '',
    assets: [{ sourceNodeId: 'audio-1', type: 'audio', mimeType: 'audio/mpeg', sizeBytes: 4096 }],
  });
  const transcription = buildFilteredModelOptions({ catalog, fingerprint: withAudio, outputType: 'text', tool: 'audio-transcription' });
  assert.deepEqual(transcription.options.map((row) => row.id).sort(), [...ASR].sort());
  // The empty state「暂无可用转写模型」must not fire while these contracts are listed.
  assert.equal(transcription.zeroCandidates, false);
  assert.equal(isZeroCandidateEmptyState(transcription), false);

  // Every other tool keeps the curated whitelist: a chat node never offers an ASR model.
  const CHAT = ['gemini-3.8-flash'];
  const chat = buildFilteredModelOptions({ catalog, fingerprint: buildUpstreamFingerprint({ prompt: '请润色这段文字' }), outputType: 'text', tool: 'text-to-text' });
  assert.deepEqual(chat.options.map((row) => row.id).sort(), [...CHAT].sort());
  // Callers that pass no tool keep the pre-#1789 behaviour (whitelist only).
  const noTool = buildFilteredModelOptions({ catalog, fingerprint: buildUpstreamFingerprint({ prompt: '请润色这段文字' }), outputType: 'text' });
  assert.deepEqual(noTool.options.map((row) => row.id).sort(), [...CHAT].sort());
});
