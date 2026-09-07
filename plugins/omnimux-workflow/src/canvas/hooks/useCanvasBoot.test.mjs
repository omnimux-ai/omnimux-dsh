/**
 * 卸载硬闸：beforeReset 同步 capture 必须发生在 resetStore() 之前。
 * 本包不装 jsdom，源码契约 + 纯函数顺序。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  applyPersistDecision,
  decidePersist,
  snapshotGraph,
} from '../bridge/persistPolicy.ts';

const here = dirname(fileURLToPath(import.meta.url));

test('源码契约：无 workspaceId 不得 fallback list()[0]', () => {
  const bootSrc = readFileSync(join(here, 'useCanvasBoot.ts'), 'utf8');
  assert.equal(/listWorkspaces/.test(bootSrc), false, 'boot 不得再 list 最新工作区');
  assert.match(bootSrc, /if \(!targetWorkspaceId\) return/);
});

test('源码契约：useCanvasBoot cleanup 里 beforeReset 在 resetStore() 之前', () => {
  const bootSrc = readFileSync(join(here, 'useCanvasBoot.ts'), 'utf8');
  assert.match(bootSrc, /beforeReset\?:/);
  assert.match(bootSrc, /return \{ boot, setBoot, catalog, nodeCount \}/);
  assert.match(bootSrc, /probeLocalFiles/);
  assert.match(bootSrc, /applyLocalMediaProbe/);
  const hydrateIdx = bootSrc.indexOf("hydrateGraph(loaded.body.workspace.nodes");
  const probeIdx = bootSrc.indexOf('await probeAndPatchImportedMedia()');
  const readyIdx = bootSrc.indexOf("setBoot({ phase: 'ready'");
  assert.ok(hydrateIdx >= 0 && probeIdx > hydrateIdx, 'hydrate 后才 probe');
  assert.ok(readyIdx > probeIdx, 'probe 完成前不得 setBoot ready');

  const cleanupStart = bootSrc.indexOf('return () => {');
  assert.ok(cleanupStart >= 0, 'missing effect cleanup');
  const cleanupEnd = bootSrc.indexOf('};', cleanupStart);
  const cleanup = bootSrc.slice(cleanupStart, cleanupEnd);
  const beforeIdx = cleanup.search(/beforeReset/);
  const resetIdx = cleanup.indexOf('resetStore()');
  assert.ok(beforeIdx >= 0, 'cleanup 必须调用 beforeReset');
  assert.ok(resetIdx >= 0, 'cleanup 必须调用 resetStore()');
  assert.ok(beforeIdx < resetIdx, 'beforeReset 必须出现在 resetStore() 之前');
});

test('源码契约：App.tsx flushRef / beforeReset 接线存在', () => {
  const appSrc = readFileSync(join(here, '../App.tsx'), 'utf8');
  assert.match(appSrc, /const flushRef = useRef\(\(\) => \{\}\)/);
  assert.match(appSrc, /useCanvasBoot\(\{/);
  assert.match(appSrc, /beforeReset:\s*\(\)\s*=>\s*\{/);
  assert.match(appSrc, /flushRef\.current\(\)/);
  assert.match(appSrc, /persistence\.flushPendingSave\(\)/);
  assert.match(appSrc, /tablePersistence\.flushDirtyTables\(\{ force: true \}\)/);
});

test('纯函数顺序：capture 有节点 → reset 后 store 空 → PUT 用 capture 不是 []', () => {
  const store = {
    nodes: [{ id: 'n-new' }, { id: 'n-keep' }],
    edges: [{ id: 'e1' }],
  };
  const calls = [];
  const beforeReset = () => {
    const capture = snapshotGraph(store.nodes, store.edges);
    const decision = decidePersist({
      lastSavedNodeCount: 0,
      nextNodes: capture.nodes,
      nextEdges: capture.edges,
      cause: 'flush',
      lastSavedSignature: 'empty',
      nextSignature: 'two-nodes',
    });
    applyPersistDecision(decision, (snap) => {
      calls.push({ when: 'put', nodeIds: snap.nodes.map((n) => n.id) });
    });
  };
  const resetStore = () => {
    store.nodes = [];
    store.edges = [];
  };

  // 与 useCanvasBoot cleanup 同序
  beforeReset();
  resetStore();

  assert.equal(store.nodes.length, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].nodeIds, ['n-new', 'n-keep']);
});
