import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readNodeInputSource } from './nodeInputSource.ts';
import { resolveGenerationPrompt } from './generationPrompt.ts';
import { buildUiUpstreamFingerprint, buildEffectiveOpsUiState } from '../validation/operationUi.ts';
import { createMaterialGatewayExecutor } from '../../workflow/execution/materialGatewayExecutor.ts';
import { catalogFor } from '../../workflow/seam/submissionFixtures.mjs';

const catalog = { models: [{ id: 'test-text', listed: true, operations: [{
  id: 'text_to_text', listed: true, output: { type: 'text' },
  inputs: [{ slot: 'prompt', role: 'prompt', type: 'text', source: 'node_field', min: 1, max: 1 }],
}] }] };
function snapshot(node) {
  const current = readNodeInputSource(node);
  return { nodeId: node.id, materialType: current.materialType, availability: current.availability,
    availabilityMessage: current.message, outputId: current.outputId, textContent: current.output.text };
}

test('IN-04/05/07: current source outputs and local rewrite instructions reach the captured request in edge order', async () => {
  const old = { id: 'one', data: { materialType: 'text', content: 'OLD', generatedContent: '原始剧本', prompt: 'PRIVATE SOURCE PROMPT' } };
  const two = { id: 'two', data: { materialType: 'text', content: '第二段正文' } };
  const upstreams = [two, old].map(snapshot);
  const fingerprint = buildUiUpstreamFingerprint({ prompt: '缩短到30秒', upstreams });
  assert.equal(fingerprint.prompt, '来源 1：\n第二段正文\n\n来源 2：\n原始剧本\n\n补充要求：\n缩短到30秒');
  const requests = [];
  const executor = createMaterialGatewayExecutor({ gateway: {
    submit: async (request) => { requests.push(request); return { taskId: 'capture', mode: 'stub' }; },
    awaitTask: async () => ({ text: 'result' }),
    capabilities: async () => catalogFor('text'),
  } });
  const outputs = new Map([old, two].map((node) => [node.id, readNodeInputSource(node).output]));
  await executor.execute({ id: 'target', type: 'material', data: { materialType: 'text', prompt: '缩短到30秒' } }, {
    upstreamOutputs: outputs, upstreamBindings: [two, old].map((node) => ({ sourceNodeId: node.id, output: outputs.get(node.id) })),
    signal: new AbortController().signal, mediaDir: '/tmp/effective-input-test',
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].prompt, fingerprint.prompt);
});

test('IN-06/08: local text cannot conceal a connected empty source; edits invalidate the fingerprint', () => {
  const source = { id: 'source', data: { materialType: 'text', content: 'stale', generatedContent: '' } };
  const waiting = buildUiUpstreamFingerprint({ prompt: 'local', upstreams: [snapshot(source)] });
  const state = buildEffectiveOpsUiState({ catalog, modelId: 'test-text', fingerprint: waiting, outputType: 'text' });
  assert.equal(state.blockGenerate, true);
  assert.equal(state.reasonCode, 'input_waiting');
  source.data.generatedContent = '1dog';
  const ready = buildUiUpstreamFingerprint({ prompt: 'local', upstreams: [snapshot(source)] });
  assert.notEqual(ready.signature, waiting.signature);
  assert.equal(buildEffectiveOpsUiState({ catalog, modelId: 'test-text', fingerprint: ready, outputType: 'text' }).blockGenerate, false);
});

test('IN-17: spoken text excludes source labels and unsupported local direction never enters a request', async () => {
  assert.equal(resolveGenerationPrompt({ materialType: 'audio' }, ['第一句', '第二句']), '第一句\n\n第二句');
  let requests = 0;
  const executor = createMaterialGatewayExecutor({ gateway: { submit: async () => { requests++; } } });
  await assert.rejects(executor.execute({ id: 'speech', data: { materialType: 'audio', prompt: '温柔一点' } }, {
    upstreamOutputs: new Map([['body', { text: '朗读正文' }]]), signal: new AbortController().signal, mediaDir: '/tmp/effective-input-test',
  }), /不能分别表达/);
  assert.equal(requests, 0);
});

test('IN-23: same image may fill two frame roles, but cannot duplicate the same binding', async () => {
  const { validateCanvasConnectionStructure } = await import('./canvasConnectionStructure.ts');
  const nodes = [
    { id: 'source', type: 'material', data: { materialType: 'image', nodeKind: 'import' } },
    { id: 'target', type: 'material', data: { materialType: 'video', nodeKind: 'generate' } },
  ];
  const edge = { id: 'first', source: 'source', target: 'target', data: { role: 'first_frame', targetSlot: 'first_frame' } };
  assert.equal(validateCanvasConnectionStructure({ ...edge, data: { role: 'last_frame', targetSlot: 'last_frame' } }, nodes, [edge]).valid, true);
  assert.equal(validateCanvasConnectionStructure({ ...edge, sourceHandle: 'another-visual-handle' }, nodes, [edge]).reasonCode, 'duplicate_edge');
  const automatic = { ...edge, data: { slotBinding: { slot: 'reference_images', role: 'reference', type: 'image' } } };
  assert.equal(validateCanvasConnectionStructure({ source: edge.source, target: edge.target }, nodes, [automatic]).reasonCode, 'duplicate_edge');
  assert.equal(validateCanvasConnectionStructure({ source: edge.source, target: edge.target, data: { role: 'reference' } }, nodes, [automatic]).reasonCode, 'duplicate_edge');
});

test('IN-10: upstream description satisfies both shared and video-specific prompt validation', async () => {
  const { validateVideoParamsForUi } = await import('../../canvas/editor/components/MaterialNode/ConfigPanel/videoParams/videoParamAdapter.ts');
  const upstreams = [{ nodeId: 'script', materialType: 'text', availability: 'ready', textContent: '1dog' }];
  for (const materialType of ['image', 'video']) {
    const model = { id: `test-${materialType}`, listed: true, operations: [{ id: `text_to_${materialType}`, listed: true,
      output: { type: materialType }, inputs: [{ slot: 'prompt', role: 'prompt', type: 'text', source: 'node_field', min: 1, max: 1 }] }] };
    const fingerprint = buildUiUpstreamFingerprint({ materialType, prompt: '', upstreams });
    const state = buildEffectiveOpsUiState({ catalog: { models: [model] }, modelId: model.id, fingerprint, outputType: materialType });
    assert.equal(state.blockGenerate, false);
    if (materialType === 'video') {
      assert.deepEqual(validateVideoParamsForUi({ prompt: '', upstreams, params: {
        operation: 'text_to_video', effectiveOperations: state.effectiveOps, schema: {},
      } }), []);
      assert.match(validateVideoParamsForUi({ prompt: '', upstreams: [], params: {
        operation: 'text_to_video', effectiveOperations: state.effectiveOps, schema: {},
      } })[0], /提示词/);
    }
    let request;
    await createMaterialGatewayExecutor({ gateway: {
      submit: async (input) => { request = input; return { taskId: 'captured' }; },
      awaitTask: async () => ({ url: 'https://example.test/result' }),
      capabilities: async () => catalogFor(materialType),
    } }).execute({ id: 'target', data: { materialType, prompt: '' } }, {
      upstreamOutputs: new Map([['script', { text: '1dog' }]]), signal: new AbortController().signal, mediaDir: '/tmp/effective-input-test',
    });
    assert.equal(request.prompt, '1dog');
  }
});
