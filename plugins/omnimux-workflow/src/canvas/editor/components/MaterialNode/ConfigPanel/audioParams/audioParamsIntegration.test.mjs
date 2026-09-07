/**
 * audioParams 集成契约测试（2026-09-07 全模态收敛 / T05 + T06）。
 *
 * 源码契约（readFileSync + node:test）锁定：
 *  - AudioTriggerBar 消费 CfgSummaryBar + AUDIO_COLLAPSE_ORDER，
 *    槽位 mode/format/duration/chevron，duration 走 ellipsis；
 *  - AudioParamPopover 消费 CfgPopoverShell + CfgDurationGrid/CustomSlider/
 *    CustomSelect/CfgCompactToggle，schema-driven 显隐，无 1–60 硬编码；
 *  - 写路径先 assertAudioParamWriteKey；
 *  - ConfigPanel 宿主：音频（非 ASR）无 SlidersHorizontal 齿轮、无 advanced-drawer；
 *    ASR 不挂载摘要条（isAsrTool 分支）。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const triggerSrc = readFileSync(join(here, 'AudioTriggerBar.tsx'), 'utf8');
const popoverSrc = readFileSync(join(here, 'AudioParamPopover.tsx'), 'utf8');
const adapterSrc = readFileSync(join(here, 'audioParamAdapter.ts'), 'utf8');
const configSrc = readFileSync(join(here, '..', 'index.tsx'), 'utf8');

test('AudioTriggerBar 消费 CfgSummaryBar 与 AUDIO_COLLAPSE_ORDER，槽位契约锁定', () => {
  assert.match(triggerSrc, /CfgSummaryBar/);
  assert.match(triggerSrc, /AUDIO_COLLAPSE_ORDER/);
  assert.match(triggerSrc, /formatAudioSummary/);
  assert.match(triggerSrc, /Clock\s+size=\{14\}/);
  assert.match(triggerSrc, /ChevronDown\s+size=\{14\}/);
  // 音频槽位：mode → format → duration → chevron；duration 走 ellipsis 尽量保留
  assert.match(triggerSrc, /push\('mode'/);
  assert.match(triggerSrc, /push\('format'/);
  assert.match(triggerSrc, /push\('duration', summary\.durationText, <Clock[\s\S]*?'ellipsis'\)/);
  assert.match(triggerSrc, /dropPolicy: 'never'/);
  assert.doesNotMatch(triggerSrc, /·/);
});

test('AudioParamPopover 消费 cfg 控件族，schema-driven 显隐，无 1–60 硬编码', () => {
  assert.match(popoverSrc, /CfgPopoverShell/);
  assert.match(popoverSrc, /CfgDurationGrid/);
  assert.match(popoverSrc, /CustomSlider/);
  assert.match(popoverSrc, /CustomSelect/);
  assert.match(popoverSrc, /CfgCompactToggle/);
  assert.match(popoverSrc, /assertAudioParamWriteKey\(key\)/);
  // 时长：options → pills；range 且无 options → slider（options 优先）
  assert.match(popoverSrc, /durationOptions\.length > 0/);
  assert.match(popoverSrc, /durationRange/);
  // 音色 ≥6 → Select
  assert.match(popoverSrc, /VOICE_SELECT_THRESHOLD = 6/);
  // 纯音乐显隐看 schema（hasInstrumentalSupport）
  assert.match(popoverSrc, /params\.hasInstrumentalSupport/);
  // 分区标题
  assert.match(popoverSrc, /生成方式/);
  assert.match(popoverSrc, /时长/);
  assert.match(popoverSrc, /音色/);
  assert.match(popoverSrc, /纯音乐/);
  // 无 1–60 硬编码上限、无原生 select、无 JS 主题分支
  assert.doesNotMatch(popoverSrc, /max=\{?60\}?/);
  assert.doesNotMatch(popoverSrc, /<select/);
  assert.doesNotMatch(popoverSrc, /isDark|theme\s*===|matchMedia/);
  assert.match(popoverSrc, /showModeUi/);
});

test('audioParamAdapter 不调用视频过渡，instrumental 显隐真源是 schema 而非 operation id', () => {
  assert.doesNotMatch(adapterSrc, /buildVideoParamTransition/);
  assert.doesNotMatch(adapterSrc, /onUpdateNodeData/);
  assert.match(adapterSrc, /outputType: 'audio'/);
  assert.match(adapterSrc, /schema\.instrumental\?\.supported/);
  assert.doesNotMatch(adapterSrc, /selectedOperationId === 'text_to_music'/);
  assert.match(adapterSrc, /assertAudioParamWriteKey/);
});

test('ConfigPanel 音频分支：无齿轮、无抽屉；ASR（isAsrTool）不挂摘要条', () => {
  assert.doesNotMatch(configSrc, /SlidersHorizontal/);
  assert.doesNotMatch(configSrc, /advanced-drawer/);
  assert.doesNotMatch(configSrc, /showAdvanced/);
  // 音频摘要条仅在非 ASR 挂载
  assert.match(configSrc, /materialType === 'audio' && !isAsrTool && audioEffectiveParams/);
  // ASR 仍走 isAsrTool 分支（无参数摘要）
  assert.match(configSrc, /isAsrTool/);
});
