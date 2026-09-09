import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  registerSessionCanvasInheritance,
  resolveCurrentCanvasWorkspaceId,
  executeSessionClearAndSnapshot,
  SESSION_CANVAS_OVERRIDE_PREFIX,
} from './sessionBranchActions.js';
import { getCanvasSnapshots } from './snapshotStore.js';

test('sessionBranchActions: register and resolve canvas inheritance', () => {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };

  registerSessionCanvasInheritance('sess_child_1', 'ws_canvas_abc');
  assert.equal(map.get(`${SESSION_CANVAS_OVERRIDE_PREFIX}sess_child_1`), 'ws_canvas_abc');

  const resolved = resolveCurrentCanvasWorkspaceId('sess_child_1');
  assert.equal(resolved, 'ws_canvas_abc');

  delete globalThis.localStorage;
});

test('sessionBranchActions: executeSessionClearAndSnapshot saves snapshot and creates new session', async () => {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };

  const wsId = 'ws_canvas_heritage';
  const beforeSessionId = 'sess_parent_99';

  let openedSessionId = null;
  const mockSessions = {
    list: {
      getSnapshot: () => ({
        current: beforeSessionId,
        byId: { [beforeSessionId]: { workspaceId: 'ws_host_123' } },
      }),
    },
    create: async () => 'sess_new_100',
    open: (id) => { openedSessionId = id; },
  };

  const result = await executeSessionClearAndSnapshot({
    sessionId: beforeSessionId,
    canvasWorkspaceId: wsId,
    title: '第一期爆款复刻',
    sessions: mockSessions,
  });

  assert.equal(result.ok, true);
  assert.equal(result.newSessionId, 'sess_new_100');
  assert.equal(openedSessionId, 'sess_new_100');
  assert.equal(map.get(`${SESSION_CANVAS_OVERRIDE_PREFIX}sess_new_100`), wsId);
  assert.ok(result.snapshot);
  assert.equal(result.snapshot.sessionId, beforeSessionId);
  assert.equal(result.snapshot.canvasWorkspaceId, wsId);

  // verify snapshot persisted in store
  const snapshots = getCanvasSnapshots(wsId);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].title, '第一期爆款复刻');

  delete globalThis.localStorage;
});
