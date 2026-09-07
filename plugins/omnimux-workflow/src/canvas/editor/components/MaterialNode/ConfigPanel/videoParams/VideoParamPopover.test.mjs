/**
 * Source-contract tests for the T04 TriggerBar / Portal Popover / CSS style system.
 * （2026-09-07 配置面板 UI 收敛：32px / 8px 几何铁律版）
 *
 * 参照仓库 configPanelExpand.test.mjs 与同目录 *.test.mjs 的源码断言风格
 * （readFileSync + node:test），对：
 * 1. VideoTriggerBar.tsx —— 摘要触发条结构契约（32/8、CSS 竖线分隔、折叠协议、14px 图标）；
 * 2. VideoParamPopover.tsx —— React Portal 浮层外壳结构契约（定位/监听/关闭/隔离）；
 * 3. components.css 新增样式块 —— 类名覆盖、overflow-y:auto、32px/8px 几何、
 *    brand-primary 选中描边、focus-visible 焦点环、Choice Tile / Compact Toggle 新控件；
 *    禁止裸色字面量与私有 token 岛。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const triggerSrc = readFileSync(join(here, 'VideoTriggerBar.tsx'), 'utf8');
const popoverSrc = readFileSync(join(here, 'VideoParamPopover.tsx'), 'utf8');
const cssSrc = readFileSync(join(here, '../../../../../theme/components.css'), 'utf8');

// 提取本次新增的视频参数样式块（从注释分区标题到文件末尾）
const BLOCK_MARKER = '视频参数配置面板 (Video Param Popover / TriggerBar)';
const blockStart = cssSrc.indexOf(BLOCK_MARKER);
assert.ok(blockStart !== -1, 'components.css 应包含新增样式块分区标题');
const videoCssBlock = cssSrc.slice(blockStart);

// 从样式块中切出指定根规则（精确到第一个闭合大括号）
function extractRuleBlock(selector) {
  const start = videoCssBlock.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `应包含 ${selector} 规则`);
  const end = videoCssBlock.indexOf('}', start);
  assert.notEqual(end, -1, `应能定位 ${selector} 规则结束`);
  return videoCssBlock.slice(start, end + 1);
}

test('VideoTriggerBar 根触发条类名与打开/禁用态', () => {
  assert.match(triggerSrc, /wf-video-trigger-bar/);
  assert.match(triggerSrc, /wf-video-trigger-bar--open/);
  // 根为 <button type="button">，disabled + aria-disabled 禁用态
  assert.match(triggerSrc, /<button\s+type="button"/);
  assert.match(triggerSrc, /disabled=\{disabled\}/);
  assert.match(triggerSrc, /aria-disabled=\{disabled\}/);
  // dialog 语义
  assert.match(triggerSrc, /aria-haspopup="dialog"/);
  assert.match(triggerSrc, /aria-expanded=\{isOpen\}/);
});

test('VideoTriggerBar 消费 formatVideoSummary / collapseSummary 与 14px 图标，无中点分隔节点', () => {
  assert.match(triggerSrc, /formatVideoSummary/);
  // 折叠协议纯函数接入（ResizeObserver 测量 → collapseSummary）
  assert.match(triggerSrc, /collapseSummary/);
  assert.match(triggerSrc, /ResizeObserver/);
  // 图标统一 14px（废除 11/12 混用）
  assert.match(triggerSrc, /AspectRatioIcon\s+ratio=\{params\.aspectRatio\}\s+size=\{14\}/);
  assert.match(triggerSrc, /ChevronDown\s+size=\{14\}/);
  assert.match(triggerSrc, /Clock\s+size=\{14\}/);
  assert.match(triggerSrc, /Volume2\s+size=\{14\}/);
  // 摘要超长省略与 title 提示
  assert.match(triggerSrc, /title=\{summary\.fullText\}/);
  assert.match(triggerSrc, /wf-video-trigger-bar__chevron/);
  // 段间分隔由 CSS 竖线承担：无 __dot 类名、源码无「·」字符节点
  assert.doesNotMatch(triggerSrc, /wf-video-trigger-bar__dot/);
  assert.doesNotMatch(triggerSrc, /·/);
  // 语义化分隔槽位类名
  assert.match(triggerSrc, /wf-video-trigger-bar__slot/);
});

test('VideoParamPopover 采用 createPortal 挂载到 document.body 且非浏览器环境不渲染', () => {
  assert.match(popoverSrc, /createPortal/);
  assert.match(popoverSrc, /document\.body/);
  assert.match(popoverSrc, /typeof document === 'undefined'/);
  assert.match(popoverSrc, /!isOpen \|\| typeof document === 'undefined'/);
});

test('VideoParamPopover 消费 calculatePopoverPosition 并写入 fixed 定位', () => {
  assert.match(popoverSrc, /calculatePopoverPosition/);
  assert.match(popoverSrc, /getBoundingClientRect\(\)/);
  assert.match(popoverSrc, /window\.innerWidth/);
  assert.match(popoverSrc, /window\.innerHeight/);
  assert.match(popoverSrc, /position:\s*'fixed'/);
  assert.match(popoverSrc, /left:/);
  assert.match(popoverSrc, /maxHeight:/);
  assert.match(popoverSrc, /width:/);
});

test('VideoParamPopover 注册并注销 resize / 捕获 scroll 监听', () => {
  assert.match(popoverSrc, /addEventListener\('resize'/);
  assert.match(popoverSrc, /removeEventListener\('resize'/);
  assert.match(popoverSrc, /addEventListener\('scroll'/);
  assert.match(popoverSrc, /removeEventListener\('scroll'/);
  assert.match(popoverSrc, /capture:\s*true/);
  assert.match(popoverSrc, /passive:\s*true/);
});

test('VideoParamPopover Escape 与外部点击（捕获阶段 mousedown）关闭', () => {
  assert.match(popoverSrc, /addEventListener\('mousedown'/);
  assert.match(popoverSrc, /addEventListener\('keydown'/);
  assert.match(popoverSrc, /e\.key === 'Escape'/);
  assert.match(popoverSrc, /onClose\(\)/);
  assert.match(popoverSrc, /removeEventListener\('mousedown'/);
  assert.match(popoverSrc, /removeEventListener\('keydown'/);
  // 目标在面板或触发器内时不关闭
  assert.match(popoverSrc, /panelRef\.current\?\.contains/);
  assert.match(popoverSrc, /triggerRef\.current\?\.contains/);
});

test('VideoParamPopover 事件隔离：nowheel nodrag 与 stopPropagation', () => {
  assert.match(popoverSrc, /nowheel nodrag/);
  assert.match(popoverSrc, /onWheel=\{\(e\) => e\.stopPropagation\(\)\}/);
  assert.match(popoverSrc, /onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}/);
  // role=dialog 语义
  assert.match(popoverSrc, /role="dialog"/);
});

test('VideoParamPopover 滚动容器与分区条件渲染（清晰度+有声同质量行）', () => {
  assert.match(popoverSrc, /wf-video-param-popover__scrollable/);
  assert.match(popoverSrc, /wf-video-param-popover__section/);
  assert.match(popoverSrc, /wf-video-param-popover__section-title/);
  // 分区标题（微文案：「有声视频」→「有声」）
  assert.match(popoverSrc, /生成方式/);
  assert.match(popoverSrc, /比例/);
  assert.match(popoverSrc, /清晰度/);
  assert.match(popoverSrc, /时长/);
  assert.match(popoverSrc, /有声/);
  assert.doesNotMatch(popoverSrc, /有声视频/);
  // 清晰度与有声同一质量行（field-row 语义，禁止通栏 section）
  assert.match(popoverSrc, /wf-video-param-popover__quality-row/);
  assert.match(popoverSrc, /wf-video-param-popover__quality-field/);
  // 条件渲染：清晰度 / 时长仅在存在选项时渲染
  assert.match(popoverSrc, /resolutionOptions\.length > 0/);
  assert.match(popoverSrc, /durationOptions\.length > 0/);
  // 有声仅在支持音效时渲染
  assert.match(popoverSrc, /params\.hasSoundSupport/);
  // 各子控件消费 onParamChange 透传（W2：写 operation，不写 generationMode）
  assert.match(popoverSrc, /onParamChange\('operation'/);
  assert.doesNotMatch(popoverSrc, /onParamChange\('generationMode'/);
  assert.match(popoverSrc, /onParamChange\('aspectRatio'/);
  assert.match(popoverSrc, /onParamChange\('resolution'/);
  assert.match(popoverSrc, /onParamChange\('duration'/);
  assert.match(popoverSrc, /onParamChange\('sound'/);
  // 消费既有子控件（W2：OperationSegment）
  assert.match(popoverSrc, /OperationSegment/);
  assert.match(popoverSrc, /AspectCardGrid/);
  assert.match(popoverSrc, /ResolutionSegment/);
  assert.match(popoverSrc, /DurationGrid/);
  assert.match(popoverSrc, /SoundSwitchSegment/);
  // mode section 受 showModeUi 门控
  assert.match(popoverSrc, /showModeUi/);
  assert.doesNotMatch(popoverSrc, /supportedRoles=\{modelItem/);
});

test('components.css 覆盖全部视频参数类名规则', () => {
  for (const cls of [
    '.wf-video-trigger-bar',
    '.wf-video-trigger-bar__slot',
    '.wf-video-trigger-bar__chevron',
    '.wf-video-trigger-bar--open',
    '.wf-video-param-popover',
    '.wf-video-param-popover__scrollable',
    '.wf-video-param-popover__section',
    '.wf-video-param-popover__section-title',
    '.wf-video-param-popover__quality-row',
    '.wf-video-seg',
    '.wf-video-seg__item',
    '.wf-video-seg__item--active',
    '.wf-video-choice-tile',
    '.wf-video-choice-tile--active',
    '.wf-video-compact-toggle',
    '.wf-video-aspect-grid',
    '.wf-video-aspect-card',
    '.wf-video-aspect-card--active',
    '.wf-video-duration-grid',
    '.wf-video-duration-pill',
    '.wf-video-duration-pill--active',
  ]) {
    assert.ok(videoCssBlock.includes(cls), `components.css 应包含规则 ${cls}`);
  }
});

test('components.css 新样式块含 overflow-y:auto 与关键设计规格（32/8 铁律）', () => {
  assert.match(videoCssBlock, /overflow-y:\s*auto/);
  assert.match(videoCssBlock, /scrollbar-width:\s*thin/);
  // 触发条规格：32px 高 / 圆角 8px / padding 0 8px 0 10px / max-width 100%
  assert.match(videoCssBlock, /\.wf-video-trigger-bar \{[\s\S]*?height:\s*32px/);
  assert.match(videoCssBlock, /\.wf-video-trigger-bar \{[\s\S]*?border-radius:\s*8px/);
  assert.match(videoCssBlock, /\.wf-video-trigger-bar \{[\s\S]*?padding:\s*0\s+8px\s+0\s+10px/);
  assert.match(videoCssBlock, /\.wf-video-trigger-bar \{[\s\S]*?max-width:\s*100%/);
  // 废除旧几何：触发条根规则内禁止 28px / 999px / 260px
  const triggerRule = extractRuleBlock('.wf-video-trigger-bar');
  assert.doesNotMatch(triggerRule, /28px|999px|260px/);
  // 触发条 open 态 brand 描边 + focus-visible 焦点环 + 按压 scale
  assert.match(videoCssBlock, /\.wf-video-trigger-bar--open \{[\s\S]*?brand-primary/);
  assert.match(videoCssBlock, /\.wf-video-trigger-bar:focus-visible \{[\s\S]*?state-business-tertiary/);
  assert.match(videoCssBlock, /\.wf-video-trigger-bar:active \{[\s\S]*?scale\(0\.96\)/);
  // 段间 CSS 竖线分隔（废除 __dot 与「·」字符）
  assert.doesNotMatch(videoCssBlock, /\.wf-video-trigger-bar__dot/);
  assert.match(videoCssBlock, /\.wf-video-trigger-bar__slot \+ \.wf-video-trigger-bar__slot::before/);
  // chevron 过渡与 open 态旋转
  assert.match(videoCssBlock, /\.wf-video-trigger-bar__chevron \{[\s\S]*?transition:\s*transform 150ms/);
  assert.match(videoCssBlock, /\.wf-video-trigger-bar--open \.wf-video-trigger-bar__chevron \{[\s\S]*?rotate\(180deg\)/);
  // 浮层规格：圆角 12px / padding 12px 16px / zIndex 9999 / blur(20px) / 宽夹紧 min(360, 100vw-24)
  assert.match(videoCssBlock, /\.wf-video-param-popover \{[\s\S]*?border-radius:\s*12px/);
  assert.match(videoCssBlock, /\.wf-video-param-popover \{[\s\S]*?padding:\s*12px\s+16px/);
  assert.match(videoCssBlock, /\.wf-video-param-popover \{[\s\S]*?z-index:\s*9999/);
  assert.match(videoCssBlock, /\.wf-video-param-popover \{[\s\S]*?max-width:\s*calc\(100vw - 24px\)/);
  assert.match(videoCssBlock, /backdrop-filter:\s*blur\(20px\)/);
  // 入场位移随 placement 同向（top 从下方 4px 长出）
  assert.match(videoCssBlock, /wf-video-popover-in-top[\s\S]*?translateY\(4px\)/);
  // 分段容器 32px 高、item nowrap、激活 brand 描边
  assert.match(videoCssBlock, /\.wf-video-seg \{[\s\S]*?height:\s*32px/);
  assert.match(videoCssBlock, /\.wf-video-seg__item \{[\s\S]*?white-space:\s*nowrap/);
  assert.match(videoCssBlock, /\.wf-video-seg__item--active \{[\s\S]*?brand-primary/);
  // Choice Tile：高 36px / nowrap + keep-all / 激活 brand 描边
  assert.match(videoCssBlock, /\.wf-video-choice-tile \{[\s\S]*?height:\s*36px/);
  assert.match(videoCssBlock, /\.wf-video-choice-tile \{[\s\S]*?white-space:\s*nowrap/);
  assert.match(videoCssBlock, /\.wf-video-choice-tile \{[\s\S]*?word-break:\s*keep-all/);
  assert.doesNotMatch(extractRuleBlock('.wf-video-choice-tile'), /break-all/);
  assert.match(videoCssBlock, /\.wf-video-choice-tile--active \{[\s\S]*?brand-primary/);
  // Compact Toggle：160px 定宽（禁止通栏）
  assert.match(videoCssBlock, /\.wf-video-compact-toggle \{[\s\S]*?width:\s*160px/);
  // 画幅网格 4 列、卡片 56px、激活 brand 描边、标签 12px
  assert.match(videoCssBlock, /\.wf-video-aspect-grid \{[\s\S]*?repeat\(4,\s*1fr\)/);
  assert.match(videoCssBlock, /\.wf-video-aspect-card \{[\s\S]*?height:\s*56px/);
  assert.match(videoCssBlock, /\.wf-video-aspect-card--active \{[\s\S]*?brand-primary/);
  assert.match(videoCssBlock, /\.wf-video-aspect-card__label \{[\s\S]*?font-size:\s*12px/);
  // 时长胶囊 32px / 8px（废除 28px / 999px）、激活 brand 描边
  assert.match(videoCssBlock, /\.wf-video-duration-pill \{[\s\S]*?height:\s*32px/);
  assert.match(videoCssBlock, /\.wf-video-duration-pill \{[\s\S]*?border-radius:\s*8px/);
  assert.match(videoCssBlock, /\.wf-video-duration-pill--active \{[\s\S]*?brand-primary/);
  const pillRule = extractRuleBlock('.wf-video-duration-pill');
  assert.doesNotMatch(pillRule, /28px|999px/);
  // 时长网格 minmax(56px, 1fr)
  assert.match(videoCssBlock, /\.wf-video-duration-grid \{[\s\S]*?minmax\(56px,\s*1fr\)/);
  // 禁用态铁律
  assert.match(videoCssBlock, /opacity:\s*0\.35/);
  assert.match(videoCssBlock, /cursor:\s*not-allowed/);
  // 焦点环出现在可点击控件族
  assert.match(videoCssBlock, /:focus-visible/);
});

test('components.css popover 根直接消费 DSH 原生浮层 token', () => {
  const rootBlock = extractRuleBlock('.wf-video-param-popover');
  assert.match(rootBlock, /background:\s*var\(--dsw-alias-bg-elevated\)/);
  assert.match(rootBlock, /border:\s*1px solid var\(--dsw-alias-border-l2\)/);
  assert.match(rootBlock, /backdrop-filter:\s*blur\(20px\)/);
});

test('components.css 视频参数块无私有 token 岛和裸色字面量', () => {
  const bareColorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
  const hits = videoCssBlock
    .split('\n')
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => bareColorRe.test(line))
    .map(({ line, i }) => `line ${i + 1}: ${line.trim()}`);
  assert.deepEqual(hits, [], `视频参数样式禁止裸色字面量，发现：\n${hits.join('\n')}`);
  assert.doesNotMatch(videoCssBlock, /--wf-vp-/);
  assert.match(videoCssBlock, /var\(--dsw-alias-/);
});

test('高级参数与范围时长控件使用正式类名', () => {
  for (const selector of [
    '.wf-video-param-popover__range-row',
    '.wf-video-param-popover__field-row',
    '.wf-video-param-popover__input',
    '.wf-video-param-popover__select',
  ]) {
    assert.ok(videoCssBlock.includes(selector), `应包含规则 ${selector}`);
  }
});
