/**
 * 画布持久化策略：禁止 reset/flush/autosave 把非空图覆盖成空。
 * 本包不装 jsdom，纯函数 + 源码契约（学 toolbarPointerGuard）。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  applyPersistDecision,
  clearPersistSessionFlags,
  decidePersist,
  inferPersistCause,
  noteGraphReset,
  noteUserDeletedGraphElements,
  peekGraphReset,
  peekUserDeletedGraphElements,
  shouldPersistEmptyGraph,
  snapshotGraph,
} from './persistPolicy.ts';

const here = dirname(fileURLToPath(import.meta.url));

test('beforeEach: 清会话标记', () => {
  clearPersistSessionFlags();
  assert.equal(peekUserDeletedGraphElements(), false);
  assert.equal(peekGraphReset(), false);
});

test('lastSaved 3 + next 0 + cause reset/flush/autosave → 不 persist', () => {
  for (const cause of ['reset', 'flush', 'autosave']) {
    assert.equal(
      shouldPersistEmptyGraph({ lastSavedNodeCount: 3, nextNodeCount: 0, cause }),
      false,
      `cause=${cause} 不得把非空图存成空`,
    );
  }
});

test('lastSaved 3 + next 0 + cause user-delete → persist', () => {
  assert.equal(
    shouldPersistEmptyGraph({ lastSavedNodeCount: 3, nextNodeCount: 0, cause: 'user-delete' }),
    true,
  );
});

test('lastSaved 0 + next 1 → persist', () => {
  assert.equal(
    shouldPersistEmptyGraph({ lastSavedNodeCount: 0, nextNodeCount: 1, cause: 'autosave' }),
    true,
  );
  const decision = decidePersist({
    lastSavedNodeCount: 0,
    nextNodes: [{ id: 'n1' }],
    nextEdges: [],
    cause: 'autosave',
    lastSavedSignature: 'empty',
    nextSignature: 'one-node',
  });
  assert.equal(decision.persist, true);
  assert.equal(decision.reason, 'save');
  assert.equal(decision.snapshot?.nodes.length, 1);
});

test('签名未变 → unchanged，不 PUT', () => {
  const decision = decidePersist({
    lastSavedNodeCount: 2,
    nextNodes: [{ id: 'a' }, { id: 'b' }],
    nextEdges: [],
    cause: 'autosave',
    lastSavedSignature: 'same',
    nextSignature: 'same',
  });
  assert.equal(decision.persist, false);
  assert.equal(decision.reason, 'unchanged');
});

test('reset 后 flush 不得调用空 nodes PUT（mock saveWorkspace）', () => {
  clearPersistSessionFlags();
  const store = {
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [{ id: 'e1' }],
  };
  const lastSavedSignature = JSON.stringify(store);
  // 模拟 resetStore：同步清空
  noteGraphReset();
  store.nodes = [];
  store.edges = [];
  const captured = snapshotGraph(store.nodes, store.edges);
  const cause = inferPersistCause(captured.nodes.length, 'flush');
  assert.equal(cause, 'flush');
  const puts = [];
  const decision = decidePersist({
    lastSavedNodeCount: 3,
    nextNodes: captured.nodes,
    nextEdges: captured.edges,
    cause,
    lastSavedSignature,
    nextSignature: JSON.stringify(captured),
  });
  applyPersistDecision(decision, (snap) => puts.push(snap));
  assert.equal(decision.reason, 'skip-empty-overwrite');
  assert.equal(puts.length, 0);
});

test('决策瞬间快照：reset 之后 save 仍只用拷贝，不回读空 store', () => {
  const store = {
    nodes: [{ id: 'a' }, { id: 'b' }],
    edges: [],
  };
  const snap = snapshotGraph(store.nodes, store.edges);
  store.nodes = []; // 模拟 await 前 resetStore
  const puts = [];
  const decision = decidePersist({
    lastSavedNodeCount: 0,
    nextNodes: snap.nodes,
    nextEdges: snap.edges,
    cause: 'flush',
    lastSavedSignature: 'empty',
    nextSignature: 'two-nodes',
  });
  applyPersistDecision(decision, (captured) => {
    // 禁止再读 store；PUT 必须是快照
    puts.push(captured);
  });
  assert.equal(puts.length, 1);
  assert.equal(puts[0].nodes.length, 2);
  assert.equal(store.nodes.length, 0);
});

test('user-delete 会话标记：删光才允许存空', () => {
  clearPersistSessionFlags();
  noteUserDeletedGraphElements();
  assert.equal(peekUserDeletedGraphElements(), true);
  assert.equal(inferPersistCause(0), 'user-delete');
  const decision = decidePersist({
    lastSavedNodeCount: 3,
    nextNodes: [],
    nextEdges: [],
    cause: inferPersistCause(0),
    lastSavedSignature: 'three',
    nextSignature: 'empty',
  });
  assert.equal(decision.persist, true);
});

test('noteGraphReset 会清掉 user-delete，推断为 reset', () => {
  clearPersistSessionFlags();
  noteUserDeletedGraphElements();
  noteGraphReset();
  assert.equal(peekUserDeletedGraphElements(), false);
  assert.equal(inferPersistCause(0), 'reset');
  assert.equal(
    shouldPersistEmptyGraph({ lastSavedNodeCount: 3, nextNodeCount: 0, cause: inferPersistCause(0) }),
    false,
  );
});

test('源码契约：hydrateGraph 之后才 setBoot ready；persist enabled 绑定 ready', () => {
  const bootSrc = readFileSync(join(here, '../hooks/useCanvasBoot.ts'), 'utf8');
  const appSrc = readFileSync(join(here, '../App.tsx'), 'utf8');
  const hydrateIdx = bootSrc.lastIndexOf('hydrateGraph(');
  const readyIdx = bootSrc.lastIndexOf("setBoot({ phase: 'ready'");
  assert.ok(hydrateIdx >= 0, 'missing hydrateGraph before ready');
  assert.ok(readyIdx > hydrateIdx, 'hydrateGraph must run before setBoot ready');
  assert.match(appSrc, /enabled:\s*boot\.phase === 'ready'/);
});

test('源码契约：performSave / flush 用决策瞬间快照，reset 不会异步存空', () => {
  const persistSrc = readFileSync(join(here, 'useWorkspacePersistence.ts'), 'utf8');
  assert.match(persistSrc, /snapshotGraph\(/);
  assert.match(persistSrc, /decidePersist\(/);
  assert.match(persistSrc, /shouldPersistEmptyGraph\(/);
  assert.match(persistSrc, /inferPersistCause\(/);
  // flush 先同步签名+拷贝，再交给 save；禁止 unmount 里 void performSave() 再读 store
  assert.match(persistSrc, /flushIfDirty/);
  assert.equal(
    /flushIfDirty[\s\S]*void performSave\(\)/.test(persistSrc),
    false,
    'flushIfDirty 不得 void performSave() 无快照',
  );
  assert.match(persistSrc, /enabledRef/);
  // 409 必须走 resolveRemoteAdvance（比签名），不得在 performSave 里回读 store
  const performSaveStart = persistSrc.indexOf('const performSave = useCallback');
  const performSaveEnd = persistSrc.indexOf('}, [resolveRemoteAdvance]);', performSaveStart);
  assert.ok(performSaveEnd > performSaveStart, 'performSave 必须依赖 resolveRemoteAdvance');
  const performSaveBlock = persistSrc.slice(performSaveStart, performSaveEnd);
  assert.equal(
    performSaveBlock.includes('useCanvasStore.getState()'),
    false,
    'performSave 不得在 await 后回读 store',
  );
  assert.match(performSaveBlock, /resolveRemoteAdvance\(/);
});

test('源码契约：resetStore 标 cause reset；用户删除走 noteUserDeletedGraphElements', () => {
  const storeSrc = readFileSync(join(here, '../store/canvasStore.ts'), 'utf8');
  assert.match(storeSrc, /noteGraphReset\(\)/);
  assert.match(storeSrc, /noteUserDeletedGraphElements\(\)/);
  const resetBlock = storeSrc.slice(storeSrc.indexOf('resetStore:'));
  assert.match(resetBlock, /noteGraphReset\(\)/);
});

test('capture 有节点 → reset 后 store 空 → PUT 用 capture 不是 []', () => {
  const store = {
    nodes: [{ id: 'new-1' }],
    edges: [],
  };
  const capture = snapshotGraph(store.nodes, store.edges);
  // 模拟 resetStore：capture 之后才清空
  store.nodes = [];
  store.edges = [];
  const puts = [];
  const decision = decidePersist({
    lastSavedNodeCount: 0,
    nextNodes: capture.nodes,
    nextEdges: capture.edges,
    cause: 'flush',
    lastSavedSignature: 'empty',
    nextSignature: 'one-node',
  });
  applyPersistDecision(decision, (snap) => puts.push(snap));
  assert.equal(store.nodes.length, 0);
  assert.equal(puts.length, 1);
  assert.notEqual(puts[0].nodes.length, 0);
  assert.equal(puts[0].nodes[0].id, 'new-1');
});

test('源码契约：flushPendingSave 同步 capture，boot cleanup 先 beforeReset 再 reset', () => {
  const persistSrc = readFileSync(join(here, 'useWorkspacePersistence.ts'), 'utf8');
  const bootSrc = readFileSync(join(here, '../hooks/useCanvasBoot.ts'), 'utf8');
  const appSrc = readFileSync(join(here, '../App.tsx'), 'utf8');

  assert.match(persistSrc, /flushPendingSave/);
  const flushStart = persistSrc.indexOf('const flushPendingSave = useCallback');
  assert.ok(flushStart >= 0, 'missing flushPendingSave');
  const flushEnd = persistSrc.indexOf('}, [performSave]);', flushStart);
  const flushBlock = persistSrc.slice(flushStart, flushEnd);
  const captureIdx = flushBlock.indexOf('readStoreCapture()');
  const putIdx = flushBlock.indexOf('void performSave(');
  assert.ok(captureIdx >= 0, 'flushPendingSave 必须同步 readStoreCapture');
  assert.ok(putIdx > captureIdx, 'PUT 必须用 capture 之后的快照');
  assert.match(flushBlock, /cause:\s*'flush'|cause: PersistCause = 'flush'/);

  const cleanupStart = bootSrc.indexOf('return () => {');
  const cleanupBlock = bootSrc.slice(cleanupStart, bootSrc.indexOf('};', cleanupStart));
  const beforeIdx = cleanupBlock.search(/beforeReset/);
  const resetIdx = cleanupBlock.indexOf('resetStore()');
  assert.ok(beforeIdx >= 0, 'cleanup 必须调用 beforeReset');
  assert.ok(resetIdx > beforeIdx, 'beforeReset 必须出现在 resetStore() 之前');

  assert.match(appSrc, /flushRef/);
  assert.match(appSrc, /beforeReset:\s*\(\)\s*=>\s*\{/);
  assert.match(appSrc, /flushRef\.current\(\)/);
  assert.match(appSrc, /persistence\.flushPendingSave\(\)/);
  assert.match(appSrc, /tablePersistence\.flushDirtyTables\(\{ force: true \}\)/);
});
