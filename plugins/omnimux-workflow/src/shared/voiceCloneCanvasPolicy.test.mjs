import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectCanvasCatalog } from './generationPolicy.ts';
import { buildUpstreamFingerprint } from './validation/compatKernel.ts';
import { buildFilteredModelOptions } from './validation/operationUi.ts';

const prompt = { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 };
const speech = {
  id: 'seed-audio-1.0', label: 'Seed Audio 1.0', family: 'bytedance',
  operations: [{ id: 'text_to_speech', label: '文本转语音', listed: true, output: { type: 'audio' }, inputs: [prompt] }],
};
const clone = {
  id: 'index-tts', label: 'Index TTS 声音克隆', family: 'gxgenai',
  operations: [{
    id: 'voice_clone', label: '声音克隆', listed: true, output: { type: 'audio' },
    inputs: [prompt, { slot: 'voice_sample', type: 'audio', role: 'audio_track', source: 'upstream_edge', min: 1, max: 1 }],
  }],
};
// Synthetic contracts exercise canvas policy, not provider support claims.
function catalog() {
  const models = [speech, clone];
  return {
    source: 'omnimux', fingerprint: 'fixture', models,
    text: [], image: [], video: [], audio: models.map(({ id, label }) => ({ id, label })),
    defaults: { audio: 'seed-audio-1.0' },
  };
}
const withScript = () => buildUpstreamFingerprint({ prompt: '你好', assets: [] });
const withSample = () => buildUpstreamFingerprint({
  prompt: '你好',
  assets: [{ sourceNodeId: 'sample', type: 'audio', role: 'audio_track' }],
});

test('canvas audio policy admits index-tts and keeps only its own listed operation (#2256)', () => {
  const view = projectCanvasCatalog(catalog());
  assert.deepEqual(view.audio.map((model) => model.id), ['seed-audio-1.0', 'index-tts']);
  assert.equal(view.defaults.audio, 'seed-audio-1.0', 'the clone model must not steal the speech default');
  const row = view.models.find((model) => model.id === 'index-tts');
  assert.deepEqual(row.operations.map((op) => op.id), ['voice_clone']);
  assert.equal(view.defaultsByOperation.voice_clone, undefined, 'no operation default is invented for the clone');
});

test('the clone model reaches a node carrying a reference audio and not a script-only node (#2256)', () => {
  const view = projectCanvasCatalog(catalog());
  const cloneNode = buildFilteredModelOptions({ catalog: view, fingerprint: withSample(), outputType: 'audio', tool: 'voice-clone' });
  assert.deepEqual(cloneNode.options.map((option) => option.id), ['index-tts']);

  // Required media is not part of the compatibility verdict, so a script-only node still
  // lists both audio models; picking the clone model there renders its reference slot and
  // submitting without one is refused by the hub guard (`slot voice_sample needs min 1`).
  const speechNode = buildFilteredModelOptions({ catalog: view, fingerprint: withScript(), outputType: 'audio', tool: 'text-to-audio' });
  assert.deepEqual(speechNode.options.map((option) => option.id), ['seed-audio-1.0', 'index-tts']);
});
