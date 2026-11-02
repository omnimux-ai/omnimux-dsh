import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeResearch,
  normalizeImplementation,
  normalizeExecution,
  materializeOpStatus,
  computeListed,
  computeOperationListed,
  deriveModelListedSummary,
  adapterProfileExists,
  adapterProfileCompatible,
  researchHasEvidence,
} from './status.js';
import { loadAdapterProfiles } from './schema.js';

const profiles = loadAdapterProfiles();

test('normalizeResearch maps governance.confidence', () => {
  const r = normalizeResearch(undefined, { confidence: 'verified', docUrl: 'https://x' });
  assert.equal(r.status, 'verified');
  assert.equal(r.docUrl, 'https://x');
});

test('normalizeResearch defaults draft', () => {
  assert.equal(normalizeResearch(undefined).status, 'draft');
});

test('normalizeExecution defaults none', () => {
  assert.equal(normalizeExecution(undefined).status, 'none');
  assert.equal(normalizeExecution({ status: 'nope' }).status, 'none');
});

test('normalizeImplementation defaults none and accepts ready', () => {
  assert.equal(normalizeImplementation(undefined).status, 'none');
  assert.equal(normalizeImplementation({ status: 'ready', profileId: 'videoGenerate' }).status, 'ready');
});

test('adapterProfileExists requires live profile', () => {
  assert.equal(adapterProfileExists(profiles, 'videoGenerate'), true);
  // #538: speechToText seam mounted; videoDigitalHuman audioTrack passthrough fixed
  assert.equal(adapterProfileExists(profiles, 'speechToText'), true);
  assert.equal(adapterProfileExists(profiles, 'videoDigitalHuman'), true);
  assert.equal(adapterProfileExists(profiles, 'missing'), false);
  assert.equal(adapterProfileExists(profiles, undefined), false);
});

test('digital_human compatible with videoGenerate after minimax-h3-video', () => {
  const op = {
    id: 'digital_human',
    output: { type: 'video' },
    inputs: [],
    implementation: { status: 'ready', profileId: 'videoGenerate', seam: 'videoGenerate' },
  };
  const compat = adapterProfileCompatible(op, profiles);
  assert.equal(compat.ok, true);
});

test('text_to_video compatible with videoGenerate', () => {
  const op = {
    id: 'text_to_video',
    output: { type: 'video' },
    inputs: [],
    implementation: { status: 'ready', profileId: 'videoGenerate', seam: 'videoGenerate' },
  };
  assert.equal(adapterProfileCompatible(op, profiles).ok, true);
});

test('materializeOpStatus inherits model defaults with op override', () => {
  const { research, implementation, execution } = materializeOpStatus(
    {
      research: { status: 'verified', docUrl: 'https://op' },
      implementation: { status: 'ready', profileId: 'imageGenerate' },
      execution: { status: 'live', profileId: 'imageGenerate' },
    },
    {
      research: { status: 'draft' },
      implementation: { status: 'none', profileId: 'videoGenerate' },
      execution: { status: 'none', profileId: 'videoGenerate' },
    },
  );
  assert.equal(research.status, 'verified');
  assert.equal(research.docUrl, 'https://op');
  assert.equal(implementation.status, 'ready');
  assert.equal(implementation.profileId, 'imageGenerate');
  assert.equal(execution.status, 'live');
  assert.equal(execution.profileId, 'imageGenerate');
});

test('operation-level listed: same model one implementation-ready one draft', () => {
  const liveOp = {
    id: 'text_to_image',
    output: { type: 'image' },
    inputs: [],
    research: { status: 'verified', docUrl: 'https://x' },
    implementation: { status: 'ready', profileId: 'imageGenerate', seam: 'imageGenerate' },
    execution: { status: 'live', profileId: 'imageGenerate', seam: 'imageGenerate' },
  };
  const draftOp = {
    id: 'image_to_image',
    output: { type: 'image' },
    inputs: [],
    research: { status: 'draft' },
    implementation: { status: 'none', profileId: 'imageGenerate' },
    execution: { status: 'stub', profileId: 'imageGenerate' },
  };
  assert.equal(computeOperationListed(liveOp, 'm1', profiles, { contractComplete: true }), true);
  assert.equal(computeOperationListed(draftOp, 'm1', profiles, { contractComplete: true }), false);

  liveOp.listed = true;
  draftOp.listed = false;
  const summary = deriveModelListedSummary({
    id: 'm1',
    operations: [liveOp, draftOp],
  });
  assert.equal(summary.listed, true);
  assert.deepEqual(summary.listedOperations, ['m1#text_to_image']);
});

test('digital_human + videoGenerate is operation-listed after minimax-h3-video', () => {
  const op = {
    id: 'digital_human',
    output: { type: 'video' },
    inputs: [],
    research: { status: 'verified', docUrl: 'https://x' },
    implementation: { status: 'ready', profileId: 'videoGenerate' },
    execution: { status: 'live', profileId: 'videoGenerate' },
  };
  assert.equal(computeOperationListed(op, 'kling-avatar', profiles, { contractComplete: true }), true);
});

test('listed five-way: whisper-like not listed', () => {
  const model = {
    id: 'whisper-1',
    research: { status: 'draft', docUrl: 'https://x' },
    execution: { status: 'none', profileId: 'speechToText' },
    operations: [
      {
        id: 'speech_to_text',
        output: { type: 'text' },
        inputs: [],
        research: { status: 'draft' },
        implementation: { status: 'none', profileId: 'speechToText' },
        execution: { status: 'none', profileId: 'speechToText' },
      },
    ],
  };
  assert.equal(computeListed(model, profiles, { contractComplete: true }), false);
});

test('computeListed true when any op listed', () => {
  const model = {
    id: 'seedance-2-5',
    operations: [
      {
        id: 'text_to_video',
        output: { type: 'video' },
        inputs: [],
        research: { status: 'verified', docUrl: 'https://x' },
        implementation: { status: 'ready', profileId: 'videoGenerate', seam: 'videoGenerate' },
        execution: { status: 'live', profileId: 'videoGenerate', seam: 'videoGenerate' },
      },
    ],
  };
  assert.equal(computeListed(model, profiles, { contractComplete: true }), true);
  assert.equal(computeListed(model, profiles, { contractComplete: false }), false);
  assert.equal(
    computeListed(model, profiles, {
      contractComplete: true,
      gateAllows: () => false,
    }),
    false,
  );
});

test('researchHasEvidence', () => {
  assert.equal(researchHasEvidence({ status: 'draft' }), true);
  assert.equal(researchHasEvidence({ status: 'verified' }), false);
  assert.equal(researchHasEvidence({ status: 'verified', docUrl: 'https://x' }), true);
});
