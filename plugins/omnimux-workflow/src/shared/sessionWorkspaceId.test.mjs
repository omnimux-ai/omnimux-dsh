import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sessionToWorkspaceId } from './sessionWorkspaceId.ts';

test('sessionToWorkspaceId: empty → undefined', () => {
  assert.equal(sessionToWorkspaceId(undefined), undefined);
  assert.equal(sessionToWorkspaceId(null), undefined);
  assert.equal(sessionToWorkspaceId(''), undefined);
  assert.equal(sessionToWorkspaceId(1), undefined);
});

test('sessionToWorkspaceId: stable ws_ + 12 hex (locked vector)', () => {
  const id = sessionToWorkspaceId('sess-1');
  assert.equal(typeof id, 'string');
  assert.match(id, /^ws_[0-9a-f]{12}$/);
  assert.equal(id, sessionToWorkspaceId('sess-1'));
  assert.notEqual(id, sessionToWorkspaceId('sess-2'));
  // Frozen vector — Host project lookup and CanvasTab must stay in lockstep.
  assert.equal(sessionToWorkspaceId('sess-1'), 'ws_5b511f810d9f');
});

test('sessionCanvasOverride: registration and resolution fallback', async () => {
  const {
    getSessionCanvasOverride,
    setSessionCanvasOverride,
    resolveEffectiveWorkspaceId,
  } = await import('./sessionWorkspaceId.ts');

  // fallback to hashed
  assert.equal(resolveEffectiveWorkspaceId('sess-fallback'), sessionToWorkspaceId('sess-fallback'));

  // mock localStorage
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };

  setSessionCanvasOverride('sess-override-1', 'ws_inherited_123');
  assert.equal(getSessionCanvasOverride('sess-override-1'), 'ws_inherited_123');
  assert.equal(resolveEffectiveWorkspaceId('sess-override-1'), 'ws_inherited_123');
  assert.equal(resolveEffectiveWorkspaceId('sess-override-2'), sessionToWorkspaceId('sess-override-2'));

  delete globalThis.localStorage;
});
