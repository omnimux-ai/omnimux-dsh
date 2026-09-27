// Regression coverage for Issue #2722 / #2723.
//
// #2722: an App form pick must carry the library record's own media metadata,
//        otherwise a remote (https) reference can never satisfy a slot that
//        declares maxSizeMb and the submission is rejected forever.
// #2723: reasoning is a separate channel; it must never ship as the business
//        answer, and a reasoning-only response must fail loudly.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveCanvasSubmission } from '../../../omnimux-workflow/src/workflow/seam/submitGuard.ts';
import { catalogFor, operation, slot } from '../../../omnimux-workflow/src/workflow/seam/submissionFixtures.mjs';
import { executeOmnimuxText } from './execute.js';
import { parseTextConfig } from './catalog.js';

const COLLECTION_SETTINGS = { get: () => undefined };

// Mirrors video-models.yaml: minimax-h3 image_to_video first_frame.
const h3Catalog = catalogFor('video', 'minimax-h3', [
  operation('image_to_video', 'video', [
    slot('prompt', 'prompt', 1, 1, 'prompt'),
    {
      ...slot('image', 'first_frame', 1, 1, 'first_frame'),
      allowedMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
      maxSizeMb: 30,
    },
  ]),
]);

const REMOTE_URL = 'https://cdn.omnimux.ai/demo/product-image.jpg';

const h3Request = (references) => ({
  capability: 'video',
  model: 'minimax-h3',
  operation: 'image_to_video',
  prompt: 'a product hero shot',
  dest: '/tmp/never-written.mp4',
  references,
});

test('#2722 a remote pick WITH library metadata satisfies a maxSizeMb first_frame slot', () => {
  // This is the reference shape executionBridge now injects for a picked card.
  const injected = {
    type: 'image',
    role: 'first_frame',
    pathOrUrl: REMOTE_URL,
    sourceNodeId: 'node-slot-product-image',
    edgeId: 'feed-edge-node-slot-product-image-productImage',
    targetSlot: 'first_frame',
    mimeType: 'image/jpeg',
    sizeBytes: 2_048_576,
  };
  const submitted = resolveCanvasSubmission(h3Request([injected]), h3Catalog);
  const [ref] = submitted.references;
  assert.equal(ref.mimeType, 'image/jpeg');
  assert.equal(ref.sizeBytes, 2_048_576);
  assert.equal(ref.targetSlot, 'first_frame');
});

test('#2722 a remote pick WITHOUT metadata is still rejected, not silently accepted', () => {
  assert.throws(
    () => resolveCanvasSubmission(h3Request([{
      type: 'image',
      role: 'first_frame',
      pathOrUrl: REMOTE_URL,
      sourceNodeId: 'node-slot-product-image',
      edgeId: 'feed-edge-node-slot-product-image-productImage',
      targetSlot: 'first_frame',
    }]), h3Catalog),
    { code: 'metadata_required' },
  );
});

function collectStream(chunks, text) {
  return {
    async * stream() {
      for (const chunk of chunks) yield chunk;
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
    get text() { return text; },
  };
}

const textInput = (llm) => ({
  prompt: '请用一句话总结 OmniMux 创作画布的核心优势',
  model: 'gemini-3.8-flash',
  operation: 'vision_chat',
  settings: { get: () => ({ runtimeMode: 'official' }) },
  llm,
  env: { OMNIMUX_API_KEY: 'sk-test' },
});

test('#2723 reasoning deltas never accumulate into the business body', async () => {
  const llm = {
    async * stream() {
      yield { type: 'reasoning-delta', text: "I'm thinking through how to approach this." };
      yield { type: 'reasoning-delta', text: ' The canvas is a workflow surface.' };
      yield { type: 'text-delta', text: 'OmniMux 创作画布把文本、图像、视频、音频串成一条可复用的生成流水线。' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  const result = await executeOmnimuxText({ ...textInput(llm), catalog: parseTextConfig(undefined) });
  assert.equal(result.text, 'OmniMux 创作画布把文本、图像、视频、音频串成一条可复用的生成流水线。');
  assert.ok(!result.text.includes("I'm thinking through"));
});

test('#2723 a reasoning-only response fails instead of shipping as a result', async () => {
  const llm = {
    async * stream() {
      yield { type: 'reasoning-delta', text: "I'm thinking through how to approach this." };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  await assert.rejects(
    executeOmnimuxText({ ...textInput(llm), catalog: parseTextConfig(undefined) }),
    (err) => {
      assert.equal(err.code, 'omnimux-invalid-response');
      assert.match(err.message, /思考过程/);
      return true;
    },
  );
});

test('#2723 a closed text block wins over a shorter leading delta', async () => {
  const llm = {
    async * stream() {
      yield { type: 'text-delta', text: "I'm thinking through how to approach this." };
      yield { type: 'block-end', block: { type: 'text', text: '完整回答：画布支持文本、图像、视频、音频四类节点的串联生成。' } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  const result = await executeOmnimuxText({ ...textInput(llm), catalog: parseTextConfig(undefined) });
  assert.equal(result.text, '完整回答：画布支持文本、图像、视频、音频四类节点的串联生成。');
});
