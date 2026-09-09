/**
 * plugins/omnimux-apps/src/shared/manifest.test.ts
 *
 * Unit test suite for ApplicationManifest contract and schemaValidator (T01).
 * Verifies strict validation, category isolation (no agent), restricted JSON schema,
 * field mapping parity, and demoSnapshot conformance.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { ApplicationManifest } from './manifest.ts';
import {
  validateApplicationManifest,
  validateFormSchema,
  validateFormData,
} from './schemaValidator.ts';

function createValidManifest(): ApplicationManifest {
  return {
    appId: 'app_video_cyber_city',
    version: '1.0.0',
    schemaVersion: '1.0',
    createdAt: '2026-09-09T10:00:00.000Z',
    metadata: {
      name: 'Cyber City Video Generator',
      category: 'video',
      description: 'Generates cinematic cyberpunk city videos from text prompts.',
      iconSvg: '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>',
      coverUrl: 'https://example.com/cover.jpg',
    },
    workflowBinding: {
      workspaceId: 'ws_test_123',
      workflowHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      snapshot: {
        nodes: [{ id: 'n1', type: 'material' }],
        edges: [],
      },
    },
    formSchema: {
      type: 'object',
      required: ['prompt'],
      additionalProperties: false,
      properties: {
        prompt: {
          type: 'string',
          title: 'Prompt',
          description: 'Description of the city scene',
          minLength: 3,
          maxLength: 1000,
          widget: 'textarea',
          default: 'Futuristic metropolis in neon rain',
        },
        aspectRatio: {
          type: 'string',
          title: 'Aspect Ratio',
          enum: ['1:1', '4:3', '16:9', '9:16'],
          widget: 'ratio-cards',
          default: '16:9',
        },
      },
    },
    fieldMappings: {
      prompt: {
        nodeId: 'n1',
        targetField: 'prompt',
        mappingType: 'text',
        widget: 'textarea',
        required: true,
        defaultValue: 'Futuristic metropolis in neon rain',
      },
      aspectRatio: {
        nodeId: 'n1',
        targetField: 'params.aspectRatio',
        mappingType: 'param',
        widget: 'ratio-cards',
        required: false,
        defaultValue: '16:9',
      },
    },
    showcase: {
      mode: 'carousel',
      items: [
        {
          id: 'item-1',
          title: 'Neon Rain Sample',
          mediaType: 'video',
          mediaUrl: 'https://example.com/sample1.mp4',
          posterUrl: 'https://example.com/poster1.jpg',
          aspectRatio: '16:9',
          durationSeconds: 5,
        },
      ],
    },
    demoSnapshot: {
      prompt: 'Futuristic metropolis in neon rain',
      aspectRatio: '16:9',
    },
  };
}

test('Manifest.1: Valid ApplicationManifest passes validation completely', () => {
  const manifest = createValidManifest();
  const res = validateApplicationManifest(manifest);
  assert.equal(res.valid, true, `Expected valid, got errors: ${res.errors.join(', ')}`);
  assert.equal(res.errors.length, 0);
});

test('Manifest.2: Strictly rejects "agent" or unknown categories', () => {
  const manifest = createValidManifest();
  (manifest.metadata as any).category = 'agent';

  const res = validateApplicationManifest(manifest);
  assert.equal(res.valid, false);
  assert.ok(
    res.errors.some((e) => e.includes('agent') && e.includes('prohibited')),
    'Must explicitly reject agent category',
  );

  (manifest.metadata as any).category = 'unknown_category';
  const res2 = validateApplicationManifest(manifest);
  assert.equal(res2.valid, false);
});

test('Manifest.3: Enforces schemaVersion === "1.0"', () => {
  const manifest = createValidManifest();
  (manifest as any).schemaVersion = '2.0';

  const res = validateApplicationManifest(manifest);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('schemaVersion must be strictly "1.0"')));
});

test('Manifest.4: Strictly rejects unsupported JSON Schema keywords ($ref, allOf, anyOf, oneOf)', () => {
  const invalidSchema: any = {
    type: 'object',
    required: ['url'],
    additionalProperties: false,
    properties: {
      url: {
        type: 'string',
        $ref: '#/definitions/URL',
      },
    },
  };

  const res = validateFormSchema(invalidSchema);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('Unsupported keyword "$ref"') || e.includes('forbidden')));
});

test('Manifest.5: Enforces additionalProperties: false on formSchema', () => {
  const manifest = createValidManifest();
  (manifest.formSchema as any).additionalProperties = true;

  const res = validateApplicationManifest(manifest);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('additionalProperties')));
});

test('Manifest.6: Rejects fieldMappings and formSchema.properties mismatch', () => {
  const manifest = createValidManifest();
  // Delete prompt from fieldMappings
  delete (manifest.fieldMappings as any).prompt;

  const res = validateApplicationManifest(manifest);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('Missing fieldMapping for form property: "prompt"')));

  // Add orphan mapping
  manifest.fieldMappings['orphanField'] = {
    nodeId: 'n1',
    targetField: 'orphan',
    mappingType: 'text',
    widget: 'input-text',
  };
  const res2 = validateApplicationManifest(manifest);
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e) => e.includes('Orphan fieldMapping "orphanField"')));
});

test('Manifest.7: Rejects demoSnapshot when it fails formSchema validation', () => {
  const manifest = createValidManifest();
  // Set prompt shorter than minLength (3)
  manifest.demoSnapshot['prompt'] = 'ab';

  const res = validateApplicationManifest(manifest);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('minLength')));

  // Set aspectRatio to value outside enum
  manifest.demoSnapshot['prompt'] = 'Cyber city';
  manifest.demoSnapshot['aspectRatio'] = '21:9';
  const res2 = validateApplicationManifest(manifest);
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e) => e.includes('allowed enum')));
});

test('Manifest.8: validateFormData strictly checks types, required fields, and rejects additional properties', () => {
  const schema = createValidManifest().formSchema;

  // 1. Success case
  const validData = { prompt: 'Valid Prompt', aspectRatio: '16:9' };
  assert.equal(validateFormData(schema, validData).valid, true);

  // 2. Missing required
  const missingData = { aspectRatio: '16:9' };
  const resMissing = validateFormData(schema, missingData);
  assert.equal(resMissing.valid, false);
  assert.ok(resMissing.errors.some((e) => e.includes('Missing required field: "prompt"')));

  // 3. Additional property
  const extraData = { prompt: 'Valid', extraKey: 'illegal' };
  const resExtra = validateFormData(schema, extraData);
  assert.equal(resExtra.valid, false);
  assert.ok(resExtra.errors.some((e) => e.includes('Property "extraKey" is not permitted')));

  // 4. Invalid type
  const badTypeData = { prompt: 12345 };
  const resBadType = validateFormData(schema, badTypeData);
  assert.equal(resBadType.valid, false);
  assert.ok(resBadType.errors.some((e) => e.includes('must be a string')));
});
