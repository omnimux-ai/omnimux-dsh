import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildModelCatalog } from '../../../omnimux/src/catalog/list.js';
import { readCanvasCatalog } from '../workflow/seam/canvasCatalog.ts';
import { projectCanvasCatalog } from './generationPolicy.ts';
import { buildFilteredModelOptions, isZeroCandidateEmptyState } from './validation/operationUi.ts';
import { buildUpstreamFingerprint, planAutoAdaptation } from './validation/compatKernel.ts';
import { planCanvasInputMutation } from './graph/canvasInputMutationGateway.ts';
import { reconcileCanvasForCatalog } from './graph/catalogReconcile.ts';

// These fixtures use the offline public catalog, never a provider request or a private index.
// 2026-10-21 网关对账 #3516：text/audio 各只剩一个在售模型，image/video 仍有一个可配置的合法替代项。
const DEFAULT_CASES = [
  { kind: 'text', setting: 'defaultTextModel', selected: 'gemini-3.8-flash', fallback: 'gemini-3.8-flash', operation: 'chat' },
  { kind: 'image', setting: 'defaultImageModel', selected: 'seedream-5-0-pro', fallback: 'gpt-image-2.5', operation: 'text_to_image' },
  { kind: 'video', setting: 'defaultVideoModel', selected: 'seedance-2-0-fast', fallback: 'seedance-2-5', operation: 'text_to_video' },
  { kind: 'audio', setting: 'defaultAudioModel', selected: 'suno', fallback: 'suno', operation: 'text_to_music' },
];
// A case exercises "configured default vs policy default" only when both models exist.
const ALTERNATIVE_CASES = DEFAULT_CASES.filter((row) => row.selected !== row.fallback);
const SELECTED_DEFAULTS = { text: 'gemini-3.8-flash', image: 'seedream-5-0-pro', video: 'seedance-2-0-fast', audio: 'suno' };
function configuredHub() {
  return buildModelCatalog({ env: {}, settingsDefaults: {
    defaultTextModel: 'gemini-3.8-flash', defaultImageModel: 'seedream-5-0-pro',
    defaultVideoModel: 'seedance-2-0-fast', defaultAudioModel: 'suno',
  } });
}
function bridge(hub) {
  return readCanvasCatalog(name => name === 'modelCatalog' ? { list: () => hub } : undefined);
}
function valueFor(object, key) {
  return Object.entries(object).find(entry => entry[0] === key)?.[1];
}
function replaceValue(object, key, value) {
  Object.assign(object, Object.fromEntries([[key, value]]));
}
function generateNode(id, kind, params = {}) {
  return { id, type: 'material', position: { x: 0, y: 0 }, data: {
    nodeKind: 'generate', materialType: kind, prompt: 'Create a short example', params,
  } };
}
function createNode(catalog, kind, preferredModels) {
  const result = planCanvasInputMutation({ nodes: [], edges: [] },
    { addNodes: [generateNode('new', kind)] }, { catalog, preferredModels });
  assert.equal(result.status, 'allowed');
  return result.nodes[0];
}
function adaptation(catalog, kind, extra = {}) {
  return planAutoAdaptation(Object.assign({ catalog, outputType: kind,
    fingerprint: buildUpstreamFingerprint({ prompt: 'Create a short example' }),
  }, extra));
}

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
  // The public capabilities seam carries the same value through the shallow projection.
  const projected = projectCanvasCatalog(Object.assign({}, hub));
  assert.equal(projected.preview_fingerprint, hub.preview_fingerprint);
});

test('readCanvasCatalog tolerates catalogs without preview_fingerprint (old hub / static stubs)', () => {
  const hub = buildModelCatalog({ env: {} });
  const stripped = Object.assign({}, hub);
  delete stripped.preview_fingerprint;
  const canvas = readCanvasCatalog(name => name === 'modelCatalog' ? { list: () => stripped } : undefined);
  assert.equal(canvas.preview_fingerprint, undefined);
  const stub = readCanvasCatalog(() => undefined);
  assert.equal(stub.source, 'static-stub');
  assert.equal(stub.preview_fingerprint, undefined);
  // Non-string values are never forwarded as a fingerprint.
  const weird = readCanvasCatalog(name => name === 'modelCatalog' ? { list: () => Object.assign({}, hub, { preview_fingerprint: null }) } : undefined);
  assert.equal(weird.preview_fingerprint, undefined);
});

test('real Hub catalog exposes the curated text models and selects Gemini 3.8 for video', () => {
  const catalog = projectCanvasCatalog(buildModelCatalog({ env: {} }));
  // 2026-10-21 网关对账 #3516：Claude 全部渠道停用，文本侧只剩 Gemini 3.8 Flash。
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

test('real Hub catalog: the listed whisper-1 ASR contract is selectable in the audio-transcription tool (#1789)', () => {
  const catalog = projectCanvasCatalog(buildModelCatalog({ env: {} }));
  // 2026-10-21 网关对账 #3516：豆包/SeedASR 渠道停用，语音识别只剩 whisper-1。
  const ASR = ['whisper-1'];

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
    // whisper-1 合同公布的 MIME 为 audio/mp3、wav、m4a、webm；用其中一项验证可选性。
    assets: [{ sourceNodeId: 'audio-1', type: 'audio', mimeType: 'audio/mp3', sizeBytes: 4096 }],
  });
  const transcription = buildFilteredModelOptions({ catalog, fingerprint: withAudio, outputType: 'text', tool: 'audio-transcription' });
  assert.deepEqual(transcription.options.map((row) => row.id).sort(), ASR.slice().sort());
  // The empty state「暂无可用转写模型」must not fire while these contracts are listed.
  assert.equal(transcription.zeroCandidates, false);
  assert.equal(isZeroCandidateEmptyState(transcription), false);

  // Every other tool keeps the curated whitelist: a chat node never offers an ASR model.
  const CHAT = ['gemini-3.8-flash'];
  const chat = buildFilteredModelOptions({ catalog, fingerprint: buildUpstreamFingerprint({ prompt: '请润色这段文字' }), outputType: 'text', tool: 'text-to-text' });
  assert.deepEqual(chat.options.map((row) => row.id).sort(), CHAT.slice().sort());
  // Callers that pass no tool keep the pre-#1789 behaviour (whitelist only).
  const noTool = buildFilteredModelOptions({ catalog, fingerprint: buildUpstreamFingerprint({ prompt: '请润色这段文字' }), outputType: 'text' });
  assert.deepEqual(noTool.options.map((row) => row.id).sort(), CHAT.slice().sort());
});

test('configured defaults survive public catalog projection, adaptation and new nodes for all four outputs (#3312)', () => {
  const hub = configuredHub();
  const before = structuredClone(hub);
  const catalog = bridge(hub);
  for (const row of DEFAULT_CASES) {
    assert.equal(valueFor(hub.defaults, row.kind), row.selected, `${row.kind}: hub setting`);
    assert.equal(valueFor(catalog.defaults, row.kind), row.selected, `${row.kind}: projection`);
    assert.equal(adaptation(catalog, row.kind).modelId, row.selected, `${row.kind}: adaptation`);
    assert.equal(createNode(catalog, row.kind).data.params.model, row.selected, `${row.kind}: new node`);
  }
  assert.deepEqual(hub, before, 'projection and node creation must not rewrite the input catalog');
});

test('adaptation respects a legal catalog default even when the attached policy prefers another model (#3312)', () => {
  const catalog = bridge(configuredHub());
  // Separate the planner boundary from projection: this is an explicit valid catalog input.
  catalog.defaults = SELECTED_DEFAULTS;
  const before = structuredClone(catalog);
  for (const row of DEFAULT_CASES) {
    assert.equal(adaptation(catalog, row.kind).modelId, row.selected, row.kind);
  }
  assert.deepEqual(catalog, before);
});

test('invalid defaults fall back to a real admitted policy model for all four outputs (#3312)', () => {
  const hub = configuredHub();
  hub.defaults = { text: 'missing-model', image: 'missing-model', video: 'missing-model', audio: 'missing-model' };
  const before = structuredClone(hub);
  const catalog = bridge(hub);
  for (const row of DEFAULT_CASES) {
    assert.equal(valueFor(catalog.defaults, row.kind), row.fallback, `${row.kind}: projection fallback`);
    assert.equal(adaptation(catalog, row.kind).modelId, row.fallback, `${row.kind}: compatible fallback`);
    assert.equal(createNode(catalog, row.kind).data.params.model, row.fallback, `${row.kind}: new node fallback`);
  }
  assert.deepEqual(hub, before);
});

test('missing policy models fall back only to real remaining rows for all four outputs (#3312)', () => {
  // text/audio have a single admitted model, so "another real remaining row" only exists for image/video.
  for (const row of ALTERNATIVE_CASES) {
    const hub = configuredHub();
    hub.defaults = { text: 'missing-model', image: 'missing-model', video: 'missing-model', audio: 'missing-model' };
    hub.models = hub.models.filter(model => model.id !== row.fallback);
    replaceValue(hub, row.kind, valueFor(hub, row.kind).filter(model => model.id === row.selected));
    const catalog = bridge(hub);
    assert.equal(valueFor(catalog.defaults, row.kind), row.selected, `${row.kind}: actual remaining row`);
    assert.equal(adaptation(catalog, row.kind).modelId, row.selected, row.kind);
    assert.equal(createNode(catalog, row.kind).data.params.model, row.selected, row.kind);
  }
});

test('defaults outside enabled buckets or listed output contracts cannot enter the canvas (#3312)', () => {
  // Only a kind with a second admissible row can fall back to a *different* real model.
  for (const row of ALTERNATIVE_CASES) {
    for (const invalidation of ['disabled', 'absent', 'draft', 'wrong-output']) {
      const hub = configuredHub();
      if (invalidation === 'disabled') {
        replaceValue(hub, row.kind, valueFor(hub, row.kind).filter(model => model.id !== row.selected));
      } else if (invalidation === 'absent') {
        hub.models = hub.models.filter(model => model.id !== row.selected);
      } else {
        const model = hub.models.find(candidate => candidate.id === row.selected);
        for (const operation of model.operations) {
          if (invalidation === 'draft') operation.listed = false;
          else operation.output = { type: 'document' };
        }
      }
      const before = structuredClone(hub);
      const catalog = bridge(hub);
      assert.equal(valueFor(catalog.defaults, row.kind), row.fallback, `${row.kind}: ${invalidation}`);
      assert.equal(valueFor(catalog, row.kind).some(model => model.id === row.selected), false);
      assert.equal(adaptation(catalog, row.kind).modelId, row.fallback);
      assert.equal(createNode(catalog, row.kind).data.params.model, row.fallback);
      assert.deepEqual(hub, before);
    }
  }
});

test('empty output buckets stay empty and new nodes fail closed for all four outputs (#3312)', () => {
  for (const row of DEFAULT_CASES) {
    const hub = configuredHub();
    replaceValue(hub, row.kind, []);
    const before = structuredClone(hub);
    const catalog = bridge(hub);
    assert.deepEqual(valueFor(catalog, row.kind), [], row.kind);
    assert.equal(valueFor(catalog.defaults, row.kind), '', row.kind);
    assert.equal(adaptation(catalog, row.kind), null, row.kind);
    const created = createNode(catalog, row.kind);
    assert.equal(created.data.params.model, undefined, row.kind);
    assert.equal(created.data.compat.status, 'configuration_error', row.kind);
    assert.equal(created.data.compat.readyToSubmit, false, row.kind);
    assert.deepEqual(hub, before);
  }
  assert.equal(adaptation(null, 'text'), null);
});

test('operation recommendations cannot impersonate a model preference or override an explicit operation (#3312)', () => {
  for (const row of DEFAULT_CASES) {
    const hub = configuredHub();
    replaceValue(hub.defaultOperations, row.kind, { modelId: row.fallback, operationId: row.operation, rule: 'configured' });
    const catalog = bridge(hub);
    // Isolate recomputation from the default-projection and planner regressions.
    replaceValue(catalog.defaults, row.kind, row.selected);
    catalog.generationPolicy = structuredClone(catalog.generationPolicy);
    valueFor(catalog.generationPolicy, row.kind).defaultModelId = row.selected;
    const before = structuredClone(catalog);
    assert.equal(valueFor(catalog.defaultOperations, row.kind).modelId, row.fallback);
    const created = createNode(catalog, row.kind);
    assert.equal(created.data.params.model, row.selected, row.kind);
    assert.ok(catalog.models.find(model => model.id === row.selected).operations.some(operation =>
      operation.id === created.data.params.operation && operation.listed && operation.output.type === row.kind));
    const explicit = generateNode('explicit', row.kind, { model: row.selected, operation: row.operation });
    explicit.data.autoOperationId = null;
    explicit.data.inputBindingVersion = 1;
    const result = planCanvasInputMutation({ nodes: [], edges: [] }, { addNodes: [explicit] }, { catalog });
    assert.equal(result.status, 'allowed');
    assert.deepEqual(result.nodes[0].data.params, { model: row.selected, operation: row.operation }, row.kind);
    assert.deepEqual(catalog, before);
  }
});

test('same-model valid operation recommendations initialize new nodes while invalid recommendations are removed (#3312)', () => {
  const hub = configuredHub();
  hub.defaultOperations = {
    text: { modelId: 'gemini-3.8-flash', operationId: 'vision_chat', rule: 'configured' },
    image: { modelId: 'seedream-5-0-pro', operationId: 'text_to_image', rule: 'configured' },
    video: { modelId: 'seedance-2-0-fast', operationId: 'video_multi_ref', rule: 'configured' },
    audio: { modelId: 'suno', operationId: 'text_to_music', rule: 'configured' },
  };
  const catalog = bridge(hub);
  for (const row of DEFAULT_CASES) {
    const created = createNode(catalog, row.kind);
    assert.equal(created.data.params.model, row.selected, row.kind);
    assert.equal(created.data.params.operation, valueFor(hub.defaultOperations, row.kind).operationId, row.kind);
  }
  hub.defaultOperations = {
    text: { modelId: 'missing-model', operationId: 'chat' },
    image: { modelId: 'seedream-5-0-pro', operationId: 'missing-operation' },
    video: { modelId: 'gemini-3.8-flash', operationId: 'chat' },
    audio: { modelId: 'suno', operationId: 'missing-operation' },
  };
  hub.defaultsByOperation = { missing_operation: 'seedance-2-0-fast', chat: 'gemini-3.8-flash' };
  const filtered = bridge(hub);
  assert.deepEqual(filtered.defaultOperations, {});
  assert.equal(filtered.defaultsByOperation.missing_operation, undefined);
  assert.equal(filtered.defaultsByOperation.chat, 'gemini-3.8-flash');
});

test('compatible recent manual preferences win only for new nodes and are never rewritten (#3312)', () => {
  const catalog = bridge(configuredHub());
  const preferences = { text: 'gemini-3.8-flash', image: 'gpt-image-2.5', video: 'seedance-2-5', audio: 'suno' };
  const before = structuredClone(preferences);
  for (const row of DEFAULT_CASES) {
    assert.equal(adaptation(catalog, row.kind, { preferredModelId: row.fallback }).modelId, row.fallback, row.kind);
    assert.equal(createNode(catalog, row.kind, preferences).data.params.model, row.fallback, row.kind);
    assert.equal(adaptation(catalog, row.kind, { preferredModelId: 'missing-model' }).modelId, row.selected, row.kind);
    assert.equal(adaptation(catalog, row.kind, { currentModelId: row.selected,
      currentOperationId: row.operation, preferredModelId: row.fallback }).modelId, row.selected, row.kind);
  }
  assert.deepEqual(preferences, before);
});

test('an incompatible configured text default safely yields to a listed video-capable text model (#3312)', () => {
  const hub = configuredHub();
  // 2026-10-21 网关对账 #3516：Claude 已不在上架白名单，配置里残留的旧文本默认必须被投影掉。
  hub.defaults.text = 'claude-sonnet-4-6';
  const catalog = bridge(hub);
  const pick = planAutoAdaptation({ catalog, outputType: 'text', fingerprint: buildUpstreamFingerprint({
    prompt: 'Analyze this video', assets: [{ sourceNodeId: 'video', type: 'video', mimeType: 'video/mp4', sizeBytes: 1024 }],
  }) });
  assert.equal(catalog.defaults.text, 'gemini-3.8-flash');
  assert.equal(pick.modelId, 'gemini-3.8-flash');
  assert.equal(pick.operationId, 'vision_chat');
});

test('catalog hydration preserves saved models, operations, results and original edge data for all outputs (#3312)', () => {
  const catalog = bridge(configuredHub());
  const preferences = { text: 'gemini-3.8-flash', image: 'gpt-image-2.5', video: 'seedance-2-5', audio: 'suno' };
  for (const row of DEFAULT_CASES) {
    for (const modelId of [row.fallback, 'unavailable-saved-model']) {
      const saved = generateNode('saved', row.kind, { model: modelId, operation: row.operation, customParameter: { keep: true } });
      saved.data.autoOperationId = null;
      saved.data.inputBindingVersion = 1;
      saved.data.content = 'saved output';
      saved.data.results = [{ id: 'result-1', type: row.kind, content: 'saved result', custom: { keep: true } }];
      saved.data.customData = { keep: ['original'] };
      const source = { id: 'source', type: 'material', position: { x: 1, y: 2 },
        data: { nodeKind: 'import', materialType: 'text', content: 'Upstream instructions', customData: { keep: true } } };
      const edge = { id: 'edge-1', source: 'source', sourceHandle: 'out', target: 'saved', targetHandle: 'in',
        type: 'default', animated: false, data: { customData: { keep: ['original'] }, keep: 'user-edge-value' } };
      const nodes = [source, saved];
      const edges = [edge];
      const before = structuredClone({ nodes, edges, catalog, preferences });
      const result = reconcileCanvasForCatalog({ nodes, edges, catalog, preferredModels: preferences, previousFingerprint: 'previous-catalog' });
      const after = result.nodes.find(candidate => candidate.id === 'saved');
      assert.equal(result.skipped, false);
      assert.deepEqual(after.data.params, saved.data.params, `${row.kind}: ${modelId} configuration`);
      assert.deepEqual(after.data.results, saved.data.results);
      assert.equal(after.data.content, saved.data.content);
      assert.deepEqual(after.data.customData, saved.data.customData);
      assert.deepEqual(result.nodes.find(candidate => candidate.id === 'source'), source);
      assert.equal(result.edges.length, 1);
      const retained = result.edges[0];
      // Existing slot mirrors may be filled; topology and every original non-mirror field must survive.
      assert.deepEqual({ id: retained.id, source: retained.source, sourceHandle: retained.sourceHandle,
        target: retained.target, targetHandle: retained.targetHandle, type: retained.type, animated: retained.animated },
      { id: 'edge-1', source: 'source', sourceHandle: 'out', target: 'saved', targetHandle: 'in', type: 'default', animated: false });
      assert.deepEqual(retained.data.customData, edge.data.customData);
      assert.equal(retained.data.keep, edge.data.keep);
      if (modelId === 'unavailable-saved-model') {
        assert.equal(after.data.compat.status, 'configuration_error');
        assert.equal(after.data.compat.readyToSubmit, false);
        assert.ok(after.data.compat.reasonCodes.includes('not_listed'));
      }
      assert.deepEqual({ nodes, edges, catalog, preferences }, before, 'hydration must not mutate its inputs');
    }
  }
});
