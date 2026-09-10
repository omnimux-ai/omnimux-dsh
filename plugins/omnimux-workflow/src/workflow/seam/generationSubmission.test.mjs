import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const bundleRoot = mkdtempSync(join(tmpdir(), 'generation-gateway-tests-'));
const bundlePath = join(bundleRoot, 'gateway.mjs');
buildSync({ stdin: { contents: `export { createOmnimuxSeamClient } from './omnimuxGateway.ts'; export { assembleGateway } from './gatewaySelection.ts';`, resolveDir: fileURLToPath(new URL('.', import.meta.url)) }, bundle: true, platform: 'node', format: 'esm', outfile: bundlePath });
const { createOmnimuxSeamClient, assembleGateway } = await import(pathToFileURL(bundlePath).href);
after(() => rmSync(bundleRoot, { recursive: true, force: true }));

const catalog = {
  text: [{ id: 'gpt-5.5', label: 'GPT 5.5' }, { id: 'excluded', label: 'Excluded' }],
  image: [], video: [], audio: [], defaults: { text: 'excluded' },
  models: ['gpt-5.5', 'excluded'].map((id) => ({ id, operations: [
    { id: 'vision_chat', listed: true, output: { type: 'text' }, inputs: ['image', 'video', 'audio'].map((type) => ({
      slot: `reference_${type}s`, role: 'reference', type, source: 'upstream_edge', min: 0, max: 4,
    })) },
    { id: 'draft', listed: false, output: { type: 'text' } },
  ] })),
};

for (const mode of ['omnimux', 'mock']) {
  test(`${mode}: direct submission rejects excluded model and unlisted operation`, async () => {
    let calls = 0;
    const gateway = assembleGateway({ mode, getSeam: (name) => name === 'modelCatalog'
      ? { list: () => catalog }
      : { execute: async () => { calls++; throw new Error('must not generate'); } },
    }).gateway;
    await assert.rejects(gateway.submit({ capability: 'text', model: 'excluded', prompt: 'x' }), { code: 'model-not-allowed' });
    await assert.rejects(gateway.submit({ capability: 'text', model: 'gpt-5.5', operation: 'draft', prompt: 'x' }), { code: 'operation-not-allowed' });
    assert.equal(calls, 0);
  });
}

test('text seam forwards ordered references and operation without duplicating legacy mirrors', async () => {
  const root = mkdtempSync(join(tmpdir(), 'generation-submit-'));
  const received = [];
  const gateway = createOmnimuxSeamClient({ getSeam: (name) => name === 'modelCatalog'
    ? { list: () => catalog }
    : name === 'textComplete' ? { execute: async (req) => { received.push(req); return { text: 'ok' }; } } : undefined,
  });
  const references = [
    { type: 'image', role: 'reference', pathOrUrl: 'https://example.test/one.png', targetSlot: 'reference_images', mimeType: 'image/png' },
    { type: 'video', role: 'reference', pathOrUrl: 'https://example.test/two.mp4', targetSlot: 'reference_videos', mimeType: 'video/mp4' },
    { type: 'audio', role: 'reference', pathOrUrl: 'https://example.test/three.wav', targetSlot: 'reference_audios', mimeType: 'audio/wav' },
  ];
  try {
    const { taskId } = await gateway.submit({ capability: 'text', operation: 'vision_chat', prompt: '分析',
      references, image: 'https://example.test/one.png', video: 'https://example.test/two.mp4', audioTrack: references[2] });
    assert.equal(received.length, 0);
    await gateway.awaitTask(taskId, join(root, 'out.txt'));
    assert.deepEqual(received, [{ prompt: '分析', model: 'gpt-5.5', operation: 'vision_chat',
      references, audioTrack: references[2] }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('canvas image node successfully submits with gpt-image-2.5', async () => {
  const { buildModelCatalog } = await import('../../../../omnimux/src/catalog/list.js');
  const rawCatalog = buildModelCatalog();
  const received = [];
  const gateway = createOmnimuxSeamClient({
    getSeam: (name) => name === 'modelCatalog'
      ? { list: () => rawCatalog }
      : name === 'imageGenerate' ? { execute: async (req) => { received.push(req); return { type: 'image', taskId: 'img_test_2_5', mode: 'submitted' }; } } : undefined,
  });
  const res = await gateway.submit({
    capability: 'image',
    model: 'gpt-image-2.5',
    operation: 'text_to_image',
    prompt: 'a cinematic portrait in 4k',
    aspectRatio: '16:9',
    resolution: '4K',
    dest: '/tmp/test.png',
  });
  assert.equal(res.taskId, 'img_test_2_5');
  assert.equal(received.length, 1);
  assert.equal(received[0].model, 'gpt-image-2.5');
  assert.equal(received[0].operation, 'text_to_image');
  assert.equal(received[0].aspectRatio, '16:9');
  assert.equal(received[0].resolution, '4K');
});
