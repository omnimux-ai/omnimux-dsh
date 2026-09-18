import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapOmnimuxInput } from '../../../omnimux/src/media/vendors/omnimux.js';

const here = dirname(fileURLToPath(import.meta.url));
const configPanelPath = join(here, '../../src/canvas/editor/components/MaterialNode/ConfigPanel/index.tsx');
const configPanelSrc = readFileSync(configPanelPath, 'utf8');

const executorPath = join(here, '../../src/workflow/execution/materialGatewayExecutor.ts');
const executorSrc = readFileSync(executorPath, 'utf8');

test('e2e: TTS dual-mode state machine and reference audio passthrough', () => {
  // 1. 静态契约断言：ConfigPanel 具备 hasUpstreamAudio 智能模式自适应
  assert.match(configPanelSrc, /hasUpstreamAudio\s*=/, 'ConfigPanel must declare hasUpstreamAudio derived from upstreams');
  assert.match(configPanelSrc, /is-locked-by-upstream/, 'Voice trigger must apply locked class when upstream audio is attached');
  assert.match(configPanelSrc, /cloneMissingAudio/, 'Generate button must guard against missing audio in clone mode');

  // 2. 静态契约断言：materialGatewayExecutor 保留参考音频载荷
  assert.match(executorSrc, /hasReferenceAudio/, 'Executor must preserve reference audio when supplied');

  // 3. 运行时发包断言：mapOmnimuxInput 在携带参考音频时规范组装 references
  const audioSample = 'https://example.com/voice-sample.mp3';
  const payloadWithRef = mapOmnimuxInput('audio', {
    model: 'seed-audio-1.0',
    prompt: '测试参考音频克隆朗读',
    references: [{ type: 'audio', pathOrUrl: audioSample }],
  });
  assert.equal(payloadWithRef.input, '测试参考音频克隆朗读');
  assert.deepEqual(payloadWithRef.references, [{ audio_url: audioSample }]);
  assert.equal(payloadWithRef.audio_url, audioSample);

  // 4. 运行时发包断言：无参考音频时走纯文本内置音色
  const payloadClean = mapOmnimuxInput('audio', {
    model: 'seed-audio-1.0',
    prompt: '纯文本朗读',
    voice: 'zh_male_guanggaojieshuo_uranus_bigtts',
  });
  assert.equal(payloadClean.input, '纯文本朗读');
  assert.equal(payloadClean.voice, 'zh_male_guanggaojieshuo_uranus_bigtts');
  assert.equal(payloadClean.references, undefined);
  assert.equal(payloadClean.audio_url, undefined);
});
