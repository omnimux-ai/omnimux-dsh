/**
 * Normative JSON Schema ↔ pure JS validator parity tests (no Ajv).
 * Canonical root is schemaVersion "1.1" (never model-capability root version).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadJsonSchema,
  loadOperationRegistry,
  validateDoc,
  validateModel,
  validateOperationRegistry,
  validateAdapterProfiles,
  CANONICAL_SCHEMA_VERSION,
} from './schema.js';

test('parity: schema requires schemaVersion+models; JS rejects missing schemaVersion', () => {
  const schema = loadJsonSchema();
  assert.deepEqual(schema.required, ['schemaVersion', 'models']);
  assert.equal(schema.properties.schemaVersion.const, '1.1');
  assert.equal(schema.properties.version, undefined);
  assert.ok(!Object.prototype.hasOwnProperty.call(schema.properties, 'version'));

  const issues = validateDoc({ models: [] });
  assert.ok(
    issues.some(
      (i) =>
        i.path === 'schemaVersion' ||
        (i.code === 'schema_invalid' && String(i.message).includes('schemaVersion')),
    ),
    JSON.stringify(issues),
  );
  // Must NOT require root version
  assert.ok(!issues.some((i) => i.path === 'version' && i.message?.includes('document.version required')));
});

test('parity: schemaVersion const exact 1.1; unsupported typed code', () => {
  assert.equal(CANONICAL_SCHEMA_VERSION, '1.1');
  const unsupported = validateDoc({ schemaVersion: '1.1.0', models: [] });
  assert.ok(
    unsupported.some((i) => i.code === 'schema_version_unsupported' && i.path === 'schemaVersion'),
    JSON.stringify(unsupported),
  );

  const badType = validateDoc({ schemaVersion: 1.1, models: [] });
  assert.ok(
    badType.some((i) => i.code === 'schema_invalid' && i.path === 'schemaVersion'),
    JSON.stringify(badType),
  );

  const residualVersion = validateDoc({ schemaVersion: '1.1', version: '1.0', models: [] });
  assert.ok(
    residualVersion.some((i) => i.code === 'schema_version_conflict'),
    JSON.stringify(residualVersion),
  );
});

test('parity: allowedMimes nonempty unique strings (slot + output)', () => {
  const schema = loadJsonSchema();
  assert.equal(schema.$defs.inputSlot.properties.allowedMimes.minItems, 1);
  assert.equal(schema.$defs.outputSpec.properties.allowedMimes.minItems, 1);

  const bad = validateModel({
    id: 'm',
    label: 'M',
    operations: [
      {
        id: 'text_to_image',
        output: { type: 'image', allowedMimes: ['', 'image/png', 'image/png'] },
        inputs: [
          {
            slot: 'prompt',
            type: 'text',
            role: 'prompt',
            min: 1,
            max: 1,
          },
          {
            slot: 'ref',
            type: 'image',
            role: 'reference',
            min: 1,
            max: 1,
            allowedMimes: [],
          },
        ],
      },
    ],
  });
  const mimeErrors = bad.filter((i) => i.code === 'allowed_mimes_invalid');
  assert.ok(mimeErrors.length >= 2, JSON.stringify(mimeErrors));
});

test('parity: slot min/max nonnegative integers and order', () => {
  const issues = validateModel({
    id: 'm',
    label: 'M',
    operations: [
      {
        id: 'chat',
        output: { type: 'text' },
        inputs: [
          {
            slot: 'prompt',
            type: 'text',
            role: 'prompt',
            min: -1,
            max: 2,
          },
        ],
      },
    ],
  });
  assert.ok(issues.some((i) => i.code === 'slot_minmax_invalid'));

  const order = validateModel({
    id: 'm2',
    label: 'M2',
    operations: [
      {
        id: 'chat',
        output: { type: 'text' },
        inputs: [
          {
            slot: 'prompt',
            type: 'text',
            role: 'prompt',
            min: 3,
            max: 1,
          },
        ],
      },
    ],
  });
  assert.ok(order.some((i) => i.code === 'slot_minmax_invalid'));
});

test('parity: output min/max numeric order', () => {
  const issues = validateModel({
    id: 'm',
    label: 'M',
    operations: [
      {
        id: 'text_to_image',
        output: { type: 'image', min: 10, max: 2 },
        inputs: [
          {
            slot: 'prompt',
            type: 'text',
            role: 'prompt',
            min: 1,
            max: 1,
          },
        ],
      },
    ],
  });
  assert.ok(issues.some((i) => i.level === 'error' && String(i.message).includes('min')));
});

test('parity: aliases array nonempty unique (model + operation layers)', () => {
  const schema = loadJsonSchema();
  assert.ok(schema.$defs.model.properties.aliases);
  assert.ok(schema.$defs.operation.properties.aliases);

  const issues = validateModel({
    id: 'm',
    label: 'M',
    aliases: [],
    operations: [
      {
        id: 'chat',
        output: { type: 'text' },
        inputs: [
          {
            slot: 'prompt',
            type: 'text',
            role: 'prompt',
            min: 1,
            max: 1,
          },
        ],
        aliases: ['a', 'a'],
      },
    ],
  });
  assert.ok(issues.some((i) => i.code === 'duplicate_alias'));
});

test('parity: operation-level research/execution enums', () => {
  const issues = validateModel({
    id: 'm',
    label: 'M',
    operations: [
      {
        id: 'chat',
        output: { type: 'text' },
        inputs: [
          {
            slot: 'prompt',
            type: 'text',
            role: 'prompt',
            min: 1,
            max: 1,
          },
        ],
        research: { status: 'nope' },
        execution: { status: 'maybe' },
      },
    ],
  });
  assert.ok(issues.some((i) => i.code === 'research_invalid'));
  assert.ok(issues.some((i) => i.message.includes('execution.status')));
});

test('parity: profile shape requires operations+outputTypes; ops ∈ registry', () => {
  const issues = validateAdapterProfiles({
    version: '1.0.0',
    profiles: [
      {
        id: 'broken',
        seam: 'x',
        status: 'live',
      },
    ],
  });
  assert.ok(issues.some((i) => i.message.includes('operations')));
  assert.ok(issues.some((i) => i.message.includes('outputTypes')));

  const fakeOp = validateAdapterProfiles({
    version: '1.0.0',
    profiles: [
      {
        id: 'fake-profile',
        seam: 'x',
        status: 'live',
        operations: ['not_a_real_operation'],
        outputTypes: ['text'],
      },
    ],
  });
  assert.ok(
    fakeOp.some((i) => i.code === 'profile_operation_unknown'),
    JSON.stringify(fakeOp),
  );
});

test('parity: registry requires promptPolicy on all ops; keeps own version field', () => {
  const reg = loadOperationRegistry();
  assert.equal(typeof reg.version, 'string');
  assert.ok(reg.operations.some((o) => o.id === 'end_frame'));
  assert.equal(validateOperationRegistry(reg).length, 0);
  const broken = {
    version: '1.0.0',
    operations: reg.operations.map((o, i) =>
      i === 0 ? { ...o, promptPolicy: 'sometimes' } : o,
    ),
  };
  assert.ok(validateOperationRegistry(broken).length >= 1);
});

test('upstream origins and text composition are validated without granting arbitrary fields', () => {
  const schema = loadJsonSchema();
  assert.deepEqual(schema.$defs.inputSlot.properties.valueSources.items.enum, ['local_field', 'upstream_output']);
  assert.deepEqual(schema.$defs.inputSlot.properties.composition.properties.kind.enum,
    ['content_with_instruction', 'single_body', 'separate_roles']);
  const model = (input) => ({ id: 'origin-check', label: 'Origin', operations: [{
    id: 'chat', output: { type: 'text' }, inputs: [{
      slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1, ...input,
    }],
  }] });
  assert.equal(validateModel(model({ valueSources: ['local_field', 'upstream_output'],
    composition: { kind: 'single_body', localRole: 'body' } })).filter(i => i.level === 'error').length, 0);
  for (const input of [
    { valueSources: [] }, { valueSources: ['file_asset'] }, { valueSources: ['local_field', 'local_field'] },
    { composition: { kind: 'unknown', localRole: 'body' } },
    { composition: { kind: 'single_body', localRole: 'unknown' } },
    { type: 'image', role: 'reference', composition: { kind: 'single_body', localRole: 'body' } },
  ]) {
    assert.ok(validateModel(model(input)).some(i => i.level === 'error'), JSON.stringify(input));
  }
});

test('parity: schema $defs.research status enum matches JS', () => {
  const schema = loadJsonSchema();
  assert.deepEqual(schema.$defs.researchStatus.enum, ['draft', 'verified', 'rejected']);
  assert.deepEqual(schema.$defs.executionStatus.enum, ['none', 'stub', 'live']);
});
