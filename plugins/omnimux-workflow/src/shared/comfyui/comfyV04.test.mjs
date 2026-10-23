/**
 * ComfyUI v0.4 schema codec tests.
 *
 * Fixtures are hand-built small samples written for this repository; no
 * upstream ComfyUI test fixture or schema file is copied here.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  parseComfyWorkflow,
  stringifyComfyWorkflow,
} from './codec.ts';
import { decodeLinkTuple, encodeLinkTuple } from './schemaV04.ts';

/** Minimal but realistic v0.4 document: text prompt -> sampler -> preview. */
function v04Sample() {
  return {
    last_node_id: 3,
    last_link_id: 2,
    nodes: [
      {
        id: 1,
        type: 'CLIPTextEncode',
        pos: [10, 20],
        size: [210, 100],
        flags: {},
        order: 0,
        mode: 0,
        inputs: [{ name: 'clip', type: 'CLIP', link: null }],
        outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [1], slot_index: 0 }],
        properties: { 'Node name for S&R': 'CLIPTextEncode' },
        widgets_values: ['a lighthouse at dusk'],
      },
      {
        id: 2,
        type: 'KSampler',
        pos: [260, 20],
        size: [300, 260],
        flags: {},
        order: 1,
        mode: 0,
        inputs: [
          { name: 'model', type: 'MODEL', link: null },
          { name: 'positive', type: 'CONDITIONING', link: 1 },
          { name: 'negative', type: 'CONDITIONING', link: null },
          { name: 'latent_image', type: 'LATENT', link: null },
        ],
        outputs: [{ name: 'LATENT', type: 'LATENT', links: [2], slot_index: 0 }],
        properties: {},
        widgets_values: [123456, 'randomize', 20, 8, 'euler', 'normal', 1],
      },
      {
        id: 3,
        type: 'PreviewImage',
        pos: [600, 20],
        size: [300, 260],
        flags: {},
        order: 2,
        mode: 0,
        inputs: [{ name: 'images', type: 'IMAGE', link: 2 }],
        outputs: [],
        properties: {},
        widgets_values: [],
      },
    ],
    links: [
      [1, 1, 0, 2, 1, 'CONDITIONING'],
      [2, 2, 0, 3, 0, 'IMAGE'],
    ],
    groups: [
      { title: 'Sampling', bounding: [0, 0, 600, 320], color: '#3f789e', font_size: 24, flags: {} },
    ],
    config: {},
    extra: { ds: { scale: 0.85, offset: [12, -30] } },
    version: 0.4,
  };
}

test('v0.4: parses the tuple-link document into the structural model', () => {
  const result = parseComfyWorkflow(JSON.stringify(v04Sample()));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.format, 'v0.4');
  const doc = result.document;
  assert.equal(doc.format, 'v0.4');
  assert.equal(doc.version, 0.4);
  assert.equal(doc.lastNodeId, 3);
  assert.equal(doc.lastLinkId, 2);
  assert.equal(doc.nodes.length, 3);
  assert.equal(doc.links.length, 2);
  // Tuple -> normalised object.
  const first = doc.links[0];
  assert.deepEqual(
    { id: first.id, originId: first.originId, originSlot: first.originSlot, targetId: first.targetId, targetSlot: first.targetSlot, type: first.type },
    { id: 1, originId: 1, originSlot: 0, targetId: 2, targetSlot: 1, type: 'CONDITIONING' },
  );
  assert.deepEqual(doc.nodes[1].widgetsValues, [123456, 'randomize', 20, 8, 'euler', 'normal', 1]);
  assert.deepEqual(doc.nodes[0].pos, [10, 20]);
  assert.deepEqual(doc.extra.ds.offset, [12, -30]);
  assert.equal(doc.extra.ds.scale, 0.85);
  assert.equal(doc.groups.length, 1);
  assert.deepEqual(doc.groups[0].bounding, [0, 0, 600, 320]);
});

test('v0.4: decode -> encode -> parse is lossless (deep equality)', () => {
  const source = v04Sample();
  const parsed = parseComfyWorkflow(JSON.stringify(source));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const reencoded = JSON.parse(stringifyComfyWorkflow(parsed.document));
  assert.deepEqual(reencoded, source);
  // And the re-encoded text parses back to an equivalent model.
  const again = parseComfyWorkflow(JSON.stringify(reencoded));
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.deepEqual(again.document.nodes, parsed.document.nodes);
  assert.deepEqual(again.document.links, parsed.document.links);
});

test('v0.4: extra tuple slots are preserved verbatim', () => {
  const source = v04Sample();
  source.links = [[1, 1, 0, 2, 1, 'CONDITIONING', 'extra-token', 42]];
  const parsed = parseComfyWorkflow(JSON.stringify(source));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.document.links[0].extraTupleSlots, ['extra-token', 42]);
  const reencoded = JSON.parse(stringifyComfyWorkflow(parsed.document));
  assert.deepEqual(reencoded.links, source.links);
});

test('v0.4: unknown node fields survive the round trip', () => {
  const source = v04Sample();
  source.nodes[0].cnr_id = 'comfy-core';
  source.nodes[0].aux_id = 'author/repo';
  source.extra.ds.linked = true;
  const parsed = parseComfyWorkflow(JSON.stringify(source));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.document.nodes[0].unknown.cnr_id, 'comfy-core');
  const reencoded = JSON.parse(stringifyComfyWorkflow(parsed.document));
  assert.deepEqual(reencoded, source);
});

test('v0.4: link tuple helpers normalise and restore the 6-element form', () => {
  const link = decodeLinkTuple([7, 1, 2, 3, 4, 'IMAGE'], 'links[0]');
  assert.deepEqual(
    { id: link.id, originId: link.originId, originSlot: link.originSlot, targetId: link.targetId, targetSlot: link.targetSlot, type: link.type },
    { id: 7, originId: 1, originSlot: 2, targetId: 3, targetSlot: 4, type: 'IMAGE' },
  );
  assert.deepEqual(encodeLinkTuple(link), [7, 1, 2, 3, 4, 'IMAGE']);
});

test('v0.4: structural violations produce readable errors', () => {
  const missingLinks = parseComfyWorkflow(JSON.stringify({ version: 0.4, nodes: [] }));
  assert.equal(missingLinks.ok, false);
  if (!missingLinks.ok) {
    assert.equal(missingLinks.error.code, 'missing-field');
    assert.equal(missingLinks.error.path, 'links');
  }

  const badPos = v04Sample();
  badPos.nodes[1].pos = 'nope';
  const badPosResult = parseComfyWorkflow(JSON.stringify(badPos));
  assert.equal(badPosResult.ok, false);
  if (!badPosResult.ok) {
    assert.equal(badPosResult.error.code, 'invalid-structure');
    assert.equal(badPosResult.error.path, 'nodes[1].pos');
  }

  const shortLink = v04Sample();
  shortLink.links = [[1, 1, 0]];
  const shortLinkResult = parseComfyWorkflow(JSON.stringify(shortLink));
  assert.equal(shortLinkResult.ok, false);
  if (!shortLinkResult.ok) {
    assert.equal(shortLinkResult.error.code, 'invalid-structure');
    assert.equal(shortLinkResult.error.path, 'links[0]');
  }
});
