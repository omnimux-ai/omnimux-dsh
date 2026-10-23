/**
 * Declared-field type mismatch coverage.
 *
 * A declared optional field whose value has an unexpected shape (including an
 * explicit `null`) must not be dropped silently: the decoder keeps the original
 * value, the encoder restores it, and the canvas projection reports it as
 * `field-type-mismatch`. Required structural fields stay loud parse errors.
 *
 * Fixtures are literals built for this repository; the tests exercise pure
 * functions only (no source-text reading, no registry mutation).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseComfyWorkflow, stringifyComfyWorkflow } from './codec.ts';
import { projectComfyToCanvas } from './canvasMapping.ts';

function parseOk(source) {
  const result = parseComfyWorkflow(JSON.stringify(source));
  assert.equal(result.ok, true, `fixture must parse: ${JSON.stringify(result)}`);
  if (!result.ok) throw new Error('unreachable');
  return result.document;
}

function reencode(document) {
  return JSON.parse(stringifyComfyWorkflow(document));
}

function mismatchIds(projection) {
  return projection.unsupported
    .filter((entry) => entry.reason === 'field-type-mismatch')
    .map((entry) => entry.id)
    .sort();
}

test('v0.4: malformed declared node and group fields are preserved, not dropped', () => {
  const source = {
    last_node_id: 1,
    last_link_id: 0,
    nodes: [{
      id: 1,
      type: 'CLIPTextEncode',
      pos: [0, 0],
      order: '7',
      mode: '0',
      color: 123,
      title: 42,
      inputs: [{ name: 'clip', type: 'CLIP', link: null, slot_index: '0' }],
      widgets_values: ['hi'],
    }],
    links: [],
    groups: [{ id: '5', title: 9, font_size: '12', bounding: [0, 0, 10, 10] }],
    config: {},
    extra: {},
    version: 0.4,
  };
  const document = parseOk(source);
  const node = document.nodes[0];
  // Typed fields stay absent ...
  assert.equal(node.order, undefined);
  assert.equal(node.mode, undefined);
  assert.equal(node.color, undefined);
  assert.equal(node.title, undefined);
  // ... and the original values are kept verbatim.
  assert.equal(node.unknown.order, '7');
  assert.equal(node.unknown.mode, '0');
  assert.equal(node.unknown.color, 123);
  assert.equal(node.unknown.title, 42);
  assert.equal(node.inputs[0].unknown.slot_index, '0');
  assert.equal(document.groups[0].unknown.id, '5');
  assert.equal(document.groups[0].unknown.title, 9);
  assert.equal(document.groups[0].unknown.font_size, '12');
  // Round-trip restores the original document byte-for-byte in content.
  assert.deepEqual(reencode(document), source);
});

test('v0.4: the projection reports every malformed declared field explicitly', () => {
  const source = {
    last_node_id: '1',
    last_link_id: 0,
    nodes: [{
      id: 1,
      type: 'CLIPTextEncode',
      pos: [0, 0],
      order: '7',
      title: 42,
      inputs: [{ name: 'clip', type: 'CLIP', link: null, slot_index: '0' }],
      outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: 'none', slot_index: 0 }],
      widgets_values: ['hi'],
    }],
    links: [],
    groups: [{ id: '5', title: 9, font_size: '12', bounding: [0, 0, 10, 10] }],
    config: {},
    extra: {},
    version: 0.4,
  };
  const projection = projectComfyToCanvas(parseOk(source));
  assert.deepEqual(mismatchIds(projection), [
    '1.inputs.clip.slot_index',
    '1.order',
    '1.outputs.CONDITIONING.links',
    '1.title',
    'comfy-group-5.font_size',
    'comfy-group-5.id',
    'comfy-group-5.title',
    'last_node_id',
  ]);
  const orderEntry = projection.unsupported.find((entry) => entry.id === '1.order');
  assert.equal(orderEntry.kind, 'parameter');
  assert.equal(orderEntry.detail, 'received string');
  const lastNodeEntry = projection.unsupported.find((entry) => entry.id === 'last_node_id');
  assert.equal(lastNodeEntry.kind, 'document-field');
  // The malformed counter is derived for internal use, never trusted as-is.
  assert.equal(projection.supported.some((entry) => entry.id === '1'), true);
});

test('explicit null on declared optional fields is preserved and reported', () => {
  const source = {
    last_node_id: 1,
    last_link_id: 0,
    nodes: [{
      id: 1,
      type: 'LoadImage',
      pos: [0, 0],
      size: null,
      flags: null,
      properties: null,
      widgets_values: null,
      color: null,
      title: null,
      inputs: null,
      outputs: null,
    }],
    links: [],
    groups: [],
    config: {},
    extra: {},
    version: 0.4,
  };
  const document = parseOk(source);
  assert.deepEqual(reencode(document), source);

  const projection = projectComfyToCanvas(document);
  assert.deepEqual(mismatchIds(projection), [
    '1.color',
    '1.flags',
    '1.inputs',
    '1.outputs',
    '1.properties',
    '1.size',
    '1.title',
    '1.widgets_values',
  ]);
  for (const entry of projection.unsupported) {
    if (entry.reason === 'field-type-mismatch') assert.equal(entry.detail, 'received null');
  }
});

test('v0.4: malformed root fields (counters, config, extra, version token) survive', () => {
  const source = {
    last_node_id: '7',
    last_link_id: '9',
    nodes: [{ id: 3, type: 'CLIPTextEncode', pos: [0, 0] }],
    links: [],
    groups: [],
    config: 5,
    extra: [],
    version: '0.4',
  };
  const document = parseOk(source);
  assert.equal(document.lastNodeId, 3);
  assert.equal(document.lastLinkId, 0);
  assert.deepEqual(reencode(document), source);

  const projection = projectComfyToCanvas(document);
  assert.deepEqual(mismatchIds(projection), [
    'config',
    'extra',
    'last_link_id',
    'last_node_id',
    'version',
  ]);
});

test('v0.4: malformed extra.ds shape is preserved and reported', () => {
  const source = {
    last_node_id: 1,
    last_link_id: 0,
    nodes: [{ id: 1, type: 'CLIPTextEncode', pos: [0, 0] }],
    links: [],
    groups: [],
    config: {},
    extra: { ds: { scale: '1', offset: 'x' } },
    version: 0.4,
  };
  const document = parseOk(source);
  assert.equal(document.extra.ds.unknown.scale, '1');
  assert.equal(document.extra.ds.unknown.offset, 'x');
  assert.deepEqual(reencode(document), source);
});

test('v1: malformed declared fields and passthrough blocks survive the round trip', () => {
  const source = {
    version: 1,
    state: { lastGroupId: 0, lastNodeId: 2, lastLinkId: 1, lastRerouteId: 0 },
    groups: [{ id: 1, title: 5, bounding: 'nope' }],
    nodes: [
      { id: 1, type: 'LoadImage', pos: [0, 0], size: [100, 100], widgets_values: ['a.png'] },
      { id: 2, type: 'CLIPTextEncode', pos: [200, 0], title: null, widgets_values: ['p'] },
    ],
    links: [{
      id: 1, origin_id: 1, origin_slot: 0, target_id: 2, target_slot: 0, type: 'IMAGE', parentId: 'x',
    }],
    floatingLinks: [],
    reroutes: [],
    extra: 7,
    definitions: 9,
  };
  const document = parseOk(source);
  assert.deepEqual(reencode(document), source);

  const projection = projectComfyToCanvas(document);
  assert.equal(projection.format, 'v1');
  assert.deepEqual(mismatchIds(projection), [
    '2.title',
    'comfy-group-1.bounding',
    'comfy-group-1.title',
    'definitions',
    'extra',
  ]);
  // The malformed bounding box means the group cannot be created: explicit.
  assert.ok(projection.unsupported.some((entry) => entry.reason === 'group-bounding-missing'));
  // definitions is preserved verbatim but never materialised.
  assert.ok(projection.unsupported.some((entry) => entry.id === 'definitions' && entry.reason === 'field-type-mismatch'));
});

test('required structural fields still fail loudly with a readable error', () => {
  const badPos = parseComfyWorkflow(JSON.stringify({
    version: 0.4, last_node_id: 1, last_link_id: 0,
    nodes: [{ id: 1, type: 'CLIPTextEncode', pos: 'x' }],
    links: [], groups: [], config: {}, extra: {},
  }));
  assert.equal(badPos.ok, false);
  if (!badPos.ok) {
    assert.equal(badPos.error.code, 'invalid-structure');
    assert.equal(badPos.error.path, 'nodes[0].pos');
  }

  const badLink = parseComfyWorkflow(JSON.stringify({
    version: 0.4, last_node_id: 1, last_link_id: 0,
    nodes: [{ id: 1, type: 'CLIPTextEncode', pos: [0, 0], inputs: [{ name: 'clip', type: 'CLIP', link: '1' }] }],
    links: [], groups: [], config: {}, extra: {},
  }));
  assert.equal(badLink.ok, false);
  if (!badLink.ok) {
    assert.equal(badLink.error.code, 'invalid-structure');
    assert.equal(badLink.error.path, 'nodes[0].inputs[0].link');
  }

  const badState = parseComfyWorkflow(JSON.stringify({
    version: 1,
    state: { lastGroupId: 0, lastNodeId: '2', lastLinkId: 0, lastRerouteId: 0 },
    groups: [], nodes: [], links: [], floatingLinks: [], reroutes: [], extra: {},
  }));
  assert.equal(badState.ok, false);
  if (!badState.ok) {
    assert.equal(badState.error.code, 'missing-field');
    assert.equal(badState.error.path, 'state.lastNodeId');
  }
});

test('well-formed documents report no type mismatch (no false positives)', () => {
  const source = {
    last_node_id: 1,
    last_link_id: 0,
    nodes: [{
      id: 1,
      type: 'CLIPTextEncode',
      pos: [10, 20],
      size: [210, 100],
      flags: {},
      order: 0,
      mode: 0,
      inputs: [{ name: 'clip', type: 'CLIP', link: null, slot_index: 0 }],
      outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: null, slot_index: 0 }],
      properties: {},
      widgets_values: ['ok'],
      color: '#223344',
      bgcolor: '#112233',
      title: 'Prompt',
    }],
    links: [],
    groups: [{ id: 1, title: 'G', bounding: [0, 0, 100, 100], color: '#3f789e', font_size: 24, flags: {} }],
    config: {},
    extra: {},
    version: 0.4,
  };
  const document = parseOk(source);
  assert.deepEqual(reencode(document), source);
  assert.deepEqual(mismatchIds(projectComfyToCanvas(document)), []);
});
