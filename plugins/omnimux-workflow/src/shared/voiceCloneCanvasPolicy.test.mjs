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

test('canvas audio policy admits every listed model; the configured catalog default wins', () => {
  const view = projectCanvasCatalog(catalog());
  // 默认全开：三个已上架音频模型全部进画布，目录序即展示序。
  assert.deepEqual(view.audio.map((model) => model.id), ['seed-audio-1.0', 'indextts-2', 'suno']);
  // catalog.defaults.audio='seed-audio-1.0' 已上架 → 默认是它，覆盖策略种子 suno。
  assert.equal(view.defaults.audio, 'seed-audio-1.0');
  assert.equal(view.models.some((model) => model.id === 'indextts-2'), true,
    'the listed clone model reaches the canvas by default');
  assert.equal(view.models.some((model) => model.id === 'seed-audio-1.0'), true,
    'the listed speech model reaches the canvas by default');
  const row = view.models.find((model) => model.id === 'suno');
  assert.deepEqual(row.operations.map((op) => op.id), ['text_to_music']);
  // 隐藏集相减：藏掉 clone/speech 即从画布移除。
  const hidden = projectCanvasCatalog({ ...catalog(), canvasHiddenModels: { audio: ['indextts-2', 'seed-audio-1.0'] } });
  assert.deepEqual(hidden.audio.map((model) => model.id), ['seed-audio-1.0', 'indextts-2', 'suno']);
});

test('capability-filtered tools expose only the models compatible with their inputs', () => {
  const view = projectCanvasCatalog(catalog());
  // voice-clone 不是声明的 capability 工具 → 候选 = 全部兼容音频模型。
  // 有上游音频样本时，只有 indextts-2 的 voice_clone op 消费它。
  const cloneNode = buildFilteredModelOptions({ catalog: view, fingerprint: withSample(), outputType: 'audio', tool: 'voice-clone' });
  assert.deepEqual(cloneNode.options.map((option) => option.id), ['indextts-2']);
  assert.equal(isZeroCandidateEmptyState(cloneNode), false);

  // 纯脚本（无上游音频）时，全部已上架音频模型都是候选。
  const speechNode = buildFilteredModelOptions({ catalog: view, fingerprint: withScript(), outputType: 'audio', tool: 'text-to-audio' });
  assert.deepEqual(speechNode.options.map((option) => option.id), ['seed-audio-1.0', 'indextts-2', 'suno']);
});
