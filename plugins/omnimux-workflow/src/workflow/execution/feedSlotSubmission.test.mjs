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

test('current waiting text has one pending reason at display, readiness and executor, never a submission', async () => {
  const inputCatalog = catalogFor('text', 'qualified', [{ ...operation('chat', 'text', []), inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1,
    valueSources: ['local_field', 'upstream_output'], composition: { kind: 'content_with_instruction', localRole: 'instruction' } }] }]);
  const source = { id: 'a', type: 'material', data: { materialType: 'text', nodeKind: 'generate', status: 'running' } };
  const target = { id: 'target', type: 'material', data: { materialType: 'text', nodeKind: 'generate', inputBindingVersion: 1, prompt: 'Local',
    params: { model: 'qualified', operation: 'chat' }, slotBindings: { prompt: [{ ...occupant('a'), use: 'active', role: 'prompt', ordinal: 0 }] } } };
  assert.equal(findExecutionReadinessFailure([target], inputCatalog, { nodes: [source, target], edges: [edge('a', 'text')] }).reasonCode, 'input_waiting');
  const gw = gateway(inputCatalog);
  await assert.rejects(createMaterialGatewayExecutor({ gateway: gw }).execute(target, context({ a: { text: '' } })), { code: 'input_waiting' });
  assert.equal(gw.requests.length, 0);
});

test('current explicit chat readiness uses the same operation as its text assembly, not a discovered vision operation', () => {
  const inputCatalog = catalogFor('text', 'qualified', [
    { ...operation('chat', 'text', []), inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1,
      valueSources: ['local_field', 'upstream_output'], composition: { kind: 'content_with_instruction', localRole: 'instruction' } }] },
    operation('vision_chat', 'text', [slot('image', 'reference', 0, 1, 'reference')]),
  ]);
  const source = { id: 'a', type: 'material', data: { materialType: 'text', nodeKind: 'import', content: 'A' } };
  const target = { id: 'target', type: 'material', data: { materialType: 'text', nodeKind: 'generate', inputBindingVersion: 1, prompt: 'Local',
    params: { model: 'qualified', operation: 'chat' }, slotBindings: { prompt: [{ ...occupant('a'), role: 'prompt', use: 'active', ordinal: 0 }] } } };
  assert.equal(findExecutionReadinessFailure([target], inputCatalog, { nodes: [source, target], edges: [edge('a', 'text')] }), null);
});

for (const kind of ['text', 'image', 'video', 'audio']) {
  test(`version1 ${kind} executor consumes A only, inactivates, resumes once, and permits local-only`, async () => {
    const textSlot = { slot: 'prompt', role: 'prompt', type: 'text', source: 'node_field', min: 1, max: 1,
      valueSources: ['local_field', 'upstream_output'], composition: { kind: kind === 'audio' ? 'single_body' : 'content_with_instruction', localRole: kind === 'audio' ? 'body' : 'instruction' } };
    const inputCatalog = catalogFor(kind, 'qualified', [{ ...operation('generate', kind, []), inputs: [textSlot] }]);
    const gw = gateway(inputCatalog);
    gw.awaitTask = async () => kind === 'text' ? { type: kind, text: 'offline result' } : { type: kind, url: `https://example.test/out.${kind}` };
    const target = { id: 'target', type: 'material', data: { materialType: kind, inputBindingVersion: 1,
      prompt: '本地。', params: { model: 'qualified', operation: 'generate' }, slotBindings: {
        prompt: [{ ...occupant('a'), outputId: 'a:current', ordinal: 0, role: 'prompt', use: 'active' }],
      } } };
    const ctx = context({}, { upstreamBindings: [
      { edgeId: 'e-a', sourceNodeId: 'a', output: { text: '选中。' } },
      { edgeId: 'e-b', sourceNodeId: 'b', output: { text: '供给勿用。' } },
    ] });
    const execute = createMaterialGatewayExecutor({ gateway: gw });
    await execute.execute(target, ctx);
    assert.equal(gw.requests[0].prompt, kind === 'audio' ? '选中。\n\n本地。' : '来源 1：\n选中。\n\n补充要求：\n本地。');
    target.data.slotBindings.prompt[0].use = 'inactive';
    await execute.execute(target, ctx);
    assert.equal(gw.requests[1].prompt, '本地。');
    target.data.slotBindings.prompt[0].use = 'active';
    await execute.execute(target, ctx);
    assert.equal(gw.requests[2].prompt, gw.requests[0].prompt);
    target.data.slotBindings = {};
    await execute.execute(target, ctx);
    assert.equal(gw.requests[3].prompt, '本地。');
    assert.equal(ctx.upstreamBindings.length, 2);
  });
}

test('current active invalid text blocks even beside a local value; inactive conflict does not block', async () => {
  const inputCatalog = catalogFor('text', 'qualified', [{ ...operation('chat', 'text', []), inputs: [{
    slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1,
    valueSources: ['local_field', 'upstream_output'], composition: { kind: 'content_with_instruction', localRole: 'instruction' },
  }] }]);
  const target = { id: 'target', type: 'material', data: { materialType: 'text', inputBindingVersion: 1, prompt: '本地。',
    params: { model: 'qualified', operation: 'chat' }, slotBindings: { prompt: [{ ...occupant('missing'), use: 'active' }] } } };
  const gw = gateway(inputCatalog); gw.awaitTask = async () => ({ type: 'text', text: 'offline' });
  const executor = createMaterialGatewayExecutor({ gateway: gw });
  await assert.rejects(executor.execute(target, context()), { code: 'input_unavailable' });
  assert.equal(gw.requests.length, 0);
  target.data.slotBindings = { removed: [{ ...occupant('missing'), use: 'active' }] };
  await assert.rejects(executor.execute(target, context()), { code: 'input_unavailable' });
  assert.equal(gw.requests.length, 0);
  target.data.slotBindings.removed[0].use = 'inactive';
  await executor.execute(target, context());
  assert.equal(gw.requests[0].prompt, '本地。');
});

test('current binding remains authoritative through production dispatch preparation and readiness', async () => {
  const inputCatalog = catalogFor('text', 'qualified', [{ ...operation('chat', 'text', []), inputs: [{
    slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1,
    valueSources: ['local_field', 'upstream_output'], composition: { kind: 'content_with_instruction', localRole: 'instruction' },
  }] }]);
  const target = { id: 'target', type: 'material', data: { materialType: 'text', inputBindingVersion: 1, prompt: '',
    params: { model: 'qualified', operation: 'chat' }, slotBindings: { prompt: [{ ...occupant('a'), use: 'active', ordinal: 0, role: 'prompt' }] } } };
  const nodes = ['a', 'b'].map(id => ({ id, type: 'material', data: { materialType: 'text', nodeKind: 'import', content: id === 'a' ? '已选。' : '勿用。' } }));
  const edges = ['a', 'b'].map(id => edge(id, 'text'));
  assert.equal(findExecutionReadinessFailure([target], inputCatalog, { nodes: [target, ...nodes], edges }), null);
  const gw = gateway(inputCatalog); gw.awaitTask = async () => ({ type: 'text', text: 'offline' });
  registerExecutor(createMaterialGatewayExecutor({ gateway: gw }));
  await createDispatchingNodeExecutor({ gateway: gw, edges, mediaRoot: '/tmp', executionId: 'current-text', abortController: new AbortController() }).executor(target, {
    getNodeOutput: id => ({ text: id === 'a' ? '已选。' : '勿用。' }), reportProgress() {}, addMediaAsset() {},
  });
  assert.equal(gw.requests[0].prompt, '已选。');
  const inactive = { ...target, data: { ...target.data, prompt: '本地。', slotBindings: { prompt: [{ ...target.data.slotBindings.prompt[0], use: 'inactive' }] } } };
  assert.equal(findExecutionReadinessFailure([inactive], inputCatalog, { nodes: [inactive, ...nodes], edges }), null);
});

test('version1 preparation never autofills supply or restores inactive intent; legacy remains unversioned', () => {
  const target = node({ first_frame: [{ ...occupant('a'), use: 'inactive', ordinal: 0, role: 'first_frame' }] });
  target.data.inputBindingVersion = 1;
  const nodes = [target, graphNode('a'), graphNode('b')];
  const before = structuredClone(nodes);
  const prepared = prepareExecutionSlotGraph(nodes, [edge('a'), edge('b')], catalog);
  assert.deepEqual(prepared.nodes[0].data.slotBindings, target.data.slotBindings);
  const empty = { ...target, data: { ...target.data, slotBindings: {} } };
  assert.deepEqual(prepareExecutionSlotGraph([empty, ...nodes.slice(1)], [edge('a'), edge('b')], catalog).nodes[0].data.slotBindings, {});
  assert.deepEqual(nodes, before);
  const legacy = node(undefined);
  const old = prepareExecutionSlotGraph([legacy, ...nodes.slice(1)], [edge('a'), edge('b')], catalog).nodes[0];
  assert.equal(old.data.inputBindingVersion, undefined);
  assert.equal(old.data.slotBindings.first_frame[0].sourceNodeId, 'a');
});

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
// f10735c6c (#2873 统一上游输入): 无专用 text 卡槽的媒体操作仍按契约接受文本——
// 未绑定连通上游文本 + 本地补充要求组合进 prompt，文本只作提示词不进 references。
test('media-only operation composes unbound upstream text with local prompt at gateway submission', async () => {
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
  assert.equal(gw.requests[0].prompt, '来源 1：\nupstream-must-not-leak\n\n补充要求：\nlocal-must-not-leak');
  assert.equal(gw.requests[0].references.length, 2);
  assert.ok(gw.requests[0].references.every((ref) => ref.type === 'image'));
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

test('F1 inactive required text conflicts never block V1 local-only readiness or consumption', async () => {
  const { effectiveInputDisplay } = await import('../../shared/graph/feedSlot/effectiveInputDisplay.ts');
  const { deriveSlotLayout } = await import('../../shared/graph/feedSlot/deriveSlotLayout.ts');
  const { validateCanvasInputSelection } = await import('../../shared/graph/canvasInputMutationGateway.ts');
  const inputCatalog = catalogFor('text', 'qualified', [{ ...operation('chat', 'text', []), inputs: [{
    slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1,
    valueSources: ['local_field', 'upstream_output'], composition: { kind: 'single_body', localRole: 'body' },
  }] }]);
  const l = deriveSlotLayout(inputCatalog, 'qualified', 'chat');
  for (const reason of ['type_mismatch', 'slot_removed', 'role_conflict']) {
    const inactive = { ...occupant('a'), outputId: 'old', use: 'inactive', role: 'prompt', ordinal: 0 };
    const target = { id: 'target', type: 'material', data: { materialType: 'text', nodeKind: 'generate', inputBindingVersion: 1,
      prompt: 'Local', params: { model: 'qualified', operation: 'chat' }, slotBindings: { prompt: [inactive] },
      slotConflicts: [{ slot: 'prompt', occupant: inactive, reason }] } };
    const graph = { nodes: [graphNode('a'), target], edges: [edge('a')] };
    const asset = { edgeId: 'e-a', sourceNodeId: 'a', outputId: 'new', type: 'image', availability: 'ready', url: 'https://example.test/a.png' };
    const display = effectiveInputDisplay(l, [asset], target.data.slotBindings, target.data.slotConflicts, [], [], 1);
    assert.equal(display.records[0].state, 'inactive');
    assert.equal(display.requiredUnavailable, undefined, reason);
    assert.equal(findExecutionReadinessFailure([target], inputCatalog, graph), null, reason);
    assert.equal(validateCanvasInputSelection(graph, { targetNodeId: 'target', chosenOperationId: 'chat' }, { catalog: inputCatalog }).ready, true);
    const gw = gateway(inputCatalog); gw.awaitTask = async () => ({ type: 'text', text: 'offline' });
    await createMaterialGatewayExecutor({ gateway: gw }).execute(target, context({ a: { text: 'Never consume' } }));
    assert.equal(gw.requests[0].prompt, 'Local');
  }
});

test('OCR8 upstream-only text excludes local fields from readiness and submission while dual origin composes normally', async () => {
  for (const composition of [{ kind: 'single_body', localRole: 'body' }, { kind: 'content_with_instruction', localRole: 'instruction' }]) {
    const textSlot = { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1, valueSources: ['upstream_output'], composition };
    const makeCatalog = valueSources => catalogFor('text', 'qualified', [{ ...operation('chat', 'text', []), inputs: [{ ...textSlot, valueSources }] }]);
    const source = { id: 'a', type: 'material', data: { materialType: 'text', nodeKind: 'import', content: 'A' } };
    const target = { id: 'target', type: 'material', data: { materialType: 'text', nodeKind: 'generate', inputBindingVersion: 1, prompt: 'Denied local',
      params: { model: 'qualified', operation: 'chat', voice: 'Never a body' }, slotBindings: { prompt: [{ ...occupant('a'), use: 'active', role: 'prompt', ordinal: 0 }] } } };
    const inputCatalog = makeCatalog(['upstream_output']); const gw = gateway(inputCatalog); gw.awaitTask = async () => ({ type: 'text', text: 'offline' });
    await createMaterialGatewayExecutor({ gateway: gw }).execute(target, context({ a: { text: 'A' } }));
    assert.equal(gw.requests[0].prompt, 'A');
    const empty = { ...target, data: { ...target.data, slotBindings: {} } };
    assert.notEqual(findExecutionReadinessFailure([empty], inputCatalog, { nodes: [source, empty], edges: [edge('a', 'text')] }), null);
    await assert.rejects(createMaterialGatewayExecutor({ gateway: gw }).execute(empty, context()), { code: 'min_unsatisfied' });
    assert.equal(gw.requests.length, 1);
    const both = gateway(makeCatalog(['local_field', 'upstream_output'])); both.awaitTask = gw.awaitTask;
    await createMaterialGatewayExecutor({ gateway: both }).execute(target, context({ a: { text: 'A' } }));
    assert.equal(both.requests[0].prompt, composition.kind === 'single_body' ? 'A\n\nDenied local' : '来源 1：\nA\n\n补充要求：\nDenied local');
  }
});

test('OCR8 V1 never remaps a local role that its composition cannot express', async () => {
  const { buildContractView, buildUpstreamFingerprint, matchOperationInputs } = await import('../../shared/validation/compatKernel.ts');
  for (const composition of [{ kind: 'single_body', localRole: 'instruction' }, { kind: 'content_with_instruction', localRole: 'body' },
    { kind: 'separate_roles', localRole: 'instruction' }]) {
    const inputCatalog = catalogFor('text', 'qualified', [{ ...operation('chat', 'text', []), inputs: [{
      slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1, valueSources: ['local_field', 'upstream_output'], composition,
    }] }]);
    const op = buildContractView(inputCatalog).models[0].operations[0];
    const matched = matchOperationInputs(op, buildUpstreamFingerprint({ prompt: 'Local', localText: 'Local' }));
    assert.equal(matched.ready, false); assert.ok(matched.pending.some(reason => reason.code === 'text_role_required'));
    const target = { id: 'target', type: 'material', data: { materialType: 'text', inputBindingVersion: 1, prompt: 'Local',
      params: { model: 'qualified', operation: 'chat' }, slotBindings: {} } };
    const gw = gateway(inputCatalog);
    await assert.rejects(createMaterialGatewayExecutor({ gateway: gw }).execute(target, context()), { code: 'text_role_required' });
    assert.equal(gw.requests.length, 0);
  }
});

test('OCR1 supplied edge context is authoritative: missing or wrong source never falls back to the same-source map', async () => {
  const inputCatalog = catalogFor('text', 'qualified', [{ ...operation('chat', 'text', []), inputs: [{
    slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1,
    valueSources: ['local_field', 'upstream_output'], composition: { kind: 'single_body', localRole: 'body' },
  }] }]);
  const target = { id: 'target', type: 'material', data: { materialType: 'text', nodeKind: 'generate', inputBindingVersion: 1,
    prompt: 'Local', params: { model: 'qualified', operation: 'chat' }, slotBindings: { prompt: [{
      edgeId: 'ea', sourceNodeId: 'a', outputId: 'old-task', role: 'prompt', ordinal: 3, pinned: true, use: 'active',
    }] } } };
  const before = structuredClone(target);
  const gw = gateway(inputCatalog); gw.awaitTask = async () => ({ type: 'text', text: 'offline' });
  const executor = createMaterialGatewayExecutor({ gateway: gw });
  for (const bindings of [[], [{ edgeId: 'different', sourceNodeId: 'a', output: { text: 'Wrong edge' } }],
    [{ edgeId: 'ea', sourceNodeId: 'other', output: { text: 'Wrong source' } }]]) {
    await assert.rejects(executor.execute(target, context({ a: { text: 'Map must not substitute' } }, { upstreamBindings: bindings })), { code: 'input_unavailable' });
    assert.equal(gw.requests.length, 0);
  }
  await executor.execute(target, context({ a: { text: 'Wrong map' } }, { upstreamBindings: [{ edgeId: 'ea', sourceNodeId: 'a', output: { text: 'Current body', assetId: 'new-task' } }] }));
  assert.equal(gw.requests[0].prompt, 'Current body\n\nLocal'); assert.equal(gw.requests[0].textInputs[0].outputId, 'new-task');
  await executor.execute(target, context({ a: { text: 'Compatible map', assetId: 'compat-task' } }));
  assert.equal(gw.requests[1].prompt, 'Compatible map\n\nLocal');
  assert.deepEqual(target, before);
});

test('OCR20 V1 malformed duplicates reach zero submissions while shared-edge distinct named roles remain legal', async () => {
  const inputCatalog = catalogFor('text', 'qualified', [{ ...operation('chat', 'text', []), inputs: [{
    slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1,
    valueSources: ['local_field', 'upstream_output'], composition: { kind: 'single_body', localRole: 'body' },
  }] }]);
  const saved = { sourceNodeId: 'a', edgeId: 'ea', outputId: 'old-task', ordinal: 0, role: 'prompt', use: 'active', pinned: true };
  const target = { id: 'target', type: 'material', data: { materialType: 'text', nodeKind: 'generate', inputBindingVersion: 1,
    prompt: 'Local', params: { model: 'qualified', operation: 'chat' }, slotBindings: {} } };
  const gw = gateway(inputCatalog); gw.awaitTask = async () => ({ type: 'text', text: 'offline' });
  const ctx = context({ a: { text: 'Wrong map' } }, { upstreamBindings: [
    { edgeId: 'ea', sourceNodeId: 'a', output: { text: 'Current', assetId: 'new-task' } },
    { edgeId: 'ea2', sourceNodeId: 'a', output: { text: 'Current', assetId: 'new-task' } },
  ] });
  for (const copies of [[saved, { ...saved, edgeId: 'ea2', ordinal: 1 }], [{ ...saved, use: 'inactive' }, { ...saved, ordinal: 1 }]]) {
    target.data.slotBindings = { prompt: copies }; const before = structuredClone(target);
    await assert.rejects(createMaterialGatewayExecutor({ gateway: gw }).execute(target, ctx), { code: 'input_unavailable' });
    assert.equal(gw.requests.length, 0); assert.deepEqual(target, before);
  }
  const frameTarget = node({ first_frame: [{ ...occupant('a'), role: 'first_frame', use: 'active', ordinal: 0 }],
    last_frame: [{ ...occupant('a'), role: 'last_frame', use: 'active', ordinal: 1 }] });
  frameTarget.data.inputBindingVersion = 1;
  const frames = gateway();
  await createMaterialGatewayExecutor({ gateway: frames }).execute(frameTarget, context({}, { upstreamBindings: [{ edgeId: 'e-a', sourceNodeId: 'a', output: media('a') }] }));
  assert.deepEqual(frames.requests[0].references.map(ref => [ref.edgeId, ref.role]), [['e-a', 'first_frame'], ['e-a', 'last_frame']]);
});

test('V1 dispatch rejects missing edge, wrong source and missing output before production transport despite same-source supply', async () => {
  const { buildModelCatalog } = await import('../../../../omnimux/src/catalog/list.js');
  const { executeOmnimuxText } = await import('../../../../omnimux/src/text/execute.js');
  const { createOmnimuxSeamClient } = await import('../seam/omnimuxGateway.ts');
  const inputCatalog = buildModelCatalog({ env: {} }); const captures = [];
  const env = { OMNIMUX_API_KEY: 'fixture-offline-only', OMNIMUX_BASE_URL: 'https://fixture.invalid/v1' };
  const seams = { modelCatalog: { list: () => inputCatalog }, textComplete: { execute: req => executeOmnimuxText({ ...req, env,
    allowedGroups: ['standard'], fetcher: async (url, init) => {
      captures.push({ url: String(url), body: JSON.parse(init.body) });
      return Response.json({ choices: [{ message: { content: 'offline' } }] });
    } }) } };
  const production = createOmnimuxSeamClient({ getSeam: name => seams[name], env: {} });
  registerExecutor(createMaterialGatewayExecutor({ gateway: production }));
  const target = { id: 'target', type: 'material', data: { materialType: 'text', nodeKind: 'generate', inputBindingVersion: 1,
    prompt: 'Local', params: { model: 'gemini-3.8-flash', operation: 'chat' }, slotBindings: { prompt: [{
      edgeId: 'ea', sourceNodeId: 'a', outputId: 'old-task', pinned: true, use: 'active', role: 'prompt', ordinal: 0,
    }] } } };
  const sources = ['a', 'b'].map(id => ({ id, type: 'material', data: { materialType: 'text', nodeKind: 'import', content: `${id} supply` } }));
  const supply = { id: 'other-a', source: 'a', target: 'target', data: { feedType: 'text' } };
  const good = { id: 'ea', source: 'a', target: 'target', data: { feedType: 'text' } };
  for (const [name, edges, outputs, expectedReason] of [
    ['missing edge', [supply], { a: { text: 'Same-source map must not substitute' } }, 'input_unavailable'],
    ['wrong source', [{ ...good, source: 'b' }, supply], { a: { text: 'Same-source map must not substitute' }, b: { text: 'Wrong source' } }, 'input_unavailable'],
    ['missing output', [good, supply], {}, 'input_waiting'],
    ['pending output', [good, supply], { a: { text: '', assetId: 'pending-task' } }, 'input_waiting'],
  ]) {
    const resolvedInputs = new Map(Object.entries(outputs).map(([id, output]) => [id, [{ nodeId: id, materialType: 'text',
      textContent: output.text, availability: output.text?.trim() ? 'ready' : 'waiting' }]]));
    const failure = findExecutionReadinessFailure([target], inputCatalog, { nodes: [], edges, resolvedInputs });
    assert.equal(failure.reasonCode, expectedReason, name);
    const before = structuredClone(target);
    await assert.rejects(createDispatchingNodeExecutor({ gateway: production, edges, mediaRoot: '/tmp', executionId: '2848-negative',
      abortController: new AbortController() }).executor(target, { getNodeOutput: id => outputs[id], reportProgress() {}, addMediaAsset() {} }),
    { message: failure.message }, name);
    assert.equal(captures.length, 0, name); assert.deepEqual(target, before, name);
  }
  assert.equal(findExecutionReadinessFailure([target], inputCatalog, { nodes: [target, ...sources], edges: [good] }), null);
  console.log('V1_DISPATCH_NEGATIVE_CAPTURE', JSON.stringify({ transportCalls: captures.length, reasons: ['input_unavailable', 'input_waiting'] }));
});

test('V1 production dispatch follows current text output and consumes only active A while B remains unused supply', async t => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path'); const { tmpdir } = await import('node:os');
  const { buildModelCatalog } = await import('../../../../omnimux/src/catalog/list.js');
  const { executeOmnimuxText } = await import('../../../../omnimux/src/text/execute.js');
  const { createOmnimuxSeamClient } = await import('../seam/omnimuxGateway.ts');
  const { readNodeInputSource } = await import('../../shared/graph/nodeInputSource.ts');
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-2848-dispatch-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const inputCatalog = buildModelCatalog({ env: {} }); const captures = []; const requests = [];
  const env = { OMNIMUX_API_KEY: 'fixture-offline-only', OMNIMUX_BASE_URL: 'https://fixture.invalid/v1' };
  const seams = { modelCatalog: { list: () => inputCatalog }, textComplete: { execute: req => executeOmnimuxText({ ...req, env,
    allowedGroups: ['standard'], fetcher: async (url, init) => {
      assert.equal(init.method, 'POST'); captures.push({ url: String(url), body: JSON.parse(init.body) });
      return Response.json({ choices: [{ message: { content: 'offline' } }] });
    } }) } };
  const production = createOmnimuxSeamClient({ getSeam: name => seams[name], env: {} });
  const gw = { ...production, submit: request => { requests.push(structuredClone({ ...request, signal: undefined })); return production.submit(request); } };
  registerExecutor(createMaterialGatewayExecutor({ gateway: gw }));
  const sourceA = { id: 'a', type: 'material', data: { materialType: 'text', nodeKind: 'generate', taskId: 'current-task', generatedContent: 'Current A.' } };
  const sourceB = { id: 'b', type: 'material', data: { materialType: 'text', nodeKind: 'generate', taskId: 'b-task', generatedContent: 'Unused B.' } };
  const target = { id: 'target', type: 'material', data: { materialType: 'text', nodeKind: 'generate', inputBindingVersion: 1,
    prompt: 'Local.', params: { model: 'gemini-3.8-flash', operation: 'chat' }, slotBindings: { prompt: [{
      edgeId: 'ea', sourceNodeId: 'a', outputId: 'saved-old-task', pinned: true, use: 'active', role: 'prompt', ordinal: 6,
    }] } } };
  const edges = ['a', 'b'].map(id => ({ id: `e${id}`, source: id, target: 'target', data: { feedType: 'text' } }));
  const run = async () => {
    const graph = prepareExecutionSlotGraph([sourceA, sourceB, target], edges, inputCatalog);
    const currentTarget = graph.nodes.find(n => n.id === 'target');
    assert.deepEqual(currentTarget.data.slotBindings, target.data.slotBindings);
    assert.equal(findExecutionReadinessFailure([currentTarget], inputCatalog, graph), null);
    const before = structuredClone(graph);
    await createDispatchingNodeExecutor({ gateway: gw, edges: graph.edges, mediaRoot: dir, executionId: 'current',
      abortController: new AbortController() }).executor(currentTarget, {
      getNodeOutput: id => readNodeInputSource(id === 'a' ? sourceA : sourceB).output, reportProgress() {}, addMediaAsset() {},
    });
    assert.deepEqual(graph, before);
  };
  await run();
  assert.equal(captures[0].body.messages[0].content[0].text, '来源 1：\nCurrent A.\n\n补充要求：\nLocal.');
  assert.deepEqual(requests[0].textInputs, [{ sourceNodeId: 'a', edgeId: 'ea', outputId: 'current-task', role: 'prompt', targetSlot: 'prompt', textContent: 'Current A.' }]);
  target.data.slotBindings.prompt[0].use = 'inactive'; await run();
  assert.equal(captures[1].body.messages[0].content[0].text, 'Local.'); assert.deepEqual(requests[1].textInputs, []);
  target.data.slotBindings.prompt[0].use = 'active'; sourceA.data.taskId = 'edited-task'; sourceA.data.generatedContent = 'Edited A.'; await run();
  assert.equal(captures[2].body.messages[0].content[0].text, '来源 1：\nEdited A.\n\n补充要求：\nLocal.');
  assert.equal(requests[2].textInputs[0].outputId, 'edited-task');
  target.data.slotBindings = {}; await run();
  assert.equal(captures[3].body.messages[0].content[0].text, 'Local.'); assert.deepEqual(requests[3].textInputs, []);
  assert.equal(captures.length, 4); assert.ok(!JSON.stringify(captures).includes('Unused B.'));
  assert.ok(!JSON.stringify(captures).includes('saved-old-task'));
  console.log('V1_DISPATCH_TRANSPORT_CAPTURE', JSON.stringify({ textInputs: requests.map(request => request.textInputs), captures }));
});

test('V1 dispatch retains both current named roles on one edge and never refills inactive roles', async () => {
  const target = node({ first_frame: [{ ...occupant('a'), use: 'active', role: 'first_frame', ordinal: 0 }],
    last_frame: [{ ...occupant('a'), use: 'active', role: 'last_frame', ordinal: 1 }] });
  target.data.inputBindingVersion = 1;
  const outputs = { a: media('a'), b: media('b') }; const edges = [edge('a'), edge('b')];
  const gw = gateway(); registerExecutor(createMaterialGatewayExecutor({ gateway: gw }));
  const before = structuredClone(target);
  const dispatch = createDispatchingNodeExecutor({ gateway: gw, edges, mediaRoot: '/tmp', executionId: '2848-roles',
    abortController: new AbortController() }).executor;
  const ctx = { getNodeOutput: id => outputs[id], reportProgress() {}, addMediaAsset() {} };
  assert.equal(findExecutionReadinessFailure([target], catalog, { nodes: [target, graphNode('a'), graphNode('b')], edges }), null);
  await dispatch(target, ctx);
  assert.deepEqual(gw.requests[0].references.map(ref => [ref.edgeId, ref.sourceNodeId, ref.role]),
    [['e-a', 'a', 'first_frame'], ['e-a', 'a', 'last_frame']]);
  assert.deepEqual(target, before);
  target.data.slotBindings.last_frame[0].use = 'inactive';
  assert.notEqual(findExecutionReadinessFailure([target], catalog, { nodes: [target, graphNode('a'), graphNode('b')], edges }), null);
  await assert.rejects(dispatch(target, ctx)); assert.equal(gw.requests.length, 1);
});
