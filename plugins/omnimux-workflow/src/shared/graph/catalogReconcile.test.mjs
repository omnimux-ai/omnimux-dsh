/**
 * Issue #467 / W2 — catalog fingerprint reconcile (no oscillation).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCompatTestCatalog } from '../validation/compatTestCatalog.ts';
import {
  readGraphCatalogFingerprint,
  reconcileCanvasForCatalog,
  shouldReconcileCatalog,
} from './catalogReconcile.ts';

const catalog = createCompatTestCatalog();

function genNode(id, params = {}, materialType = 'image') {
  return {
    id,
    type: 'material',
    position: { x: 0, y: 0 },
    data: {
      label: id,
      materialType,
      nodeKind: 'generate',
      selectedTool: materialType === 'video' ? 'video-generation' : 'text-to-image',
      status: 'empty',
      prompt: '',
      params: { model: 'img-ref', ...params },
    },
  };
}

describe('shouldReconcileCatalog', () => {
  it('same fingerprint → skip; different → reconcile; force always', () => {
    assert.equal(shouldReconcileCatalog({ previousFingerprint: 'a', nextFingerprint: 'a' }), false);
    assert.equal(shouldReconcileCatalog({ previousFingerprint: 'a', nextFingerprint: 'b' }), true);
    assert.equal(shouldReconcileCatalog({ previousFingerprint: '', nextFingerprint: '' }), false);
    assert.equal(shouldReconcileCatalog({ previousFingerprint: 'a', nextFingerprint: 'a', force: true }), true);
  });
});

describe('reconcileCanvasForCatalog', () => {
  it('same fingerprint is a no-op (oscillation guard)', () => {
    const nodes = [genNode('g1')];
    const edges = [];
    const result = reconcileCanvasForCatalog({
      nodes,
      edges,
      catalog,
      previousFingerprint: catalog.fingerprint,
    });
    assert.equal(result.skipped, true);
    assert.equal(result.changed, false);
    assert.equal(result.nodes, nodes);
  });

  it('fingerprint change recomputes generate nodes and stamps catalogFingerprint', () => {
    const nodes = [genNode('g1', { model: 'img-ref', operation: 'image_to_image' })];
    const edges = [];
    const result = reconcileCanvasForCatalog({
      nodes,
      edges,
      catalog,
      previousFingerprint: 'stale-fp',
    });
    assert.equal(result.skipped, false);
    assert.equal(result.fingerprint, catalog.fingerprint);
    const gen = result.nodes.find((n) => n.id === 'g1');
    assert.ok(gen);
    assert.equal(typeof gen.data.params.operation, 'string');
    assert.equal(gen.data.compat.catalogFingerprint, catalog.fingerprint);
  });

  it('unsupported historical feed keeps edges and does not invalidate a prompt-only task', () => {
    const nodes = [
      {
        id: 'src',
        type: 'material',
        position: { x: 0, y: 0 },
        data: {
          label: 'src',
          materialType: 'image',
          nodeKind: 'import',
          selectedTool: 'import',
          status: 'ready',
          mimeType: 'image/gif', // fixture models only allow png/jpeg
          fileSize: 1024,
        },
      },
      genNode('g1', { model: 'img-prompt-only' }),
    ];
    const edges = [
      { id: 'e1', source: 'src', target: 'g1' },
    ];
    const result = reconcileCanvasForCatalog({
      nodes,
      edges,
      catalog,
      previousFingerprint: 'old',
    });
    assert.equal(result.edges.length, 1, 'edges must not be deleted');
    assert.equal(result.edges[0].id, 'e1');
    const gen = result.nodes.find((n) => n.id === 'g1');
    assert.equal(gen.data.compat.status, 'ok');
    assert.equal(gen.data.compat.acceptsCurrentInputs, true);
    assert.deepEqual(gen.data.slotBindings, {});
    assert.equal(gen.data.compat.readyToSubmit, false, 'the task still needs prompt');
  });

  it('readGraphCatalogFingerprint reads the stamped value', () => {
    const nodes = [
      {
        ...genNode('g1'),
        data: {
          ...genNode('g1').data,
          compat: { catalogFingerprint: 'fp-1' },
        },
      },
    ];
    assert.equal(readGraphCatalogFingerprint(nodes), 'fp-1');
    assert.equal(readGraphCatalogFingerprint([]), '');
  });
});
