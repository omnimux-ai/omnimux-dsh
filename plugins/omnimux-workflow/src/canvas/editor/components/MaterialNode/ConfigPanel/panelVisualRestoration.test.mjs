/**
 * Issue #737: 还原画布配置面板（所有面板）至图 2 的极简深色一体化视觉样式回归验收测试。
 *
 * 验证核心：
 * 1. PromptTokenEditor：去边框、去内嵌灰底、font-size 14px、line-height 1.6；
 * 2. PromptTokenEditor 元数据状态栏：Copy 助手按钮、"T"、细竖线与字数统计 {count}/{max}；
 * 3. SlotWells：44px × 44px 大方圆角虚线加号框，空态绝无 refe... 截断标签文本，Plus 图标尺寸为 20；
 * 4. GenerateButton：移除“生成”汉字药丸，左侧 ✳ 60 积分点数，右侧 32x32px 方圆角发送按钮（居中纯白 ArrowUp 粗箭头）；
 * 5. 底栏排版：细竖线分隔，包含 x 1 数量/倍率标签。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const panelSrc = readFileSync(join(here, 'index.tsx'), 'utf8');
const generateBtnSrc = readFileSync(join(here, 'GenerateButton.tsx'), 'utf8');
const slotWellsSrc = readFileSync(join(here, 'SlotWells/SlotWells.tsx'), 'utf8');
const promptEditorSrc = readFileSync(join(here, '../../PromptTokenEditor/PromptTokenEditor.tsx'), 'utf8');
const promptEditorCss = readFileSync(join(here, '../../PromptTokenEditor/promptTokenEditor.css'), 'utf8');
const themeCss = readFileSync(join(here, '../../../../theme/components.css'), 'utf8');

test('TC-737-01: PromptTokenEditor 去边框去底色与排版规范', () => {
  // .wf-prompt-token-editor background 与 border 必须为 transparent / none !important
  assert.match(promptEditorCss, /\.wf-prompt-token-editor\s*\{[\s\S]*?background:\s*transparent\s*!important/);
  assert.match(promptEditorCss, /\.wf-prompt-token-editor\s*\{[\s\S]*?border:\s*none\s*!important/);
  assert.match(promptEditorCss, /\.wf-prompt-token-editor\s*\{[\s\S]*?box-shadow:\s*none\s*!important/);
  assert.match(promptEditorCss, /\.wf-prompt-token-editor\s*\{[\s\S]*?font-size:\s*14px/);
  assert.match(promptEditorCss, /\.wf-prompt-token-editor\s*\{[\s\S]*?line-height:\s*1\.6/);
});

test('TC-737-02: PromptTokenEditor 字数与元数据统计栏对齐图 2', () => {
  // 右下角渲染 meta-bar 容器
  assert.match(promptEditorSrc, /wf-prompt-token-meta-bar/);
  assert.match(promptEditorSrc, /<Copy\s+size=\{12\}/);
  assert.match(promptEditorSrc, /wf-prompt-token-meta-type/);
  assert.match(promptEditorSrc, /wf-prompt-token-meta-count/);
  // CSS 定义存在
  assert.match(promptEditorCss, /\.wf-prompt-token-meta-bar/);
  assert.match(promptEditorCss, /\.wf-prompt-token-meta-btn/);
  assert.match(promptEditorCss, /\.wf-prompt-token-meta-count/);
});

test('TC-737-03: SlotWells 空态 44px 大方圆角虚线框且绝无截断文字', () => {
  // CSS 尺寸升级为 44px，圆角 10px
  assert.match(themeCss, /\.wf-slot-well\s*\{[\s\S]*?width:\s*44px/);
  assert.match(themeCss, /\.wf-slot-well\s*\{[\s\S]*?height:\s*44px/);
  assert.match(themeCss, /\.wf-slot-well\s*\{[\s\S]*?border-radius:\s*10px/);
  // 空态强制隐藏文字标签
  assert.match(themeCss, /\.wf-slot-well--empty\s+\.wf-slot-well__label\s*\{[\s\S]*?display:\s*none\s*!important/);
  // SlotWells.tsx 中彻底移除文字浮层，保持纯净预览（Issue #755）
  assert.doesNotMatch(slotWellsSrc, /<span className="wf-slot-well__label">/);
  // 加号 Plus 图标尺寸升级至 20
  assert.match(slotWellsSrc, /<Plus\s+size=\{20\}/);
});

test('TC-737-04: GenerateButton 极简深色一体化（去汉字，圆形白色 ArrowUp 发送按钮）', () => {
  // 不再渲染冗余汉字 label
  assert.doesNotMatch(generateBtnSrc, /<span className="wf-generate-btn__label">/);
  // 采用 ArrowUp 图标
  assert.match(generateBtnSrc, /<ArrowUp\s+size=\{16\}\s+strokeWidth=\{2\.5\}/);
  // 不再展示积分点数
  assert.doesNotMatch(generateBtnSrc, /wf-generate-btn__cost/);
  // CSS 中定义了 32px 圆形发送按钮
  assert.match(themeCss, /\.wf-generate-btn__send\s*\{[\s\S]*?width:\s*32px/);
  assert.match(themeCss, /\.wf-generate-btn__send\s*\{[\s\S]*?height:\s*32px/);
  assert.match(themeCss, /\.wf-generate-btn__send\s*\{[\s\S]*?border-radius:\s*999px/);
});

test('TC-737-05: 底栏排版与全模态覆盖一致性', () => {
  // 底栏不再展示生成数量标签 x 1
  assert.doesNotMatch(panelSrc, /wf-config-panel__batch-tag/);
  // 摘要条包裹层前置细竖线
  assert.match(themeCss, /\.wf-cfg-summary-bar__wrap::before/);
  // ConfigPanel 不再传递 creditCost 给 GenerateButton
  assert.doesNotMatch(panelSrc, /creditCost=/);
});
