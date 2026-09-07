import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCanvasUpstreamFingerprint, planCanvasInputMutation } from './canvasInputMutationGateway.ts';
import { mutateWorkspaceGraph } from '../../workflow/graph/GraphMutator.ts';
import { createWorkspaceStore } from '../../workflow/workspace/WorkspaceStore.ts';
import { createCompatTestCatalog } from '../validation/compatTestCatalog.ts';
const catalog = createCompatTestCatalog();
const gen = (model = 'alias-img', operation = 'image_to_image', type = 'image') => ({ id: 'gen', type: 'material', position: { x: 0, y: 0 }, data: {
  materialType: type, nodeKind: 'generate', selectedTool: type === 'video' ? 'text-to-video' : 'text-to-image', prompt: 'go', params: { model, operation },
} });
const source = (id, data = {}) => ({ id, type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'image', nodeKind: 'import', selectedTool: 'import', mediaUrl: `https://fixture.test/${id}.png`, mimeType: 'image/png', sizeBytes: 100, ...data } });
const connect = { addEdges: [{ id: 'e', source: 'src', target: 'gen' }] };
const graph = (target = gen(), data = {}) => ({ nodes: [target, source('src', data)], edges: [] });
const target = (plan) => plan.nodes.find((node) => node.id === 'gen');

test('supply and node bindings commit atomically without changing creative choice', () => {
  const current = graph(); const before = structuredClone(current);
  const plan = planCanvasInputMutation(current, connect, { catalog });
  assert.equal(plan.status, 'allowed'); assert.equal(plan.edges.length, 1);
  assert.equal(target(plan).data.slotBindings.reference_images[0].edgeId, 'e');
  assert.equal(target(plan).data.params.model, 'alias-img'); assert.equal(target(plan).data.compat.readyToSubmit, true);
  assert.equal(plan.edges[0].data.slotBinding.role, 'reference'); assert.deepEqual(current, before);
});
test('new image supply cannot switch prompt-only model or operation', () => {
  const plan = planCanvasInputMutation(graph(gen('img-prompt-only', 'text_to_image')), connect, { catalog });
  assert.equal(plan.status, 'allowed'); assert.deepEqual(target(plan).data.slotBindings, {});
  assert.equal(target(plan).data.params.model, 'img-prompt-only'); assert.equal(target(plan).data.params.operation, 'text_to_image');
});
test('alias model normalizes without replacement', () => {
  const plan = planCanvasInputMutation(graph(gen('alias-img-wire')), connect, { catalog });
  assert.equal(target(plan).data.params.model, 'alias-img');
});
test('fifth supply stays connected while reference slot remains at max four', () => {
  const nodes = [gen(), ...Array.from({ length: 5 }, (_, i) => source(`s${i}`))];
  const plan = planCanvasInputMutation({ nodes, edges: [] }, { addEdges: nodes.slice(1).map((node, i) => ({ id: `e${i}`, source: node.id, target: 'gen' })) }, { catalog });
  assert.equal(plan.status, 'allowed'); assert.equal(plan.edges.length, 5);
  assert.equal(target(plan).data.slotBindings.reference_images.length, 4);
  assert.equal(target(plan).data.compat.readyToSubmit, true); assert.equal(plan.edges[4].data.slotBinding, undefined);
});
test('MIME mismatch goes to feed; oversize remains visible and blocks submit instead of connection', () => {
  const mime = planCanvasInputMutation(graph(gen(), { mimeType: 'image/gif' }), connect, { catalog });
  assert.equal(mime.status, 'allowed'); assert.equal(target(mime).data.slotBindings.reference_images.length, 0);
  const size = planCanvasInputMutation(graph(gen(), { sizeBytes: 11 * 1024 * 1024 }), connect, { catalog });
  assert.equal(size.status, 'allowed'); assert.equal(target(size).data.compat.readyToSubmit, false);
  assert.ok(target(size).data.compat.reasonCodes.includes('size_exceeded'));
});
test('missing catalog retains edge and exposes configuration error, legacy caller remains structural', () => {
  const plan = planCanvasInputMutation(graph(), connect, { catalog: null });
  assert.equal(plan.status, 'allowed'); assert.equal(plan.edges.length, 1);
  assert.equal(target(plan).data.compat.status, 'configuration_error');
  assert.equal(target(plan).data.compat.readyToSubmit, false);
  assert.equal(target(planCanvasInputMutation(graph(), connect)).data.compat, undefined);
});
test('first frame alone is legal middle state; second source fills tail and pins survive swap patches', () => {
  const first = planCanvasInputMutation(graph(gen('vid-frames', 'first_last_frame', 'video')), connect, { catalog });
  assert.equal(first.status, 'allowed'); assert.equal(target(first).data.slotBindings.end_frame.length, 0);
  assert.equal(target(first).data.compat.readyToSubmit, false);
  const second = planCanvasInputMutation(first, { addNodes: [source('b')], addEdges: [{ id: 'b', source: 'b', target: 'gen' }] }, { catalog });
  assert.equal(target(second).data.slotBindings.end_frame[0].sourceNodeId, 'b');
  const bindings = { start_frame: [{ sourceNodeId: 'b', edgeId: 'b', pinned: true }], end_frame: [{ sourceNodeId: 'src', edgeId: 'e', pinned: true }] };
  const swap = planCanvasInputMutation(second, { nodePatches: [{ nodeId: 'gen', data: { slotBindings: bindings } }] }, { catalog });
  assert.equal(target(swap).data.slotBindings.start_frame[0].sourceNodeId, 'b');
  assert.deepEqual(swap.edges.map((edge) => edge.id), second.edges.map((edge) => edge.id));
});
test('remove and source changes refresh effective state without deleting other edges', () => {
  const first = planCanvasInputMutation(graph(), connect, { catalog });
  const waiting = planCanvasInputMutation(first, { nodePatches: [{ nodeId: 'src', data: { mediaUrl: '', status: 'loading' } }] }, { catalog });
  assert.equal(target(waiting).data.compat.readyToSubmit, false); assert.equal(waiting.edges.length, 1);
  const removed = planCanvasInputMutation(waiting, { removeEdgeIds: ['e'] }, { catalog: null });
  assert.equal(removed.status, 'allowed'); assert.equal(removed.edges.length, 0);
});
for (const [model, inputCatalog, reason] of [['unknown', catalog, 'unknown_model'], [17, catalog, 'unknown_model'], ['', catalog, 'unknown_model'], ['unlisted-model', catalog, 'not_listed'], ['img-hd', null, 'catalog_unavailable']]) {
  test(`manual invalid model ${model} remains fail-closed`, () => {
    const current = graph(); const patch = { nodePatches: [{ nodeId: 'gen', data: { params: { model } } }] };
    const plan = planCanvasInputMutation(current, patch, { catalog: inputCatalog });
    assert.equal(plan.status, 'rejected'); assert.equal(plan.reasonCode, reason); assert.equal(plan.nodes, current.nodes); assert.equal(plan.edges, current.edges);
  });
}
test('known model selection is allowed with unconsumed feed and does not rewrite preferences', () => {
  const current = planCanvasInputMutation(graph(), connect, { catalog });
  const plan = planCanvasInputMutation(current, { nodePatches: [{ nodeId: 'gen', data: { params: { model: 'img-prompt-only', operation: 'text_to_image' } } }] }, { catalog });
  assert.equal(plan.status, 'allowed'); assert.equal(plan.edges.length, 1); assert.deepEqual(target(plan).data.slotBindings, {});
});
test('canvas and host GraphMutator preserve identical soft admission and persisted bindings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'feed-slot-mutation-')); const store = createWorkspaceStore({ workspacesDir: join(dir, 'workspaces') });
  try {
    const ws = store.create('parity'); const current = graph();
    assert.equal(mutateWorkspaceGraph(store, ws.id, { addNodes: current.nodes }, { catalog }).ok, true);
    const result = mutateWorkspaceGraph(store, ws.id, connect, { catalog });
    const plan = planCanvasInputMutation(current, connect, { catalog });
    assert.equal(result.ok, true); assert.deepEqual(target(result.snapshot).data.slotBindings, target(plan).data.slotBindings);
    const noCatalog = store.create('no-catalog'); mutateWorkspaceGraph(store, noCatalog.id, { addNodes: current.nodes }, { catalog: null });
    assert.equal(mutateWorkspaceGraph(store, noCatalog.id, connect, { catalog: null }).ok, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('explicit slot repairs clear old conflicts and semantic handles pin newly selected media', () => {
  const current = graph(gen('vid-frames', 'first_last_frame', 'video'));
  const first = planCanvasInputMutation(current, connect, { catalog });
  target(first).data.slotConflicts = [{ slot: 'old', occupant: { sourceNodeId: 'src', edgeId: 'e', pinned: true }, reason: 'slot_removed' }];
  const repaired = planCanvasInputMutation(first, { nodePatches: [{ nodeId: 'gen', data: { slotBindings: {
    start_frame: [{ sourceNodeId: 'src', edgeId: 'e', pinned: true }], end_frame: [],
  } } }] }, { catalog });
  assert.deepEqual(target(repaired).data.slotConflicts, []);
  const withTail = planCanvasInputMutation(repaired, { addNodes: [source('tail')], addEdges: [{ id: 'tail', source: 'tail', target: 'gen', targetHandle: 'end_frame' }] }, { catalog });
  assert.equal(target(withTail).data.slotBindings.end_frame[0].pinned, true);
  assert.equal(target(withTail).data.slotBindings.end_frame[0].sourceNodeId, 'tail');
});
test('repeating an invalid saved model remains fail-closed', () => {
  const current = graph(gen('unknown'));
  assert.equal(planCanvasInputMutation(current, { nodePatches: [{ nodeId: 'gen', data: { params: { model: 'unknown' } } }] }, { catalog }).status, 'rejected');
});
test('source fingerprint retains semantic handles but excludes generic input handles', () => {
  for (const [handle, expected] of [['in', undefined], ['end_frame', 'end_frame'], ['first_frame', 'first_frame']]) {
    const fp = buildCanvasUpstreamFingerprint('gen', graph().nodes, [{ id: 'e', source: 'src', target: 'gen', targetHandle: handle }]);
    assert.equal(fp.assets[0].targetSlot, expected);
  }
});
