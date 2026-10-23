/**
 * Canvas projection tests: the mapping must carry over only what is declared
 * and report everything else explicitly.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseComfyWorkflow, stringifyComfyWorkflow } from './codec.ts';
import {
  COMFY_TO_CANVAS_MAPPING,
  lookupComfyNodeMapping,
  projectCanvasToComfy,
  projectComfyToCanvas,
} from './canvasMapping.ts';

function parseOrThrow(source) {
  const result = parseComfyWorkflow(JSON.stringify(source));
  assert.equal(result.ok, true, 'fixture must parse');
  if (!result.ok) throw new Error('unreachable');
  return result.document;
}

function v04Document() {
  return {
    last_node_id: 3,
    last_link_id: 2,
    nodes: [
      {
        id: 1,
        type: 'CLIPTextEncode',
        pos: [10, 20],
        size: [210, 100],
        order: 0,
        mode: 0,
        inputs: [{ name: 'clip', type: 'CLIP', link: null }],
        outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [1], slot_index: 0 }],
        properties: { 'Node name for S&R': 'CLIPTextEncode' },
        widgets_values: ['a lighthouse'],
      },
      {
        id: 2,
        type: 'KSampler',
        pos: [260, 20],
        size: [300, 260],
        order: 1,
        mode: 0,
        inputs: [
          { name: 'model', type: 'MODEL', link: null },
          { name: 'positive', type: 'CONDITIONING', link: 1 },
          { name: 'negative', type: 'CONDITIONING', link: null },
          { name: 'latent_image', type: 'LATENT', link: null },
        ],
        outputs: [{ name: 'LATENT', type: 'LATENT', links: [2], slot_index: 0 }],
        widgets_values: [123456, 'randomize', 20, 8, 'euler', 'normal', 1],
      },
      {
        id: 3,
        type: 'PreviewImage',
        pos: [600, 20],
        size: [300, 260],
        order: 2,
        mode: 0,
        inputs: [{ name: 'images', type: 'IMAGE', link: 2 }],
        outputs: [],
        widgets_values: [],
      },
    ],
    links: [
      [1, 1, 0, 2, 1, 'CONDITIONING'],
      [2, 2, 0, 3, 0, 'IMAGE'],
    ],
    groups: [{ title: 'Sampling', bounding: [0, 0, 600, 320] }],
    config: {},
    extra: { ds: { scale: 0.85, offset: [12, -30] } },
    version: 0.4,
  };
}

test('mapping table is explicit and self-consistent', () => {
  assert.ok(COMFY_TO_CANVAS_MAPPING.length >= 4);
  assert.equal(lookupComfyNodeMapping('CLIPTextEncode').materialType, 'text');
  assert.equal(lookupComfyNodeMapping('KSampler').lossy, true);
  assert.equal(lookupComfyNodeMapping('NotARealNode'), undefined);
});

test('v0.4 projection: mapped nodes become canvas nodes, unmapped ones are reported', () => {
  const projection = projectComfyToCanvas(parseOrThrow(v04Document()));

  const byId = Object.fromEntries(projection.nodes.map((node) => [node.id, node]));
  assert.equal(byId['comfy-1'].type, 'material');
  assert.equal(byId['comfy-1'].data.materialType, 'text');
  assert.equal(byId['comfy-1'].data.prompt, 'a lighthouse');
  assert.equal(byId['comfy-1'].data.nodeKind, 'generate');
  assert.deepEqual(byId['comfy-1'].position, { x: 10, y: 20 });
  assert.equal(byId['comfy-1'].width, 210);

  assert.equal(byId['comfy-2'].data.materialType, 'image');
  assert.equal(byId['comfy-2'].data.nodeKind, 'generate');

  // Group containers map onto the canvas group node.
  const group = projection.nodes.find((node) => node.type === 'group');
  assert.ok(group, 'group node must be projected');
  assert.equal(group.data.title, 'Sampling');
  assert.equal(group.width, 600);
  assert.equal(group.height, 320);

  // PreviewImage has no canvas counterpart.
  const unmapped = projection.unsupported.filter((entry) => entry.reason === 'unmapped-node-type');
  assert.equal(unmapped.length, 1);
  assert.equal(unmapped[0].id, '3');
  assert.equal(unmapped[0].kind, 'node');
  assert.equal(unmapped[0].detail, 'PreviewImage');

  // Sampler widgets are all reported.
  const widgetReports = projection.unsupported.filter((entry) => entry.kind === 'widget');
  assert.equal(widgetReports.length, 7);
  assert.equal(widgetReports[0].id, '2:widgets_values[0]');
  assert.equal(widgetReports[0].reason, 'widget-not-mapped');

  // Node properties / viewport are reported.
  assert.ok(projection.unsupported.some((entry) => entry.id === '1.properties'));
  assert.ok(projection.unsupported.some((entry) => entry.id === 'extra.ds' && entry.reason === 'viewport-not-carried'));

  // Link 1 (text -> sampler positive) is carried; link 2 targets an unmapped node.
  assert.equal(projection.edges.length, 1);
  assert.deepEqual(projection.edges[0], {
    id: 'comfy-link-1',
    source: 'comfy-1',
    target: 'comfy-2',
    sourceHandle: 'out',
    targetHandle: 'in',
  });
  const badLink = projection.unsupported.find((entry) => entry.kind === 'link');
  assert.equal(badLink.id, '2');
  assert.equal(badLink.reason, 'link-target-unmapped');
});

test('v0.4 projection: muted / bypassed nodes are reported instead of silently created', () => {
  const source = v04Document();
  source.nodes[1].mode = 4;
  const projection = projectComfyToCanvas(parseOrThrow(source));
  assert.equal(projection.nodes.some((node) => node.id === 'comfy-2'), false);
  const entry = projection.unsupported.find((item) => item.id === '2');
  assert.equal(entry.reason, 'node-muted-or-bypassed');
});

test('v1 projection: reroutes, floating links and subgraph definitions are reported', () => {
  const source = {
    version: 1,
    state: { lastGroupId: 0, lastNodeId: 3, lastLinkId: 1, lastRerouteId: 1 },
    groups: [],
    nodes: [
      {
        id: 1,
        type: 'LoadImage',
        pos: [0, 0],
        size: [315, 314],
        order: 0,
        mode: 0,
        inputs: [],
        outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [], slot_index: 0 }],
        widgets_values: ['example.png', 'image'],
      },
      {
        id: 2,
        type: 'Reroute',
        pos: [340, 0],
        size: [75, 26],
        order: 1,
        mode: 0,
        inputs: [{ name: '', type: '*', link: null }],
        outputs: [{ name: '', type: '*', links: [], slot_index: 0 }],
      },
      {
        id: 3,
        type: 'Note',
        pos: [0, 360],
        size: [200, 100],
        order: 2,
        mode: 0,
        inputs: [],
        outputs: [],
        widgets_values: ['remember to check the seed'],
      },
    ],
    links: [],
    floatingLinks: [{ id: 5, origin_id: 1, origin_slot: 0, target_id: 3, target_slot: 0, type: 'IMAGE' }],
    reroutes: [{ id: 1, pos: [340, 0], linkIds: [], parentId: null }],
    extra: { ds: { scale: 1, offset: [0, 0] } },
    definitions: { subgraphs: [] },
  };
  const projection = projectComfyToCanvas(parseOrThrow(source));

  assert.equal(projection.format, 'v1');
  assert.equal(projection.nodes.length, 1);
  assert.equal(projection.nodes[0].data.nodeKind, 'import');
  assert.equal(projection.nodes[0].data.materialType, 'image');

  assert.ok(projection.unsupported.some((entry) => entry.reason === 'reroute-has-no-canvas-counterpart'));
  assert.ok(projection.unsupported.some((entry) => entry.reason === 'annotation-has-no-canvas-counterpart'));
  assert.ok(projection.unsupported.some((entry) => entry.kind === 'floating-link'));
  assert.ok(projection.unsupported.some((entry) => entry.kind === 'reroute'));
  assert.ok(projection.unsupported.some((entry) => entry.id === 'definitions'));
  assert.ok(projection.unsupported.some((entry) => entry.id === 'extra.ds' && entry.reason === 'unknown-document-field'));

  // LoadImage's filename widget has no canvas counterpart.
  assert.ok(projection.unsupported.some((entry) => entry.id === '1:widgets_values[0]'));
});

test('encode: canvas text node becomes CLIPTextEncode; unsupported nodes are reported', () => {
  const nodes = [
    { id: 'n1', type: 'material', position: { x: 10, y: 20 }, data: { materialType: 'text', nodeKind: 'generate', prompt: 'hello', label: 'Prompt' } },
    { id: 'n2', type: 'material', position: { x: 300, y: 20 }, data: { materialType: 'image', nodeKind: 'import', relativePath: 'assets/a.png' } },
    { id: 'n3', type: 'material', position: { x: 600, y: 20 }, data: { materialType: 'image', nodeKind: 'generate', selectedTool: 'text-to-image' } },
    { id: 'n4', type: 'table', position: { x: 0, y: 300 }, data: {} },
    { id: 'g1', type: 'group', position: { x: 0, y: 0 }, width: 500, height: 400, data: { title: 'Group A' } },
  ];
  // e1 targets an unencodable node; e2 connects two encoded nodes, whose
  // typed ComfyUI ports the mapping does not declare.
  const edges = [
    { id: 'e1', source: 'n1', target: 'n3', sourceHandle: 'out', targetHandle: 'in' },
    { id: 'e2', source: 'n1', target: 'n2', sourceHandle: 'out', targetHandle: 'in' },
  ];

  const result = projectCanvasToComfy({ nodes, edges, format: 'v0.4' });
  const types = result.document.nodes.map((node) => node.type);
  assert.deepEqual(types, ['CLIPTextEncode', 'LoadImage']);
  assert.equal(result.document.nodes[0].widgetsValues[0], 'hello');
  assert.equal(result.document.nodes[0].title, 'Prompt');
  assert.equal(result.document.nodes[1].widgetsValues[0], 'assets/a.png');
  assert.equal(result.document.groups.length, 1);
  assert.deepEqual(result.document.groups[0].bounding, [0, 0, 500, 400]);

  assert.ok(result.unsupported.some((entry) => entry.id === 'n3' && entry.reason === 'no-comfyui-counterpart'));
  assert.ok(result.unsupported.some((entry) => entry.id === 'n4' && entry.reason === 'no-comfyui-counterpart'));
  assert.ok(result.unsupported.some((entry) => entry.kind === 'link' && entry.reason === 'typed-port-not-declared'));
  assert.ok(result.unsupported.some((entry) => entry.reason === 'local-asset-reference-exported-as-filename'));

  // The produced document is itself a valid ComfyUI document.
  const reparsed = parseComfyWorkflow(stringifyComfyWorkflow(result.document));
  assert.equal(reparsed.ok, true);
  if (reparsed.ok) assert.equal(reparsed.format, 'v0.4');
});

test('encode: v1 output carries a state block with the last ids', () => {
  const nodes = [
    { id: 'n1', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text', nodeKind: 'generate', prompt: 'p' } },
    { id: 'g1', type: 'group', position: { x: 0, y: 0 }, width: 200, height: 200, data: { title: 'G' } },
  ];
  const result = projectCanvasToComfy({ nodes, edges: [], format: 'v1' });
  assert.equal(result.document.format, 'v1');
  assert.equal(result.document.state.lastNodeId, 1);
  assert.equal(result.document.state.lastGroupId, 1);
  const reparsed = parseComfyWorkflow(stringifyComfyWorkflow(result.document));
  assert.equal(reparsed.ok, true);
  if (reparsed.ok) assert.equal(reparsed.format, 'v1');
});
