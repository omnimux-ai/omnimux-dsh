import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { transformSync } from 'esbuild';
import { planCanvasInputMutation } from '../../../../shared/graph/canvasInputMutationGateway.ts';

// Execute the production callback body, not a duplicate mutation algorithm.
const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');
const callback = source.match(/const updateNodeData = useCallback\(\s*([\s\S]*?),\s*\[[^\]]*\],\s*\);/)?.[1];
assert.ok(callback, 'production updateNodeData callback must be discoverable');
const patch = source.match(/function patchNodeData\([\s\S]*?\n\}/)?.[0];
assert.ok(patch);
const compiled = transformSync(`${patch}\nconst callback = ${callback};`, { loader: 'ts', target: 'es2022' }).code;
function harness() {
  const old = { id: 'target', type: 'material', position: { x: 0, y: 0 }, data: { nodeKind: 'generate', materialType: 'text', prompt: 'keep prompt', params: { model: 'wrong-video' }, compat: { status: 'configuration_error', readyToSubmit: false } } };
  const input = { id: 'asset', type: 'material', position: { x: 0, y: 0 }, data: { nodeKind: 'import', materialType: 'image', mediaUrl: '/media/image.png', mediaAssets: [{ type: 'image', url: '/media/image.png', mimeType: 'image/png' }], mimeType: 'image/png', executionStatus: 'completed' } };
  const operation = { id: 'chat', listed: true, output: { type: 'text' }, inputs: [{ slot: 'reference_images', type: 'image', role: 'reference', source: 'upstream_edge', min: 0, max: 4 }] };
  const catalog = { source: 'omnimux', text: [{ id: 'gemini-3.8-flash', label: 'Gemini' }], image: [], video: [], audio: [], models: [{ id: 'gemini-3.8-flash', operations: [operation, { ...operation, id: 'vision_chat' }] }] };
  let graph = { nodes: [old, input], edges: [{ id: 'edge', source: 'asset', target: 'target', targetHandle: 'in' }] };
  let transactions = 0, plainWrites = 0;
  const setNodes = updater => { plainWrites++; graph = { ...graph, nodes: updater(graph.nodes) }; };
  const apply = mutation => { transactions++; const result = planCanvasInputMutation(graph, mutation, { catalog }); if (result.status === 'allowed') graph = result; return result; };
  const getCallback = () => new Function('id', 'nodeData', 'setNodes', 'applyCanvasInputMutation', `${compiled}\nreturn callback;`)('target', graph.nodes[0].data, setNodes, apply);
  return { update: updates => getCallback()(updates), state: () => ({ ...graph, transactions, plainWrites }) };
}
test('model selection atomically updates slots and compatibility without a plain write', () => {
  const h = harness(); h.update({ params: { model: 'gemini-3.8-flash', operation: 'chat' } });
  const s = h.state(); assert.equal(s.transactions, 1); assert.equal(s.plainWrites, 0);
  assert.equal(s.nodes[0].data.compat.readyToSubmit, true, JSON.stringify(s.nodes[0].data.compat));
  assert.equal(s.nodes[0].data.slotBindings.reference_images[0].edgeId, 'edge');
  assert.equal(s.nodes[0].data.prompt, 'keep prompt'); assert.equal(s.edges.length, 1);
});
test('operation-only change uses a transaction; routing, size and prompt do not', () => {
  const h = harness(); h.update({ params: { model: 'gemini-3.8-flash', operation: 'chat' } });
  h.update({ params: { model: 'gemini-3.8-flash', operation: 'vision_chat' } });
  assert.equal(h.state().transactions, 2);
  h.update({ params: { model: 'gemini-3.8-flash', operation: 'vision_chat', routing: { strategy: 'speed_first' } } });
  h.update({ nodeHeight: 300 }); h.update({ prompt: 'new prompt' });
  assert.equal(h.state().transactions, 2); assert.equal(h.state().plainWrites, 3);
});
test('rejected model transaction never falls back to writing invalid params', () => {
  const h = harness(); h.update({ params: { model: 'unknown' } });
  assert.equal(h.state().transactions, 1); assert.equal(h.state().plainWrites, 0);
  assert.equal(h.state().nodes[0].data.params.model, 'wrong-video');
});
