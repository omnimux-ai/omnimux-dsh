/**
 * ComfyUI v1 schema codec tests.
 *
 * Fixtures are hand-built small samples written for this repository; no
 * upstream ComfyUI test fixture or schema file is copied here.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseComfyWorkflow, stringifyComfyWorkflow } from './codec.ts';

/** Minimal but realistic v1 document: state + object links + reroutes. */
function v1Sample() {
  return {
    version: 1,
    state: { lastGroupId: 1, lastNodeId: 4, lastLinkId: 3, lastRerouteId: 2 },
    groups: [
      { id: 1, title: 'Loaders', bounding: [0, 0, 300, 200], color: '#3f789e', font_size: 24, flags: {} },
    ],
    nodes: [
      {
        id: 1,
        type: 'CLIPTextEncode',
        pos: [0, 0],
        size: [200, 100],
        flags: {},
        order: 0,
        mode: 0,
        inputs: [{ name: 'clip', type: 'CLIP', link: null }],
        outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [1], slot_index: 0 }],
        properties: {},
        widgets_values: ['a quiet harbour'],
      },
      {
        id: 2,
        type: 'Reroute',
        pos: [220, 0],
        size: [75, 26],
        flags: {},
        order: 1,
        mode: 0,
        inputs: [{ name: '', type: '*', link: 1 }],
        outputs: [{ name: '', type: '*', links: [2], slot_index: 0 }],
      },
      {
        id: 3,
        type: 'LoadImage',
        pos: [320, 0],
        size: [315, 314],
        flags: {},
        order: 2,
        mode: 0,
        inputs: [],
        outputs: [
          { name: 'IMAGE', type: 'IMAGE', links: [3], slot_index: 0 },
          { name: 'MASK', type: 'MASK', links: null, slot_index: 1 },
        ],
        widgets_values: ['example.png', 'image'],
      },
      {
        id: 4,
        type: 'KSampler',
        pos: [660, 0],
        size: [300, 260],
        flags: {},
        order: 3,
        mode: 0,
        inputs: [
          { name: 'model', type: 'MODEL', link: null },
          { name: 'positive', type: 'CONDITIONING', link: 2 },
          { name: 'negative', type: 'CONDITIONING', link: null },
          { name: 'latent_image', type: 'LATENT', link: null },
        ],
        outputs: [{ name: 'LATENT', type: 'LATENT', links: [], slot_index: 0 }],
        properties: {},
        widgets_values: [1, 'fixed', 20, 8, 'euler', 'normal', 1],
      },
    ],
    links: [
      { id: 1, origin_id: 1, origin_slot: 0, target_id: 2, target_slot: 0, type: 'CONDITIONING' },
      { id: 2, origin_id: 2, origin_slot: 0, target_id: 4, target_slot: 1, type: 'CONDITIONING', parentId: null },
      { id: 3, origin_id: 3, origin_slot: 0, target_id: 2, target_slot: 0, type: 'IMAGE' },
    ],
    floatingLinks: [
      { id: 9, origin_id: 3, origin_slot: 1, target_id: 4, target_slot: 3, type: 'MASK' },
    ],
    reroutes: [
      { id: 1, pos: [220, 0], linkIds: [1, 2], parentId: null },
      { id: 2, pos: [230, 40], linkIds: [], parentId: null },
    ],
    extra: { ds: { scale: 0.9, offset: [0, 0] } },
    definitions: { subgraphs: [] },
  };
}

test('v1: parses state, object links, reroutes and definitions', () => {
  const result = parseComfyWorkflow(JSON.stringify(v1Sample()));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.format, 'v1');
  const doc = result.document;
  assert.equal(doc.format, 'v1');
  assert.equal(doc.version, 1);
  assert.equal(doc.state.lastNodeId, 4);
  assert.equal(doc.state.lastRerouteId, 2);
  assert.equal(doc.nodes.length, 4);
  assert.equal(doc.links.length, 3);
  assert.equal(doc.links[1].parentId, null);
  assert.equal(doc.floatingLinks.length, 1);
  assert.equal(doc.reroutes.length, 2);
  assert.deepEqual(doc.reroutes[0].linkIds, [1, 2]);
  assert.deepEqual(doc.definitions, { subgraphs: [] });
  assert.deepEqual(doc.nodes[3].widgetsValues, [1, 'fixed', 20, 8, 'euler', 'normal', 1]);
});

test('v1: decode -> encode -> parse is lossless (deep equality)', () => {
  const source = v1Sample();
  const parsed = parseComfyWorkflow(JSON.stringify(source));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const reencoded = JSON.parse(stringifyComfyWorkflow(parsed.document));
  assert.deepEqual(reencoded, source);
  const again = parseComfyWorkflow(JSON.stringify(reencoded));
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.deepEqual(again.document.links, parsed.document.links);
  assert.deepEqual(again.document.nodes, parsed.document.nodes);
});

test('v1: unknown node and state fields survive the round trip', () => {
  const source = v1Sample();
  source.nodes[0].showAdvanced = true;
  source.nodes[0].properties = { 'Node name for S&R': 'CLIPTextEncode', cnr_id: 'comfy-core' };
  source.state.workflowId = 'abc';
  const parsed = parseComfyWorkflow(JSON.stringify(source));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.document.nodes[0].unknown.showAdvanced, true);
  assert.equal(parsed.document.state.unknown.workflowId, 'abc');
  const reencoded = JSON.parse(stringifyComfyWorkflow(parsed.document));
  assert.deepEqual(reencoded, source);
});

test('v1: widget-backed input descriptors are preserved', () => {
  const source = v1Sample();
  source.nodes[3].inputs[0].widget = { name: 'seed' };
  const parsed = parseComfyWorkflow(JSON.stringify(source));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.document.nodes[3].inputs[0].widget, { name: 'seed' });
  const reencoded = JSON.parse(stringifyComfyWorkflow(parsed.document));
  assert.deepEqual(reencoded, source);
});

test('v1: structural violations produce readable errors', () => {
  const noState = v1Sample();
  delete noState.state;
  const noStateResult = parseComfyWorkflow(JSON.stringify(noState));
  assert.equal(noStateResult.ok, false);
  if (!noStateResult.ok) {
    assert.equal(noStateResult.error.code, 'missing-field');
    assert.equal(noStateResult.error.path, 'state');
  }

  const partialState = v1Sample();
  delete partialState.state.lastRerouteId;
  const partialStateResult = parseComfyWorkflow(JSON.stringify(partialState));
  assert.equal(partialStateResult.ok, false);
  if (!partialStateResult.ok) {
    assert.equal(partialStateResult.error.code, 'missing-field');
    assert.equal(partialStateResult.error.path, 'state.lastRerouteId');
  }

  const badLink = v1Sample();
  badLink.links[0] = { id: 1, origin_id: 1, origin_slot: 0, target_id: 2 };
  const badLinkResult = parseComfyWorkflow(JSON.stringify(badLink));
  assert.equal(badLinkResult.ok, false);
  if (!badLinkResult.ok) {
    assert.equal(badLinkResult.error.code, 'invalid-structure');
    assert.equal(badLinkResult.error.path, 'links[0].target_slot');
  }
});
