import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDispatchingNodeExecutor } from './nodeExecutors.ts';
import { createMaterialGatewayExecutor } from './materialGatewayExecutor.ts';
import { registerExecutor } from '../executors/registry.ts';
import { findExecutionReadinessFailure } from '../../shared/validation/executionReadiness.ts';

const catalog = { source: 'omnimux', models: [{ id: 'text-model', listed: true, operations: [{
  id: 'text_generate', listed: true, output: { type: 'text' }, inputs: [
    { slot: 'prompt', role: 'prompt', accepts: ['text'], source: 'node_field', min: 1, max: 1 },
  ],
}] }] };
const target = { id: 'target', type: 'material', data: { materialType: 'text', prompt: '缩短到 30 秒', params: { model: 'text-model', operation: 'text_generate' } } };
const edges = [{ source: 'first', target: 'target' }, { source: 'second', target: 'target' }];
function dispatch(outputs, requests, node = target, inputCatalog = catalog) {
  const gateway = {
    capabilities: async () => inputCatalog,
    submit: async (request) => { requests.push(request); return { taskId: 'captured', mode: 'mock' }; },
    awaitTask: async () => ({ text: 'done' }),
  };
  registerExecutor(createMaterialGatewayExecutor({ gateway }));
  return createDispatchingNodeExecutor({ gateway, mediaRoot: '/tmp', executionId: 'readiness', edges, abortController: new AbortController() }).executor(node, {
    getNodeOutput: (id) => outputs[id], reportProgress() {}, addMediaAsset() {},
  });
}

test('dispatch sends both current text outputs and the local instruction in stable edge order', async () => {
  const requests = [];
  await dispatch({ first: { text: '第一段剧本' }, second: { text: '第二段剧本' } }, requests);
  assert.equal(requests.length, 1);
  assert.ok(requests[0].prompt.includes('第一段剧本'));
  assert.ok(requests[0].prompt.includes('第二段剧本'));
  assert.ok(requests[0].prompt.includes('缩短到 30 秒'));
  assert.ok(requests[0].prompt.indexOf('第一段剧本') < requests[0].prompt.indexOf('第二段剧本'));
});

test('missing or empty scheduler outputs make zero gateway requests despite local text', async () => {
  for (const output of [undefined, {}, { status: 'waiting' }, { text: '' }, { text: '   ' }]) {
    const requests = [];
    await assert.rejects(dispatch({ first: { text: 'usable' }, second: output }, requests), /等待/);
    assert.equal(requests.length, 0);
  }
});

test('full scheduling may defer a generated dependency; single execution and missing imports cannot', () => {
  const generated = { id: 'first', type: 'material', data: { materialType: 'text', prompt: 'write', params: { model: 'text-model' } } };
  const imported = { id: 'second', type: 'material', data: { materialType: 'text', nodeKind: 'import', content: 'ready' } };
  const graph = { nodes: [generated, imported, target], edges };
  assert.equal(findExecutionReadinessFailure([target], catalog, graph).reasonCode, 'input_waiting');
  assert.equal(findExecutionReadinessFailure([target], catalog, { ...graph, scheduledNodeIds: new Set(['first', 'second', 'target']) }), null);
  imported.data.content = '';
  assert.equal(findExecutionReadinessFailure([target], catalog, { ...graph, scheduledNodeIds: new Set(['first', 'second', 'target']) }).reasonCode, 'input_waiting');
});


test('final operation validation rejects incompatible media and ambiguous audio text with zero requests', async () => {
  const requests = [];
  await assert.rejects(dispatch({ first: { mediaAssets: [{ type: 'image', url: 'https://example.test/image.png' }] }, second: { text: 'body' } }, requests));
  assert.equal(requests.length, 0);
  const audioCatalog = { source: 'omnimux', models: [{ id: 'voice-model', listed: true, operations: [{ id: 'speak', listed: true, output: { type: 'audio' }, inputs: [{ slot: 'prompt', role: 'prompt', source: 'node_field', accepts: ['text'], min: 1, max: 1 }] }] }] };
  await assert.rejects(dispatch({ first: { text: '朗读正文' }, second: { text: '另一段正文' } }, requests, { ...target, data: { materialType: 'audio', prompt: '温柔一点', params: { model: 'voice-model', operation: 'speak' } } }, audioCatalog), /正文/);
  assert.equal(requests.length, 0);
});
