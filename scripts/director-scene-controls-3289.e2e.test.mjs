import { sceneJourneyRun } from './director-scene-controls-3289.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('real scene journey leaves matching persisted scene after normal project reload', () => {
  assert.equal(process.env.DIRECTOR_SCENE_REAL_UI, '1', 'Real installed-app scene journey must run, not skip');
  const run = sceneJourneyRun.evidence;
  assert.equal(typeof run, 'string', 'evidence must belong to the imported journey in this process');
  const result = JSON.parse(readFileSync(join(run, 'result.json'), 'utf8'));
  const saved = JSON.parse(readFileSync(join(run, 'saved-scene.json'), 'utf8'));
  const reloaded = JSON.parse(readFileSync(join(run, 'reloaded-scene.json'), 'utf8'));
  const cleanup = JSON.parse(readFileSync(join(run, 'browser-cleanup.json'), 'utf8'));
  assert.equal(result.passed, true);
  assert.equal(result.realModelRequest, false);
  assert.deepEqual(reloaded, saved);
  assert.equal(cleanup.closedSpace, true);
});
