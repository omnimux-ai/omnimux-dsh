import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveGenerationPrompt } from './generationPrompt.ts';
import { buildUiUpstreamFingerprint, buildEffectiveOpsUiState } from '../validation/operationUi.ts';
import { createMaterialGatewayExecutor } from '../../workflow/execution/materialGatewayExecutor.ts';
import { catalogFor, operation } from '../../workflow/seam/submissionFixtures.mjs';
const catalog = catalogFor('audio', 'tts', [operation('text_to_speech', 'audio', [])]);
const token = '@ref[script:-1:script]';
test('shared local text distinguishes text references from real direction and media annotations', () => {
  assert.equal(resolveGenerationPrompt({ prompt: `${token} ${token}`, materialType: 'audio' }), '');
  assert.equal(resolveGenerationPrompt({ prompt: `${token} 温柔一点`, materialType: 'audio' }), '温柔一点');
  assert.equal(resolveGenerationPrompt({ prompt: '@ref[a:-2:a.png]' }), '@ref[a:-2:a.png]');
  const upstreams = [{ nodeId: 'script', materialType: 'text', availability: 'ready', textContent: '正文' }];
  const fingerprint = buildUiUpstreamFingerprint({ prompt: token, materialType: 'audio', upstreams });
  assert.equal(fingerprint.localText, '');
  assert.equal(fingerprint.prompt, '正文');
  assert.equal(buildEffectiveOpsUiState({ catalog, modelId: 'tts', fingerprint, outputType: 'audio' }).blockGenerate, false);
});
test('repeated text mentions consume ordered scripts once; actual instructions never submit', async () => {
  const requests = [];
  const executor = createMaterialGatewayExecutor({ gateway: { capabilities: async () => catalog,
    submit: async request => { requests.push(request); return { taskId: 'offline' }; },
    awaitTask: async () => ({ type: 'audio', url: 'https://example.test/out.mp3' }),
  } });
  const ctx = { upstreamOutputs: new Map([['script', { text: '第一句' }], ['second', { text: '第二句' }]]),
    upstreamBindings: [{ sourceNodeId: 'script', edgeId: 'one', output: { text: '第一句' } }, { sourceNodeId: 'second', edgeId: 'two', output: { text: '第二句' } }],
    signal: new AbortController().signal, mediaDir: '/unused-offline' };
  const node = { id: 'target', data: { materialType: 'audio', prompt: `${token} ${token}`, params: { model: 'tts', operation: 'text_to_speech' }, slotBindings: {} } };
  await executor.execute(node, ctx);
  assert.equal(requests[0].prompt, '第一句\n\n第二句');
  node.data.prompt += ' 温柔一点';
  await assert.rejects(executor.execute(node, ctx), /不能分别表达/);
  assert.equal(requests.length, 1);
});
