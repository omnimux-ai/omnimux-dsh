import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPreviewMediaDuration } from './directorConfirmedMediaDuration.ts';

function patchesFor(data, value) { const patches = []; applyPreviewMediaDuration(data, value, patch => patches.push(patch)); return patches; }

test('invalid browser observations never create metadata patches', () => {
  for (const value of [0, -1, NaN, Infinity, -Infinity]) assert.deepEqual(patchesFor({ durationSec: null }, value), []);
});
test('explicit inspector metadata protects ordinary nodes and repairs only its stale alias', () => {
  assert.deepEqual(patchesFor({ metadataProvenance: 'media-inspector', durationSec: 4.984, duration: 5.12 }, 5.12), [{ durationSec: 4.984, duration: 4.984 }]);
  assert.deepEqual(patchesFor({ metadataProvenance: 'media-inspector', durationSec: 4.984, duration: 4.984 }, 5.12), []);
});
test('unknown canonical metadata does not inherit an old alias as authority', () => {
  assert.deepEqual(patchesFor({ metadataProvenance: 'media-inspector', durationSec: null, duration: 77 }, 5.12), [{ durationSec: 5.12, duration: 5.12 }]);
});
test('ordinary known duration without confirmed provenance still follows the browser', () => {
  assert.deepEqual(patchesFor({ assetId: 'ordinary', durationSec: 4.984, duration: 4.984 }, 5.12), [{ durationSec: 5.12, duration: 5.12 }]);
});
test('incomplete or unsafe director provenance cannot freeze browser metadata', () => {
  const valid = { assetId: 'managed', relativePath: 'artifacts/director/ws/node/video.webm', mimeType: 'video/webm', directorSourceNodeId: 'node', directorSourceRevision: 4, durationSec: 4.984, duration: 4.984 };
  for (const patch of [{ assetId: '' }, { relativePath: 'artifacts/../foreign.webm' }, { mimeType: 'image/png' }, { directorSourceRevision: 0 }, { directorSourceNodeId: '' }]) assert.deepEqual(patchesFor({ ...valid, ...patch }, 5.12), [{ durationSec: 5.12, duration: 5.12 }]);
});

test('browser duration does not replace confirmed director metadata used by the asset ledger', () => {
  const data = { assetId: 'director-asset', relativePath: 'artifacts/director/ws/node/video.webm', mimeType: 'video/webm', directorSourceNodeId: 'node', directorSourceRevision: 4, durationSec: 4.984, duration: 4.984 };
  const patches = [];
  applyPreviewMediaDuration(data, 5.12, patch => patches.push(patch));
  assert.deepEqual(patches, []);
  assert.equal(data.durationSec, 4.984);
});

test('unknown ordinary video duration is still filled from a valid browser measurement', () => {
  const patches = [];
  applyPreviewMediaDuration({ durationSec: null, duration: null }, 5.12, patch => patches.push(patch));
  assert.deepEqual(patches, [{ durationSec: 5.12, duration: 5.12 }]);
});
