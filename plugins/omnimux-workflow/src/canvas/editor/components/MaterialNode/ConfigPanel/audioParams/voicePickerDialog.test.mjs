/**
 * VoicePickerDialog / VoiceTrigger / 字数闸门集成契约测试（Issue #735 / T03/T04；
 * Issue #763 / #771 更新）。
 *
 * 源码契约（readFileSync + node:test）锁定：
 *  - VoicePickerDialog：CustomModal 540px、标题「选择音色」、搜索占位、四维筛选、
 *    空态「未找到匹配音色 + 清除筛选」、选中即 onSelect(voice_type)、底部常驻选中条；
 *  - Issue #771 试听：原生 Audio 对象经 getVoiceSampleUrl 加载火山官方 CDN 样音
 *    （零 fetch / TTS 请求），playingVoice + audioRef 单例控制，play/pause 切换，
 *    onended/onerror/play().catch 兜底 toast.info('该音色暂无官方试听音频')，
 *    弹窗关闭或卸载即停播清理；
 *  - ConfigPanel 宿主：朗读正文字数闸门（Array.from / 10000）经 maxLength/countOverride
 *    传入 PromptTokenEditor 内置 meta-bar，右下角仅保留唯一字符统计（Issue #746）、
 *    超限进入 blockGenerate 且禁用文案「朗读正文不能超过 10000 字符」、
 *    底栏 wf-voice-trigger（AudioLines 图标）唤起弹窗并写回 params.voice；
 *  - Issue #763：AudioParamPopover 已删除，音色选择统一由 VoiceTrigger +
 *    VoicePickerDialog 承载（有音色选项即显示，不再按大目录门槛收缩）；
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
const configSrc = readFileSync(join(here, '..', 'index.tsx'), 'utf8');
const cssSrc = readFileSync(join(here, '../../../../../theme/components.css'), 'utf8');
const promptEditorSrc = readFileSync(join(here, '../../../PromptTokenEditor/PromptTokenEditor.tsx'), 'utf8');
const promptEditorCss = readFileSync(join(here, '../../../PromptTokenEditor/promptTokenEditor.css'), 'utf8');

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

test('VoicePickerDialog：试听安全（原生 Audio 加载官方 CDN 样音，零 fetch / TTS 请求）', () => {
  // Issue #771 / Issue #923：火山官方公开 CDN 样音 URL 生成与自适应候选重试
  assert.match(dialogSrc, /VOLCENGINE_SAMPLE_CDN_BASE/);
  assert.match(dialogSrc, /lf3-static\.bytednsdoc\.com/);
  assert.match(dialogSrc, /export function getVoiceSampleUrl\(voiceType: string\): string/);
  assert.match(dialogSrc, /export function getVoiceSampleCandidates\(/);
  assert.match(dialogSrc, /encodeURIComponent\(voiceType\)/);
  assert.match(dialogSrc, /new Audio\(candidateUrls\[0\]\)/);
  // 单例控制与 play/pause 切换
  assert.match(dialogSrc, /playingVoice/);
  assert.match(dialogSrc, /audioRef/);
  assert.match(dialogSrc, /useRef<HTMLAudioElement \| null>\(null\)/);
  assert.match(dialogSrc, /playingVoice === voiceType/);
  assert.match(dialogSrc, /audio\.pause\(\)/);
  assert.match(dialogSrc, /audio\.play\(\)\.catch/);
  assert.match(dialogSrc, /audio\.onended/);
  assert.match(dialogSrc, /audio\.onerror/);
  assert.match(dialogSrc, /event\.stopPropagation\(\)/);
  // 候选降级自适应
  assert.match(dialogSrc, /tryNextOrReportError/);
  // 弹窗关闭 / 组件卸载时停止播放并清理
  assert.match(dialogSrc, /if \(!open\) stopPlayback\(\)/);
  assert.match(dialogSrc, /useEffect\(\(\) => stopPlayback, \[\]\)/);
  // 加载失败兜底 Toast，绝不冒充试听
  assert.match(dialogSrc, /toast\.info\('该音色暂无官方试听音频'\)/);
  // 播放/暂停按钮状态与无障碍文案
  assert.match(dialogSrc, /wf-voice-picker__preview--playing/);
  assert.match(dialogSrc, /暂停试听/);
  assert.match(dialogSrc, /Pause\s+size=\{12\}/);
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
  // Issue #746：右下角唯一字符统计由 PromptTokenEditor 内置 meta-bar 承载，
  // 外部 wf-config-panel__char-counter / wf-audio-char-counter 已移除，杜绝 0/0/10000 重叠。
  assert.doesNotMatch(configSrc, /wf-config-panel__char-counter/);
  assert.doesNotMatch(configSrc, /wf-audio-char-counter/);
  assert.match(configSrc, /resolveAudioPromptGate/);
  assert.match(configSrc, /AUDIO_PROMPT_MAX_CHARS/);
  assert.match(configSrc, /maxLength=\{audioPromptGate \? AUDIO_PROMPT_MAX_CHARS : undefined\}/);
  assert.match(configSrc, /countOverride=\{audioPromptGate \? audioPromptGate\.count : undefined\}/);
  assert.match(configSrc, /朗读正文不能超过/);
  // 超限进入生成门禁
  assert.match(configSrc, /audioPromptGate\?\.exceeded/);
  // 内置 meta-bar 承载唯一计数与超限红色高亮
  assert.match(promptEditorSrc, /countOverride/);
  assert.match(promptEditorSrc, /wf-prompt-token-meta-count--exceeded/);
  assert.match(promptEditorCss, /\.wf-prompt-token-meta-count--exceeded/);
});

test('ConfigPanel T04：底栏 VoiceTrigger 唤起弹窗并写回 params.voice', () => {
  assert.match(configSrc, /wf-voice-trigger/);
  assert.match(configSrc, /AudioLines/);
  assert.match(configSrc, /VoicePickerDialog/);
  // Issue #763：浮层移除后，任何音色选项都由 VoiceTrigger 承载
  assert.match(configSrc, /voiceCatalogOptions\.length > 0/);
  assert.doesNotMatch(configSrc, /VOICE_PICKER_MIN_OPTIONS/);
  assert.match(configSrc, /setVoicePickerOpen\(true\)/);
  assert.match(configSrc, /updateParam\('voice', voiceType\)/);
  assert.match(configSrc, /setVoicePickerOpen\(false\)/);
});

test('样式门禁：新增源码零 raw hex/rgba、零违禁 tokens', () => {
  const colorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
  for (const [name, src] of [
    ['VoicePickerDialog', dialogSrc],
    ['voicePickerModel', modelSrc],
  ]) {
    const code = stripComments(src);
    assert.doesNotMatch(code, colorRe, `${name} must not use raw hex/rgba`);
    assert.doesNotMatch(code, /--omx-/, `${name} must not use banned tokens`);
  }
  // CSS：音色相关块使用 --wb-* / --dsw-* tokens
  assert.match(cssSrc, /wf-voice-picker-modal/);
  assert.match(cssSrc, /wf-voice-trigger/);
  // Issue #771：试听播放中激活态样式存在且无裸色
  assert.match(cssSrc, /\.wf-voice-picker__preview--playing/);
  // Issue #746：外部重叠计数样式已移除，超限高亮收编进 PromptTokenEditor meta-bar
  assert.doesNotMatch(cssSrc, /\.wf-config-panel__char-counter/);
  assert.match(promptEditorCss, /\.wf-prompt-token-meta-count--exceeded/);
  assert.doesNotMatch(cssSrc, /--omx-/);
  assert.doesNotMatch(promptEditorCss, /--omx-/);
});
