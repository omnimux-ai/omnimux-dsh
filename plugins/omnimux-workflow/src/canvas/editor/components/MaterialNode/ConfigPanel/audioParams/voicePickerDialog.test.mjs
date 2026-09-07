/**
 * VoicePickerDialog / VoiceTrigger / 字数闸门集成契约测试（Issue #735 / T03/T04）。
 *
 * 源码契约（readFileSync + node:test）锁定：
 *  - VoicePickerDialog：CustomModal 540px、标题「选择音色」、搜索占位、四维筛选、
 *    空态「未找到匹配音色 + 清除筛选」、试听仅 toast.info 不发起真 TTS、
 *    选中即 onSelect(voice_type)、底部常驻选中条；
 *  - ConfigPanel 宿主：字数统计 wf-audio-char-counter（Array.from / 10000）、
 *    超限进入 blockGenerate 且禁用文案「朗读正文不能超过 10000 字符」、
 *    底栏 wf-voice-trigger（AudioLines 图标）唤起弹窗并写回 params.voice；
 *  - AudioParamPopover：大音色目录由 VoiceTrigger 承载时音色区收缩；
 *  - 样式门禁：新增源码零 raw hex/rgba、零 --omx-* 违禁 tokens。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dialogSrc = readFileSync(join(here, 'VoicePickerDialog.tsx'), 'utf8');
const modelSrc = readFileSync(join(here, 'voicePickerModel.ts'), 'utf8');
const popoverSrc = readFileSync(join(here, 'AudioParamPopover.tsx'), 'utf8');
const configSrc = readFileSync(join(here, '..', 'index.tsx'), 'utf8');
const cssSrc = readFileSync(join(here, '../../../../../theme/components.css'), 'utf8');

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

test('VoicePickerDialog：结构契约（标题 / 搜索 / 四维筛选 / 空态 / 底部选中条）', () => {
  assert.match(dialogSrc, /CustomModal/);
  assert.match(dialogSrc, /选择音色/);
  assert.match(dialogSrc, /width=\{540\}/);
  assert.match(dialogSrc, /搜索音色\.\.\./);
  // 四维筛选器
  for (const label of ['语言', '口音', '性别', '场景']) {
    assert.ok(dialogSrc.includes(`'${label}'`), `缺少筛选维度 ${label}`);
  }
  // 空态与清除筛选
  assert.match(dialogSrc, /未找到匹配音色/);
  assert.match(dialogSrc, /清除筛选/);
  // 底部常驻选中条
  assert.match(dialogSrc, /wf-voice-picker__selected/);
  assert.match(dialogSrc, /当前音色/);
});

test('VoicePickerDialog：试听占位安全（仅 Toast，绝不发起真 TTS 请求）', () => {
  assert.match(dialogSrc, /toast\.info\('暂无试听音频'\)/);
  const code = stripComments(dialogSrc);
  assert.doesNotMatch(code, /fetch\(|XMLHttpRequest|EventSource|WebSocket/);
  assert.doesNotMatch(code, /speechSynthesis|AudioContext/);
});

test('VoicePickerDialog：选中写回契约（onSelect(voice_type)，宿主负责关闭）', () => {
  assert.match(dialogSrc, /onSelect\(option\.value\)/);
  assert.match(dialogSrc, /role="listbox"/);
  assert.match(dialogSrc, /role="option"/);
  assert.match(dialogSrc, /aria-selected/);
  // 热门徽标与选中勾选
  assert.match(dialogSrc, /wf-voice-picker__hot/);
  assert.match(dialogSrc, /Check\s+size=\{16\}/);
});

test('ConfigPanel T03：字数统计与超限阻断', () => {
  assert.match(configSrc, /wf-audio-char-counter/);
  assert.match(configSrc, /resolveAudioPromptGate/);
  assert.match(configSrc, /AUDIO_PROMPT_MAX_CHARS/);
  assert.match(configSrc, /朗读正文不能超过/);
  // 超限进入生成门禁
  assert.match(configSrc, /audioPromptGate\?\.exceeded/);
  assert.match(configSrc, /wf-config-panel__char-counter--exceeded/);
});

test('ConfigPanel T04：底栏 VoiceTrigger 唤起弹窗并写回 params.voice', () => {
  assert.match(configSrc, /wf-voice-trigger/);
  assert.match(configSrc, /AudioLines/);
  assert.match(configSrc, /VoicePickerDialog/);
  assert.match(configSrc, /VOICE_PICKER_MIN_OPTIONS/);
  assert.match(configSrc, /setVoicePickerOpen\(true\)/);
  assert.match(configSrc, /updateParam\('voice', voiceType\)/);
  assert.match(configSrc, /setVoicePickerOpen\(false\)/);
});

test('AudioParamPopover T04：大音色目录由 VoiceTrigger 承载，音色区收缩', () => {
  assert.match(popoverSrc, /VOICE_PICKER_MIN_OPTIONS/);
  assert.match(popoverSrc, /voiceHostedByPicker/);
  assert.match(popoverSrc, /voiceOptions\.length > 0 && !voiceHostedByPicker/);
  // 小目录仍保留 Popover 内音色控件
  assert.match(popoverSrc, /VOICE_SELECT_THRESHOLD = 6/);
});

test('样式门禁：新增源码零 raw hex/rgba、零违禁 tokens', () => {
  const colorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
  for (const [name, src] of [
    ['VoicePickerDialog', dialogSrc],
    ['voicePickerModel', modelSrc],
    ['AudioParamPopover', popoverSrc],
  ]) {
    const code = stripComments(src);
    assert.doesNotMatch(code, colorRe, `${name} must not use raw hex/rgba`);
    assert.doesNotMatch(code, /--omx-/, `${name} must not use banned tokens`);
  }
  // CSS：音色相关块使用 --wb-* / --dsw-* tokens
  assert.match(cssSrc, /wf-voice-picker-modal/);
  assert.match(cssSrc, /wf-voice-trigger/);
  assert.match(cssSrc, /wf-config-panel__char-counter/);
  assert.doesNotMatch(cssSrc, /--omx-/);
});
