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

test('源码契约：useCanvasBoot 并行加载偏好与工作区，probe 不阻塞 ready', () => {
  const bootSrc = readFileSync(join(here, 'useCanvasBoot.ts'), 'utf8');
  assert.match(bootSrc, /probeLocalFiles/);
  assert.match(bootSrc, /applyLocalMediaProbe/);

  // 偏好与工作区快照互不依赖：必须同批 Promise.all 发起，不得串行 await。
  const parallelIdx = bootSrc.indexOf('await Promise.all([');
  assert.ok(parallelIdx >= 0, '必须用 Promise.all 并行发起偏好与工作区加载');
  const parallelEnd = bootSrc.indexOf(']);', parallelIdx);
  assert.ok(parallelEnd > parallelIdx, 'Promise.all 调用需闭合');
  const parallelBlock = bootSrc.slice(parallelIdx, parallelEnd);
  assert.match(parallelBlock, /loadGenerationPreferences\(\)/);
  assert.match(parallelBlock, /getWorkspace\(targetWorkspaceId\)/);
  assert.doesNotMatch(bootSrc, /await loadGenerationPreferences\(\)/);
  assert.doesNotMatch(bootSrc, /await getWorkspace\(targetWorkspaceId\)/);

  // probe 是 ready 之后的补丁：hydrate → ready → 异步 probe，不得 await。
  const hydrateIdx = bootSrc.indexOf('hydrateGraph(loaded.body.workspace.nodes');
  const readyIdx = bootSrc.indexOf("setBoot({ phase: 'ready'");
  assert.ok(hydrateIdx >= 0, 'missing hydrate');
  assert.ok(readyIdx > hydrateIdx, 'hydrate 后才 setBoot ready');
  const probeCallIdx = bootSrc.indexOf('probeAndPatchImportedMedia()', readyIdx);
  assert.ok(probeCallIdx > readyIdx, 'ready 之后才发起本地文件探测');
  assert.doesNotMatch(bootSrc, /await probeAndPatchImportedMedia\(\)/, 'probe 不得阻塞 ready');
});

test('源码契约：useCanvasBoot cleanup 里 beforeReset 在 resetStore() 之前', () => {
  const bootSrc = readFileSync(join(here, 'useCanvasBoot.ts'), 'utf8');
  assert.match(bootSrc, /beforeReset\?:/);
  assert.match(bootSrc, /return \{ boot, setBoot, catalog, nodeCount \}/);

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
