import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectCanvasCatalog } from './generationPolicy.ts';
import { buildUpstreamFingerprint } from './validation/compatKernel.ts';
import { buildFilteredModelOptions, isZeroCandidateEmptyState } from './validation/operationUi.ts';

const prompt = { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 };
// 2026-10-21 网关对账 #3516：语音合成/克隆渠道停用，音频只保留 Suno 音乐生成。
const legacySpeech = {
  id: 'seed-audio-1.0', label: 'Seed Audio 1.0', family: 'bytedance',
  operations: [{ id: 'text_to_speech', label: '文本转语音', listed: true, output: { type: 'audio' }, inputs: [prompt] }],
};
const legacyClone = {
  id: 'indextts-2', label: 'Index TTS2 声音克隆', family: 'indextts',
  operations: [{
    id: 'voice_clone', label: '声音克隆', listed: true, output: { type: 'audio' },
    inputs: [prompt, { slot: 'voice_sample', type: 'audio', role: 'audio_track', source: 'upstream_edge', min: 1, max: 1 }],
  }],
};
const suno = {
  id: 'suno', label: 'Suno', family: 'suno',
  operations: [{ id: 'text_to_music', label: '音乐生成', listed: true, output: { type: 'audio' }, inputs: [prompt] }],
};
// Synthetic contracts exercise canvas policy, not provider support claims.
function catalog() {
  const models = [legacySpeech, legacyClone, suno];
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

test('canvas audio policy admits only listed suno and drops the delisted clone/speech models (#3516)', () => {
  const view = projectCanvasCatalog(catalog());
  assert.deepEqual(view.audio.map((model) => model.id), ['suno']);
  assert.equal(view.defaults.audio, 'suno', 'the surviving audio default is the admitted Suno model');
  // 已下线模型即便仍在 hub 目录里登记，也不得借音频白名单回到画布。
  assert.equal(view.models.some((model) => model.id === 'indextts-2'), false,
    'the delisted clone model must not reach the canvas');
  assert.equal(view.models.some((model) => model.id === 'seed-audio-1.0'), false,
    'the delisted speech model must not reach the canvas');
  const row = view.models.find((model) => model.id === 'suno');
  assert.deepEqual(row.operations.map((op) => op.id), ['text_to_music']);
  assert.equal(view.defaultsByOperation.voice_clone, undefined, 'no operation default is invented for the dropped clone');
  assert.equal(view.defaultsByOperation.text_to_speech, undefined, 'text_to_speech is no longer a canvas default operation');
});

test('the delisted clone model reaches no node and the voice-clone tool fails closed (#3516)', () => {
  const view = projectCanvasCatalog(catalog());
  const cloneNode = buildFilteredModelOptions({ catalog: view, fingerprint: withSample(), outputType: 'audio', tool: 'voice-clone' });
  assert.deepEqual(cloneNode.options.map((option) => option.id), []);
  assert.equal(isZeroCandidateEmptyState(cloneNode), true);

  // 只有 Suno 能进入音频节点的模型选择；脚本节点同样看不到已下线模型。
  const speechNode = buildFilteredModelOptions({ catalog: view, fingerprint: withScript(), outputType: 'audio', tool: 'text-to-audio' });
  assert.deepEqual(speechNode.options.map((option) => option.id), ['suno']);
  assert.ok(!speechNode.options.some((option) => option.id === 'indextts-2'));
  assert.ok(!speechNode.options.some((option) => option.id === 'seed-audio-1.0'));
});
