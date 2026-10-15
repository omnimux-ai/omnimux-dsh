import './director-scene-controls-3289.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('real scene journey leaves matching persisted scene after normal project reload', () => {
  assert.equal(process.env.DIRECTOR_SCENE_REAL_UI, '1', 'Real installed-app scene journey must run, not skip');
  const reportRoot = join(root, '.agent-reports/beeftv-director');
  const runs = readdirSync(reportRoot).filter(name => name.startsWith('formal-scene-controls-'));
  runs.sort((left, right) => statSync(join(reportRoot, right)).mtimeMs - statSync(join(reportRoot, left)).mtimeMs);
  assert.notEqual(runs.length, 0);
  const run = join(reportRoot, runs[0]);
  const result = JSON.parse(readFileSync(join(run, 'result.json'), 'utf8'));
  const saved = JSON.parse(readFileSync(join(run, 'saved-scene.json'), 'utf8'));
  const reloaded = JSON.parse(readFileSync(join(run, 'reloaded-scene.json'), 'utf8'));
  const cleanup = JSON.parse(readFileSync(join(run, 'browser-cleanup.json'), 'utf8'));
  assert.equal(result.passed, true);
  assert.equal(result.realModelRequest, false);
  assert.deepEqual(reloaded, saved);
  assert.equal(cleanup.closedSpace, true);
});
