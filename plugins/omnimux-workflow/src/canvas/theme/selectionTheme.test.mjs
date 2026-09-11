/**
 * selectionTheme.test.mjs
 * 契约测试：
 * 1. 鼠标框选（全选）样式使用品牌视觉紫色（对齐设计参考，实线描边）
 * 2. 多选后包裹框及各类选中态切换为 DSH 黑白主题色（--wb-node-ring / 中性黑白，杜绝蓝色残留）
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const themeCss = readFileSync(join(here, 'workbench-theme.css'), 'utf8');
const componentsCss = readFileSync(join(here, 'components.css'), 'utf8');
const tableNodeCss = readFileSync(join(here, 'table-node.css'), 'utf8');

function extractRule(src, selector) {
  const needle = `${selector} {`;
  const start = src.indexOf(needle);
  assert.ok(start >= 0, `缺少选择器 ${selector}`);
  let i = start + needle.length;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  assert.ok(depth === 0, `${selector} 规则体未闭合`);
  return src.slice(start, i);
}

describe('Canvas Selection & Multi-select Theme Alignment (Issue #1229)', () => {
  it('REQ-WF-SELECTION-MARQUEE-PURPLE: 鼠标框选声明品牌视觉紫色 Token 且在深浅主题中自适应', () => {
    // 浅色模式声明品牌紫色边框与背景 Token
    assert.match(
      themeCss,
      /--wb-selection-marquee-border:\s*var\(--dsw-alias-brand-purple,\s*#7961f2\);/,
      '默认浅色模式应使用品牌电紫 #7961f2',
    );
    assert.match(
      themeCss,
      /--wb-selection-marquee-bg:\s*color-mix\(in srgb,\s*var\(--wb-selection-marquee-border\)\s+8%,\s*transparent\);/,
      '浅色模式背景为柔和紫色半透明',
    );

    // 深色模式声明香芋浅紫 / 极光紫 #978fd8 翻转
    assert.match(
      themeCss,
      /body\[data-ds-dark-theme\]\s+\.wf-canvas-root[\s\S]*?--wb-selection-marquee-border:\s*var\(--dsw-alias-brand-purple,\s*#978fd8\);/,
      '深色模式应自适应翻转至参考图实测香芋紫 #978fd8',
    );
  });

  it('REQ-WF-SELECTION-MARQUEE-STYLE: 鼠标框选 .react-flow__selection 使用紫色实线描边，不得使用虚线', () => {
    const selectionRule = extractRule(themeCss, '.wf-canvas-root .react-flow__selection');
    assert.match(
      selectionRule,
      /border:\s*1px solid var\(--wb-selection-marquee-border\);/,
      '全选框必须使用 1px solid 实线描边（对齐参考图）',
    );
    assert.match(
      selectionRule,
      /background:\s*var\(--wb-selection-marquee-bg\);/,
      '全选框必须使用品牌视觉紫色背景 Token',
    );
    assert.doesNotMatch(selectionRule, /dashed/, '全选框严禁残留旧版 dashed 虚线');
  });

  it('REQ-WF-SELECTION-RECT-MONOCHROME: 多选包裹框 .react-flow__nodesselection-rect 接入 DSH 黑白主题', () => {
    const rectRule = extractRule(themeCss, '.wf-canvas-root .react-flow__nodesselection-rect');
    assert.match(
      rectRule,
      /border:\s*1px solid var\(--wb-node-ring\);/,
      '多选包裹框边框必须使用 --wb-node-ring 黑白主题色',
    );
    assert.match(
      rectRule,
      /background:\s*color-mix\(in srgb,\s*var\(--wb-node-ring\)\s+4%,\s*transparent\);/,
      '多选包裹框背景必须使用 --wb-node-ring 微透明黑白底色',
    );
    assert.doesNotMatch(rectRule, /--wb-accent/, '多选包裹框严禁引用 --wb-accent 蓝色');
    assert.doesNotMatch(rectRule, /#4176E6|#679EFE|#3b82f6|rgba\(0,\s*89,\s*220/, '多选包裹框不得包含任何蓝色代码');
  });

  it('REQ-WF-SELECTION-EDGE-MONOCHROME: 连线选中态使用 --wb-node-ring，杜绝蓝色高亮', () => {
    const selectedEdgeRule = extractRule(
      themeCss,
      '.wf-canvas-root .react-flow__edge.selected .react-flow__edge-path',
    );
    assert.match(
      selectedEdgeRule,
      /stroke:\s*var\(--wb-node-ring\);/,
      '选中边的描边必须使用 --wb-node-ring 黑白主题色',
    );
    assert.doesNotMatch(selectedEdgeRule, /var\(--wb-accent\)/, '选中边不得使用 --wb-accent');
  });

  it('REQ-WF-SELECTION-HANDLE-MONOCHROME: 连接手柄使用 --wb-node-ring，杜绝蓝色边框与背景', () => {
    const handleRule = extractRule(themeCss, '.wf-canvas-root .react-flow__handle');
    const handleHoverRule = extractRule(themeCss, '.wf-canvas-root .react-flow__handle:hover');
    assert.match(handleRule, /border:\s*2px solid var\(--wb-node-ring\);/);
    assert.match(handleHoverRule, /background:\s*var\(--wb-node-ring\);/);
    assert.doesNotMatch(handleRule, /var\(--wb-accent\)/);
    assert.doesNotMatch(handleHoverRule, /var\(--wb-accent\)/);
  });

  it('REQ-WF-SELECTION-COMPONENTS-MONOCHROME: 组件层素材卡片与下拉选中态黑白化', () => {
    // 资源卡片 / 列表项选中态
    const pickerCardRule = extractRule(componentsCss, '.wf-picker-card--selected');
    const pickerRowRule = extractRule(componentsCss, '.wf-picker-row--selected');
    assert.match(pickerCardRule, /border-color:\s*var\(--wb-node-ring\);/);
    assert.match(pickerRowRule, /border-color:\s*var\(--wb-node-ring\);/);
    assert.doesNotMatch(pickerCardRule, /var\(--wb-accent\)/);
    assert.doesNotMatch(pickerRowRule, /var\(--wb-accent\)/);

    // 下拉选中项
    assert.doesNotMatch(
      componentsCss,
      /\.wf-custom-select-option--selected[\s\S]*?#679EFE/,
      '下拉选择项不得残留 #679EFE 蓝色',
    );
    assert.doesNotMatch(
      componentsCss,
      /\.wf-custom-select-option--selected[\s\S]*?rgba\(65,\s*118,\s*230/,
      '下拉选择项不得残留 65, 118, 230 蓝色',
    );

    // 拖拽悬停卡片
    const dragOverRule = extractRule(componentsCss, '.wf-material-node__card--dragover');
    assert.match(dragOverRule, /border-color:\s*var\(--wb-node-ring\)/);
    assert.doesNotMatch(dragOverRule, /rgba\(59,\s*130,\s*246/);
  });

  it('REQ-WF-SELECTION-TABLE-MONOCHROME: 表格行高与单元格聚焦选中态黑白化', () => {
    const rowHeightRule = extractRule(tableNodeCss, '.wf-row-height-item--selected');
    assert.match(rowHeightRule, /background:\s*color-mix\(in srgb,\s*var\(--wb-node-ring\)\s+12%,\s*transparent\);/);
    assert.doesNotMatch(rowHeightRule, /#4176E6/);

    const cellFocusRule = extractRule(tableNodeCss, '.wf-grid-cell-input:focus');
    assert.match(cellFocusRule, /box-shadow:\s*inset 0 0 0 2px var\(--wb-node-ring\);/);
    assert.doesNotMatch(cellFocusRule, /#4176E6/);
  });
});
