import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMaterialGatewayExecutor } from './materialGatewayExecutor.ts';
import { catalogFor, operation, slot } from '../seam/submissionFixtures.mjs';

const SCRIPT = '要朗读的文稿';
const audio = (name) => ({ mediaAssets: [{ type: 'audio', url: `https://example.test/${name}.mp3`, mimeType: 'audio/mpeg' }] });

function setup() {
  const catalog = catalogFor('audio', 'index-tts', [
    operation('voice_clone', 'audio', [slot('audio', 'audio_track', 1, 1, 'voice_sample')]),
  ]);
  const requests = [];
  const gateway = {
    capabilities: async () => catalog,
    submit: async (request) => { requests.push(request); return { taskId: 'clone', mode: 'submitted' }; },
    awaitTask: async () => ({ type: 'audio', url: 'https://example.test/cloned.mp3', durationSec: 3 }),
  };
  return { requests, executor: createMaterialGatewayExecutor({ gateway }) };
}

const node = (params = {}, prompt = SCRIPT) => ({
  id: 'clone', type: 'material',
  data: { materialType: 'audio', prompt, params: { operation: 'voice_clone', ...params } },
});
const context = (upstreamBindings = []) => ({
  upstreamOutputs: new Map(upstreamBindings.map((binding) => [binding.sourceNodeId, binding.output])),
  upstreamBindings, mediaDir: '/tmp/voice-clone-2256-media', signal: new AbortController().signal,
});

test('a voice-clone node submits the clone operation with its reference audio intact (#2256)', async () => {
  const { executor, requests } = setup();
  const output = await executor.execute(node(), context([
    { sourceNodeId: 'sample', edgeId: 'sample', role: 'audio_track', targetSlot: 'voice_sample', output: audio('sample') },
  ]));

  assert.ok(output, 'the executor returns a result instead of throwing');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].operation, 'voice_clone');
  assert.equal(requests[0].model, 'index-tts');
  assert.equal(requests[0].prompt, SCRIPT);
  // Unlike text_to_speech, the clone operation must keep the reference audio.
  const track = requests[0].audioTrack?.pathOrUrl
    ?? requests[0].references?.find((reference) => reference.type === 'audio')?.pathOrUrl
    ?? requests[0].audio;
  assert.equal(track, 'https://example.test/sample.mp3');
});

test('a voice-clone node without a reference audio is refused instead of submitting a partial request (#2256)', async () => {
  const { executor, requests } = setup();
  await assert.rejects(executor.execute(node(), context()));
  assert.equal(requests.length, 0);
});
