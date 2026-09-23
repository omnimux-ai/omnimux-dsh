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

test('Manifest.9: Compound widgets (Issue #2596) pass validation with legal configs', () => {
  const schema = {
    type: 'object',
    required: ['assetPick'],
    additionalProperties: false,
    properties: {
      assetPick: { type: 'string', widget: 'library-picker', library: 'asset' },
      inspirationPick: { type: 'string', widget: 'library-picker', library: 'inspiration' },
      productLink: { type: 'string', widget: 'product-link' },
      tabs: {
        type: 'string',
        widget: 'segmented-tabs',
        options: [
          { label: '预设视频类型', value: 'preset' },
          { label: '自定义视频内容', value: 'custom' },
        ],
      },
      tags: {
        type: 'array',
        widget: 'multi-tags',
        items: { type: 'string' },
        maxItems: 3,
        options: [
          { label: 'TikTok', value: 'TikTok' },
          { label: '快手', value: '快手' },
        ],
      },
    },
  } as const;

  const res = validateFormSchema(schema);
  assert.equal(res.valid, true, `legal compound widgets should validate: ${res.errors.join('; ')}`);
});

test('Manifest.10: Rejects library-picker without a valid library kind', () => {
  const base = {
    type: 'object',
    required: [],
    additionalProperties: false,
    properties: {
      pick: { type: 'string', widget: 'library-picker', library: 'asset' },
    },
  } as const;

  const missing = validateFormSchema({
    ...base,
    properties: { pick: { type: 'string', widget: 'library-picker' } },
  });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some((e) => e.includes('library must be one of')));

  const unknown = validateFormSchema({
    ...base,
    properties: { pick: { type: 'string', widget: 'library-picker', library: 'warehouse' } },
  });
  assert.equal(unknown.valid, false);

  const wrongType = validateFormSchema({
    ...base,
    properties: { pick: { type: 'array', widget: 'library-picker', library: 'asset', items: { type: 'string' } } },
  });
  assert.equal(wrongType.valid, false);
  assert.ok(wrongType.errors.some((e) => e.includes('must have type "string"')));
});

test('Manifest.11: Rejects segmented-tabs with fewer than 2 or more than 4 options', () => {
  const wrap = (options: unknown) => ({
    type: 'object',
    required: [],
    additionalProperties: false,
    properties: { tabs: { type: 'string', widget: 'segmented-tabs', options } },
  });

  const tooFew = validateFormSchema(wrap([{ label: '仅一项', value: 'one' }]));
  assert.equal(tooFew.valid, false);
  assert.ok(tooFew.errors.some((e) => e.includes('2~4')));

  const tooMany = validateFormSchema(
    wrap([1, 2, 3, 4, 5].map((i) => ({ label: `选项${i}`, value: `v${i}` }))),
  );
  assert.equal(tooMany.valid, false);

  const missing = validateFormSchema({
    type: 'object',
    required: [],
    additionalProperties: false,
    properties: { tabs: { type: 'string', widget: 'segmented-tabs' } },
  });
  assert.equal(missing.valid, false);

  const four = validateFormSchema(
    wrap([1, 2, 3, 4].map((i) => ({ label: `选项${i}`, value: `v${i}` }))),
  );
  assert.equal(four.valid, true, `4 options should validate: ${four.errors.join('; ')}`);
});

test('Manifest.12: Rejects multi-tags with illegal config; enforces maxItems on data', () => {
  const legal = {
    type: 'object',
    required: [],
    additionalProperties: false,
    properties: {
      tags: {
        type: 'array',
        widget: 'multi-tags',
        items: { type: 'string' },
        maxItems: 2,
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
          { label: 'C', value: 'c' },
        ],
      },
    },
  } as const;
  assert.equal(validateFormSchema(legal).valid, true);

  const wrongType = validateFormSchema({
    ...legal,
    properties: { tags: { ...legal.properties.tags, type: 'string' } },
  });
  assert.equal(wrongType.valid, false);
  assert.ok(wrongType.errors.some((e) => e.includes('must have type "array"')));

  const noOptions = validateFormSchema({
    ...legal,
    properties: { tags: { type: 'array', widget: 'multi-tags', items: { type: 'string' } } },
  });
  assert.equal(noOptions.valid, false);
  assert.ok(noOptions.errors.some((e) => e.includes('non-empty "options"')));

  const badMax = validateFormSchema({
    ...legal,
    properties: { tags: { ...legal.properties.tags, maxItems: 0 } },
  });
  assert.equal(badMax.valid, false);
  assert.ok(badMax.errors.some((e) => e.includes('positive integer')));

  const badItems = validateFormSchema({
    ...legal,
    properties: { tags: { ...legal.properties.tags, items: { type: 'number' } } },
  });
  assert.equal(badItems.valid, false);
  assert.ok(badItems.errors.some((e) => e.includes('items of type "string"')));

  // Data-level: exceeding maxItems is rejected by validateFormData
  const overLimit = validateFormData(legal as any, { tags: ['a', 'b', 'c'] });
  assert.equal(overLimit.valid, false);
  assert.ok(overLimit.errors.some((e) => e.includes('exceeds maxItems')));

  const withinLimit = validateFormData(legal as any, { tags: ['a', 'b'] });
  assert.equal(withinLimit.valid, true, `within limit should pass: ${withinLimit.errors.join('; ')}`);

  const badItemType = validateFormData(legal as any, { tags: ['a', 42] });
  assert.equal(badItemType.valid, false);
});

test('Manifest.13: Rejects product-link with non-string type', () => {
  const res = validateFormSchema({
    type: 'object',
    required: [],
    additionalProperties: false,
    properties: {
      link: { type: 'array', widget: 'product-link', items: { type: 'string' } },
    },
  });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('product-link')));
});
