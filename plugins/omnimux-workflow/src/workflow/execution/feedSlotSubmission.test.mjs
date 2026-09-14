import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMaterialGatewayExecutor } from './materialGatewayExecutor.ts';
import { createDispatchingNodeExecutor, resolveUpstreamBindings } from './nodeExecutors.ts';
import { registerExecutor } from '../executors/registry.ts';
import { findExecutionReadinessFailure } from '../../shared/validation/executionReadiness.ts';
import { prepareExecutionSlotGraph } from '../../shared/graph/feedSlot/prepareExecutionSlotGraph.ts';
import { buildInitialOutputs } from './executionInputs.ts';
import { catalogFor, operation, slot } from '../seam/submissionFixtures.mjs';

const op = operation('first_last_frame', 'video', [slot('image', 'first_frame', 1, 1, 'first_frame'), slot('image', 'last_frame', 1, 1, 'last_frame')]);
const catalog = catalogFor('video', 'frames', [op, operation('text_to_video', 'video', [])]);
const media = (id, type = 'image') => ({ mediaAssets: [{ type, url: `https://example.test/${id}.${type === 'audio' ? 'mp3' : 'png'}` }] });
const occupant = (id) => ({ edgeId: `e-${id}`, sourceNodeId: id, pinned: true });
const node = (bindings, operation = 'first_last_frame') => ({ id: 'target', type: 'material', data: {
  materialType: 'video', prompt: 'go', params: { model: 'frames', operation }, slotBindings: bindings,
} });
const edge = (id, feedType = 'image') => ({ id: `e-${id}`, source: id, target: 'target', data: { feedType } });
function gateway(inputCatalog = catalog) {
  const requests = [];
  return { requests, capabilities: async () => inputCatalog,
    submit: async (request) => { requests.push(request); return { taskId: 'captured' }; },
    awaitTask: async () => ({ type: 'video', url: 'https://example.test/out.mp4' }) };
}
const context = (outputs = {}, extras = {}) => ({ upstreamOutputs: new Map(Object.entries(outputs)), mediaDir: '/tmp/feed-slot', signal: new AbortController().signal, ...extras });
const graphNode = (id, type = 'image', data = {}) => ({ id, type: 'material', data: { materialType: type, nodeKind: 'import', mediaUrl: `https://example.test/${id}.png`, ...data } });

test('only occupied frames pass through dispatch, standby missing and bad URLs are never submitted', async () => {
  const target = node({ first_frame: [occupant('a')], last_frame: [occupant('b')] });
  const outputs = { a: media('a'), b: media('b'), bad: { mediaAssets: [{ type: 'image', url: 'blob:invalid' }] } };
  const edges = ['a', 'bad', 'waiting', 'b'].map((id) => edge(id));
  const gw = gateway(); let catalogReads = 0; gw.capabilities = async () => { catalogReads++; return catalog; };
  registerExecutor(createMaterialGatewayExecutor({ gateway: gw }));
  await createDispatchingNodeExecutor({ gateway: gw, edges, mediaRoot: '/tmp', executionId: 'slots', abortController: new AbortController() }).executor(target, {
    getNodeOutput: (id) => outputs[id], reportProgress() {}, addMediaAsset() {},
  });
  assert.equal(gw.requests.length, 1); assert.equal(catalogReads, 1);
  assert.deepEqual(gw.requests[0].references.map((ref) => [ref.sourceNodeId, ref.role]), [['a', 'first_frame'], ['b', 'last_frame']]);
});
test('media-only operation never restores excluded upstream or local prompt at gateway submission', async () => {
  const mediaOnly = { ...op, inputs: op.inputs.filter((input) => input.type !== 'text') };
  const gw = gateway(catalogFor('video', 'frames', [mediaOnly]));
  const target = node({ first_frame: [occupant('a')], last_frame: [occupant('b')] });
  target.data.prompt = 'local-must-not-leak';
  await createMaterialGatewayExecutor({ gateway: gw }).execute(target, context({}, {
    upstreamBindings: [
      { edgeId: 'e-a', sourceNodeId: 'a', output: media('a') },
      { edgeId: 'e-b', sourceNodeId: 'b', output: media('b') },
      { edgeId: 'e-text', sourceNodeId: 'text', output: { text: 'upstream-must-not-leak' } },
    ],
  }));
  assert.equal(gw.requests.length, 1);
  assert.equal(gw.requests[0].prompt ?? '', '');
  assert.equal(gw.requests[0].references.length, 2);
});

test('execution preparation fills valid slots beside retained removed intent without mutating saved graph', () => {
  const target = node({ removed_slot: [occupant('missing')] });
  const nodes = [target, graphNode('a'), graphNode('b')];
  const before = structuredClone(nodes);
  const prepared = prepareExecutionSlotGraph(nodes, [edge('a'), edge('b')], catalog);
  const data = prepared.nodes[0].data;
  assert.deepEqual(data.slotBindings.first_frame.map((item) => item.sourceNodeId), ['a']);
  assert.deepEqual(data.slotBindings.last_frame.map((item) => item.sourceNodeId), ['b']);
  assert.equal(data.slotConflicts[0].slot, 'removed_slot');
  assert.deepEqual(nodes, before);
});

test('empty explicit slot does not fallback to all upstream outputs; pinned missing source blocks', async () => {
  const gw = gateway(); const executor = createMaterialGatewayExecutor({ gateway: gw });
  await assert.rejects(executor.execute(node({ first_frame: [], last_frame: [] }), context({ a: media('a') })), { code: 'min_unsatisfied' });
  await assert.rejects(executor.execute(node({ first_frame: [occupant('missing')], last_frame: [occupant('a')] }), context({}, {
    upstreamBindings: [{ edgeId: 'e-a', sourceNodeId: 'a', output: media('a') }],
  })), { code: 'input_unavailable' });
  assert.equal(gw.requests.length, 0);
});
test('one supply edge can fill two named roles and swapped node roles override edge mirrors', async () => {
  const gw = gateway(); const executor = createMaterialGatewayExecutor({ gateway: gw });
  const target = node({ first_frame: [occupant('a')], last_frame: [occupant('a')] });
  await executor.execute(target, context({ a: media('a') }, { upstreamBindings: [{ edgeId: 'e-a', sourceNodeId: 'a', role: 'reference', targetSlot: 'wrong', output: media('a') }] }));
  assert.equal(gw.requests[0].references.length, 2);
  assert.deepEqual(gw.requests[0].references.map((ref) => ref.role), ['first_frame', 'last_frame']);
});
test('removed saved slots are omitted without blocking a satisfied operation', async () => {
  const target = node({ removed_slot: [occupant('a')] }, 'text_to_video'); const gw = gateway();
  assert.equal(findExecutionReadinessFailure([target], catalog, { nodes: [target, graphNode('a')], edges: [edge('a')] }), null);
  await createMaterialGatewayExecutor({ gateway: gw }).execute(target, context({}, { upstreamBindings: [{ edgeId: 'e-a', sourceNodeId: 'a', output: media('a') }] }));
  assert.equal(gw.requests.length, 1);
  assert.equal(gw.requests[0].references, undefined);
});
test('strip max one admits three edges and sends only the first slot occupant', async () => {
  const refsCatalog = catalogFor('video', 'frames', [operation('video_multi_ref', 'video', [slot('image', 'reference', 1, 1, 'refs')])]);
  const gw = gateway(refsCatalog);
  const target = node({ refs: [occupant('b')] }, 'video_multi_ref');
  await createMaterialGatewayExecutor({ gateway: gw }).execute(target, context({}, { upstreamBindings: ['a', 'b', 'c'].map((id) => ({ edgeId: `e-${id}`, sourceNodeId: id, output: media(id) })) }));
  assert.deepEqual(gw.requests[0].references.map((ref) => ref.sourceNodeId), ['b']);
});
for (const min of [0, 1]) {
  test(`pinned unavailable input with ready standby preserves intent at readiness and submission (min ${min})`, async () => {
    const inputCatalog = catalogFor('video', 'frames', [operation('video_multi_ref', 'video', [slot('image', 'reference', min, 1, 'refs')])]);
    const target = node({ refs: [occupant('missing')] }, 'video_multi_ref');
    const graph = { nodes: [target, graphNode('missing', 'image', { mediaUrl: '', status: 'loading' }), graphNode('standby')], edges: [edge('missing'), edge('standby')] };
    const failure = findExecutionReadinessFailure([target], inputCatalog, graph);
    assert.equal(failure?.reasonCode ?? null, min ? 'input_unavailable' : null);
    const gw = gateway(inputCatalog);
    const pending = createMaterialGatewayExecutor({ gateway: gw }).execute(target, context({}, { upstreamBindings: [
      { edgeId: 'e-missing', sourceNodeId: 'missing', output: {} },
      { edgeId: 'e-standby', sourceNodeId: 'standby', output: media('standby') },
    ] }));
    if (min) {
      await assert.rejects(pending, { code: 'input_unavailable' });
      assert.equal(gw.requests.length, 0);
    } else {
      await pending;
      assert.equal(gw.requests.length, 1);
      assert.equal(gw.requests[0].references, undefined);
    }
  });
}

test('submission snapshots detach before asynchronous catalog reads', async () => {
  const target = node({ first_frame: [occupant('a')], last_frame: [occupant('b')] });
  const ctx = context({}, { upstreamBindings: ['a', 'b'].map((id) => ({ edgeId: `e-${id}`, sourceNodeId: id, output: media(id) })) });
  let resume; const ready = new Promise((resolve) => { resume = resolve; }); const gw = gateway();
  gw.capabilities = () => ready;
  const pending = createMaterialGatewayExecutor({ gateway: gw }).execute(target, ctx);
  target.data.slotBindings.first_frame[0].sourceNodeId = 'changed';
  ctx.upstreamBindings[0].output.mediaAssets[0].url = 'https://example.test/changed.png';
  resume(catalog); await pending;
  assert.equal(gw.requests[0].references[0].sourceNodeId, 'a');
  assert.equal(gw.requests[0].references[0].pathOrUrl, 'https://example.test/a.png');
});
test('dispatch detaches topology and scheduler outputs before awaiting catalog', async () => {
  const target = node({ first_frame: [occupant('a')], last_frame: [occupant('b')] });
  const edges = ['a', 'b'].map((id) => edge(id)); const outputs = { a: media('a'), b: media('b') };
  const gw = gateway(); let resume; gw.capabilities = () => new Promise((resolve) => { resume = resolve; });
  registerExecutor(createMaterialGatewayExecutor({ gateway: gw }));
  const pending = createDispatchingNodeExecutor({ gateway: gw, edges, mediaRoot: '/tmp', executionId: 'snapshot', abortController: new AbortController() }).executor(target, {
    getNodeOutput: (id) => outputs[id], reportProgress() {}, addMediaAsset() {},
  });
  edges.length = 0; outputs.a.mediaAssets[0].url = 'https://example.test/changed.png';
  target.data.slotBindings.first_frame[0].sourceNodeId = 'changed';
  resume(catalog); await pending;
  assert.deepEqual(gw.requests[0].references.map((ref) => ref.sourceNodeId), ['a', 'b']);
  assert.equal(gw.requests[0].references[0].pathOrUrl, 'https://example.test/a.png');
});
test('legacy hydration, single-node readiness and initial output seeding share occupied population', () => {
  const target = node(undefined); delete target.data.slotBindings;
  const nodes = [graphNode('a'), graphNode('b'), graphNode('bad', 'image', { relativePath: 'assets/missing.png' }), target];
  const prepared = prepareExecutionSlotGraph(nodes, ['a', 'b', 'bad'].map((id) => edge(id)), catalog);
  const preparedTarget = prepared.nodes.find((item) => item.id === 'target');
  assert.equal(preparedTarget.data.slotBindings.first_frame[0].sourceNodeId, 'a');
  assert.equal(target.data.slotBindings, undefined);
  assert.equal(findExecutionReadinessFailure([preparedTarget], catalog, prepared), null);
  const outputs = buildInitialOutputs({ ...prepared, id: 'ws_slots' }, new Set(['target']), {
    mediaDir: '/tmp', resolveProjectFile: () => { throw new Error('standby file must not be opened'); },
  });
  assert.deepEqual(Object.keys(outputs), ['a', 'b']);
});
test('none layout ignores ten waiting audio supplies in readiness and dispatch', async () => {
  const target = node({}, 'text_to_video'); const edges = Array.from({ length: 10 }, (_, i) => edge(`a${i}`, 'audio'));
  const nodes = edges.map((edge) => graphNode(edge.source, 'audio', { mediaUrl: '', status: 'loading' }));
  assert.equal(findExecutionReadinessFailure([target], catalog, { nodes: [target, ...nodes], edges }), null);
  assert.deepEqual(resolveUpstreamBindings(target, edges, { getNodeOutput() {} }, catalog), []);
  const gw = gateway(); registerExecutor(createMaterialGatewayExecutor({ gateway: gw }));
  await createDispatchingNodeExecutor({ gateway: gw, edges, mediaRoot: '/tmp', executionId: 'none', abortController: new AbortController() }).executor(target, {
    getNodeOutput() { return {}; }, reportProgress() {}, addMediaAsset() {},
  });
  assert.equal(gw.requests[0].references, undefined); assert.equal(gw.requests[0].audioTrack, undefined);
});
test('prepareExecutionSlotGraph preserves invalid fixed ratio for adaptive-only mode until UI corrects it (#1785)', async () => {
  const ffOp = {
    ...operation('first_frame', 'video', [slot('image', 'first_frame', 1, 1, 'first_frame')]),
    parameters: {
      aspectRatio: {
        options: [{ value: 'adaptive', label: '自适应' }],
        defaultValue: 'adaptive',
      },
    },
  };
  const customCatalog = catalogFor('video', 'frames', [ffOp, op, operation('text_to_video', 'video', [])]);
  const target = {
    id: 'target',
    type: 'material',
    data: {
      materialType: 'video',
      prompt: 'go',
      params: { model: 'frames', operation: 'first_frame', aspectRatio: '9:16' },
    },
  };
  const nodes = [graphNode('img-1', 'image'), target];
  const edges = [edge('img-1')];
  const prepared = prepareExecutionSlotGraph(nodes, edges, customCatalog);
  const preparedTarget = prepared.nodes.find((item) => item.id === 'target');
  assert.equal(preparedTarget.data.params.aspectRatio, '9:16');
  assert.equal(target.data.params.aspectRatio, '9:16');
  assert.equal(findExecutionReadinessFailure([preparedTarget], customCatalog, prepared).reasonCode, 'parameter_unsupported');
  const gw = gateway(customCatalog);
  registerExecutor(createMaterialGatewayExecutor({ gateway: gw }));
  await assert.rejects(createDispatchingNodeExecutor({ gateway: gw, edges: prepared.edges, mediaRoot: '/tmp', executionId: 'invalid-adaptive', abortController: new AbortController() }).executor(preparedTarget, {
    getNodeOutput: () => media('img-1'), reportProgress() {}, addMediaAsset() {},
  }), { message: '参数“aspectRatio”不支持值 "9:16"' });
  assert.equal(gw.requests.length, 0);
});

for (const defaultValue of ['16:9', undefined]) {
  test(`prepareExecutionSlotGraph never replaces unsupported fixed ratio with ${defaultValue ?? 'first option'} (#1785)`, async () => {
    const customCatalog = catalogFor('video', 'frames', [{
      ...operation('text_to_video', 'video', []),
      parameters: { aspectRatio: { options: [{ value: '16:9' }, { value: '9:16' }], ...(defaultValue ? { defaultValue } : {}) } },
    }]);
    const target = node({}, 'text_to_video');
    target.data.params.aspectRatio = '4:3';
    const prepared = prepareExecutionSlotGraph([target], [], customCatalog);
    const preparedTarget = prepared.nodes[0];
    assert.equal(preparedTarget.data.params.aspectRatio, '4:3');
    assert.equal(target.data.params.aspectRatio, '4:3');
    assert.equal(findExecutionReadinessFailure([preparedTarget], customCatalog, prepared).reasonCode, 'parameter_unsupported');
    const gw = gateway(customCatalog);
    registerExecutor(createMaterialGatewayExecutor({ gateway: gw }));
    await assert.rejects(createDispatchingNodeExecutor({ gateway: gw, edges: prepared.edges, mediaRoot: '/tmp', executionId: 'invalid-fixed', abortController: new AbortController() }).executor(preparedTarget, {
      getNodeOutput() {}, reportProgress() {}, addMediaAsset() {},
    }), { message: '参数“aspectRatio”不支持值 "4:3"' });
    assert.equal(gw.requests.length, 0);
  });
}

test('prepareExecutionSlotGraph preserves valid fixed ratio through submission (#1785)', async () => {
  const customCatalog = catalogFor('video', 'frames', [{
    ...operation('text_to_video', 'video', []),
    parameters: { aspectRatio: { options: [{ value: '16:9' }, { value: '9:16' }], defaultValue: '16:9' } },
  }]);
  const target = node({}, 'text_to_video');
  target.data.params.aspectRatio = '9:16';
  const prepared = prepareExecutionSlotGraph([target], [], customCatalog);
  assert.equal(prepared.nodes[0].data.params.aspectRatio, '9:16');
  assert.equal(findExecutionReadinessFailure(prepared.nodes, customCatalog, prepared), null);
  const gw = gateway(customCatalog);
  registerExecutor(createMaterialGatewayExecutor({ gateway: gw }));
  await createDispatchingNodeExecutor({ gateway: gw, edges: prepared.edges, mediaRoot: '/tmp', executionId: 'valid-fixed', abortController: new AbortController() }).executor(prepared.nodes[0], {
    getNodeOutput() {}, reportProgress() {}, addMediaAsset() {},
  });
  assert.equal(gw.requests.length, 1);
  assert.equal(gw.requests[0].aspectRatio, '9:16');
});
