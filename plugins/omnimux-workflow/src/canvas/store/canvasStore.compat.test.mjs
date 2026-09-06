/**
 * Issue #466: canvasStore atomic commit contract.
 * edge + binding + model/operation switch must land via ONE `set({ nodes, edges })`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const storeSrc = readFileSync(join(here, 'canvasStore.ts'), 'utf8');

test('applyCanvasInputMutation：catalogRuntime 注入 + 一次 set 提交 nodes/edges', () => {
  assert.match(storeSrc, /catalogRuntime:\s*CapabilityCatalog\s*\|\s*null/);
  assert.match(storeSrc, /setCatalogRuntime:\s*\(catalog:\s*CapabilityCatalog\s*\|\s*null\)\s*=>/);
  assert.match(storeSrc, /planCanvasInputMutation\(/);
  assert.match(storeSrc, /\{\s*catalog:\s*current\.catalogRuntime\s*[,}]/);
  // Allowed path commits nodes + edges in a single set call (atomic).
  assert.match(storeSrc, /set\(\{\s*nodes:\s*plan\.nodes,\s*edges:\s*plan\.edges\s*\}\)/);
  // Rejected path returns plan without a second set of nodes/edges.
  assert.match(storeSrc, /if \(plan\.status !== 'allowed'\) return plan;/);
  // resetStore clears runtime catalog (not persisted).
  assert.match(storeSrc, /catalogRuntime:\s*null/);
  // W2: fingerprint change triggers reconcile (no oscillation via same-fp skip).
  assert.match(storeSrc, /reconcileCanvasForCatalog/);
  assert.match(storeSrc, /previousFingerprint/);
});

test('onConnect / removeEdge 均走 applyCanvasInputMutation（无 useEffect 事后修模）', () => {
  assert.match(storeSrc, /onConnect:\s*\(connection:\s*Connection\)\s*=>\s*\{[\s\S]*applyCanvasInputMutation\(\{\s*addEdges:/);
  assert.match(storeSrc, /applyCanvasInputMutation\(\{\s*removeEdgeIds:/);
  assert.doesNotMatch(storeSrc, /useEffect\s*\(/);
});
