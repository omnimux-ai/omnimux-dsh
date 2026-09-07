/**
 * Source-contract tests for the T03 Popover param sub-components.
 *
 * 参照同目录 viewportPositioner.test.mjs 与仓库 configPanelExpand.test.mjs 的源码断言风格
 * （readFileSync + node:test），对三个 .tsx 组件做静态源码契约校验：
 * 1. 消费矢量 SVG / lucide 图标，无 Emoji、无原生 <select>；
 * 2. AspectCardGrid 含 4 列网格类名与 wf-video-aspect-card 结构；
 * 3. SegmentControls 生成方式分段含 supportedRoles 禁用逻辑与双模式文案；
 * 4. DurationGrid 含 wf-video-duration-pill 与 onChange 透传；
 * 5. 无硬编码裸色 hex/rgba 字面量（SVG viewBox 等几何数值除外）。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const segmentSrc = readFileSync(join(here, 'SegmentControls.tsx'), 'utf8');
const aspectSrc = readFileSync(join(here, 'AspectCardGrid.tsx'), 'utf8');
const durationSrc = readFileSync(join(here, 'DurationGrid.tsx'), 'utf8');

const sources = { segmentSrc, aspectSrc, durationSrc };

test('三个分段组件均消费矢量 SVG / lucide 图标，无 Emoji、无原生 select', () => {
  // 画幅卡片网格消费 AspectRatioIcon
  assert.match(aspectSrc, /AspectRatioIcon/);
  // 有声/无声分段消费 lucide 图标
  assert.match(segmentSrc, /Volume2/);
  assert.match(segmentSrc, /VolumeX/);
  // 无原生 <select>（严格遵守 Popover 下拉规范）
  for (const src of Object.values(sources)) {
    assert.doesNotMatch(src, /<select/);
  }
  // 无 Emoji（禁止用表情符号代替矢量图标）
  const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  for (const src of Object.values(sources)) {
    assert.doesNotMatch(src, emojiRe);
  }
});

test('AspectCardGrid 采用 4 列网格类名与 wf-video-aspect-card 卡片结构', () => {
  assert.match(aspectSrc, /wf-video-aspect-grid/);
  assert.match(aspectSrc, /grid-template-columns:\s*repeat\(4,\s*1fr\)/);
  assert.match(aspectSrc, /wf-video-aspect-card/);
  assert.match(aspectSrc, /wf-video-aspect-card--active/);
  // 上部消费 AspectRatioIcon（size 24），下部为 label
  assert.match(aspectSrc, /AspectRatioIcon\s+ratio=\{opt\.value\}\s+size=\{24\}/);
  // 点击透传 onChange(opt.value)
  assert.match(aspectSrc, /onChange\(opt\.value\)/);
});

test('SegmentControls operation 分段消费 effective operations；≤1 隐藏；无 hardcoded dual-button', () => {
  assert.match(segmentSrc, /OperationSegment/);
  assert.match(segmentSrc, /operations\.length <= 1/);
  // 旧 dual-button 已收口
  assert.doesNotMatch(segmentSrc, /value:\s*'reference'/);
  assert.doesNotMatch(segmentSrc, /value:\s*'first_last_frame'/);
  assert.doesNotMatch(segmentSrc, /'全能参考'/);
  // 通用分段类名
  assert.match(segmentSrc, /wf-video-seg/);
  // 分辨率只读提示
  assert.match(segmentSrc, /当前模型仅支持此分辨率/);
  // 有声/无声 label（CompactToggle JSX 属性形式）
  assert.match(segmentSrc, /"有声"/);
  assert.match(segmentSrc, /"无声"/);
});

test('SegmentControls 控件选型矩阵：Operation 走 resolveControlKind，Sound 走 160px CompactToggle', () => {
  // 生成方式：长标签 / 溢出 → Choice Tile（2×N nowrap），否则 Segment
  assert.match(segmentSrc, /resolveControlKind/);
  assert.match(segmentSrc, /ChoiceTile/);
  assert.match(segmentSrc, /kind === 'choice-tile'/);
  // 有声：从通栏 Segment 降级为 CompactToggle（与清晰度同行）
  assert.match(segmentSrc, /CompactToggle/);
  assert.match(segmentSrc, /trueLabel="有声"/);
  assert.match(segmentSrc, /falseLabel="无声"/);
});

test('DurationGrid 含时长胶囊网格类与 onChange 透传', () => {
  assert.match(durationSrc, /wf-video-duration-grid/);
  assert.match(durationSrc, /wf-video-duration-pill/);
  assert.match(durationSrc, /wf-video-duration-pill--active/);
  assert.match(durationSrc, /repeat\(auto-fill,\s*minmax\(56px,\s*1fr\)\)/);
  assert.match(durationSrc, /onChange\(opt\.value\)/);
});

test('组件源码无硬编码裸色 hex/rgba 字面量', () => {
  // 除 SVG viewBox 等几何数值外，组件代码禁止直接写色值（统一交由 CSS 类名 / DSH token）
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const colorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
  for (const src of Object.values(sources)) {
    assert.doesNotMatch(stripComments(src), colorRe);
  }
});
