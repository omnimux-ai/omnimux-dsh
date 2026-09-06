import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildModelCatalog } from '../../../omnimux/src/catalog/list.js';
import { projectCanvasCatalog } from './generationPolicy.ts';
import { buildUpstreamFingerprint, planAutoAdaptation } from './validation/compatKernel.ts';

test('real Hub catalog exposes the four curated text models and selects Gemini 3.8 for video', () => {
  const catalog = projectCanvasCatalog(buildModelCatalog({ env: {} }));
  assert.deepEqual(catalog.text.map((row) => row.id), ['claude-opus-4-6', 'gemini-3.8-flash', 'deepseek-v4-flash-vision-exp', 'gpt-5.5']);
  assert.equal(catalog.defaults.text, 'gemini-3.8-flash');
  const select = (assets = [], currentModelId) => planAutoAdaptation({ catalog, outputType: 'text', currentModelId,
    fingerprint: buildUpstreamFingerprint({ prompt: 'analyze', assets }) });
  assert.equal(select().modelId, 'gemini-3.8-flash');
  const pick = select([{ sourceNodeId: 'video', type: 'video', mimeType: 'video/mp4', sizeBytes: 1024 }], 'claude-opus-4-6');
  assert.equal(pick.modelId, 'gemini-3.8-flash');
  assert.equal(pick.operationId, 'vision_chat');
  assert.equal(catalog.models.find((row) => row.id === pick.modelId).operations.find((op) => op.id === pick.operationId).execution.status, 'none');
});
