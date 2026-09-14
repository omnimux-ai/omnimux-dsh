import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectiveInputDisplay } from '../src/shared/graph/feedSlot/effectiveInputDisplay.ts';
import { assembleEffectiveInputsFromSlots } from '../src/shared/graph/feedSlot/assembleEffectiveInputs.ts';
import { deriveSlotLayout } from '../src/shared/graph/feedSlot/index.ts';

const slot = (name, role = 'reference') => ({ slot: name, type: 'image', role, source: 'upstream_edge', min: 1, max: 4 });
const layoutFor = (inputs) => deriveSlotLayout({ models: [{ id: 'fixture', operations: [{
  id: 'image_to_image', listed: true, output: { type: 'image' }, inputs,
}] }] }, 'fixture', 'image_to_image', 'image');
const asset = (edgeId, sourceNodeId = edgeId, extra = {}) => ({ edgeId, sourceNodeId,
  outputId: 'current', type: 'image', availability: 'ready', ordinal: 0,
  url: `https://fixture.test/${sourceNodeId}.png`, ...extra });
const occupant = (feed) => ({ edgeId: feed.edgeId, sourceNodeId: feed.sourceNodeId, outputId: feed.outputId, pinned: true });
const assemble = (layout, feedAssets, display) => assembleEffectiveInputsFromSlots({
  layout, feedAssets, bindings: display.bindings, conflicts: display.conflicts,
  nodeData: {}, incomingText: ['1dog'],
});

test('duplicate saved occupants and duplicate edges project once in display and payload without rewriting saved choices', () => {
  const layout = layoutFor([slot('reference')]);
  const a = asset('e1', 'source');
  const duplicate = asset('e2', 'source');
  const other = asset('e3', 'other', { url: a.url });
  const feed = [a, duplicate, other];
  const saved = { reference: [occupant(a), occupant(a), occupant(duplicate), occupant(other)] };
  const before = structuredClone(saved);
  const display = effectiveInputDisplay(layout, feed, saved);
  const payload = assemble(layout, feed, display);
  assert.deepEqual(display.visibleBindings.reference.map((entry) => entry.edgeId), ['e1', 'e3']);
  assert.deepEqual(payload.references.map((entry) => entry.edgeId), ['e1', 'e3']);
  assert.deepEqual(payload.unusedFeedEdgeIds, ['e2']);
  assert.deepEqual(display.conflicts, []);
  assert.deepEqual(saved, before);
  assert.equal(payload.prompt, '1dog');
});

test('same source can retain two explicit frame roles in display and execution', () => {
  const layout = layoutFor([slot('first_frame', 'first_frame'), slot('last_frame', 'last_frame')]);
  const a = asset('e1');
  const display = effectiveInputDisplay(layout, [a], { first_frame: [occupant(a)], last_frame: [occupant(a)] });
  assert.deepEqual(display.selected.map((entry) => entry.slot.role), ['first_frame', 'last_frame']);
  assert.deepEqual(assemble(layout, [a], display).references.map((entry) => entry.role), ['first_frame', 'last_frame']);
});

test('removed saved slot stays an explicit conflict instead of becoming consumed or silently reassigned', () => {
  const layout = layoutFor([slot('reference')]);
  const a = asset('e1');
  const saved = { removed: [occupant(a)] };
  const display = effectiveInputDisplay(layout, [a], saved);
  assert.deepEqual(display.conflicts, [{ slot: 'removed', occupant: occupant(a), reason: 'slot_removed' }]);
  assert.deepEqual(display.visibleBindings, {});
  assert.deepEqual(display.bindings, saved);
  const payload = assemble(layout, [a], display);
  assert.deepEqual(payload.references, []);
  assert.deepEqual(payload.unusedFeedEdgeIds, ['e1']);
  assert.deepEqual(payload.emptyRequiredSlots, ['reference']);
});

test('saved conflict excludes only its slot and edge, not another legal role on the same source', () => {
  const layout = layoutFor([slot('first_frame', 'first_frame'), slot('last_frame', 'last_frame')]);
  const a = asset('e1');
  const saved = { first_frame: [occupant(a)], last_frame: [occupant(a)] };
  const conflict = { slot: 'first_frame', occupant: occupant(a), reason: 'role_illegal' };
  const display = effectiveInputDisplay(layout, [a], saved, [conflict]);
  assert.deepEqual(display.visibleBindings, { last_frame: [occupant(a)] });
  assert.deepEqual(display.conflicts, [conflict]);
  assert.deepEqual(assemble(layout, [a], display).references.map((entry) => entry.role), ['last_frame']);
});

test('explicit empty bindings never hydrate standby supply but legacy missing bindings do', () => {
  const layout = layoutFor([slot('reference')]);
  const a = asset('e1');
  const empty = effectiveInputDisplay(layout, [a], {});
  assert.deepEqual(empty.visibleBindings, {});
  assert.deepEqual(assemble(layout, [a], empty).references, []);
  const legacy = effectiveInputDisplay(layout, [a]);
  assert.deepEqual(legacy.visibleBindings.reference.map((entry) => entry.edgeId), ['e1']);
  assert.deepEqual(assemble(layout, [a], legacy).references.map((entry) => entry.edgeId), ['e1']);
});

test('waiting saved occupant remains visible and blocks instead of using ready standby', () => {
  const layout = layoutFor([slot('reference')]);
  const a = asset('waiting', 'source', { availability: 'waiting', url: undefined });
  const standby = asset('standby');
  const display = effectiveInputDisplay(layout, [a, standby], { reference: [occupant(a)] });
  assert.deepEqual(display.visibleBindings.reference, [occupant(a)]);
  const payload = assemble(layout, [a, standby], display);
  assert.deepEqual(payload.references, []);
  assert.deepEqual(payload.blockedInputs, [{ slot: 'reference', edgeId: 'waiting', sourceNodeId: 'source', reason: 'input_waiting' }]);
  assert.deepEqual(payload.unusedFeedEdgeIds, ['standby']);
});
