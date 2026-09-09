import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planResourcePickerCommit } from './resourcePickerPolicy.ts';
import { planCanvasInputMutation } from '../../../shared/graph/canvasInputMutationGateway.ts';
import { catalogFor, operation, slot } from '../../../workflow/seam/submissionFixtures.mjs';

const occupant = id => ({ sourceNodeId: id, edgeId: `e-${id}`, pinned: true });
const image = id => ({ id, type: 'material', position: { x: 0, y: 0 }, data: {
  materialType: 'image', nodeKind: 'import', mediaUrl: `https://example.test/${id}.png`,
} });
function fixture(max, connected) {
  const target = { ...image('target'), data: { materialType: 'image', nodeKind: 'generate', prompt: 'describe',
    params: { model: 'refs', operation: 'image_to_image' }, slotBindings: { refs: [occupant('a'), occupant('b')] } } };
  return { nodes: [target, ...['a', 'b', 'c'].map(image)],
    edges: ['a', 'b', ...(connected ? ['c'] : [])].map(id => ({ id: `e-${id}`, source: id, target: 'target' })),
    catalog: catalogFor('image', 'refs', [operation('image_to_image', 'image', [slot('image', 'reference', 0, max, 'refs')])]) };
}
function planFor(f, overrides = {}) {
  return planResourcePickerCommit({ ...f, targetNodeId: 'target', targetSlot: 'refs', replaceEdgeId: 'e-a',
    mode: 'replace', slotMax: 2, acceptedTypes: ['image'], selectedCanvasNodeIds: ['c'], localFiles: [], ...overrides });
}
for (const max of [2, 3, null]) {
  for (const connected of [true, false]) {
    test(`replace stable occupant with ${connected ? 'Feed' : 'new'} source at capacity ${max}`, () => {
      const f = fixture(max, connected);
      const before = structuredClone(f);
      const result = planCanvasInputMutation(f, planFor(f, { slotMax: max }), { catalog: f.catalog });
      assert.equal(result.status, 'allowed');
      assert.deepEqual(result.nodes[0].data.slotBindings.refs.map(item => item.sourceNodeId), ['c', 'b']);
      assert.deepEqual(result.nodes[0].data.slotConflicts, []);
      assert.equal(result.edges.length, 3);
      assert.ok(result.edges.some(edge => edge.id === 'e-a'));
      assert.deepEqual(f, before);
      const reloaded = JSON.parse(JSON.stringify(result));
      const recomputed = planCanvasInputMutation(reloaded, { nodePatches: [{ nodeId: 'target', data: { prompt: 'edited' } }] }, { catalog: f.catalog });
      assert.deepEqual(recomputed.nodes[0].data.slotBindings.refs.map(item => item.sourceNodeId), ['c', 'b']);
      const reuse = planResourcePickerCommit({ nodes: recomputed.nodes, edges: recomputed.edges, targetNodeId: 'target',
        targetSlot: 'refs', replaceEdgeId: recomputed.nodes[0].data.slotBindings.refs[0].edgeId,
        acceptedTypes: ['image'], selectedCanvasNodeIds: ['a'], localFiles: [], mode: 'replace' });
      const restored = planCanvasInputMutation(recomputed, reuse, { catalog: f.catalog });
      assert.deepEqual(restored.nodes[0].data.slotBindings.refs.map(item => item.sourceNodeId), ['a', 'b']);
    });
  }
}
test('replacement resolves reordered occupant at commit time and rejects disappeared identity', () => {
  const f = fixture(2, true);
  f.nodes[0].data.slotBindings.refs.reverse();
  const result = planCanvasInputMutation(f, planFor(f), { catalog: f.catalog });
  assert.deepEqual(result.nodes[0].data.slotBindings.refs.map(item => item.sourceNodeId), ['b', 'c']);
  assert.equal(planFor(f, { replaceEdgeId: 'gone' }).hasWork, false);
  assert.equal(planFor(f, { selectedCanvasNodeIds: ['b'] }).hasWork, false);
  assert.equal(planFor(f, { selectedCanvasNodeIds: ['c', 'a'] }).hasWork, false);
});
test('replacing a later automatic occupant preserves visible order', () => {
  const f = fixture(2, true);
  f.nodes[0].data.slotBindings.refs.forEach(item => { item.pinned = false; });
  const result = planCanvasInputMutation(f, planFor(f, { replaceEdgeId: 'e-b' }), { catalog: f.catalog });
  assert.deepEqual(result.nodes[0].data.slotBindings.refs.map(item => item.sourceNodeId), ['a', 'c']);
});
test('local file replacement adds a node and edge in the same slot mutation', () => {
  const f = fixture(2, false);
  const plan = planFor(f, { selectedCanvasNodeIds: [], localFiles: [{ id: 'file', name: 'new.png', mime: 'image/png', size: 10, realPath: '/tmp/new.png', materialType: 'image' }] });
  const result = planCanvasInputMutation(f, plan, { catalog: f.catalog });
  assert.equal(result.status, 'allowed');
  assert.equal(result.nodes[0].data.slotBindings.refs[0].sourceNodeId, plan.addNodes[0].id);
  assert.equal(result.nodes[0].data.slotBindings.refs[1].sourceNodeId, 'b');
  assert.equal(result.edges.length, 3);
});
test('cycle rejects replacement atomically and incompatible file does not create work', () => {
  const f = fixture(2, false);
  f.edges.push({ id: 'cycle', source: 'target', target: 'c' });
  const result = planCanvasInputMutation(f, planFor(f), { catalog: f.catalog });
  assert.equal(result.status, 'rejected');
  assert.equal(result.nodes, f.nodes);
  assert.equal(result.edges, f.edges);
  assert.equal(planFor(f, { selectedCanvasNodeIds: [], localFiles: [{ id: 'file', name: 'new.mp3', mime: 'audio/mpeg', size: 10, realPath: '/tmp/new.mp3', materialType: 'audio' }] }).hasWork, false);
});
