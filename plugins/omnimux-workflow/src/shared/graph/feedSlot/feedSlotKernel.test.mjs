import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoFillSlots, deriveSlotLayout, hydrateSlotBindings, assembleEffectiveInputsFromSlots, swapNamedSlots, feedFromFingerprint } from './index.ts';
import { effectiveInputDisplay } from './effectiveInputDisplay.ts';
import { buildUpstreamFingerprint } from '../../validation/compatKernel.ts';
import { effectiveSlotFingerprint } from './effectiveFingerprint.ts';
import { createMaterialNode } from '../nodeFactory.ts';
import { planCanvasInputMutation } from '../canvasInputMutationGateway.ts';

const input = (slot, type, role, min = 1, max = 1) => ({ slot, type, role, min, max, source: 'upstream_edge' });
const catalog = { models: [{ id: 'video', operations: [
  { id: 'text_to_video', inputs: [] },
  { id: 'first_frame', inputs: [input('first_frame', 'image', 'first_frame')] },
  { id: 'end_frame', inputs: [input('last_frame', 'image', 'last_frame')] },
  { id: 'first_last_frame', inputs: [input('start_frame', 'image', 'first_frame'), input('end_frame', 'image', 'last_frame')] },
  { id: 'video_multi_ref', inputs: [input('reference', 'image', 'reference', 1, 1)] },
  { id: 'digital_human', inputs: [input('character', 'image', 'reference'), input('audio_track', 'audio', 'audio_track')] },
].map((op) => ({ ...op, listed: true, output: { type: 'video' } })) }] };
const layout = (id) => deriveSlotLayout(catalog, 'video', id);
const feed = (id, type = 'image', extra = {}) => ({ edgeId: `e${id}`, sourceNodeId: `s${id}`, outputId: `o${id}`, type, ordinal: id, availability: 'ready', url: `https://fixture.test/${id}.png`, ...extra });
const occupant = (asset, pinned = true) => ({ edgeId: asset.edgeId, sourceNodeId: asset.sourceNodeId, outputId: asset.outputId, pinned });
const assemble = (l, assets, bindings) => assembleEffectiveInputsFromSlots({ layout: l, bindings, feedAssets: assets, conflicts: [], nodeData: {}, incomingText: [] });

test('selection callback adds supply and explicit text binding together, replaces in place and refuses stale output', async () => {
  const { planCanvasInputSelection } = await import('../canvasInputMutationGateway.ts');
  const qualified = { models: [{ id: 'qualified', operations: [{ id: 'chat', listed: true, output: { type: 'text' }, inputs: [
    { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1, valueSources: ['local_field', 'upstream_output'],
      composition: { kind: 'content_with_instruction', localRole: 'instruction' } }], }, { id: 'vision_chat', listed: true, output: { type: 'text' }, inputs: [input('images', 'image', 'reference', 0, 1)] }] }] };
  const target = createMaterialNode('text', { x: 0, y: 0 }, { params: { model: 'qualified', operation: 'chat' } });
  const source = id => ({ id, type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text', nodeKind: 'import', content: id } });
  const graph = { nodes: [source('a'), source('b'), target], edges: [] }; const before = structuredClone(graph);
  const context = { catalog: qualified }; const intent = { targetNodeId: target.id, chosenOperationId: 'chat' };
  const added = planCanvasInputSelection(graph, { ...intent, selections: [{ sourceNodeId: 'a', outputId: 'a:current', targetSlot: 'prompt', role: 'prompt' }] }, context);
  assert.equal(added.status, 'allowed'); assert.equal(added.edges.length, 1);
  const binding = added.nodes.find(node => node.id === target.id).data.slotBindings.prompt[0];
  assert.equal(binding.use, 'active'); assert.equal(binding.outputId, 'a:current'); assert.equal(binding.ordinal, 0);
  assert.equal(added.nodes.find(node => node.id === target.id).data.params.operation, 'chat');
  const replaced = planCanvasInputSelection(added, { ...intent, replaceEdgeId: binding.edgeId, selections: [{ sourceNodeId: 'b', outputId: 'b:current', targetSlot: 'prompt', role: 'prompt' }] }, context);
  assert.equal(replaced.status, 'allowed'); assert.equal(replaced.edges.length, 1);
  assert.equal(replaced.nodes.find(node => node.id === target.id).data.slotBindings.prompt[0].ordinal, 0);
  assert.equal(replaced.nodes.find(node => node.id === target.id).data.slotBindings.prompt[0].sourceNodeId, 'b');
  const stale = planCanvasInputSelection(graph, { ...intent, selections: [{ sourceNodeId: 'a', outputId: 'old-output', targetSlot: 'prompt' }] }, context);
  assert.equal(stale.status, 'rejected'); assert.equal(stale.reasonCode, 'input_changed'); assert.equal(stale.nodes, graph.nodes);
  const disabled = planCanvasInputSelection(added, { ...intent, setUse: { slot: 'prompt', edgeId: binding.edgeId, use: 'inactive' } }, context);
  assert.equal(disabled.status, 'allowed'); assert.equal(disabled.edges.length, 1);
  assert.equal(disabled.nodes.find(node => node.id === target.id).data.slotBindings.prompt[0].use, 'inactive');
  assert.deepEqual(graph, before);
});

test('strict current selection rejects the full over-capacity set atomically and validates reactivation', async () => {
  const { validateCanvasInputSelection } = await import('../canvasInputMutationGateway.ts');
  const source = id => ({ id, type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'image', nodeKind: 'import', mediaUrl: `https://fixture.test/${id}.png`, mimeType: 'image/png' } });
  const target = { id: 'target', type: 'material', position: { x: 0, y: 0 }, data: { nodeKind: 'generate', materialType: 'video', inputBindingVersion: 1,
    prompt: 'Local', params: { model: 'video', operation: 'video_multi_ref' }, slotBindings: { reference: [
      { edgeId: 'ea', sourceNodeId: 'a', pinned: true, ordinal: 0, use: 'active', role: 'reference' },
      { edgeId: 'eb', sourceNodeId: 'b', pinned: true, ordinal: 1, use: 'inactive', role: 'reference' }] } } };
  const state = { nodes: [source('a'), source('b'), target], edges: [{ id: 'ea', source: 'a', target: 'target' }, { id: 'eb', source: 'b', target: 'target' }] };
  const before = structuredClone(state);
  const context = { catalog };
  const intent = { targetNodeId: 'target', chosenOperationId: 'video_multi_ref' };
  const current = validateCanvasInputSelection(state, intent, context);
  assert.equal(current.accepts, true); assert.equal(current.ready, true);
  assert.deepEqual(current.records.map(record => record.state), ['ready', 'inactive']);
  const full = { reference: target.data.slotBindings.reference.map(item => ({ ...item, use: 'active' })) };
  const rejected = planCanvasInputMutation(state, { nodePatches: [{ nodeId: 'target', data: { slotBindings: full } }], strictConsumption: intent }, context);
  assert.equal(rejected.status, 'rejected'); assert.equal(rejected.reasonCode, 'slot_capacity');
  assert.equal(rejected.nodes, state.nodes); assert.equal(rejected.edges, state.edges); assert.deepEqual(state, before);
  const switched = planCanvasInputMutation(state, { nodePatches: [{ nodeId: 'target', data: { params: { model: 'video', operation: 'first_frame' }, slotBindings: full } }],
    strictConsumption: { ...intent, chosenOperationId: 'first_frame' } }, context);
  assert.equal(switched.status, 'rejected'); assert.deepEqual(state, before);
  const swapUse = { reference: full.reference.map(item => ({ ...item, use: item.edgeId === 'ea' ? 'inactive' : 'active' })) };
  const allowed = planCanvasInputMutation(state, { nodePatches: [{ nodeId: 'target', data: { slotBindings: swapUse } }], strictConsumption: intent }, context);
  assert.equal(allowed.status, 'allowed');
  assert.deepEqual(allowed.nodes.find(node => node.id === 'target').data.slotBindings, swapUse);
  assert.equal(allowed.edges.length, 2); assert.deepEqual(state, before);
  const incomplete = validateCanvasInputSelection({ ...state, nodes: state.nodes.map(node => node.id === 'target' ? { ...node, data: { ...node.data, slotBindings: {} } } : node) }, intent, context);
  assert.equal(incomplete.accepts, true); assert.equal(incomplete.ready, false); assert.equal(incomplete.reasonCode, 'min_unsatisfied');
});

test('current traversal retains ready, inactive, waiting and removed intent for every consumer', async () => {
  const { selectSlotOccupants } = await import('./assembleEffectiveInputs.ts');
  const { effectiveInputDisplay } = await import('./effectiveInputDisplay.ts');
  const l = { operationId: 'generate', preset: 'strip', addButton: true, swap: false, implementationGaps: [], acceptsText: true,
    slots: [{ slot: 'prompt', type: 'text', role: 'prompt', min: 1, max: 1, labelKey: 'prompt',
      valueSources: ['local_field', 'upstream_output'], composition: { kind: 'single_body', localRole: 'body' } }] };
  const assets = [feed(1, 'text', { textContent: 'A', url: undefined }), feed(2, 'text', { textContent: 'B', url: undefined }),
    feed(3, 'text', { availability: 'waiting', textContent: undefined, url: undefined })];
  const bindings = { prompt: assets.map((asset, ordinal) => ({ ...occupant(asset), ordinal, role: 'prompt', use: ordinal === 1 ? 'inactive' : 'active' })),
    removed: [{ edgeId: 'e4', sourceNodeId: 's4', ordinal: 3, role: 'body', use: 'active', pinned: true }] };
  const records = selectSlotOccupants(l, bindings, assets, [], 1);
  assert.deepEqual(records.map(record => [record.occupant.edgeId, record.state, record.reasonCode]),
    [['e1', 'ready', undefined], ['e2', 'inactive', undefined], ['e3', 'pending', 'input_waiting'], ['e4', 'invalid', 'slot_removed']]);
  const display = effectiveInputDisplay(l, assets, bindings, [], [], [], 1);
  assert.deepEqual(display.records, records);
  assert.deepEqual(display.selected.map(record => record.occupant.edgeId), ['e1']);
  assert.equal(display.requiredUnavailable.occupant.edgeId, 'e3');
  const effective = assembleEffectiveInputsFromSlots({ layout: l, bindings, conflicts: [], feedAssets: assets,
    nodeData: { inputBindingVersion: 1, prompt: 'Local' }, incomingText: ['B'] });
  assert.equal(effective.prompt, 'A\n\nLocal');
  assert.deepEqual(effective.blockedInputs.map(record => [record.edgeId, record.reason]), [['e3', 'input_waiting'], ['e4', 'slot_removed']]);
  const fingerprint = effectiveSlotFingerprint(buildUpstreamFingerprint({ localText: 'Local', assets }), l, bindings, [], 1);
  assert.deepEqual(fingerprint.assets.map(asset => asset.edgeId), ['e1', 'e3', 'e4']);
});

for (const kind of ['text', 'image', 'video', 'audio']) {
  test(`qualified ${kind} empty layout exposes text and consumes only active bound body`, () => {
    const composition = { kind: kind === 'audio' ? 'single_body' : 'content_with_instruction', localRole: kind === 'audio' ? 'body' : 'instruction' };
    const qualified = { models: [{ id: 'qualified', operations: [{ id: 'generate', listed: true, output: { type: kind }, inputs: [
      { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1,
        valueSources: ['local_field', 'upstream_output'], composition },
    ] }] }] };
    const l = deriveSlotLayout(qualified, 'qualified', 'generate', kind);
    assert.equal(l.addButton, true);
    assert.deepEqual(l.slots.map(slot => slot.type), ['text']);
    const assets = [feed(1, 'text', { textContent: '选中正文。', url: undefined }), feed(2, 'text', { textContent: '未选供给。', url: undefined })];
    const active = { ...occupant(assets[0]), ordinal: 0, use: 'active', role: 'prompt' };
    const args = { layout: l, bindings: { prompt: [active] }, feedAssets: assets, conflicts: [],
      nodeData: { materialType: kind, inputBindingVersion: 1, prompt: '本地正文。' }, incomingText: ['未选供给。'] };
    const first = assembleEffectiveInputsFromSlots(args);
    assert.equal(first.prompt, kind === 'audio' ? '选中正文。\n\n本地正文。' : '来源 1：\n选中正文。\n\n补充要求：\n本地正文。');
    assert.deepEqual(first.emptyRequiredSlots, []);
    assert.deepEqual(first.unusedFeedEdgeIds, ['e2']);
    const inactive = assembleEffectiveInputsFromSlots({ ...args, bindings: { prompt: [{ ...active, use: 'inactive' }] } });
    assert.equal(inactive.prompt, '本地正文。');
    assert.deepEqual(inactive.unusedFeedEdgeIds, ['e1', 'e2']);
    assert.equal(assembleEffectiveInputsFromSlots(args).prompt, first.prompt);
    assert.equal(assembleEffectiveInputsFromSlots({ ...args, bindings: {} }).prompt, '本地正文。');
    assert.deepEqual(assets.map(asset => asset.edgeId), ['e1', 'e2']);
  });
}

test('new-version node and supply mutation preserve explicitly empty bindings and do not compose supply text', () => {
  const qualified = { source: 'omnimux', text: [], image: [], video: [], audio: [], models: [{ id: 'qualified', label: 'Qualified', operations: [{
    id: 'generate', listed: true, output: { type: 'text' }, inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1,
      valueSources: ['local_field', 'upstream_output'], composition: { kind: 'content_with_instruction', localRole: 'instruction' } }],
  }] }] };
  const target = createMaterialNode('text', { x: 0, y: 0 }, { params: { model: 'qualified', operation: 'generate' }, prompt: '本地。' });
  assert.equal(target.data.inputBindingVersion, 1);
  assert.deepEqual(target.data.slotBindings, {});
  const source = { id: 'a', type: 'material', position: { x: 0, y: 0 }, data: { nodeKind: 'import', materialType: 'text', content: '供给。' } };
  const changed = planCanvasInputMutation({ nodes: [source, target], edges: [] }, { addEdges: [{ id: 'ea', source: 'a', target: target.id }] }, { catalog: qualified });
  assert.equal(changed.status, 'allowed');
  assert.deepEqual(changed.nodes.find(node => node.id === target.id).data.slotBindings, {});
  const l = deriveSlotLayout(qualified, 'qualified', 'generate');
  const raw = buildUpstreamFingerprint({ prompt: '供给。', localText: '本地。', assets: [{ edgeId: 'ea', sourceNodeId: 'a', type: 'text', textContent: '供给。', availability: 'ready' }] });
  const selected = effectiveSlotFingerprint(raw, l, {}, [], 1);
  assert.equal(selected.prompt, '本地。');
  assert.deepEqual(selected.assets, []);
});

for (const [id, preset] of [['text_to_video', 'none'], ['first_frame', 'named'], ['end_frame', 'named'], ['first_last_frame', 'pair'], ['video_multi_ref', 'strip'], ['digital_human', 'named']]) {
  test(`${id} derives ${preset} from catalog`, () => assert.equal(layout(id).preset, preset));
}
test('end_frame derives single named slot for last_frame without add button', () => {
  const l = layout('end_frame');
  assert.equal(l.preset, 'named');
  assert.equal(l.slots.length, 1);
  assert.equal(l.slots[0].slot, 'last_frame');
  assert.equal(l.slots[0].role, 'last_frame');
  assert.equal(l.addButton, false);
});
test('pair uses real catalog aliases, roles and swap', () => {
  assert.deepEqual(layout('first_last_frame').slots.map((slot) => slot.slot), ['start_frame', 'end_frame']);
  assert.equal(layout('first_last_frame').swap, true);
});
test('missing/unlisted op never invents slots', () => {
  assert.deepEqual(layout('absent').implementationGaps, ['operation_unlisted']);
  assert.equal(layout('absent').slots.length, 0);
});
test('unknown listed layout degrades to strip and keeps null maximum', () => {
  const custom = structuredClone(catalog);
  custom.models[0].operations.push({ id: 'custom', listed: true, output: { type: 'video' }, inputs: [input('videos', 'video', 'source', 0, null)] });
  const l = deriveSlotLayout(custom, 'video', 'custom');
  assert.equal(l.preset, 'strip'); assert.equal(l.slots[0].max, null); assert.ok(l.implementationGaps.includes('missing_layout'));
  assert.equal(autoFillSlots(Array.from({ length: 10 }, (_, i) => feed(i, 'video')), l, {}).bindings.videos.length, 10);
});
test('three supplies with max one keep overflow observable and never submit it', () => {
  const assets = [feed(3), feed(1), feed(2)]; const l = layout('video_multi_ref');
  const fill = autoFillSlots(assets, l, {});
  assert.equal(fill.bindings.reference.length, 1); assert.equal(fill.bindings.reference[0].edgeId, 'e1');
  assert.deepEqual(fill.unusedFeed.map((asset) => asset.edgeId), ['e2', 'e3']);
  const payload = assemble(l, assets, fill.bindings);
  assert.equal(payload.references.length, 1); assert.equal(payload.references[0].edgeId, 'e1');
});
test('none keeps all supply unused, including waiting inputs', () => {
  const assets = [feed(1, 'image', { availability: 'waiting' })]; const l = layout('text_to_video');
  const fill = autoFillSlots(assets, l, {});
  assert.deepEqual(fill.bindings, {}); assert.equal(fill.unusedFeed.length, 1);
  assert.equal(assemble(l, assets, fill.bindings).blockedInputs.length, 0);
});
test('pinned choice beats earlier auto occupant and new feed', () => {
  const assets = [feed(1), feed(2), feed(3)];
  const fill = autoFillSlots(assets, layout('video_multi_ref'), { reference: [occupant(assets[0], false), occupant(assets[2])] });
  assert.equal(fill.bindings.reference[0].edgeId, 'e3'); assert.equal(fill.bindings.reference[0].pinned, true);
});
test('first frame alone leaves tail empty; second source fills tail without reusing first', () => {
  const l = layout('first_last_frame'); const a = feed(1); const b = feed(2);
  const first = autoFillSlots([a], l, {});
  assert.deepEqual(assemble(l, [a], first.bindings).emptyRequiredSlots, ['end_frame']);
  const both = autoFillSlots([a, b], l, first.bindings);
  assert.equal(both.bindings.end_frame[0].edgeId, 'e2');
});
test('swap changes roles without changing edges; same image can occupy two explicit roles', () => {
  const l = layout('first_last_frame'); const assets = [feed(1), feed(2)];
  const filled = autoFillSlots(assets, l, {}).bindings;
  const swapped = swapNamedSlots(filled, 'start_frame', 'end_frame');
  assert.equal(swapped.start_frame[0].edgeId, 'e2'); assert.equal(swapped.end_frame[0].pinned, true);
  assert.equal(filled.start_frame[0].edgeId, 'e1');
  const same = autoFillSlots([assets[0]], l, { start_frame: [occupant(assets[0])], end_frame: [occupant(assets[0])] });
  assert.deepEqual(assemble(l, assets, same.bindings).references.map((ref) => ref.role), ['first_frame', 'last_frame']);
});
test('digital human separates character and audio track, ignoring extra audio', () => {
  const l = layout('digital_human'); const assets = [feed(1), ...Array.from({ length: 10 }, (_, i) => feed(i + 2, 'audio'))];
  const fill = autoFillSlots(assets, l, {}); const payload = assemble(l, assets, fill.bindings);
  assert.equal(payload.references.length, 1); assert.equal(payload.audioTrack.edgeId, 'e2'); assert.equal(payload.unusedFeedEdgeIds.length, 9);
});
test('invalid pinned types and removed slots become conflicts, deleted edges disappear', () => {
  const a = feed(1, 'audio'); const fill = autoFillSlots([a], layout('first_frame'), { first_frame: [occupant(a)], old: [occupant(feed(9))] });
  assert.equal(fill.conflicts[0].reason, 'type_mismatch'); assert.equal(fill.unusedFeed.length, 1);
  const removed = autoFillSlots([a], layout('text_to_video'), { old: [occupant(a)] });
  assert.equal(removed.conflicts[0].reason, 'slot_removed');
});
test('ordinary waiting supply is omitted and leaves the required slot unsatisfied', () => {
  const a = feed(1, 'image', { availability: 'waiting', url: undefined }); const l = layout('first_frame');
  const payload = assemble(l, [a], autoFillSlots([a], l, {}).bindings);
  assert.deepEqual(payload.blockedInputs, []);
  assert.deepEqual(payload.emptyRequiredSlots, ['first_frame']);
  assert.deepEqual(payload.references, []);
});
test('empty before ready does not consume max-one capacity and overflow stays unused', () => {
  const l = layout('first_frame');
  const assets = [feed(0, 'image', { url: undefined }), feed(1), feed(2)];
  const fill = autoFillSlots(assets, l, {});
  assert.deepEqual(fill.bindings.first_frame.map((item) => item.edgeId), ['e1']);
  assert.deepEqual(fill.unusedFeed.map((item) => item.edgeId), ['e0', 'e2']);
  assert.deepEqual(assemble(l, assets, fill.bindings).emptyRequiredSlots, []);
});
test('MIME mismatch stays feed; unknown MIME is not treated as unsupported', () => {
  const l = layout('first_frame'); l.slots[0].allowedMimes = ['image/png'];
  assert.equal(autoFillSlots([feed(1, 'image', { mimeType: 'image/gif' })], l, {}).unusedFeed.length, 1);
  assert.equal(autoFillSlots([feed(1)], l, {}).bindings.first_frame.length, 1);
});
test('known invalid duration or size cannot occupy capacity before valid supply; unknown metadata remains eligible', () => {
  const custom = structuredClone(catalog);
  custom.models[0].operations.push({ id: 'custom', listed: true, output: { type: 'video' }, inputs: [{
    ...input('videos', 'video', 'reference', 1, 1), minDurationSec: 2, maxDurationSec: 10, maxSizeMb: 1, maxSizeExclusive: true,
  }] });
  const l = deriveSlotLayout(custom, 'video', 'custom');
  for (const invalid of [{ durationSec: 1 }, { durationSec: 11 }, { sizeBytes: 1024 * 1024 }, { sizeBytes: 1024 * 1024 + 1 }]) {
    const assets = [feed(0, 'video', invalid), feed(1, 'video', { durationSec: 5, sizeBytes: 1024 })];
    const fill = autoFillSlots(assets, l, {});
    assert.deepEqual(fill.bindings.videos.map((entry) => entry.edgeId), ['e1']);
    assert.deepEqual(fill.unusedFeed.map((entry) => entry.edgeId), ['e0']);
  }
  assert.deepEqual(autoFillSlots([feed(0, 'video')], l, {}).bindings.videos.map((entry) => entry.edgeId), ['e0']);
});
test('legacy edge mirrors hydrate in role order without mutating graph', () => {
  const assets = [feed(1), feed(2)]; const l = layout('first_last_frame');
  const edges = [{ id: 'e1', source: 's1', data: { slotBinding: { slot: 'end_frame' } } }, { id: 'e2', source: 's2' }];
  const before = structuredClone(edges); const fill = hydrateSlotBindings(assets, l, edges);
  assert.equal(fill.bindings.end_frame[0].edgeId, 'e1'); assert.equal(fill.bindings.end_frame[0].pinned, false);
  assert.deepEqual(edges, before);
});
test('legacy type mismatch remains an explicit conflict rather than guessing another role', () => {
  const a = feed(1, 'audio');
  const fill = hydrateSlotBindings([a], layout('first_frame'), [{ id: 'e1', source: 's1', data: { targetSlot: 'first_frame' } }]);
  assert.equal(fill.conflicts[0].reason, 'type_mismatch');
});
test('same source and result deduplicate by role, not path or supply-edge id', () => {
  const a = feed(1); const duplicate = { ...a, edgeId: 'duplicate' }; const b = feed(2, 'image', { url: a.url });
  const l = layout('video_multi_ref'); l.slots[0].max = 4;
  const fill = autoFillSlots([a, duplicate, b], l, {});
  assert.equal(fill.bindings.reference.length, 2);
  const duplicatePin = autoFillSlots([a, duplicate], layout('first_frame'), { first_frame: [occupant(a), occupant(duplicate)] });
  assert.equal(duplicatePin.bindings.first_frame.length, 1); assert.deepEqual(duplicatePin.conflicts, []);
  const refs = assemble(l, [a, duplicate, b], { reference: [occupant(a), occupant(duplicate), occupant(b)] }).references;
  assert.deepEqual(refs.map((ref) => ref.sourceNodeId), ['s1', 's2']);
  const pair = autoFillSlots([a], layout('first_last_frame'), { start_frame: [occupant(a, false)], end_frame: [occupant(a, false)] });
  assert.equal(pair.bindings.end_frame.length, 0, 'automatic duplicates cannot imply same-image first/last');
});
test('fallback edge identity preserves ordinal among text and media inputs', () => {
  const fp = buildUpstreamFingerprint({ assets: [{ sourceNodeId: 'text', type: 'text' }, { sourceNodeId: 'image', type: 'image' }] });
  assert.equal(feedFromFingerprint(fp)[0].edgeId, 'feed-image-1');
});
test('snapshot is detached and refreshes selected output rather than stale occupant output', () => {
  const assets = [feed(1)]; const l = layout('first_frame'); const explicit = { first_frame: [occupant(assets[0])] };
  assets[0].outputId = 'new-output';
  const fill = autoFillSlots(assets, l, explicit); const snapshot = assemble(l, assets, fill.bindings);
  assert.equal(fill.bindings.first_frame[0].outputId, 'new-output');
  assets[0].url = 'https://fixture.test/changed.png'; explicit.first_frame[0].sourceNodeId = 'changed';
  assert.equal(snapshot.references[0].pathOrUrl, 'https://fixture.test/1.png'); assert.equal(fill.bindings.first_frame[0].sourceNodeId, 's1');
});
test('image operations derive strip preset and have addButton enabled', () => {
  const imgCatalog = {
    models: [{
      id: 'nanobanana-2',
      operations: [
        { id: 'text_to_image', listed: true, output: { type: 'image' }, inputs: [] },
        { id: 'image_to_image', listed: true, output: { type: 'image' }, inputs: [input('reference_image', 'image', 'reference', 0, 5)] },
        { id: 'multi_reference', listed: true, output: { type: 'image' }, inputs: [input('reference', 'image', 'reference', 0, 10)] },
      ],
    }],
  };
  assert.equal(deriveSlotLayout(imgCatalog, 'nanobanana-2', 'text_to_image', 'image').preset, 'none');
  for (const opId of ['image_to_image', 'multi_reference']) {
    const l = deriveSlotLayout(imgCatalog, 'nanobanana-2', opId, 'image');
    assert.equal(l.preset, 'strip');
    assert.equal(l.addButton, true);
    assert.ok(l.slots.length > 0);
  }
});
test('image slots remain empty for text-only, missing and unspecified operations', () => {
  const imgCatalog = {
    models: [{
      id: 'gpt-image-2.5',
      operations: [
        { id: 'text_to_image', listed: true, output: { type: 'image' }, inputs: [] },
      ],
    }],
  };
  for (const operation of ['text_to_image', 'absent_op', undefined]) {
    const derived = deriveSlotLayout(imgCatalog, 'gpt-image-2.5', operation, 'image');
    assert.equal(derived.preset, 'none');
    assert.equal(derived.addButton, false);
    assert.deepEqual(derived.slots, []);
    assert.deepEqual(derived.implementationGaps, operation === 'text_to_image' ? [] : ['operation_unlisted']);
  }
});
test('image slot name aliases match reference, references, input_image and input_images', () => {
  const customCatalog = {
    models: [{
      id: 'test-model',
      operations: [
        { id: 'text_to_image', listed: true, output: { type: 'image' }, inputs: [input('input_images', 'image', 'reference', 0, 4)] },
      ],
    }],
  };
  const l = deriveSlotLayout(customCatalog, 'test-model', 'text_to_image', 'image');
  assert.equal(l.preset, 'strip');
  assert.equal(l.slots.length, 1);
  assert.equal(l.slots[0].slot, 'input_images');
});
test('plain speech exposes no reference audio slots or add button', () => {
  const ttsCatalog = {
    models: [{
      id: 'seed-audio-1.0',
      operations: [
        { id: 'text_to_speech', listed: true, output: { type: 'audio' }, inputs: [input('reference_audio', 'audio', 'reference', 0, 5)] },
      ],
    }],
  };
  const l = deriveSlotLayout(ttsCatalog, 'seed-audio-1.0', 'text_to_speech', 'audio');
  assert.equal(l.preset, 'none');
  assert.equal(l.addButton, false);
  assert.deepEqual(l.slots, []);
});
test('plain speech ignores all legacy optional audio slot aliases', () => {
  for (const slotName of ['reference', 'references', 'input_audio', 'audio_track', 'audio']) {
    const customCatalog = {
      models: [{
        id: 'tts-model',
        operations: [
          { id: 'text_to_speech', listed: true, output: { type: 'audio' }, inputs: [input(slotName, 'audio', 'reference', 0, 3)] },
        ],
      }],
    };
    const l = deriveSlotLayout(customCatalog, 'tts-model', 'text_to_speech', 'audio');
    assert.equal(l.preset, 'none');
    assert.deepEqual(l.slots, [], `${slotName} is not consumed by plain speech`);
  }
});

test('chat does not borrow vision_chat media slots from the same model', () => {
  const textMultimodalCatalog = {
    models: [{
      id: 'gemini-3.8-flash',
      operations: [
        { id: 'chat', listed: true, output: { type: 'text' }, inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field' }] },
        {
          id: 'vision_chat',
          listed: true,
          output: { type: 'text' },
          inputs: [
            { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field' },
            input('reference_images', 'image', 'reference', 0, 10),
            input('reference_videos', 'video', 'reference', 0, 3),
          ],
        },
      ],
    }],
  };
  // 当当前操作为默认 chat 时
  const chatLayout = deriveSlotLayout(textMultimodalCatalog, 'gemini-3.8-flash', 'chat', 'text');
  assert.equal(chatLayout.preset, 'none');
  assert.equal(chatLayout.addButton, false);
  assert.deepEqual(chatLayout.slots, []);

  // 当当前操作为 vision_chat 时
  const visionLayout = deriveSlotLayout(textMultimodalCatalog, 'gemini-3.8-flash', 'vision_chat', 'text');
  assert.equal(visionLayout.preset, 'strip');
  assert.equal(visionLayout.addButton, true);
  assert.equal(visionLayout.slots.length, 2);
  assert.equal(visionLayout.slots[0].slot, 'reference_images');
  assert.equal(visionLayout.slots[1].slot, 'reference_videos');
});

test('pure text model derives none preset with empty slots', () => {
  const pureTextCatalog = {
    models: [{
      id: 'deepseek-v4-pro',
      operations: [
        { id: 'chat', listed: true, output: { type: 'text' }, inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field' }] },
      ],
    }],
  };
  const l = deriveSlotLayout(pureTextCatalog, 'deepseek-v4-pro', 'chat', 'text');
  assert.equal(l.preset, 'none');
  assert.equal(l.slots.length, 0);
  assert.equal(l.addButton, false);
});

test('reference_images and reference_videos aliases match expected variants', () => {
  for (const slotName of ['reference_image', 'reference', 'references', 'input_images']) {
    const customCatalog = {
      models: [{
        id: 'text-vision',
        operations: [
          { id: 'vision_chat', listed: true, output: { type: 'text' }, inputs: [input(slotName, 'image', 'reference', 0, 5)] },
        ],
      }],
    };
    const l = deriveSlotLayout(customCatalog, 'text-vision', 'vision_chat', 'text');
    assert.equal(l.preset, 'strip');
    assert.equal(l.slots.length, 1);
    assert.equal(l.slots[0].slot, slotName);
  }

  for (const slotName of ['reference_video', 'reference', 'references', 'input_videos']) {
    const customCatalog = {
      models: [{
        id: 'text-video',
        operations: [
          { id: 'vision_chat', listed: true, output: { type: 'text' }, inputs: [input(slotName, 'video', 'reference', 0, 3)] },
        ],
      }],
    };
    const l = deriveSlotLayout(customCatalog, 'text-video', 'vision_chat', 'text');
    assert.equal(l.preset, 'strip');
    assert.equal(l.slots.length, 1);
    assert.equal(l.slots[0].slot, slotName);
  }

  for (const slotName of ['reference_audio', 'audio_track', 'audio', 'reference', 'references']) {
    const customCatalog = {
      models: [{
        id: 'text-audio',
        operations: [
          { id: 'vision_chat', listed: true, output: { type: 'text' }, inputs: [input(slotName, 'audio', 'reference', 0, 1)] },
        ],
      }],
    };
    const l = deriveSlotLayout(customCatalog, 'text-audio', 'vision_chat', 'text');
    assert.equal(l.preset, 'strip');
    assert.equal(l.slots.length, 1);
    assert.equal(l.slots[0].slot, slotName);
  }

  for (const slotName of ['reference_document', 'document', 'pdf', 'reference', 'references']) {
    const customCatalog = {
      models: [{
        id: 'text-document',
        operations: [
          { id: 'vision_chat', listed: true, output: { type: 'text' }, inputs: [input(slotName, 'document', 'reference', 0, 1)] },
        ],
      }],
    };
    const l = deriveSlotLayout(customCatalog, 'text-document', 'vision_chat', 'text');
    assert.equal(l.preset, 'strip');
    assert.equal(l.slots.length, 1);
    assert.equal(l.slots[0].slot, slotName);
  }
});

test('Issue #1104: 卡槽装填过滤 — 不支持格式与超量素材不进入卡槽，仅展示非空就绪素材', () => {
  // 1. 首帧模式卡槽（仅支持 1 张图片）
  const firstFrameLayout = layout('first_frame');
  const imageReady = { ...feed(1, 'image'), availability: 'ready', url: 'https://test.com/frame.png' };
  const imageExtra = { ...feed(2, 'image'), availability: 'ready', url: 'https://test.com/extra.png' };
  const videoFeed = { ...feed(3, 'video'), availability: 'ready', url: 'https://test.com/video.mp4' };

  // 连入 2 张图片和 1 个视频：卡槽只接受第 1 张图片，超量图片与视频不进入卡槽
  const fillFirstFrame = autoFillSlots([imageReady, imageExtra, videoFeed], firstFrameLayout, {});
  assert.equal(fillFirstFrame.bindings.first_frame.length, 1, '首帧卡槽仅应装填 1 张图片');
  assert.equal(fillFirstFrame.bindings.first_frame[0].sourceNodeId, 's1');
  assert.equal(fillFirstFrame.unusedFeed.length, 2, '超量图片与不匹配视频应保留在未消费池（Feed）');

  // 2. 全能参考卡槽（支持图片）
  const multiRefLayout = layout('video_multi_ref');
  const fillMultiRef = autoFillSlots([imageReady, imageExtra, videoFeed], multiRefLayout, {});
  assert.equal(fillMultiRef.bindings.reference.length, 1, '满足容量上限的图片进入参考卡槽');
  assert.equal(fillMultiRef.unusedFeed.length, 2, '超量与不匹配格式保留在 Feed');
});

test('F2 deactivation repairs one invalid intent at a time without granting mutation or reactivation bypass', async () => {
  const { planCanvasInputSelection, validateCanvasInputSelection } = await import('../canvasInputMutationGateway.ts');
  const qualified = { models: [{ id: 'qualified', operations: [{ id: 'chat', listed: true, output: { type: 'text' }, inputs: [{
    slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1, valueSources: ['local_field', 'upstream_output'],
    composition: { kind: 'single_body', localRole: 'body' },
  }] }] }] };
  const source = { id: 'c', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text', nodeKind: 'import', content: 'C' } };
  const values = ['a', 'b'].map((id, ordinal) => ({ sourceNodeId: id, edgeId: `e${id}`, outputId: `${id}:current`, ordinal, pinned: true, role: 'prompt', use: 'active' }));
  const target = { id: 'target', type: 'material', position: { x: 0, y: 0 }, data: { nodeKind: 'generate', materialType: 'text', inputBindingVersion: 1,
    prompt: 'Local', params: { model: 'qualified', operation: 'chat' }, slotBindings: { prompt: values } } };
  const graph = { nodes: [source, target], edges: [] }; const before = structuredClone(graph);
  const intent = { targetNodeId: 'target', chosenOperationId: 'chat' }; const ctx = { catalog: qualified };
  const first = planCanvasInputSelection(graph, { ...intent, setUse: { slot: 'prompt', edgeId: 'ea', use: 'inactive' } }, ctx);
  assert.equal(first.status, 'allowed');
  assert.deepEqual(first.nodes.find(n => n.id === 'target').data.slotBindings.prompt, [{ ...values[0], use: 'inactive' }, values[1]]);
  const stillInvalid = validateCanvasInputSelection(first, intent, ctx);
  assert.equal(stillInvalid.ready, false); assert.deepEqual(stillInvalid.records.map(r => r.state), ['inactive', 'invalid']);
  const second = planCanvasInputSelection(first, { ...intent, setUse: { slot: 'prompt', edgeId: 'eb', use: 'inactive' } }, ctx);
  assert.equal(second.status, 'allowed'); assert.equal(validateCanvasInputSelection(second, intent, ctx).ready, true);
  for (const request of [
    { ...intent, setUse: { slot: 'prompt', edgeId: 'ea', use: 'active' } },
    { ...intent, selections: [{ sourceNodeId: 'c', outputId: 'c:current' }] },
    { ...intent, replaceEdgeId: 'ea', selections: [{ sourceNodeId: 'c', outputId: 'c:current' }] },
    { ...intent, setUse: { slot: 'prompt', edgeId: 'absent', use: 'inactive' } },
    { ...intent, setUse: { slot: 'wrong', edgeId: 'ea', use: 'inactive' } },
    { ...intent, setUse: { slot: 'prompt', edgeId: 'ea', use: 'inactive' }, selections: [{ sourceNodeId: 'c', outputId: 'c:current' }] },
  ]) {
    const rejected = planCanvasInputSelection(first, request, ctx);
    assert.equal(rejected.status, 'rejected'); assert.equal(rejected.nodes, first.nodes); assert.equal(rejected.edges, first.edges);
  }
  const arbitrary = planCanvasInputMutation(graph, { strictConsumption: intent, nodePatches: [{ nodeId: 'target', data: {
    slotBindings: { prompt: [{ ...values[0], use: 'inactive' }, values[1]] }, params: { model: 'qualified', operation: 'chat', injected: true },
  } }] }, ctx);
  assert.equal(arbitrary.status, 'rejected'); assert.equal(arbitrary.nodes, graph.nodes);
  assert.deepEqual(graph, before); assert.deepEqual(first.nodes.find(n => n.id === 'target').data.params, target.data.params);
});

test('F3 same-source replacement revalidates itself and repairs missing edges but rejects another binding duplicate', async () => {
  const { planCanvasInputSelection } = await import('../canvasInputMutationGateway.ts');
  const qualified = { models: [{ id: 'qualified', operations: [{ id: 'chat', listed: true, output: { type: 'text' }, inputs: [{
    slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1, valueSources: ['local_field', 'upstream_output'],
    composition: { kind: 'single_body', localRole: 'body' },
  }] }] }] };
  const source = { id: 'a', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text', nodeKind: 'import', content: 'A' } };
  const binding = { sourceNodeId: 'a', edgeId: 'ea', outputId: 'a:current', ordinal: 7, role: 'prompt', pinned: true, use: 'active' };
  const target = { id: 'target', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text', nodeKind: 'generate', inputBindingVersion: 1,
    params: { model: 'qualified', operation: 'chat' }, slotBindings: { prompt: [binding] } } };
  const request = { targetNodeId: 'target', chosenOperationId: 'chat', replaceEdgeId: 'ea', selections: [{ sourceNodeId: 'a', outputId: 'a:current', targetSlot: 'prompt', role: 'prompt' }] };
  for (const edges of [[{ id: 'ea', source: 'a', target: 'target' }], []]) {
    const graph = { nodes: [source, target], edges }; const before = structuredClone(graph);
    const repaired = planCanvasInputSelection(graph, request, { catalog: qualified });
    assert.equal(repaired.status, 'allowed'); assert.equal(repaired.edges.length, 1);
    const next = repaired.nodes.find(n => n.id === 'target').data.slotBindings.prompt[0];
    assert.equal(next.ordinal, 7); assert.equal(next.role, 'prompt'); assert.equal(next.outputId, 'a:current');
    assert.equal(repaired.edges[0].id, next.edgeId); assert.deepEqual(graph, before);
  }
  const duplicateTarget = { ...target, data: { ...target.data, slotBindings: { prompt: [binding, { ...binding, edgeId: 'other', ordinal: 8 }] } } };
  const duplicate = { nodes: [source, duplicateTarget], edges: [{ id: 'ea', source: 'a', target: 'target' }] };
  const rejected = planCanvasInputSelection(duplicate, request, { catalog: qualified });
  assert.equal(rejected.status, 'rejected'); assert.equal(rejected.reasonCode, 'input_already_bound'); assert.equal(rejected.nodes, duplicate.nodes);
});

test('A6 resolved V1 records follow current source output identity without mutating saved intent or rejecting live edits', async () => {
  const { validateCanvasInputSelection } = await import('../canvasInputMutationGateway.ts');
  const { readNodeInputSource } = await import('../nodeInputSource.ts');
  const qualified = { models: [{ id: 'qualified', operations: [{ id: 'chat', listed: true, output: { type: 'text' }, inputs: [{
    slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1, valueSources: ['local_field', 'upstream_output'],
    composition: { kind: 'single_body', localRole: 'body' },
  }] }] }] };
  const source = { id: 'a', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text', nodeKind: 'generate', taskId: 'current-task', generatedContent: 'Current output' } };
  const saved = { sourceNodeId: 'a', edgeId: 'ea', outputId: 'old-task', ordinal: 4, role: 'prompt', pinned: true, use: 'active' };
  const target = { id: 'target', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text', nodeKind: 'generate', inputBindingVersion: 1,
    params: { model: 'qualified', operation: 'chat' }, slotBindings: { prompt: [saved] } } };
  const graph = { nodes: [source, target], edges: [{ id: 'ea', source: 'a', target: 'target' }] }; const before = structuredClone(graph);
  for (const taskId of ['current-task', 'edited-task']) {
    source.data.taskId = taskId;
    const verdict = validateCanvasInputSelection(graph, { targetNodeId: 'target', chosenOperationId: 'chat' }, { catalog: qualified });
    assert.equal(verdict.ready, true); assert.equal(verdict.records[0].occupant.outputId, taskId);
    assert.equal(verdict.records[0].asset.outputId, taskId); assert.equal(verdict.records[0].occupant.ordinal, 4);
    assert.equal(readNodeInputSource(source).output.assetId, taskId);
    assert.equal(saved.outputId, 'old-task');
  }
  source.data.taskId = 'current-task'; assert.deepEqual(graph, before);
});

const identityCatalog2848 = { models: [{ id: 'qualified', operations: [{ id: 'chat', listed: true, output: { type: 'text' }, inputs: [{
  slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1, valueSources: ['local_field', 'upstream_output'],
  composition: { kind: 'single_body', localRole: 'body' },
}] }] }] };
function identityGraph2848(use = 'inactive', outputId = 'old-task') {
  const source = { id: 'a', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text', nodeKind: 'generate', taskId: 'new-task', generatedContent: 'New A' } };
  const saved = { sourceNodeId: 'a', edgeId: 'ea', outputId, ordinal: 7, role: 'prompt', pinned: true, use };
  const target = { id: 'target', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text', nodeKind: 'generate', inputBindingVersion: 1,
    prompt: 'Local', params: { model: 'qualified', operation: 'chat' }, slotBindings: { prompt: [saved] } } };
  return { nodes: [source, target], edges: [{ id: 'ea', source: 'a', target: 'target' }] };
}
const identityIntent2848 = { targetNodeId: 'target', chosenOperationId: 'chat' };
const identitySelection2848 = { sourceNodeId: 'a', outputId: 'new-task', targetSlot: 'prompt', role: 'prompt' };

test('R2 Add reactivates the same inactive intent in place for old and current saved task identities', async () => {
  const { planCanvasInputSelection, validateCanvasInputSelection } = await import('../canvasInputMutationGateway.ts');
  const { collectMaterialSlotInputs } = await import('../../../workflow/execution/materialSlotInputs.ts');
  for (const savedId of ['old-task', 'new-task']) {
    const graph = identityGraph2848('inactive', savedId); const before = structuredClone(graph);
    const planned = planCanvasInputSelection(graph, { ...identityIntent2848, selections: [identitySelection2848] }, { catalog: identityCatalog2848 });
    assert.equal(planned.status, 'allowed');
    const target = planned.nodes.find(n => n.id === 'target');
    assert.deepEqual(target.data.slotBindings.prompt, [{ ...graph.nodes[1].data.slotBindings.prompt[0], outputId: 'new-task', use: 'active' }]);
    assert.equal(planned.edges.length, 1); assert.equal(planned.edges[0].id, 'ea');
    const replay = planCanvasInputMutation(graph, { nodePatches: [{ nodeId: 'target', data: { slotBindings: target.data.slotBindings } }],
      strictConsumption: identityIntent2848 }, { catalog: identityCatalog2848 });
    assert.equal(replay.status, 'allowed');
    assert.deepEqual(validateCanvasInputSelection(replay, identityIntent2848, { catalog: identityCatalog2848 }).records.map(r => r.state), ['ready']);
    const result = collectMaterialSlotInputs(target.data, { upstreamOutputs: new Map([['a', { text: 'Wrong map' }]]),
      upstreamBindings: [{ edgeId: 'ea', sourceNodeId: 'a', output: { text: 'New A', assetId: 'new-task' } }] }, identityCatalog2848);
    assert.equal(result.prompt, 'New A\n\nLocal'); assert.equal(result.textInputs.length, 1);
    assert.deepEqual(graph, before);
  }
});

test('OCR3 Replace disambiguates shared-edge roles and changes only the clicked slot occupant', async () => {
  const { planCanvasInputSelection } = await import('../canvasInputMutationGateway.ts');
  const image = id => ({ id, type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'image', nodeKind: 'import', mediaUrl: `https://fixture.test/${id}.png`, mimeType: 'image/png' } });
  const first = { sourceNodeId: 'a', edgeId: 'ea', outputId: 'old', ordinal: 4, role: 'first_frame', pinned: true, use: 'active' };
  const last = { ...first, ordinal: 8, role: 'last_frame' };
  const target = { id: 'target', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'video', nodeKind: 'generate', inputBindingVersion: 1,
    params: { model: 'video', operation: 'first_last_frame' }, slotBindings: { start_frame: [first], end_frame: [last] } } };
  const graph = { nodes: [image('a'), image('b'), target], edges: [{ id: 'ea', source: 'a', target: 'target' }] }; const before = structuredClone(graph);
  const request = { targetNodeId: 'target', chosenOperationId: 'first_last_frame', replaceEdgeId: 'ea',
    selections: [{ sourceNodeId: 'b', outputId: 'https://fixture.test/b.png', targetSlot: 'end_frame', role: 'last_frame' }] };
  const ambiguous = planCanvasInputSelection(graph, request, { catalog });
  assert.equal(ambiguous.status, 'rejected'); assert.equal(ambiguous.reasonCode, 'role_required');
  assert.equal(ambiguous.nodes, graph.nodes); assert.equal(ambiguous.edges, graph.edges);
  const exact = planCanvasInputSelection(graph, { ...request, replaceSlot: 'end_frame', replaceRole: 'last_frame', replaceSourceNodeId: 'a' }, { catalog });
  assert.equal(exact.status, 'allowed');
  const next = exact.nodes.find(n => n.id === 'target').data.slotBindings;
  assert.deepEqual(next.start_frame, [first]); assert.equal(next.end_frame.length, 1);
  assert.equal(next.end_frame[0].sourceNodeId, 'b'); assert.equal(next.end_frame[0].ordinal, 8); assert.equal(next.end_frame[0].role, 'last_frame');
  assert.deepEqual(graph, before);
});

test('OCR20 V1 duplicate active resolved intent is visible and blocks while legacy keeps its original dedupe', async () => {
  const { validateCanvasInputSelection } = await import('../canvasInputMutationGateway.ts');
  const { selectSlotOccupants } = await import('./assembleEffectiveInputs.ts');
  const graph = identityGraph2848('active'); const saved = graph.nodes[1].data.slotBindings.prompt[0];
  graph.nodes[1].data.slotBindings.prompt.push({ ...saved, edgeId: 'ea2', outputId: 'different-old-task', ordinal: 9 });
  graph.edges.push({ id: 'ea2', source: 'a', target: 'target' }); const before = structuredClone(graph);
  const verdict = validateCanvasInputSelection(graph, identityIntent2848, { catalog: identityCatalog2848 });
  assert.equal(verdict.accepts, false); assert.equal(verdict.ready, false); assert.equal(verdict.reasonCode, 'role_conflict');
  assert.deepEqual(verdict.records.map(r => [r.occupant.edgeId, r.state]), [['ea', 'ready'], ['ea2', 'invalid']]);
  const l = deriveSlotLayout(identityCatalog2848, 'qualified', 'chat');
  const assets = ['ea', 'ea2'].map(edgeId => ({ edgeId, sourceNodeId: 'a', outputId: 'new-task', type: 'text', availability: 'ready', textContent: 'New A' }));
  const assembled = assembleEffectiveInputsFromSlots({ layout: l, bindings: graph.nodes[1].data.slotBindings, conflicts: [],
    nodeData: graph.nodes[1].data, feedAssets: assets, incomingText: [] });
  assert.equal(assembled.blockedInputs.length, 1); assert.equal(assembled.blockedInputs[0].edgeId, 'ea2');
  assert.equal(selectSlotOccupants(l, graph.nodes[1].data.slotBindings, assets).length, 1);
  assert.deepEqual(graph, before);
});

test('OCR20 same-edge inactive occurrence cannot swallow an unavailable active intent and ambiguous actions reject', async () => {
  const { validateCanvasInputSelection, planCanvasInputSelection } = await import('../canvasInputMutationGateway.ts');
  const graph = identityGraph2848('inactive'); const inactive = graph.nodes[1].data.slotBindings.prompt[0];
  graph.nodes[1].data.slotBindings.prompt.push({ ...inactive, use: 'active', ordinal: 9 });
  graph.nodes = [graph.nodes[1]]; graph.edges = []; const before = structuredClone(graph);
  const verdict = validateCanvasInputSelection(graph, identityIntent2848, { catalog: identityCatalog2848 });
  assert.equal(verdict.accepts, false); assert.equal(verdict.ready, false);
  assert.deepEqual(verdict.records.map(r => r.state), ['inactive', 'invalid']);
  for (const request of [
    { ...identityIntent2848, setUse: { slot: 'prompt', edgeId: 'ea', use: 'inactive' } },
    { ...identityIntent2848, replaceEdgeId: 'ea', replaceSlot: 'prompt', selections: [identitySelection2848] },
  ]) {
    const rejected = planCanvasInputSelection(graph, request, { catalog: identityCatalog2848 });
    assert.equal(rejected.status, 'rejected'); assert.equal(rejected.nodes, graph.nodes); assert.equal(rejected.edges, graph.edges);
  }
  assert.deepEqual(graph, before);
});

test('OCR20 malformed same-edge active and inactive copies block even with a healthy current output in either order', async () => {
  const { validateCanvasInputSelection } = await import('../canvasInputMutationGateway.ts');
  for (const activeFirst of [false, true]) {
    const graph = identityGraph2848('inactive'); const saved = graph.nodes[1].data.slotBindings.prompt[0];
    const active = { ...saved, use: 'active', ordinal: 9 };
    graph.nodes[1].data.slotBindings.prompt = activeFirst ? [active, saved] : [saved, active];
    const before = structuredClone(graph);
    const verdict = validateCanvasInputSelection(graph, identityIntent2848, { catalog: identityCatalog2848 });
    assert.equal(verdict.accepts, false); assert.equal(verdict.reasonCode, 'role_conflict');
    assert.equal(verdict.records.length, 2);
    assert.equal(verdict.records.find(r => r.occupant.use === 'active').state, 'invalid');
    assert.equal(verdict.records.find(r => r.occupant.use === 'inactive').state, 'inactive');
    assert.deepEqual(graph, before);
  }
});

test('R2 current-output Add rejects active identity and healthy restoration cannot bypass another invalid binding', async () => {
  const { planCanvasInputSelection, validateCanvasInputSelection } = await import('../canvasInputMutationGateway.ts');
  const ctx = { catalog: identityCatalog2848 };
  for (const savedId of ['old-task', 'new-task']) {
    const graph = identityGraph2848('active', savedId); const before = structuredClone(graph);
    const rejected = planCanvasInputSelection(graph, { ...identityIntent2848, selections: [identitySelection2848] }, ctx);
    assert.equal(rejected.status, 'rejected'); assert.equal(rejected.reasonCode, 'input_already_bound');
    assert.equal(rejected.nodes, graph.nodes); assert.equal(rejected.edges, graph.edges); assert.deepEqual(graph, before);
  }
  const graph = identityGraph2848();
  graph.nodes[1].data.slotBindings.prompt.push({ sourceNodeId: 'missing', edgeId: 'missing-edge', outputId: 'missing-task', role: 'prompt', ordinal: 10, use: 'active', pinned: true });
  const before = structuredClone(graph);
  assert.equal(validateCanvasInputSelection(identityGraph2848('active'), identityIntent2848, ctx).ready, true, 'A itself is healthy');
  for (const request of [{ ...identityIntent2848, selections: [identitySelection2848] },
    { ...identityIntent2848, setUse: { slot: 'prompt', edgeId: 'ea', use: 'active' } }]) {
    const rejected = planCanvasInputSelection(graph, request, ctx);
    assert.equal(rejected.status, 'rejected'); assert.equal(rejected.reasonCode, 'input_unavailable');
    assert.equal(rejected.nodes, graph.nodes); assert.equal(rejected.edges, graph.edges);
  }
  assert.deepEqual(graph, before);
});

test('R2 missing former slot never redirects retained role and same-edge inactive-only intent remains nonblocking', async () => {
  const { planCanvasInputSelection, validateCanvasInputSelection } = await import('../canvasInputMutationGateway.ts');
  const graph = identityGraph2848(); const saved = graph.nodes[1].data.slotBindings.prompt[0];
  graph.nodes[1].data.slotBindings = { removed: [{ ...saved, role: 'former-body' }] }; const before = structuredClone(graph);
  const rejected = planCanvasInputSelection(graph, { ...identityIntent2848, replaceEdgeId: 'ea', replaceSlot: 'removed', replaceRole: 'former-body', selections: [identitySelection2848] }, { catalog: identityCatalog2848 });
  assert.equal(rejected.status, 'rejected'); assert.equal(rejected.reasonCode, 'role_conflict'); assert.equal(rejected.nodes, graph.nodes);
  assert.deepEqual(graph, before);
  const inactiveOnly = identityGraph2848(); inactiveOnly.nodes[1].data.slotBindings.prompt.push({ ...inactiveOnly.nodes[1].data.slotBindings.prompt[0], ordinal: 8 });
  const verdict = validateCanvasInputSelection(inactiveOnly, identityIntent2848, { catalog: identityCatalog2848 });
  assert.equal(verdict.ready, true); assert.deepEqual(verdict.records.map(r => r.state), ['inactive', 'inactive']);
});

test('effectiveInputDisplay auto-fills upstream feed into matching slots under inputBindingVersion=1 when saved is undefined', () => {
  const l = {
    operationId: 'digital_human',
    preset: 'named',
    slots: [
      { slot: 'character', role: 'first_frame', type: 'image', min: 1, max: 1 },
      { slot: 'driving_audio', role: 'audio_track', type: 'audio', min: 1, max: 1 },
    ],
  };
  const imgFeed = {
    edgeId: 'e-img',
    sourceNodeId: 'node-img',
    type: 'image',
    availability: 'ready',
    outputId: 'ast-1',
    url: 'https://example.test/img.png',
    ordinal: 0,
  };
  // 当 saved 未定义时（未初始化/空装填态），执行自动装填
  const result = effectiveInputDisplay(l, [imgFeed], undefined, [], [], [], 1);
  assert.equal(result.bindings.character?.length, 1, '图片连线必须自动装填进 character 卡槽');
  assert.equal(result.bindings.character[0].edgeId, 'e-img');
  assert.equal(result.bindings.driving_audio?.length ?? 0, 0, '音频卡槽无对应输入保持空态');
});

