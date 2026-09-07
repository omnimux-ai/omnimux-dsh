import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMaterialGatewayExecutor } from './materialGatewayExecutor.ts';
import { catalogFor, operation, slot } from '../seam/submissionFixtures.mjs';

const voice = 'zh_female_linxiao_uranus_bigtts';
const audio = (name) => ({ mediaAssets: [{ type: 'audio', url: `https://example.test/${name}.mp3`, mimeType: 'audio/mpeg' }] });
function setup(id = 'text_to_speech', slots = []) {
  const catalog = catalogFor('audio', 'test-speech', [operation(id, 'audio', slots)]);
  const requests = [];
  const gateway = { capabilities: async () => catalog,
    submit: async (req) => { requests.push(req); return { taskId: 'speech', mode: 'submitted' }; },
    awaitTask: async () => ({ type: 'audio', url: 'https://example.test/generated.mp3', durationSec: 2.5 }),
  };
  return { catalog, requests, executor: createMaterialGatewayExecutor({ gateway }) };
}
const node = (params = {}, prompt = '朗读正文') => ({ id: 'speech', type: 'material', data: {
  materialType: 'audio', prompt, params: { voice, speed: 1.25, ...params },
} });
const context = (upstreamBindings = []) => ({
  upstreamOutputs: new Map(upstreamBindings.map((binding) => [binding.sourceNodeId, binding.output])),
  upstreamBindings, mediaDir: '/tmp/voice-picker-735-media', signal: new AbortController().signal,
});
const assertNoMedia = (request) => {
  for (const field of ['references', 'audio', 'audioTrack', 'image', 'interleavedParts']) {
    assert.equal(Object.hasOwn(request, field), false, `${field} must be absent, not just undefined`);
  }
};

for (const params of [{ operation: 'text_to_speech' }, {}]) {
  test(`speech omits reference fields and keeps text/voice/speed with ${params.operation ? 'explicit' : 'inferred'} operation`, async () => {
    const { executor, requests } = setup();
    const input = node(params, '');
    const ctx = context([
      { sourceNodeId: 'script', output: { text: '上游朗读正文' } },
      { sourceNodeId: 'reference', edgeId: 'ref', output: audio('reference') },
    ]);
    const original = structuredClone(ctx.upstreamOutputs);
    const output = await executor.execute(input, ctx);
    assert.equal(requests.length, 1);
    assertNoMedia(requests[0]);
    assert.equal(requests[0].operation, 'text_to_speech');
    assert.equal(requests[0].model, 'test-speech');
    assert.equal(requests[0].prompt, '上游朗读正文');
    assert.equal(requests[0].voice, voice);
    assert.equal(requests[0].speed, 1.25);
    assert.equal(output.mediaAssets[0].durationSec, 2.5);
    assert.deepEqual(ctx.upstreamOutputs, original);
  });
}

test('speech strips resolved optional audio references and tracks before the submission boundary', async () => {
  const { executor, requests } = setup('text_to_speech', [
    slot('audio', 'reference', 0, 1, 'reference'), slot('audio', 'audio_track', 0, 1, 'track'),
  ]);
  await executor.execute(node(), context([
    { sourceNodeId: 'reference', edgeId: 'ref', role: 'reference', targetSlot: 'reference', output: audio('reference') },
    { sourceNodeId: 'track', edgeId: 'track', role: 'audio_track', targetSlot: 'track', output: audio('track') },
  ]));
  assertNoMedia(requests[0]);
  assert.equal(requests[0].prompt, '朗读正文');
});

test('speech cannot leak prompt-token references via legacy image or interleaved payloads', async () => {
  const { executor, requests } = setup();
  await executor.execute(node({ supportsInterleaved: true }, '朗读 @ref[reference:0:reference.mp3] @ref[image:1:image.png]'), context([
    { sourceNodeId: 'reference', output: audio('reference') },
    { sourceNodeId: 'image', output: { mediaAssets: [{ type: 'image', url: 'https://example.test/image.png' }] } },
  ]));
  assertNoMedia(requests[0]);
  assert.equal(requests[0].voice, voice);
});

test('music generation retains references and audio tracks unchanged', async () => {
  const { executor, requests } = setup('text_to_music', [
    slot('audio', 'reference', 0, 1, 'reference'), slot('audio', 'audio_track', 0, 1, 'track'),
  ]);
  await executor.execute(node({ operation: 'text_to_music' }), context([
    { sourceNodeId: 'reference', edgeId: 'ref', role: 'reference', targetSlot: 'reference', output: audio('reference') },
    { sourceNodeId: 'track', edgeId: 'track', role: 'audio_track', targetSlot: 'track', output: audio('track') },
  ]));
  assert.equal(requests[0].references[0].pathOrUrl, 'https://example.test/reference.mp3');
  assert.equal(requests[0].audio, 'https://example.test/reference.mp3');
  assert.equal(requests[0].audioTrack.pathOrUrl, 'https://example.test/track.mp3');
});

test('speech cleanup does not bypass missing text or unknown operation rejection', async () => {
  const { executor, requests } = setup();
  await assert.rejects(executor.execute(node({}, ''), context([{ sourceNodeId: 'reference', output: audio('reference') }])));
  await assert.rejects(executor.execute(node({ operation: 'voice_clone' }), context()));
  assert.equal(requests.length, 0);
});
