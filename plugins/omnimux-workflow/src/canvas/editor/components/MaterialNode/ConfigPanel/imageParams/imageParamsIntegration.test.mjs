/**
 * imageParams 集成契约测试（2026-09-07 全模态收敛 / T04 + T06）。
 *
 * 源码契约（readFileSync + node:test）锁定：
 *  - ImageTriggerBar 消费 CfgSummaryBar + IMAGE_COLLAPSE_ORDER，
 *    槽位 mode/ratio/resolution/chevron，无 duration/sound；
 *  - ImageParamPopover 消费 CfgPopoverShell + CfgAspectGrid + CfgSegment/ChoiceTile，
 *    写路径先 assertImageParamWriteKey；
 *  - 组件群不出现幽灵 Select / 原生 <select> / 裸色值 / `·` 分隔；
 *  - ConfigPanel 宿主：图像分支无 wf-param-pill--video-summary、无前置 `|`。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const triggerSrc = readFileSync(join(here, 'ImageTriggerBar.tsx'), 'utf8');
const popoverSrc = readFileSync(join(here, 'ImageParamPopover.tsx'), 'utf8');
const adapterSrc = readFileSync(join(here, 'imageParamAdapter.ts'), 'utf8');
const configSrc = readFileSync(join(here, '..', 'index.tsx'), 'utf8');

test('ImageTriggerBar 消费 CfgSummaryBar 与 IMAGE_COLLAPSE_ORDER，槽位契约锁定', () => {
  assert.match(triggerSrc, /CfgSummaryBar/);
  assert.match(triggerSrc, /IMAGE_COLLAPSE_ORDER/);
  assert.match(triggerSrc, /formatImageSummary/);
  assert.match(triggerSrc, /AspectRatioIcon\s+ratio=\{params\.aspectRatio\}\s+size=\{14\}/);
  assert.match(triggerSrc, /ChevronDown\s+size=\{14\}/);
  // 图像槽位：mode → ratio → resolution → chevron；无 duration / sound
  assert.match(triggerSrc, /push\('mode'/);
  assert.match(triggerSrc, /push\('ratio'/);
  assert.match(triggerSrc, /push\('resolution'/);
  assert.doesNotMatch(triggerSrc, /push\('duration'/);
  assert.doesNotMatch(triggerSrc, /push\('sound'/);
  assert.match(triggerSrc, /dropPolicy: 'never'/);
  assert.doesNotMatch(triggerSrc, /·/);
});

test('ImageParamPopover 消费 cfg 控件族，写路径先 assertImageParamWriteKey', () => {
  assert.match(popoverSrc, /CfgPopoverShell/);
  assert.match(popoverSrc, /CfgAspectGrid/);
  assert.match(popoverSrc, /CfgSegment/);
  assert.match(popoverSrc, /CfgChoiceTile/);
  assert.match(popoverSrc, /resolveControlKind/);
  assert.match(popoverSrc, /assertImageParamWriteKey\(key\)/);
  assert.match(popoverSrc, /writeParam\('operation', operationId\)/);
  assert.match(popoverSrc, /writeParam\('aspectRatio', v\)/);
  assert.match(popoverSrc, /writeParam\('resolution', v\)/);
  // 分区标题（硬编码中文，与视频一致）
  assert.match(popoverSrc, /生成方式/);
  assert.match(popoverSrc, /比例/);
  assert.match(popoverSrc, /清晰度/);
  // 清晰度仅在 resolution.options 存在时渲染（quality 补位）
  assert.match(popoverSrc, /resolutionOptions\.length > 0/);
  // 无幽灵 Select / 原生 select / JS 主题分支
  assert.doesNotMatch(popoverSrc, /<select/);
  assert.doesNotMatch(popoverSrc, /isDark|theme\s*===|matchMedia/);
  // mode section 受 showModeUi 门控
  assert.match(popoverSrc, /showModeUi/);
});

test('imageParamAdapter 不调用视频过渡与 pending 调整，不回写 nodeData', () => {
  const code = adapterSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.doesNotMatch(code, /buildVideoParamTransition/);
  assert.doesNotMatch(code, /pendingVideoParamAdjustment/);
  assert.doesNotMatch(code, /onUpdateNodeData/);
  assert.match(code, /outputType: 'image'/);
  assert.match(code, /assertImageParamWriteKey/);
});

test('ConfigPanel 图像分支：无幽灵 Select、无前置竖线分隔', () => {
  assert.doesNotMatch(configSrc, /wf-param-pill--video-summary/);
  assert.doesNotMatch(configSrc, /wf-param-bar__select--ghost/);
  const imageBlock = configSrc.slice(configSrc.indexOf("{materialType === 'image'"));
  assert.ok(imageBlock.includes('wf-cfg-summary-bar__wrap'), '图像分支使用摘要条包裹层');
  assert.ok(!imageBlock.includes('wf-param-pill__divider'), '图像分支不得再有前置 `|` 分隔');
});
