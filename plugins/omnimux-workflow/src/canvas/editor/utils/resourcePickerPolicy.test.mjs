/**
 * ResourcePicker 纯策略测试：列表 / 过滤 / MIME / 提交计划。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listCanvasResources,
  filterCanvasResources,
  mimeToMaterialType,
  formatFileSize,
  planResourcePickerCommit,
  planStandaloneImportNodes,
  planImportNodeFill,
  evaluateResourcePickerAvailability,
  planResourcePickerReplaceCommit,
} from './resourcePickerPolicy.ts';

function materialNode(id, materialType, extras = {}) {
  return {
    id,
    type: 'material',
    position: extras.position ?? { x: 400, y: 80 },
    data: {
      label: extras.label ?? id,
      materialType,
      status: extras.status ?? 'ready',
      mediaUrl: extras.mediaUrl,
      mediaAssets: extras.mediaAssets,
      content: extras.content,
      selectedTool: extras.selectedTool ?? (materialType === 'text' ? 'text-to-text' : 'import'),
      nodeWidth: extras.nodeWidth,
      nodeHeight: extras.nodeHeight,
      dimensions: extras.dimensions,
    },
  };
}

test('V1 qualified current picker lists selected ready text, not blank/waiting or local-only sources', () => {
  const source = (id, content, status = 'ready') => ({ id, type: 'material', position: { x: 0, y: 0 },
    data: { materialType: 'text', nodeKind: 'import', label: id, content, status } });
  const target = { id: 'target', type: 'material', position: { x: 0, y: 0 }, data: {
    materialType: 'image', nodeKind: 'generate', inputBindingVersion: 1, slotBindings: {},
    params: { model: 'qualified', operation: 'text_to_image' } } };
  const context = { catalog: { models: [{ id: 'qualified', operations: [{ id: 'text_to_image', listed: true,
    output: { type: 'image' }, inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1,
      valueSources: ['local_field', 'upstream_output'], composition: { kind: 'content_with_instruction', localRole: 'instruction' } }] }] }] } };
  const nodes = [target, source('a', 'Body A'), source('blank', '  '), source('waiting', '', 'running')];
  const items = listCanvasResources(nodes, [], 'target', context);
  assert.deepEqual(items.map(item => item.nodeId), ['a']);
  assert.equal(items[0].outputId, 'a:current');
  assert.equal(items[0].textContent, 'Body A');
  const localOnly = structuredClone(context);
  localOnly.catalog.models[0].operations[0].inputs[0].valueSources = ['local_field'];
  assert.deepEqual(listCanvasResources(nodes, [], 'target', localOnly), []);
  assert.deepEqual(listCanvasResources(nodes, [], 'target', { catalog: null }), []);
});

test('V1 strict adapter commits explicit selected text once through original gateway, supply stays unused and rejects stale output', async () => {
  const { planPickerSelectionMutation } = await import('./resourcePickerPolicy.ts');
  const { planCanvasInputMutation } = await import('../../../shared/graph/canvasInputMutationGateway.ts');
  const source = id => ({ id, type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text', nodeKind: 'import', content: id } });
  const target = { id: 'target', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text', nodeKind: 'generate',
    inputBindingVersion: 1, slotBindings: {}, params: { model: 'qualified', operation: 'chat' } } };
  const context = { catalog: { models: [{ id: 'qualified', operations: [{ id: 'chat', listed: true, output: { type: 'text' }, inputs: [
    { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1, valueSources: ['local_field', 'upstream_output'],
      composition: { kind: 'content_with_instruction', localRole: 'instruction' } }] }] }] } };
  const graph = { nodes: [source('a'), source('b'), target], edges: [{ id: 'supply', source: 'b', target: 'target' }] };
  const before = structuredClone(graph);
  const request = { targetNodeId: 'target', chosenOperationId: 'chat', selections: [{ sourceNodeId: 'a', outputId: 'a:current' }] };
  const prepared = planPickerSelectionMutation(graph, request, context);
  assert.equal(prepared.status, 'allowed');
  assert.equal(prepared.verdict.accepts, true);
  const result = planCanvasInputMutation(graph, prepared.mutation, context);
  assert.equal(result.status, 'allowed');
  assert.equal(result.edges.length, 2);
  assert.deepEqual(result.nodes.find(node => node.id === 'target').data.slotBindings.prompt.map(item => item.sourceNodeId), ['a']);
  assert.equal(result.nodes.find(node => node.id === 'target').data.slotBindings.prompt[0].outputId, 'a:current');
  const disabled = planPickerSelectionMutation(result, { targetNodeId: 'target', chosenOperationId: 'chat', setUse: {
    slot: 'prompt', edgeId: result.nodes.find(node => node.id === 'target').data.slotBindings.prompt[0].edgeId, use: 'inactive' } }, context);
  const stopped = planCanvasInputMutation(result, disabled.mutation, context);
  assert.equal(stopped.edges.length, 2);
  assert.equal(stopped.nodes.find(node => node.id === 'target').data.slotBindings.prompt[0].use, 'inactive');
  const stale = planPickerSelectionMutation(graph, { ...request, selections: [{ sourceNodeId: 'a', outputId: 'old' }] }, context);
  assert.equal(stale.status, 'rejected');
  assert.equal(stale.mutation, undefined);
  assert.deepEqual(graph, before);
});

test('R1 adapter→store allows two invalid intents to be disabled one by one without granting restore or arbitrary strict patches', async () => {
  const { planPickerSelectionMutation } = await import('./resourcePickerPolicy.ts');
  const { planCanvasInputMutation, validateCanvasInputSelection } = await import('../../../shared/graph/canvasInputMutationGateway.ts');
  const context = { catalog: { models: [{ id: 'qualified', operations: [{ id: 'chat', listed: true, output: { type: 'text' }, inputs: [
    { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1,
      valueSources: ['local_field', 'upstream_output'], composition: { kind: 'single_body', localRole: 'body' } }] }] }] } };
  const binding = (sourceNodeId, edgeId, ordinal) => ({ sourceNodeId, edgeId, outputId: `${sourceNodeId}:current`, ordinal, role: 'prompt', pinned: true, use: 'active' });
  const target = { id: 'target', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text', nodeKind: 'generate',
    inputBindingVersion: 1, prompt: 'Local', slotBindings: { prompt: [binding('a', 'ea', 0), binding('b', 'eb', 1)] },
    params: { model: 'qualified', operation: 'chat' } } };
  const graph = { nodes: [target], edges: [] };
  const original = structuredClone(graph);
  const intent = { targetNodeId: 'target', chosenOperationId: 'chat' };
  const first = planPickerSelectionMutation(graph, { ...intent, setUse: { slot: 'prompt', edgeId: 'ea', use: 'inactive' } }, context);
  assert.equal(first.status, 'allowed');
  assert.equal(first.verdict.ready, false);
  assert.equal(first.mutation.strictConsumption, undefined);
  assert.deepEqual(Object.keys(first.mutation.nodePatches[0].data), ['slotBindings']);
  const stoppedA = planCanvasInputMutation(graph, first.mutation, context);
  assert.equal(stoppedA.status, 'allowed');
  assert.deepEqual(validateCanvasInputSelection(stoppedA, intent, context).records.map(record => record.state), ['inactive', 'invalid']);
  const second = planPickerSelectionMutation(stoppedA, { ...intent, setUse: { slot: 'prompt', edgeId: 'eb', use: 'inactive' } }, context);
  const stoppedBoth = planCanvasInputMutation(stoppedA, second.mutation, context);
  assert.equal(stoppedBoth.status, 'allowed');
  assert.equal(validateCanvasInputSelection(stoppedBoth, intent, context).ready, true);
  assert.deepEqual(graph, original);
  const healthyA = { id: 'a', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text', nodeKind: 'import', content: 'Healthy A' } };
  const healthyGraph = { nodes: [healthyA, stoppedA.nodes[0]], edges: [{ id: 'ea', source: 'a', target: 'target' }] };
  const healthyBefore = structuredClone(healthyGraph);
  const restore = planPickerSelectionMutation(healthyGraph, { ...intent, setUse: { slot: 'prompt', edgeId: 'ea', use: 'active' } }, context);
  assert.equal(restore.status, 'rejected');
  assert.equal(restore.mutation, undefined);
  const arbitrary = planCanvasInputMutation(healthyGraph, { nodePatches: [{ nodeId: 'target', data: { prompt: 'Bypass' } }], strictConsumption: intent }, context);
  assert.equal(arbitrary.status, 'rejected');
  assert.equal(arbitrary.nodes, healthyGraph.nodes);
  assert.equal(arbitrary.edges, healthyGraph.edges);
  assert.deepEqual(healthyGraph, healthyBefore);
});

 test('mimeToMaterialType：MIME 优先，扩展名兜底，未知返回 null', () => {
  assert.equal(mimeToMaterialType('image/png'), 'image');
  assert.equal(mimeToMaterialType('video/mp4'), 'video');
  assert.equal(mimeToMaterialType('audio/mpeg'), 'audio');
  assert.equal(mimeToMaterialType('', 'hero.PNG'), 'image');
  assert.equal(mimeToMaterialType('application/octet-stream', 'clip.webm'), 'video');
  assert.equal(mimeToMaterialType('', 'voice.m4a'), 'audio');
  assert.equal(mimeToMaterialType('application/pdf', 'doc.pdf'), null);
  assert.equal(mimeToMaterialType('', 'readme'), null);
});

test('formatFileSize：B / KB / MB', () => {
  assert.equal(formatFileSize(512), '512 B');
  assert.equal(formatFileSize(2048), '2.0 KB');
  assert.equal(formatFileSize(2.5 * 1024 * 1024), '2.5 MB');
  assert.equal(formatFileSize(-1), '');
});

test('listCanvasResources：无目录不造候选，按上游契约列文本和媒体，区分供给与使用并解析真实预览元数据', () => {
  // Inline test-only DTO fixture, not a production model or supplier capability claim.
  const context = { catalog: {
    source: 'static-stub', schemaVersion: '1.1', fingerprint: 'fixture:picker-origin-qualified-v1',
    text: [], image: [], video: [], audio: [],
    models: [{ id: 'fixture-picker-origin-qualified', label: 'Picker contract fixture', operations: [{
      id: 'text_to_image', listed: true, output: { type: 'image' }, inputs: [
        { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1,
          valueSources: ['local_field', 'upstream_output'],
          composition: { kind: 'content_with_instruction', localRole: 'instruction' } },
        { slot: 'reference_image', type: 'image', role: 'reference', source: 'upstream_edge', min: 0, max: 1,
          valueSources: ['upstream_output'] },
        { slot: 'reference_video', type: 'video', role: 'reference', source: 'upstream_edge', min: 0, max: 1,
          valueSources: ['upstream_output'] },
      ],
    }] }],
  } };
  const target = materialNode('target', 'image', {
    mediaUrl: 'https://fixtures.invalid/self.png', selectedTool: 'text-to-image',
  });
  Object.assign(target.data, {
    nodeKind: 'generate', inputBindingVersion: 1,
    params: { model: 'fixture-picker-origin-qualified', operation: 'text_to_image' },
    slotBindings: {
      reference_image: [{ sourceNodeId: 'img-a', edgeId: 'e1', outputId: 'https://fixtures.invalid/a.png',
        role: 'reference', pinned: true, ordinal: 0, use: 'active' }],
      prompt: [{ sourceNodeId: 'txt-c', edgeId: 'e3', outputId: 'txt-c:current',
        role: 'prompt', pinned: true, ordinal: 1, use: 'inactive' }],
    },
  });
  const nodes = [
    target,
    materialNode('img-a', 'image', {
      label: '参考图.png', mediaUrl: 'https://fixtures.invalid/a.png',
      dimensions: { width: 1024, height: 768 },
    }),
    materialNode('vid-b', 'video', {
      label: '尾帧', mediaUrl: 'https://fixtures.invalid/fallback.mp4',
      mediaAssets: [{ type: 'image', url: 'https://fixtures.invalid/poster.png' },
        { type: 'video', url: 'https://fixtures.invalid/b.mp4' }],
    }),
    materialNode('txt-c', 'text', { label: '正文', content: 'hello', selectedTool: 'text-to-text' }),
    materialNode('img-free', 'image', { label: '未连接图片', mediaUrl: 'https://fixtures.invalid/free.png' }),
    materialNode('audio-unsupported', 'audio', { mediaUrl: 'https://fixtures.invalid/voice.mp3' }),
    materialNode('empty-d', 'image', { status: 'empty' }),
    materialNode('ready-without-output', 'image', { status: 'ready' }),
    materialNode('relative-preview', 'image', { mediaUrl: 'relative.png' }),
    materialNode('transient-preview', 'image', { mediaUrl: 'blob:transient' }),
    materialNode('wrong-asset-type', 'video', {
      mediaAssets: [{ type: 'image', url: 'https://fixtures.invalid/not-a-video.png' }],
    }),
    { ...materialNode('missing-preview', 'image', { mediaUrl: 'https://fixtures.invalid/missing.png' }),
      data: { materialType: 'image', label: '失效图片', mediaUrl: 'https://fixtures.invalid/missing.png', isMissing: true } },
    materialNode('blank-text', 'text', { content: '  ' }),
    materialNode('waiting-text', 'text', { content: '', status: 'running' }),
    { id: 'table-1', type: 'table', position: { x: 0, y: 0 }, data: {} },
  ];
  const edges = [
    { id: 'e1', source: 'img-a', target: 'target' },
    { id: 'e2', source: 'vid-b', target: 'target' },
    { id: 'e3', source: 'txt-c', target: 'target' },
  ];
  const before = structuredClone({ nodes, edges, context });
  assert.deepEqual(listCanvasResources(nodes, edges, 'target'), []);
  assert.deepEqual(listCanvasResources(nodes, edges, 'target', { catalog: null }), []);

  const items = listCanvasResources(nodes, edges, 'target', context);
  assert.deepEqual(items.map((item) => item.nodeId).sort(), ['img-a', 'img-free', 'txt-c', 'vid-b']);
  assert.equal(items.some((item) => item.nodeId === 'target'), false);
  const img = items.find((item) => item.nodeId === 'img-a');
  assert.equal(img.materialType, 'image');
  assert.equal(img.alreadyConnected, true);
  assert.equal(img.inUse, true);
  assert.equal(img.title, '参考图.png');
  assert.equal(img.outputId, 'https://fixtures.invalid/a.png');
  assert.equal(img.previewUrl, 'https://fixtures.invalid/a.png');
  assert.equal(img.subtitle, '1024 × 768');
  assert.equal(img.width, 1024);
  assert.equal(img.height, 768);
  const vid = items.find((item) => item.nodeId === 'vid-b');
  assert.equal(vid.materialType, 'video');
  assert.equal(vid.title, '尾帧');
  assert.equal(vid.alreadyConnected, true);
  assert.equal(vid.inUse, false);
  assert.equal(vid.outputId, 'https://fixtures.invalid/b.mp4');
  assert.equal(vid.previewUrl, 'https://fixtures.invalid/b.mp4');
  assert.equal(vid.subtitle, '');
  assert.equal(vid.width, undefined);
  assert.equal(vid.height, undefined);
  const text = items.find((item) => item.nodeId === 'txt-c');
  assert.equal(text.materialType, 'text');
  assert.equal(text.title, '正文');
  assert.equal(text.alreadyConnected, true);
  assert.equal(text.inUse, false);
  assert.equal(text.outputId, 'txt-c:current');
  assert.equal(text.textContent, 'hello');
  assert.equal(text.subtitle, 'hello');
  assert.equal(text.previewUrl, undefined);
  const free = items.find((item) => item.nodeId === 'img-free');
  assert.equal(free.alreadyConnected, false);
  assert.equal(free.inUse, false);
  assert.equal(free.previewUrl, 'https://fixtures.invalid/free.png');

  const changedIdentity = structuredClone(nodes);
  changedIdentity[0].data.slotBindings.reference_image[0].outputId = 'https://fixtures.invalid/old.png';
  assert.equal(listCanvasResources(changedIdentity, edges, 'target', context).find((item) => item.nodeId === 'img-a').inUse, true);
  changedIdentity[0].data.slotBindings.reference_image[0].outputId = 'https://fixtures.invalid/a.png';
  changedIdentity[0].data.slotBindings.reference_image[0].role = 'first_frame';
  assert.equal(listCanvasResources(changedIdentity, edges, 'target', context).find((item) => item.nodeId === 'img-a').inUse, false);
  changedIdentity[0].data.slotBindings.prompt[0].use = 'active';
  assert.equal(listCanvasResources(changedIdentity, edges, 'target', context).find((item) => item.nodeId === 'txt-c').inUse, true);

  const localOnly = structuredClone(context);
  for (const input of localOnly.catalog.models[0].operations[0].inputs) {
    input.source = 'node_field';
    input.valueSources = ['local_field'];
  }
  assert.deepEqual(listCanvasResources(nodes, edges, 'target', localOnly), []);
  const sourceOnlyText = structuredClone(context);
  delete sourceOnlyText.catalog.models[0].operations[0].inputs[0].valueSources;
  assert.deepEqual(listCanvasResources(nodes, edges, 'target', sourceOnlyText).map((item) => item.nodeId).sort(),
    ['img-a', 'img-free', 'vid-b']);
  const unlisted = structuredClone(context);
  unlisted.catalog.models[0].operations[0].listed = false;
  assert.deepEqual(listCanvasResources(nodes, edges, 'target', unlisted), []);
  assert.deepEqual({ nodes, edges, context }, before);
});

test('R2 active current changed output stays in use and inactive same-intent re-add preserves one binding', async () => {
  const { planPickerSelectionMutation } = await import('./resourcePickerPolicy.ts');
  const { planCanvasInputMutation } = await import('../../../shared/graph/canvasInputMutationGateway.ts');
  const { collectMaterialSlotInputs } = await import('../../../workflow/execution/materialSlotInputs.ts');
  const context = { catalog: { models: [{ id: 'qualified', operations: [{ id: 'chat', listed: true, output: { type: 'text' }, inputs: [
    { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1, valueSources: ['local_field', 'upstream_output'], composition: { kind: 'single_body', localRole: 'body' } }] }] }] } };
  for (const savedOutput of ['old-task', 'new-task']) {
    const source = { id: 'a', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text', nodeKind: 'generate', label: 'A', taskId: 'new-task', generatedContent: 'New A' } };
    const target = { id: 'target', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text', nodeKind: 'generate', inputBindingVersion: 1, prompt: 'Local', params: { model: 'qualified', operation: 'chat' },
      slotBindings: { prompt: [{ sourceNodeId: 'a', edgeId: 'ea', outputId: savedOutput, ordinal: 7, role: 'prompt', pinned: true, use: 'active' }] } } };
    const graph = { nodes: [source, target], edges: [{ id: 'ea', source: 'a', target: 'target' }] };
    assert.equal(listCanvasResources(graph.nodes, graph.edges, 'target', context)[0].inUse, true);
    target.data.slotBindings.prompt[0].use = 'inactive';
    assert.equal(listCanvasResources(graph.nodes, graph.edges, 'target', context)[0].inUse, false);
    const before = structuredClone(graph);
    const request = { targetNodeId: 'target', chosenOperationId: 'chat', selections: [{ sourceNodeId: 'a', outputId: 'new-task' }] };
    const prepared = planPickerSelectionMutation(graph, request, context);
    assert.equal(prepared.status, 'allowed');
    const applied = planCanvasInputMutation(graph, prepared.mutation, context);
    assert.equal(applied.status, 'allowed');
    const data = applied.nodes.find(node => node.id === 'target').data;
    assert.equal(data.slotBindings.prompt.length, 1);
    assert.equal(data.slotBindings.prompt[0].ordinal, 7);
    assert.equal(data.slotBindings.prompt[0].edgeId, 'ea');
    assert.equal(data.slotBindings.prompt[0].use, 'active');
    assert.equal(applied.edges.length, 1);
    const collected = collectMaterialSlotInputs(data, { upstreamOutputs: new Map(), upstreamBindings: [{ edgeId: 'ea', sourceNodeId: 'a', output: { text: 'New A', assetId: 'new-task' } }] }, context.catalog);
    assert.equal(collected.prompt, 'New A\n\nLocal');
    source.data.taskId = 'changed-while-selected';
    assert.equal(planPickerSelectionMutation(graph, request, context).status, 'rejected');
    source.data.taskId = 'new-task';
    assert.deepEqual(graph, before);
    const withBadB = structuredClone(graph);
    withBadB.nodes.find(node => node.id === 'target').data.slotBindings.prompt.push({ sourceNodeId: 'b', edgeId: 'eb', outputId: 'old-b', ordinal: 8, role: 'prompt', pinned: true, use: 'active' });
    const badBefore = structuredClone(withBadB);
    assert.equal(planPickerSelectionMutation(withBadB, request, context).status, 'rejected');
    assert.deepEqual(withBadB, badBefore);
  }
});

test('R5 current-operation verdict disables known JPEG and excluded model, but allows incomplete/pending loading', () => {
  const source = (id, mime) => ({ id, type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'image', nodeKind: 'import', label: id,
    mediaUrl: `https://fixtures.invalid/${id}`, ...(mime ? { mimeType: mime } : {}) } });
  const target = { id: 'target', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'image', nodeKind: 'generate', inputBindingVersion: 1,
    slotBindings: {}, params: { model: 'qualified', operation: 'image_to_image' } } };
  const context = { catalog: { models: [{ id: 'qualified', operations: [{ id: 'image_to_image', listed: true, output: { type: 'image' }, inputs: [
    { slot: 'references', type: 'image', role: 'reference', source: 'upstream_edge', min: 2, max: 3, allowedMimes: ['image/png'] }] }] }] } };
  const nodes = [target, source('png', 'image/png'), source('jpeg', 'image/jpeg'), source('unknown', undefined)];
  const items = listCanvasResources(nodes, [], 'target', context);
  assert.equal(items.find(item => item.nodeId === 'png').selectable, true);
  assert.equal(items.find(item => item.nodeId === 'jpeg').selectable, false);
  assert.equal(items.find(item => item.nodeId === 'unknown').selectable, true);
  const excluded = structuredClone(context);
  excluded.catalog.generationPolicy = { image: { allowedModelIds: [], preferredModelId: null } };
  assert.equal(listCanvasResources(nodes, [], 'target', excluded).some(item => item.selectable), false);
  assert.deepEqual(listCanvasResources([target], [], 'target', context), []);
});

test('R6 unnamed ready media stays discoverable with actual current asset name/title or approved type alias', () => {
  for (const type of ['image', 'video', 'audio']) {
    const target = { id: 'target', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'image', nodeKind: 'generate', inputBindingVersion: 1,
      slotBindings: {}, params: { model: 'qualified', operation: 'image_to_image' } } };
    const context = { catalog: { models: [{ id: 'qualified', operations: [{ id: 'image_to_image', listed: true, output: { type: 'image' }, inputs: [
      { slot: 'ref', type, role: 'reference', source: 'upstream_edge', min: 0, max: 3 }] }] }] } };
    const source = { id: 'internal-id', type: 'material', position: { x: 0, y: 0 }, data: { materialType: type, nodeKind: 'import', label: '',
      mediaAssets: [{ type, url: `https://fixtures.invalid/current.${type}`, name: 'actual-file', originalName: 'original-file' }] } };
    assert.equal(listCanvasResources([target, source], [], 'target', context)[0]?.title, 'original-file');
    delete source.data.mediaAssets[0].originalName;
    assert.equal(listCanvasResources([target, source], [], 'target', context)[0]?.title, 'actual-file');
    delete source.data.mediaAssets[0].name;
    source.data.mediaAssets[0].title = 'Actual title';
    assert.equal(listCanvasResources([target, source], [], 'target', context)[0]?.title, 'Actual title');
    delete source.data.mediaAssets[0].title;
    assert.equal(listCanvasResources([target, source], [], 'target', context)[0]?.titleKey, `panel.slot.${type}`);
  }
});

test('OCR9 legacy omitted operation resolves qualified catalog slots without static media fallback', () => {
  const target = { id: 'target', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'image', nodeKind: 'generate', params: { model: 'qualified' } } };
  const source = { id: 'a', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'image', nodeKind: 'import', label: 'A', mediaUrl: 'https://fixtures.invalid/a.png' } };
  const context = { catalog: { models: [{ id: 'qualified', operations: [{ id: 'image_to_image', listed: true, output: { type: 'image' }, inputs: [
    { slot: 'ref', type: 'image', role: 'reference', source: 'upstream_edge', min: 0, max: 1 }] }] }] } };
  const before = structuredClone(target);
  assert.deepEqual(listCanvasResources([target, source], [], 'target', context).map(item => item.nodeId), ['a']);
  assert.deepEqual(listCanvasResources([target, source], [], 'target', { catalog: null }), []);
  const localOnly = structuredClone(context);
  localOnly.catalog.models[0].operations[0].inputs[0].source = 'node_field';
  localOnly.catalog.models[0].operations[0].inputs[0].valueSources = ['local_field'];
  assert.deepEqual(listCanvasResources([target, source], [], 'target', localOnly), []);
  assert.deepEqual(target, before);
});

test('OCR3 adapter targets clicked slot when two roles share one edge', async () => {
  const { planPickerSelectionMutation } = await import('./resourcePickerPolicy.ts');
  const { planCanvasInputMutation } = await import('../../../shared/graph/canvasInputMutationGateway.ts');
  const source = id => ({ id, type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'image', nodeKind: 'import', mediaUrl: `https://fixtures.invalid/${id}.png`, mimeType: 'image/png' } });
  const occupant = role => ({ sourceNodeId: 'a', edgeId: 'ea', outputId: 'https://fixtures.invalid/a.png', ordinal: role === 'first_frame' ? 3 : 7, role, use: 'active', pinned: true });
  const target = { id: 'target', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'video', nodeKind: 'generate', inputBindingVersion: 1,
    params: { model: 'qualified', operation: 'first_last_frame' }, slotBindings: { start_frame: [occupant('first_frame')], end_frame: [occupant('last_frame')] } } };
  const context = { catalog: { models: [{ id: 'qualified', operations: [{ id: 'first_last_frame', listed: true, output: { type: 'video' }, inputs: [
    { slot: 'start_frame', type: 'image', role: 'first_frame', source: 'upstream_edge', min: 1, max: 1, allowedMimes: ['image/png'] },
    { slot: 'end_frame', type: 'image', role: 'last_frame', source: 'upstream_edge', min: 1, max: 1, allowedMimes: ['image/png'] }] }] }] } };
  const graph = { nodes: [source('a'), source('b'), target], edges: [{ id: 'ea', source: 'a', target: 'target' }] };
  const before = structuredClone(graph);
  const request = { targetNodeId: 'target', chosenOperationId: 'first_last_frame', replaceEdgeId: 'ea', replaceSlot: 'end_frame', selections: [{ sourceNodeId: 'b', outputId: 'https://fixtures.invalid/b.png', targetSlot: 'end_frame' }] };
  const prepared = planPickerSelectionMutation(graph, request, context);
  assert.equal(prepared.status, 'allowed');
  const applied = planCanvasInputMutation(graph, prepared.mutation, context);
  assert.equal(applied.status, 'allowed');
  const bindings = applied.nodes.find(node => node.id === 'target').data.slotBindings;
  assert.deepEqual(bindings.start_frame, before.nodes[2].data.slotBindings.start_frame);
  assert.equal(bindings.end_frame[0].sourceNodeId, 'b');
  assert.equal(bindings.end_frame[0].ordinal, 7);
  assert.deepEqual(graph, before);
  assert.equal(planPickerSelectionMutation(graph, { ...request, replaceSlot: undefined }, context).status, 'rejected');
});

test('filterCanvasResources：按类型与搜索词过滤', () => {
  const items = [
    { nodeId: 'n1', materialType: 'image', title: '参考图.png', alreadyConnected: false, subtitle: '1024 × 768' },
    { nodeId: 'n2', materialType: 'video', title: '尾帧.mp4', alreadyConnected: false, subtitle: 'n2' },
    { nodeId: 'n3', materialType: 'audio', title: '旁白.mp3', alreadyConnected: true, subtitle: 'n3' },
  ];
  assert.equal(filterCanvasResources(items, '', 'all').length, 3);
  assert.deepEqual(filterCanvasResources(items, '', 'image').map((i) => i.nodeId), ['n1']);
  assert.deepEqual(filterCanvasResources(items, '尾帧', 'all').map((i) => i.nodeId), ['n2']);
  assert.deepEqual(filterCanvasResources(items, 'n3', 'audio').map((i) => i.nodeId), ['n3']);
  assert.equal(filterCanvasResources(items, '不存在', 'all').length, 0);
});

test('planResourcePickerCommit：画布资源只给未连线节点加边，已连线进 rejected', () => {
  const nodes = [
    materialNode('target', 'video', { selectedTool: 'video-generation' }),
    materialNode('img-a', 'image', { mediaUrl: 'a.png' }),
    materialNode('img-b', 'image', { mediaUrl: 'b.png' }),
  ];
  const edges = [{ id: 'e1', source: 'img-a', target: 'target' }];
  const plan = planResourcePickerCommit({
    nodes,
    edges,
    targetNodeId: 'target',
    selectedCanvasNodeIds: ['img-a', 'img-b', 'target', 'missing'],
    localFiles: [],
  });
  assert.equal(plan.hasWork, true);
  assert.equal(plan.addEdges?.length, 1);
  assert.equal(plan.addEdges[0].source, 'img-b');
  assert.equal(plan.addEdges[0].target, 'target');
  assert.deepEqual(
    plan.rejected.map((r) => r.reason).sort(),
    ['already_connected', 'missing', 'self'],
  );
  assert.equal(plan.addNodes, undefined);
  assert.equal(plan.nodePatches, undefined);
});

test('planResourcePickerCommit：单文件也建上游并连线，不写入当前节点', () => {
  const nodes = [materialNode('target', 'image', { status: 'empty', selectedTool: 'image-to-image' })];
  const plan = planResourcePickerCommit({
    nodes,
    edges: [],
    targetNodeId: 'target',
    selectedCanvasNodeIds: [],
    localFiles: [
      {
        id: 'f1',
        name: 'hero.png',
        mime: 'image/png',
        size: 12,
        realPath: '/Users/me/hero.png',
        materialType: 'image',
      },
    ],
  });
  assert.equal(plan.hasWork, true);
  assert.equal(plan.nodePatches, undefined);
  assert.equal(plan.addNodes?.length, 1);
  assert.equal(plan.addEdges?.length, 1);
  assert.equal(plan.addEdges[0].target, 'target');
  const node = plan.addNodes[0];
  assert.equal(node.data.materialType, 'image');
  assert.equal(node.data.nodeKind, 'import');
  assert.equal(node.data.status, 'ready');
  assert.equal(node.data.realPath, '/Users/me/hero.png');
  assert.equal(node.data.content, 'hero.png');
  assert.equal(node.data.mediaUrl.includes('blob:'), false);
  assert.equal(node.data.mediaUrl.includes('/api/local-file?path='), true);
  assert.equal(node.data.mediaAssets[0].path, '/Users/me/hero.png');
  assert.ok(node.position.x < 400);
});

test('planResourcePickerCommit：多文件全部建上游，addNodes/addEdges 数等于文件数', () => {
  const nodes = [materialNode('target', 'image', { status: 'empty', position: { x: 600, y: 100 }, selectedTool: 'image-to-image' })];
  const plan = planResourcePickerCommit({
    nodes,
    edges: [],
    targetNodeId: 'target',
    selectedCanvasNodeIds: [],
    localFiles: [
      { id: 'f1', name: 'a.png', mime: 'image/png', size: 1, realPath: '/Users/me/a.png', materialType: 'image' },
      { id: 'f2', name: 'b.png', mime: 'image/png', size: 1, realPath: '/Users/me/b.png', materialType: 'image' },
      { id: 'f3', name: 'c.png', mime: 'image/png', size: 1, realPath: '/Users/me/c.png', materialType: 'image' },
    ],
  });
  assert.equal(plan.hasWork, true);
  assert.equal(plan.nodePatches, undefined);
  assert.equal(plan.addNodes?.length, 3);
  assert.equal(plan.addEdges?.length, 3);
  assert.ok(plan.addNodes.every((node) => node.position.x < 600));
  assert.ok(plan.addEdges.every((edge) => edge.target === 'target'));
  assert.ok(plan.addNodes.every((node) => node.data.materialType === 'image'));
  assert.ok(plan.addNodes.every((node) => node.data.nodeKind === 'import'));
});

test('planResourcePickerCommit：类型合同匹配建上游，不匹配进 rejected 且无 nodePatches', () => {
  const nodes = [materialNode('target', 'image', { status: 'empty', selectedTool: 'image-to-image' })];
  const plan = planResourcePickerCommit({
    nodes,
    edges: [],
    targetNodeId: 'target',
    selectedCanvasNodeIds: [],
    localFiles: [
      { id: 'f1', name: 'a.png', mime: 'image/png', size: 1, realPath: '/Users/me/a.png', materialType: 'image' },
      { id: 'f2', name: 'c.mp4', mime: 'video/mp4', size: 1, realPath: '/Users/me/c.mp4', materialType: 'video' },
    ],
  });
  assert.equal(plan.nodePatches, undefined);
  assert.equal(plan.addNodes?.length, 1);
  assert.equal(plan.addEdges?.length, 1);
  assert.equal(plan.addNodes[0].data.materialType, 'image');
  assert.equal(plan.addNodes[0].data.nodeKind, 'import');
  assert.equal(plan.rejected.some((r) => r.id === 'f2' && r.reason === 'type_contract'), true);
});

test('planResourcePickerCommit：当前节点为文本时全部本地文件走上游节点', () => {
  const nodes = [materialNode('target', 'text', { selectedTool: 'text-to-text', content: 'prompt' })];
  const plan = planResourcePickerCommit({
    nodes,
    edges: [],
    targetNodeId: 'target',
    selectedCanvasNodeIds: [],
    localFiles: [
      { id: 'f1', name: 'a.png', mime: 'image/png', size: 1, realPath: '/Users/me/a.png', materialType: 'image' },
    ],
  });
  assert.equal(plan.nodePatches, undefined);
  assert.equal(plan.addNodes?.length, 1);
  assert.equal(plan.addEdges?.length, 1);
  assert.equal(plan.addNodes[0].data.materialType, 'image');
});

test('planResourcePickerCommit：无 realPath 的 draft 视为 unsupported', () => {
  const nodes = [materialNode('target', 'image', { status: 'empty' })];
  const plan = planResourcePickerCommit({
    nodes,
    edges: [],
    targetNodeId: 'target',
    selectedCanvasNodeIds: [],
    localFiles: [
      { id: 'f1', name: 'hero.png', mime: 'image/png', size: 12, objectUrl: 'blob:hero', materialType: 'image' },
    ],
  });
  assert.equal(plan.hasWork, false);
  assert.equal(plan.nodePatches, undefined);
  assert.equal(plan.rejected[0].reason, 'unsupported');
});

test('planResourcePickerCommit：目标缺失时无 mutation', () => {
  const plan = planResourcePickerCommit({
    nodes: [],
    edges: [],
    targetNodeId: 'gone',
    selectedCanvasNodeIds: ['x'],
    localFiles: [],
  });
  assert.equal(plan.hasWork, false);
  assert.equal(plan.rejected[0].reason, 'missing');
});

test('planStandaloneImportNodes：空选择不建节点', () => {
  const plan = planStandaloneImportNodes({ files: [], origin: { x: 120, y: 80 } });
  assert.equal(plan.hasWork, false);
  assert.equal(plan.addNodes, undefined);
});

test('planStandaloneImportNodes：按文件类型落导入节点，取消路径不得出现空节点', () => {
  const plan = planStandaloneImportNodes({
    origin: { x: 200, y: 100 },
    files: [
      { id: 'f1', name: 'hero.png', mime: 'image/png', size: 12, realPath: '/Users/me/hero.png', materialType: 'image' },
      { id: 'f2', name: 'clip.mp4', mime: 'video/mp4', size: 20, realPath: '/Users/me/clip.mp4', materialType: 'video' },
      { id: 'f3', name: 'doc.pdf', mime: 'application/pdf', size: 8, realPath: '/Users/me/doc.pdf', materialType: 'text' },
    ],
  });
  assert.equal(plan.hasWork, true);
  assert.equal(plan.addNodes?.length, 2);
  assert.equal(plan.addNodes[0].data.nodeKind, 'import');
  assert.equal(plan.addNodes[0].data.selectedTool, 'import');
  assert.equal(plan.addNodes[0].data.materialType, 'image');
  assert.equal(plan.addNodes[0].data.realPath, '/Users/me/hero.png');
  assert.equal(plan.addNodes[1].data.materialType, 'video');
  assert.equal(plan.addNodes[1].selected, true);
  assert.equal(plan.addNodes[0].position.x, 200);
  assert.ok(plan.addNodes[1].position.y > plan.addNodes[0].position.y);
  assert.equal(plan.rejected.some((item) => item.id === 'f3' && item.reason === 'unsupported'), true);
  assert.equal(plan.addEdges, undefined);
});

test('planImportNodeFill：首个文件替换当前导入节点，其余向下落独立导入节点', () => {
  const nodes = [materialNode('target', 'image', {
    status: 'empty',
    selectedTool: 'import',
    position: { x: 400, y: 80 },
  })];
  const plan = planImportNodeFill({
    nodes,
    targetNodeId: 'target',
    files: [
      { id: 'f1', name: 'voice.wav', mime: 'audio/wav', size: 4, realPath: '/Users/me/voice.wav', materialType: 'audio' },
      { id: 'f2', name: 'b.png', mime: 'image/png', size: 2, realPath: '/Users/me/b.png', materialType: 'image' },
    ],
  });
  assert.equal(plan.hasWork, true);
  assert.equal(plan.nodePatches?.length, 1);
  assert.equal(plan.nodePatches[0].data.materialType, 'audio');
  assert.equal(plan.nodePatches[0].data.nodeKind, 'import');
  assert.equal(plan.nodePatches[0].data.realPath, '/Users/me/voice.wav');
  assert.equal(typeof plan.nodePatches[0].data.nodeWidth, 'number');
  assert.equal(typeof plan.nodePatches[0].data.nodeHeight, 'number');
  assert.equal(plan.addNodes?.length, 1);
  assert.equal(plan.addNodes[0].data.nodeKind, 'import');
  assert.equal(plan.addNodes[0].data.materialType, 'image');
  assert.equal(plan.addNodes[0].position.x, 400);
  assert.ok(plan.addNodes[0].position.y > 80);
  assert.equal(plan.addEdges, undefined);
});

test('evaluateResourcePickerAvailability：防重锁判定（活跃卡槽占用、当前使用中、溢出候选池）', () => {
  const mockSlotState = {
    modelId: 'test-model',
    operationId: 'image-to-video',
    capacity: 2,
    activeSlots: [
      {
        slotId: 'slot_0',
        slotIndex: 0,
        sourceNodeId: 'node_hero',
        materialType: 'image',
        label: 'Hero',
      },
      {
        slotId: 'slot_1',
        slotIndex: 1,
        sourceNodeId: 'node_bg',
        materialType: 'video',
        label: 'BG',
      },
    ],
    overflowPool: [
      {
        sourceNodeId: 'node_overflow_1',
        materialType: 'image',
        label: 'Extra Pic',
        addedAt: Date.now(),
      },
    ],
  };

  // 1. 追加模式：被活跃卡槽占用 -> isAssigned=true, disabled=true, '✓ 已添加'
  const addActive = evaluateResourcePickerAvailability({
    item: { nodeId: 'node_hero' },
    mode: 'add',
    slotState: mockSlotState,
  });
  assert.equal(addActive.isAssigned, true);
  assert.equal(addActive.isCurrentSlot, false);
  assert.equal(addActive.disabled, true);
  assert.equal(addActive.badgeLabel, '✓ 已添加');

  // 2. 替换模式：正是当前正在替换的槽位 (slotIndex === 0) -> isCurrentSlot=true, disabled=true, '当前使用中'
  const replaceCurrent = evaluateResourcePickerAvailability({
    item: { nodeId: 'node_hero' },
    mode: 'replace',
    targetSlotIndex: 0,
    slotState: mockSlotState,
  });
  assert.equal(replaceCurrent.isAssigned, false);
  assert.equal(replaceCurrent.isCurrentSlot, true);
  assert.equal(replaceCurrent.disabled, true);
  assert.equal(replaceCurrent.badgeLabel, '当前使用中');

  // 3. 替换模式：被其它活跃槽位占用 (slotIndex === 1, targetSlotIndex === 0) -> isAssigned=true, disabled=true, '✓ 已添加'
  const replaceOther = evaluateResourcePickerAvailability({
    item: { nodeId: 'node_bg' },
    mode: 'replace',
    targetSlotIndex: 0,
    slotState: mockSlotState,
  });
  assert.equal(replaceOther.isAssigned, true);
  assert.equal(replaceOther.isCurrentSlot, false);
  assert.equal(replaceOther.disabled, true);
  assert.equal(replaceOther.badgeLabel, '✓ 已添加');

  // 4. 处于溢出候选池中 -> 可选，显示标签「候选池中」
  const overflowRes = evaluateResourcePickerAvailability({
    item: { nodeId: 'node_overflow_1' },
    mode: 'replace',
    targetSlotIndex: 0,
    slotState: mockSlotState,
  });
  assert.equal(overflowRes.isAssigned, false);
  assert.equal(overflowRes.isCurrentSlot, false);
  assert.equal(overflowRes.disabled, false);
  assert.equal(overflowRes.badgeLabel, '候选池中');

  // 5. 画布上其他未连线节点 -> 正常可选
  const unlinkedRes = evaluateResourcePickerAvailability({
    item: { nodeId: 'node_fresh' },
    mode: 'replace',
    targetSlotIndex: 0,
    slotState: mockSlotState,
  });
  assert.equal(unlinkedRes.isAssigned, false);
  assert.equal(unlinkedRes.isCurrentSlot, false);
  assert.equal(unlinkedRes.disabled, false);
  assert.equal(unlinkedRes.badgeLabel, undefined);
});

test('planResourcePickerReplaceCommit：置换 Mutation 计划生成（溢出池提拔置换 vs 新连线替换）', () => {
  const target = materialNode('target', 'video', {
    selectedTool: 'image-to-video',
    params: { model: 'test-model' },
  });
  const heroNode = materialNode('node_hero', 'image');
  const freshNode = materialNode('node_fresh', 'image');
  const overflowNode = materialNode('node_overflow', 'image');

  const initialSlotState = {
    modelId: 'test-model',
    operationId: 'image-to-video',
    capacity: 1,
    activeSlots: [
      {
        slotId: 'slot_0',
        slotIndex: 0,
        sourceNodeId: 'node_hero',
        materialType: 'image',
        label: 'Hero',
      },
    ],
    overflowPool: [
      {
        sourceNodeId: 'node_overflow',
        materialType: 'image',
        label: 'Overflow Asset',
        addedAt: 1000,
      },
    ],
  };

  const nodes = [target, heroNode, freshNode, overflowNode];
  const edges = [
    { id: 'e1', source: 'node_hero', target: 'target' },
    { id: 'e2', source: 'node_overflow', target: 'target' },
  ];

  // A. 从溢出池置换：通过 promoteOverflowAsset 置换，无需新边，产生 nodePatches 更新 slotState
  const overflowPlan = planResourcePickerReplaceCommit({
    nodes,
    edges,
    targetNodeId: 'target',
    targetSlotIndex: 0,
    slotState: initialSlotState,
    selectedCanvasNodeId: 'node_overflow',
  });
  assert.equal(overflowPlan.hasWork, true);
  assert.equal(overflowPlan.nodePatches?.length, 1);
  const patchedState = overflowPlan.nodePatches[0].data.slotState;
  assert.equal(patchedState.activeSlots[0].sourceNodeId, 'node_overflow');
  assert.equal(patchedState.overflowPool[0].sourceNodeId, 'node_hero');

  // B. 从未连线节点替换：生成 addEdges 并将原槽位退入 overflowPool
  const freshPlan = planResourcePickerReplaceCommit({
    nodes,
    edges,
    targetNodeId: 'target',
    targetSlotIndex: 0,
    slotState: initialSlotState,
    selectedCanvasNodeId: 'node_fresh',
  });
  assert.equal(freshPlan.hasWork, true);
  assert.equal(freshPlan.addEdges?.length, 1);
  assert.equal(freshPlan.addEdges[0].source, 'node_fresh');
  assert.equal(freshPlan.addEdges[0].target, 'target');
  const freshPatchedState = freshPlan.nodePatches[0].data.slotState;
  assert.equal(freshPatchedState.activeSlots[0].sourceNodeId, 'node_fresh');
  assert.equal(freshPatchedState.overflowPool.some((o) => o.sourceNodeId === 'node_hero'), true);
});

test('planImportNodeFill：支持 edges 入参，生图节点原地蜕变并断开全部上游边、保留下游边', () => {
  const nodes = [
    materialNode('upstream_text', 'text', { content: 'prompt text' }),
    materialNode('target_gen_img', 'image', {
      nodeKind: 'generate',
      selectedTool: 'text-to-image',
      status: 'empty',
      position: { x: 500, y: 100 },
    }),
    materialNode('downstream_video', 'video', {
      nodeKind: 'generate',
      selectedTool: 'image-to-video',
      position: { x: 900, y: 100 },
    }),
  ];
  const edges = [
    { id: 'edge_in_1', source: 'upstream_text', target: 'target_gen_img' },
    { id: 'edge_in_2', source: 'other_upstream', target: 'target_gen_img' },
    { id: 'edge_out_1', source: 'target_gen_img', target: 'downstream_video' },
  ];

  const plan = planImportNodeFill({
    nodes,
    targetNodeId: 'target_gen_img',
    files: [
      {
        id: 'file_imported',
        name: 'photo.jpg',
        mime: 'image/jpeg',
        size: 1024,
        realPath: '/path/to/photo.jpg',
        materialType: 'image',
      },
    ],
    edges,
  });

  assert.equal(plan.hasWork, true);
  assert.equal(plan.nodePatches?.length, 1);
  const patch = plan.nodePatches[0];
  assert.equal(patch.nodeId, 'target_gen_img');
  assert.equal(patch.data.nodeKind, 'import');
  assert.equal(patch.data.selectedTool, 'import');
  assert.equal(patch.data.materialType, 'image');
  assert.equal(patch.data.status, 'ready');
  assert.equal(patch.data.realPath, '/path/to/photo.jpg');

  // 断开所有入边，保留出边
  assert.deepEqual(plan.removeEdgeIds, ['edge_in_1', 'edge_in_2']);
  assert.equal(plan.removeEdgeIds?.includes('edge_out_1'), false);
});

test('planImportNodeFill：无上游边时 removeEdgeIds 为 undefined', () => {
  const nodes = [
    materialNode('target', 'image', {
      nodeKind: 'generate',
      status: 'empty',
      position: { x: 100, y: 100 },
    }),
  ];
  const edges = [
    { id: 'other_edge', source: 'target', target: 'downstream' },
  ];

  const plan = planImportNodeFill({
    nodes,
    targetNodeId: 'target',
    files: [
      {
        id: 'f1',
        name: 'a.png',
        mime: 'image/png',
        size: 10,
        realPath: '/a.png',
        materialType: 'image',
      },
    ],
    edges,
  });

  assert.equal(plan.hasWork, true);
  assert.equal(plan.removeEdgeIds, undefined);
});

test('planImportNodeFill：多文件拖入空态生图节点，首文件就地蜕变并断入边，后续文件落独立导入节点', () => {
  const nodes = [
    materialNode('up_text', 'text', { content: 'prompt' }),
    materialNode('up_img', 'image', { previewUrl: 'https://example.com/ref.png' }),
    materialNode('target_gen', 'image', {
      nodeKind: 'generate',
      selectedTool: 'text-to-image',
      status: 'empty',
      position: { x: 300, y: 200 },
    }),
    materialNode('down_v', 'video', {
      nodeKind: 'generate',
      position: { x: 700, y: 200 },
    }),
    materialNode('unrelated_1', 'text', { content: 'other' }),
    materialNode('unrelated_2', 'image', { previewUrl: 'https://example.com/o.png' }),
  ];
  const edges = [
    { id: 'edge_in_text', source: 'up_text', target: 'target_gen' },
    { id: 'edge_in_img', source: 'up_img', target: 'target_gen' },
    { id: 'edge_out_video', source: 'target_gen', target: 'down_v' },
    { id: 'edge_unrelated', source: 'unrelated_1', target: 'unrelated_2' },
  ];

  const plan = planImportNodeFill({
    nodes,
    targetNodeId: 'target_gen',
    files: [
      {
        id: 'file_1',
        name: 'portrait.jpg',
        mime: 'image/jpeg',
        size: 2048,
        realPath: '/path/portrait.jpg',
        materialType: 'image',
      },
      {
        id: 'file_2',
        name: 'landscape.png',
        mime: 'image/png',
        size: 4096,
        realPath: '/path/landscape.png',
        materialType: 'image',
      },
    ],
    edges,
  });

  assert.equal(plan.hasWork, true);
  // 1. 首个文件就地蜕变
  assert.equal(plan.nodePatches?.length, 1);
  const patch = plan.nodePatches[0];
  assert.equal(patch.nodeId, 'target_gen');
  assert.equal(patch.data.nodeKind, 'import');
  assert.equal(patch.data.selectedTool, 'import');
  assert.equal(patch.data.materialType, 'image');
  assert.equal(patch.data.realPath, '/path/portrait.jpg');

  // 2. 第二个文件在下方落地为独立导入节点
  assert.equal(plan.addNodes?.length, 1);
  const added = plan.addNodes[0];
  assert.equal(added.data.nodeKind, 'import');
  assert.equal(added.data.selectedTool, 'import');
  assert.equal(added.data.materialType, 'image');

  // 3. 严格断开入边，保留出边与无关连线
  assert.deepEqual(plan.removeEdgeIds?.sort(), ['edge_in_img', 'edge_in_text'].sort());
  assert.equal(plan.removeEdgeIds?.includes('edge_out_video'), false);
  assert.equal(plan.removeEdgeIds?.includes('edge_unrelated'), false);
});

test('PM name precedence: node label → current title → originalName → asset name → real text → type alias', () => {
  for (const type of ['image', 'video', 'audio', 'text']) {
    const target = { id: 'target', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'image', nodeKind: 'generate', inputBindingVersion: 1,
      slotBindings: {}, params: { model: 'qualified', operation: 'current' } } };
    const context = { catalog: { models: [{ id: 'qualified', operations: [{ id: 'current', listed: true, output: { type: 'image' }, inputs: [
      { slot: 'input', type, role: type === 'text' ? 'prompt' : 'reference', source: type === 'text' ? 'node_field' : 'upstream_edge', min: 0, max: 3,
        valueSources: ['upstream_output'], ...(type === 'text' ? { composition: { kind: 'single_body', localRole: 'body' } } : {}) }] }] }] } };
    const source = { id: 'internal-source', type: 'material', position: { x: 0, y: 0 }, data: { materialType: type, nodeKind: 'import', label: '  Real label  ',
      title: 'Current node title', originalName: 'Node original', name: 'Node asset name', filename: 'never-filename.png', content: '  Real body excerpt  ',
      mediaUrl: `https://fixtures.invalid/current.${type}`, mediaAssets: type === 'text' ? undefined : [
        { type: 'image' === type ? 'video' : 'image', url: 'https://fixtures.invalid/unrelated', title: 'Unrelated output' },
        { type, url: `https://fixtures.invalid/current.${type}`, title: 'Current asset title', originalName: 'Current original', name: 'Current asset name', filename: 'never-asset-filename.png' }] } };
    const project = () => listCanvasResources([target, source], [], 'target', context)[0];
    const before = structuredClone({ source, target, context });
    assert.equal(project().title, 'Real label');
    assert.deepEqual({ source, target, context }, before);
    source.data.label = '   ';
    assert.equal(project().title, type === 'text' ? 'Current node title' : 'Current asset title');
    if (type !== 'text') delete source.data.mediaAssets[1].title;
    assert.equal(project().title, 'Current node title');
    delete source.data.title;
    assert.equal(project().title, type === 'text' ? 'Node original' : 'Current original');
    if (type !== 'text') delete source.data.mediaAssets[1].originalName;
    assert.equal(project().title, 'Node original');
    delete source.data.originalName;
    assert.equal(project().title, type === 'text' ? 'Node asset name' : 'Current asset name');
    if (type !== 'text') delete source.data.mediaAssets[1].name;
    delete source.data.name;
    assert.equal(project().title, type === 'text' ? 'Real body excerpt' : '');
    assert.equal(project().titleKey, type === 'text' ? undefined : `panel.slot.${type}`);
    if (type !== 'text') {
      source.data.title = 'Unassociated stale node title';
      delete source.data.mediaUrl;
      assert.equal(project().titleKey, `panel.slot.${type}`);
      delete source.data.title;
      source.data.label = source.id;
      assert.equal(project().titleKey, `panel.slot.${type}`);
      source.data.label = `https://fixtures.invalid/path.${type}`;
      assert.equal(project().titleKey, `panel.slot.${type}`);
      source.data.label = '/private/unrelated/file.png';
      assert.equal(project().titleKey, `panel.slot.${type}`);
      source.data.label = 'Image 1';
      assert.equal(project().title, 'Image 1');
    }
  }
});
