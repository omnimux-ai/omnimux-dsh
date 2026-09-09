import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getCanvasSnapshots,
  saveSessionSnapshot,
  removeSessionSnapshot,
} from './snapshotStore.js';

test('snapshotStore: save, retrieve, and remove snapshots', () => {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };

  const wsId = 'ws_test_canvas_1';
  assert.deepEqual(getCanvasSnapshots(wsId), []);

  const s1 = saveSessionSnapshot({
    sessionId: 'sess_1',
    canvasWorkspaceId: wsId,
    title: '第一轮创作',
    excerpt: '文生图测试提示词...',
    nodeCount: 3,
  });
  assert.ok(s1);
  assert.equal(s1.sessionId, 'sess_1');
  assert.equal(s1.canvasWorkspaceId, wsId);

  const list1 = getCanvasSnapshots(wsId);
  assert.equal(list1.length, 1);
  assert.equal(list1[0].id, s1.id);

  // save second snapshot
  const s2 = saveSessionSnapshot({
    sessionId: 'sess_2',
    canvasWorkspaceId: wsId,
    title: '第二轮创作',
    nodeCount: 5,
  });
  assert.ok(s2);
  const list2 = getCanvasSnapshots(wsId);
  assert.equal(list2.length, 2);
  assert.equal(list2[0].id, s2.id); // sorted desc

  // remove s1
  const removed = removeSessionSnapshot(wsId, s1.id);
  assert.equal(removed, true);
  const list3 = getCanvasSnapshots(wsId);
  assert.equal(list3.length, 1);
  assert.equal(list3[0].id, s2.id);

  delete globalThis.localStorage;
});
