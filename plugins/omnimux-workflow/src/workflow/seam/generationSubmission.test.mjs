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
    { id: 'vision_chat', listed: true, output: { type: 'text' } },
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

test('text seam forwards ordered references, operation and legacy inputs without rewriting', async () => {
  const root = mkdtempSync(join(tmpdir(), 'generation-submit-'));
  const received = [];
  const gateway = createOmnimuxSeamClient({ getSeam: (name) => name === 'modelCatalog'
    ? { list: () => catalog }
    : name === 'textComplete' ? { execute: async (req) => { received.push(req); return { text: 'ok' }; } } : undefined,
  });
  const references = [
    { type: 'image', role: 'reference', pathOrUrl: '/one.png' },
    { type: 'video', role: 'reference', pathOrUrl: '/two.mp4' },
    { type: 'audio', role: 'reference', pathOrUrl: '/three.wav' },
  ];
  try {
    const { taskId } = await gateway.submit({ capability: 'text', operation: 'vision_chat', prompt: '分析',
      references, image: '/one.png', video: '/two.mp4', audioTrack: references[2] });
    assert.equal(received.length, 0);
    await gateway.awaitTask(taskId, join(root, 'out.txt'));
    assert.deepEqual(received, [{ prompt: '分析', model: 'gpt-5.5', operation: 'vision_chat',
      image: '/one.png', video: '/two.mp4', references, audioTrack: references[2] }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
