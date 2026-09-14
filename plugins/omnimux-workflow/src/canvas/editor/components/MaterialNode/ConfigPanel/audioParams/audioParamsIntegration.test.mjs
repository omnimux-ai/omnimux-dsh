/**
 * audioParams 集成契约测试（Issue #763：音频输入面板卡槽常驻 + 底栏精简）。
 *
 * 源码契约（readFileSync + node:test）锁定：
 *  - AudioTriggerBar / AudioParamPopover 组件文件已删除，ConfigPanel 不再导入、
 *    渲染或持有其状态（audioPopoverOpen / audioTriggerRef）；
 *  - 音频底栏只保留：模型下拉 + wf-voice-trigger 音色胶囊 + 生成按钮；
 *  - SLOT_LAYOUT_TABLE 新增 text_to_speech strip 策略，SLOT_NAME_ALIASES
 *    新增 reference_audio 别名；
 *  - 音频槽严格来自所选 listed 操作，speech 无槽，music 保留准确容量；
 *  - audioParamAdapter 不再导出 formatAudioSummary / assertAudioParamWriteKey；
 *  - ASR（isAsrTool）不挂卡槽兜底，字数闸门保留。
 */

import assert from 'node:assert/strict';
import { deriveSlotLayout, autoFillSlots } from '../../../../../../shared/graph/feedSlot/index.ts';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const adapterSrc = readFileSync(join(here, 'audioParamAdapter.ts'), 'utf8');
const configSrc = readFileSync(join(here, '..', 'index.tsx'), 'utf8');
const tableSrc = readFileSync(
  join(here, '..', '..', '..', '..', '..', '..', 'shared', 'graph', 'feedSlot', 'slotLayoutTable.ts'),
  'utf8',
);

test('Issue #763：AudioTriggerBar / AudioParamPopover 组件文件已删除', () => {
  assert.equal(existsSync(join(here, 'AudioTriggerBar.tsx')), false, 'AudioTriggerBar.tsx 必须删除');
  assert.equal(existsSync(join(here, 'AudioParamPopover.tsx')), false, 'AudioParamPopover.tsx 必须删除');
});

test('Issue #763：ConfigPanel 不再挂载音频时长摘要条与参数浮层', () => {
  assert.doesNotMatch(configSrc, /AudioTriggerBar/);
  assert.doesNotMatch(configSrc, /AudioParamPopover/);
  assert.doesNotMatch(configSrc, /audioPopoverOpen/);
  assert.doesNotMatch(configSrc, /audioTriggerRef/);
  assert.doesNotMatch(configSrc, /SlidersHorizontal/);
  assert.doesNotMatch(configSrc, /advanced-drawer/);
  assert.doesNotMatch(configSrc, /showAdvanced/);
});

test('Issue #763：音频底栏保留模型下拉与 VoiceTrigger 音色胶囊（有音色选项即常驻）', () => {
  assert.match(configSrc, /wf-voice-trigger/);
  assert.match(configSrc, /VoicePickerDialog/);
  assert.match(configSrc, /resolveVoiceLabel/);
  // 浮层已移除，音色选择不再按大目录门槛收缩：任何音色选项都走 VoiceTrigger
  assert.match(configSrc, /voiceCatalogOptions\.length > 0/);
  assert.doesNotMatch(configSrc, /VOICE_PICKER_MIN_OPTIONS/);
  // 音色读侧真源仍是 resolveEffectiveAudioParams
  assert.match(configSrc, /resolveEffectiveAudioParams\(\{/);
  assert.match(configSrc, /updateParam\('voice', voiceType\)/);
});

test('Issue #763：text_to_speech 进入 SLOT_LAYOUT_TABLE，reference_audio 别名在位', () => {
  assert.match(tableSrc, /text_to_speech: \{ preset: 'strip', slots: \['reference_audio', 'reference'\], addButton: true \}/);
  assert.match(tableSrc, /reference_audio: \['reference', 'references', 'input_audio', 'audio_track', 'audio'\]/);
});

test('Issue #763/#1760：speech 不消费音频，music 严格保留所选操作的槽与容量', () => {
  const catalog = {models:[{id:'audio-model',operations:[
    {id:'text_to_speech',listed:true,output:{type:'audio'},inputs:[]},
    {id:'text_to_music',listed:true,output:{type:'audio'},inputs:[{slot:'reference_audio',type:'audio',role:'reference',source:'upstream_edge',min:0,max:1}]},
  ]}]};
  const feed = [0,1].map(i => ({edgeId:`audio-${i}`,sourceNodeId:`audio-${i}`,type:'audio',ordinal:i,availability:'ready'}));
  const speech = deriveSlotLayout(catalog, 'audio-model', 'text_to_speech', 'audio');
  assert.equal(speech.preset, 'none');
  assert.deepEqual(speech.slots, []);
  assert.deepEqual(autoFillSlots(feed, speech).bindings, {});
  const music = deriveSlotLayout(catalog, 'audio-model', 'text_to_music', 'audio');
  assert.deepEqual(music.slots.map(({slot,type,min,max}) => ({slot,type,min,max})), [{slot:'reference_audio',type:'audio',min:0,max:1}]);
  assert.equal(autoFillSlots(feed, music).bindings.reference_audio.length, 1);
  catalog.models[0].operations[1].inputs[0].max = null;
  assert.equal(deriveSlotLayout(catalog, 'audio-model', 'text_to_music', 'audio').slots[0].max, null);
  delete catalog.models[0].operations[1].inputs[0].max;
  assert.equal(deriveSlotLayout(catalog, 'audio-model', 'text_to_music', 'audio').slots[0].max, 0, '不完整DTO保持fail-closed，不合成正容量');
});

test('audioParamAdapter：摘要格式化与浮层写白名单随浮层下线，字数闸门保留', () => {
  assert.doesNotMatch(adapterSrc, /formatAudioSummary/);
  assert.doesNotMatch(adapterSrc, /assertAudioParamWriteKey/);
  assert.doesNotMatch(adapterSrc, /buildVideoParamTransition/);
  assert.doesNotMatch(adapterSrc, /onUpdateNodeData/);
  assert.match(adapterSrc, /outputType: 'audio'/);
  assert.match(adapterSrc, /resolveAudioPromptGate/);
  assert.match(adapterSrc, /AUDIO_PROMPT_MAX_CHARS/);
});

test('ASR（isAsrTool）不挂音频卡槽兜底，字数闸门接线保留', () => {
  assert.match(configSrc, /isAsrTool/);
  assert.match(configSrc, /maxLength=\{audioPromptGate \? AUDIO_PROMPT_MAX_CHARS : undefined\}/);
  assert.match(configSrc, /audioPromptGate\?\.exceeded/);
});
