import test from 'node:test';
import assert from 'node:assert/strict';
import * as assets from './vendor/lib/director-actor-assets.ts';

test('builtin actor handedness is identical for logical and persisted asset references', () => {
  const raw = { leftUpperArm: [0, 0, 0.6, 0.8], rightUpperArm: [0, 0, 0.6, 0.8] };
  const male = 'director/models/quaternius-standard-male.glb';
  const persistedMale = '/omnimux-workflow/director-assets/quaternius-standard-male.glb';
  const female = 'director/models/quaternius-standard-female.glb';
  const persistedFemale = '/omnimux-workflow/director-assets/quaternius-standard-female.glb';
  assert.equal(typeof assets.resolveDirectorActorBoneDeltas, 'function');
  const expected = { leftUpperArm: [-0, -0, -0.6, 0.8], rightUpperArm: [0, 0, 0.6, 0.8] };
  assert.deepEqual(assets.resolveDirectorActorBoneDeltas(male, raw), expected);
  assert.deepEqual(assets.resolveDirectorActorBoneDeltas(persistedMale, raw), expected);
  assert.deepEqual(assets.resolveDirectorActorBoneDeltas(female, raw), expected);
  assert.deepEqual(assets.resolveDirectorActorBoneDeltas(persistedFemale, raw), expected);
  assert.deepEqual(raw.leftUpperArm, [0, 0, 0.6, 0.8]);
});

test('foreign and lookalike references do not acquire builtin skeleton compensation', () => {
  const raw = { leftUpperArm: [0, 0, 0.6, 0.8] };
  assert.equal(assets.resolveDirectorActorBoneDeltas('https://example.com/quaternius-standard-male.glb', raw), raw);
  assert.equal(assets.resolveDirectorActorBoneDeltas('assets/imported/quaternius-standard-male.glb', raw), raw);
  assert.equal(assets.resolveDirectorActorBoneDeltas('/omnimux-workflow/director-assets/quaternius-standard-male.glb?other=1', raw), raw);
});
