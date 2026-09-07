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
test('saved removed slots fail closed even when a graph bypasses canvas recompute', async () => {
  const target = node({ removed_slot: [occupant('a')] }, 'text_to_video'); const gw = gateway();
  assert.equal(findExecutionReadinessFailure([target], catalog, { nodes: [target, graphNode('a')], edges: [edge('a')] }).reasonCode, 'role_conflict');
  await assert.rejects(createMaterialGatewayExecutor({ gateway: gw }).execute(target, context({}, { upstreamBindings: [{ edgeId: 'e-a', sourceNodeId: 'a', output: media('a') }] })), { code: 'role_conflict' });
  assert.equal(gw.requests.length, 0);
});
test('strip max one admits three edges and sends only the first slot occupant', async () => {
  const refsCatalog = catalogFor('video', 'frames', [operation('video_multi_ref', 'video', [slot('image', 'reference', 1, 1, 'refs')])]);
  const gw = gateway(refsCatalog);
  const target = node({ refs: [occupant('b')] }, 'video_multi_ref');
  await createMaterialGatewayExecutor({ gateway: gw }).execute(target, context({}, { upstreamBindings: ['a', 'b', 'c'].map((id) => ({ edgeId: `e-${id}`, sourceNodeId: id, output: media(id) })) }));
  assert.deepEqual(gw.requests[0].references.map((ref) => ref.sourceNodeId), ['b']);
});
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
