// Regression coverage for Issue #2723: reasoning is a separate channel; it must
// never ship as the business answer, and a reasoning-only response must fail
// loudly. The #2722 submit-guard cases live with the guard in omnimux-workflow
// (src/workflow/seam/remote-pick-metadata.test.mjs).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeOmnimuxText } from './execute.js';
import { parseTextConfig } from './catalog.js';

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
