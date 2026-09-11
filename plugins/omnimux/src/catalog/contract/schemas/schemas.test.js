import test from 'node:test';
import assert from 'node:assert/strict';

import * as FacadeSchema from '../schema.js';
import * as CommonSchema from './commonSchema.js';
import * as VideoSchema from './videoSchema.js';
import * as ImageSchema from './imageSchema.js';
import * as TextSchema from './textSchema.js';
import * as AudioSchema from './audioSchema.js';
import * as StatusSchema from './statusSchema.js';
import * as OperationSchema from './operationSchema.js';
import * as RegistrySchema from './registrySchema.js';
import * as ModelSchema from './modelSchema.js';

test('schemas modular architecture: exports parity with facade', () => {
  assert.equal(FacadeSchema.EXPECTED_OPERATION_COUNT, 21);
  assert.equal(FacadeSchema.CANONICAL_SCHEMA_VERSION, '1.1');
  assert.equal(typeof FacadeSchema.validateModel, 'function');
  assert.equal(typeof FacadeSchema.validateDoc, 'function');
  assert.equal(typeof FacadeSchema.validateCrossModelAliases, 'function');
  assert.equal(typeof FacadeSchema.validateAdapterProfiles, 'function');
  assert.equal(typeof FacadeSchema.validateOperationRegistry, 'function');
});

test('commonSchema: issue constructor formatting and field attachments', () => {
  const err = CommonSchema.issue('test_code', 'test message', {
    modelId: 'm-1',
    operationId: 'op-1',
    path: 'root.field',
    file: 'spec.yaml',
    level: 'warning',
  });
  assert.equal(err.code, 'test_code');
  assert.equal(err.message, 'test message');
  assert.equal(err.modelId, 'm-1');
  assert.equal(err.operationId, 'op-1');
  assert.equal(err.path, 'root.field');
  assert.equal(err.file, 'spec.yaml');
  assert.equal(err.level, 'warning');
});

test('videoSchema: validates duration fields and exclusive flags', () => {
  const validSlot = { minDurationSec: 5, maxDurationSec: 10, totalMinExclusive: false };
  const issues1 = VideoSchema.validateSlotDurations(validSlot, 'inputs[0]');
  assert.equal(issues1.length, 0);

  const invalidSlot = { minDurationSec: -1, totalMaxExclusive: 'true' };
  const issues2 = VideoSchema.validateSlotDurations(invalidSlot, 'inputs[0]');
  assert.equal(issues2.length, 2);
  assert.equal(issues2[0].code, 'schema_invalid');
  assert.equal(issues2[1].code, 'schema_invalid');
});

test('imageSchema: validates slot file size limits', () => {
  const validSlot = { maxSizeMb: 20, maxSizeExclusive: true };
  const issues1 = ImageSchema.validateSlotSizes(validSlot, 'inputs[0]');
  assert.equal(issues1.length, 0);

  const invalidSlot = { maxSizeMb: -5, maxSizeExclusive: 'not_bool' };
  const issues2 = ImageSchema.validateSlotSizes(invalidSlot, 'inputs[0]');
  assert.equal(issues2.length, 2);
  assert.equal(issues2[0].code, 'schema_invalid');
  assert.equal(issues2[1].code, 'schema_invalid');
});

test('textSchema: validates prompt policy and inputGroups', () => {
  const registry = CommonSchema.loadOperationRegistry();
  const opIds = CommonSchema.operationIdSet(registry);
  const context = { modelId: 'test-model', opIds, registry, file: 'spec.yaml' };

  // required prompt missing
  const issues = TextSchema.validatePromptPolicy('text_to_image', [], 'operations[0]', context);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'prompt_required_missing');
});

test('audioSchema: validates audio output parameters', () => {
  const valid = { sampleRate: 44100, format: 'mp3' };
  const issues1 = AudioSchema.validateAudioOutputParams(valid, 'output');
  assert.equal(issues1.length, 0);

  const invalid = { sampleRate: -1, format: 'unknown_codec' };
  const issues2 = AudioSchema.validateAudioOutputParams(invalid, 'output');
  assert.equal(issues2.length, 2);
  assert.equal(issues2[0].code, 'schema_invalid');
  assert.equal(issues2[1].code, 'schema_invalid');
});

test('statusSchema: validates research evidence requirements', () => {
  const verifiedWithoutDoc = { status: 'verified' };
  const issues = StatusSchema.validateResearch(verifiedWithoutDoc, 'research');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'research_verified_without_evidence');
});

test('registrySchema: validates operation registry against SSOT count', () => {
  const issues = RegistrySchema.validateOperationRegistry();
  assert.equal(issues.length, 0);
});

test('modelSchema: validates canonical doc minimal shape', () => {
  const invalidDoc = { schemaVersion: '2.0', models: [] };
  const issues = ModelSchema.validateDoc(invalidDoc);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'schema_version_unsupported');
});
