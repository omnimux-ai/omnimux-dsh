/**
 * Portable OmniMux workflow file tests: export -> import round trip plus the
 * readable error paths for illegal files.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  OMNIMUX_WORKFLOW_FILE_KIND,
  OMNIMUX_WORKFLOW_FILE_VERSION,
  buildOmnimuxWorkflowFile,
  parseOmnimuxWorkflowFile,
  serializeOmnimuxWorkflowFile,
} from './omnimuxWorkflowFile.ts';

/** Graph carrying the runtime-only fields the canvas store keeps in memory. */
function canvasGraph() {
  return {
    nodes: [
      {
        id: 'node-1',
        type: 'material',
        position: { x: 40, y: 60 },
        data: { materialType: 'text', prompt: 'hello', status: 'empty' },
        width: 320,
        height: 240,
        selected: true,
        measured: { width: 320, height: 240 },
        dragging: false,
      },
      {
        id: 'group-1',
        type: 'group',
        position: { x: 0, y: 0 },
        width: 600,
        height: 400,
        data: { title: 'Group', color: '', nodeIds: ['node-1'] },
      },
    ],
    edges: [
      { id: 'edge-1', source: 'node-1', target: 'group-1', sourceHandle: 'out', targetHandle: 'in' },
    ],
  };
}

/** Same graph without runtime-only fields: a clean export reports no drops. */
function cleanGraph() {
  const graph = canvasGraph();
  return {
    nodes: graph.nodes.map((node) => {
      const { measured, dragging, ...rest } = node;
      void measured;
      void dragging;
      return rest;
    }),
    edges: graph.edges,
  };
}

test('workflow file: export -> import restores nodes and edges', () => {
  const graph = cleanGraph();
  const { file, dropped } = buildOmnimuxWorkflowFile({
    name: 'my workflow',
    nodes: graph.nodes,
    edges: graph.edges,
    exportedAt: '2026-10-23T00:00:00.000Z',
  });
  assert.equal(dropped.length, 0);
  assert.equal(file.kind, OMNIMUX_WORKFLOW_FILE_KIND);
  assert.equal(file.schemaVersion, OMNIMUX_WORKFLOW_FILE_VERSION);
  assert.equal(file.metadata.nodeCount, 2);
  assert.equal(file.metadata.edgeCount, 1);
  assert.equal(file.metadata.embeddedTableDocuments, false);

  const text = serializeOmnimuxWorkflowFile(file);
  const parsed = parseOmnimuxWorkflowFile(text);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.file.name, 'my workflow');
  assert.deepEqual(
    parsed.file.nodes.map((node) => node.id),
    ['node-1', 'group-1'],
  );
  assert.deepEqual(parsed.file.nodes[0].position, { x: 40, y: 60 });
  assert.deepEqual(parsed.file.nodes[0].data, { materialType: 'text', prompt: 'hello', status: 'empty' });
  assert.equal(parsed.file.nodes[0].selected, false);
  assert.deepEqual(parsed.file.edges, graph.edges);
});

test('workflow file: runtime-only node fields are dropped and reported', () => {
  const graph = canvasGraph();
  const { file, dropped } = buildOmnimuxWorkflowFile({
    name: 'runtime',
    nodes: graph.nodes,
    edges: graph.edges,
  });
  assert.ok(dropped.some((path) => path.includes('measured')));
  assert.equal('measured' in file.nodes[0], false);
  assert.equal('dragging' in file.nodes[0], false);
  assert.equal(file.nodes[0].selected, false);
});

test('workflow file: values that cannot be represented are reported, not silently lost', () => {
  const nodes = [{
    id: 'n1',
    type: 'material',
    position: { x: 0, y: 0 },
    data: { materialType: 'text', callback: () => {} },
  }];
  const { dropped } = buildOmnimuxWorkflowFile({ name: 'weird', nodes, edges: [] });
  assert.ok(dropped.some((path) => path.includes('callback')));
});

test('workflow file: a ComfyUI document is rejected with a readable error', () => {
  const result = parseOmnimuxWorkflowFile(JSON.stringify({ version: 0.4, nodes: [], links: [] }));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'not-a-workflow-file');
    assert.equal(result.error.path, 'kind');
  }
});

test('workflow file: malformed JSON, non-object root and newer schema are readable errors', () => {
  const badJson = parseOmnimuxWorkflowFile('{ nope');
  assert.equal(badJson.ok, false);
  if (!badJson.ok) assert.equal(badJson.error.code, 'invalid-json');

  const arrayRoot = parseOmnimuxWorkflowFile('[]');
  assert.equal(arrayRoot.ok, false);
  if (!arrayRoot.ok) assert.equal(arrayRoot.error.code, 'invalid-root');

  const newer = parseOmnimuxWorkflowFile(JSON.stringify({
    kind: OMNIMUX_WORKFLOW_FILE_KIND,
    schemaVersion: 2,
    nodes: [],
    edges: [],
  }));
  assert.equal(newer.ok, false);
  if (!newer.ok) {
    assert.equal(newer.error.code, 'unsupported-schema-version');
    assert.equal(newer.error.path, 'schemaVersion');
  }
});

test('workflow file: a broken node or edge reports its exact path', () => {
  const missingPosition = parseOmnimuxWorkflowFile(JSON.stringify({
    kind: OMNIMUX_WORKFLOW_FILE_KIND,
    schemaVersion: 1,
    nodes: [{ id: 'n1', type: 'material' }],
    edges: [],
  }));
  assert.equal(missingPosition.ok, false);
  if (!missingPosition.ok) {
    assert.equal(missingPosition.error.code, 'invalid-structure');
    assert.equal(missingPosition.error.path, 'nodes[0].position');
  }

  const badEdge = parseOmnimuxWorkflowFile(JSON.stringify({
    kind: OMNIMUX_WORKFLOW_FILE_KIND,
    schemaVersion: 1,
    nodes: [],
    edges: [{ id: 'e1', source: 'a' }],
  }));
  assert.equal(badEdge.ok, false);
  if (!badEdge.ok) {
    assert.equal(badEdge.error.code, 'invalid-structure');
    assert.equal(badEdge.error.path, 'edges[0].target');
  }

  const missingEdges = parseOmnimuxWorkflowFile(JSON.stringify({
    kind: OMNIMUX_WORKFLOW_FILE_KIND,
    schemaVersion: 1,
    nodes: [],
  }));
  assert.equal(missingEdges.ok, false);
  if (!missingEdges.ok) assert.equal(missingEdges.error.code, 'invalid-structure');
});
