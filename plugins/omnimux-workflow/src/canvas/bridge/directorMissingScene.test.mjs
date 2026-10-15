import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMissingDirectorScene } from './directorMissingScene.ts';

const empty = () => ({ id: 'fresh-scene', objects: [] });

test('missing document with a prior scene reference must not silently overwrite it', () => {
  const result = resolveMissingDirectorScene({ error: 'director-scene-not-found', priorSceneId: 'scene-old', emptyScene: empty });
  assert.equal(result.action, 'throw');
  assert.match(result.message, /保留原引用/);
});

test('first-time director without a scene reference may create an empty scene', () => {
  assert.deepEqual(resolveMissingDirectorScene({ error: 'director-scene-not-found', emptyScene: empty }), { action: 'create', scene: { id: 'fresh-scene', objects: [] } });
  assert.equal(resolveMissingDirectorScene({ error: 'project-required', priorSceneId: '', emptyScene: empty }).action, 'create');
});

test('other load errors never fall back to scene creation', () => {
  const result = resolveMissingDirectorScene({ error: 'permission-denied', priorSceneId: 'scene-old', emptyScene: empty });
  assert.equal(result.action, 'throw'); assert.equal(result.message, 'permission-denied');
});
