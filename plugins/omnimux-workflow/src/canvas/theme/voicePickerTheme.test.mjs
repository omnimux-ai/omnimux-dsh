/**
 * voicePickerTheme.test.mjs
 * #3058 PM_THEME_CORRECTION（附录 T.3）合同测试：
 * 音色弹窗仅局部恢复既有语义颜色 —— 唯一 token 链、只作用于
 * .wf-voice-picker-modal 成员与其活动期 portal 下拉，禁止裸色、
 * --wb-* 残留、新增变量或全局 modal/select 重涂。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const componentsCss = readFileSync(join(here, 'components.css'), 'utf8');

const SURFACE_CHAIN = 'var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)))';
const BORDER_CHAIN = 'var(--dsw-alias-border, var(--dsw-alias-border-l2))';

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

function extractBlock(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  assert.ok(start >= 0, `缺少区块起点 ${startNeedle}`);
  const end = src.indexOf(endNeedle, start);
  assert.ok(end > start, `缺少区块终点 ${endNeedle}`);
  return src.slice(start, end);
}

describe('Voice Picker Modal Theme Restoration (Issue #3058, PM92 APPROVED)', () => {
  it('REQ-WF-VOICE-MODAL-SURFACE: 弹窗表面/外框/正文走附录 T.3 唯一语义链，无裸色', () => {
    const modal = extractRule(componentsCss, '.wf-voice-picker-modal');
    assert.match(
      modal,
      new RegExp(`background:\\s*${SURFACE_CHAIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`),
      '弹窗背景必须是 bg-elevated→layer-1→base 回退链',
    );
    assert.match(
      modal,
      new RegExp(`border-color:\\s*${BORDER_CHAIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`),
      '弹窗外框必须是 border→border-l2 回退链',
    );
    assert.match(modal, /color:\s*var\(--dsw-alias-label-primary\);/, '弹窗默认正文色为 label-primary');
    assert.doesNotMatch(modal, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, '弹窗本体禁止裸色值');
  });

  it('REQ-WF-VOICE-MODAL-SEMANTIC-TINTS: 标题/关闭/搜索/行/预览/底栏使用核定 label/border/interactive token', () => {
    const title = extractRule(componentsCss, '.wf-voice-picker-modal .wf-modal-title');
    assert.match(title, /color:\s*var\(--dsw-alias-label-primary\);/);

    const close = extractRule(componentsCss, '.wf-voice-picker-modal .wf-modal-close');
    assert.match(close, /color:\s*var\(--dsw-alias-label-secondary\);/);
    const closeHover = extractRule(componentsCss, '.wf-voice-picker-modal .wf-modal-close:hover');
    assert.match(closeHover, /color:\s*var\(--dsw-alias-label-primary\);/);
    assert.match(closeHover, /background:\s*var\(--dsw-alias-interactive-bg-hover\);/);

    const header = extractRule(componentsCss, '.wf-voice-picker-modal .wf-modal-header');
    assert.match(header, /border-bottom-color:\s*var\(--dsw-alias-border-l1\);/);
    const footer = extractRule(componentsCss, '.wf-voice-picker-modal .wf-modal-footer');
    assert.match(footer, /border-top-color:\s*var\(--dsw-alias-border-l1\);/);

    const search = extractRule(componentsCss, '.wf-voice-picker__search');
    assert.match(search, /background:\s*var\(--dsw-alias-bg-layer-1\);/);
    assert.match(search, /color:\s*var\(--dsw-alias-label-secondary\);/);
    const searchInput = extractRule(componentsCss, '.wf-voice-picker__search input');
    assert.match(searchInput, /color:\s*var\(--dsw-alias-label-primary\);/);
    const placeholder = extractRule(componentsCss, '.wf-voice-picker__search input::placeholder');
    assert.match(placeholder, /color:\s*var\(--dsw-alias-label-tertiary\);/);

    const rowHover = extractRule(componentsCss, '.wf-voice-picker__row:hover,\n.wf-voice-picker__row:focus-visible');
    assert.match(rowHover, /background:\s*var\(--dsw-alias-interactive-bg-hover\);/);
    const rowSelected = extractRule(componentsCss, '.wf-voice-picker__row--selected,\n.wf-voice-picker__row--selected:hover');
    assert.match(rowSelected, /background:\s*var\(--dsw-alias-interactive-bg-active\);/);
    assert.match(rowSelected, /box-shadow:\s*inset 0 0 0 1px var\(--dsw-alias-brand-primary\);/);

    const preview = extractRule(componentsCss, '.wf-voice-picker__preview');
    assert.match(preview, /border:\s*1px solid var\(--dsw-alias-border-l2\);/);
    assert.match(preview, /color:\s*var\(--dsw-alias-label-secondary\);/);
    const previewHover = extractRule(componentsCss, '.wf-voice-picker__preview:hover');
    assert.match(previewHover, /color:\s*var\(--dsw-alias-label-primary\);/);
    assert.match(previewHover, /border-color:\s*var\(--dsw-alias-border-l3\);/);

    const rowName = extractRule(componentsCss, '.wf-voice-picker__row-name');
    assert.match(rowName, /color:\s*var\(--dsw-alias-label-primary\);/);
    const rowTags = extractRule(componentsCss, '.wf-voice-picker__row-tags');
    assert.match(rowTags, /color:\s*var\(--dsw-alias-label-secondary\);/);

    const emptyText = extractRule(componentsCss, '.wf-voice-picker__empty-text');
    assert.match(emptyText, /color:\s*var\(--dsw-alias-label-secondary\);/);
    const emptyClear = extractRule(componentsCss, '.wf-voice-picker__empty-clear');
    assert.match(emptyClear, /color:\s*var\(--dsw-alias-label-primary\);/);

    const selected = extractRule(componentsCss, '.wf-voice-picker__selected');
    assert.match(selected, /color:\s*var\(--dsw-alias-label-secondary\);/);
    const selectedName = extractRule(componentsCss, '.wf-voice-picker__selected-name');
    assert.match(selectedName, /color:\s*var\(--dsw-alias-label-primary\);/);
  });

  it('REQ-WF-VOICE-MODAL-FILTER-TRIGGER: 筛选触发器限定到弹窗成员，layer-1/border-l2/hover链', () => {
    const trigger = extractRule(
      componentsCss,
      '.wf-voice-picker__filters .wf-custom-select-trigger,\n.wf-voice-picker-modal .wf-voice-picker__filter',
    );
    assert.match(trigger, /background:\s*var\(--dsw-alias-bg-layer-1\);/);
    assert.match(trigger, /border-color:\s*var\(--dsw-alias-border-l2\);/);
    assert.match(trigger, /color:\s*var\(--dsw-alias-label-primary\);/);

    const chevron = extractRule(componentsCss, '.wf-voice-picker__filters .wf-custom-select-chevron');
    assert.match(chevron, /color:\s*var\(--dsw-alias-label-secondary\);/);

    const triggerHover = extractRule(componentsCss, '.wf-voice-picker__filters .wf-custom-select-trigger:hover:not(:disabled)');
    assert.match(triggerHover, /background:\s*var\(--dsw-alias-interactive-bg-hover\);/);
    assert.match(triggerHover, /border-color:\s*var\(--dsw-alias-border-l3\);/);
  });

  it('REQ-WF-VOICE-MODAL-PORTAL-SCOPED: portal 下拉仅在音色弹窗活动时重涂，且同色链', () => {
    const dropdown = extractRule(
      componentsCss,
      'body:has(.wf-voice-picker-modal) > .wf-custom-select-dropdown',
    );
    assert.match(
      dropdown,
      new RegExp(`background:\\s*${SURFACE_CHAIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`),
    );
    assert.match(
      dropdown,
      new RegExp(`border-color:\\s*${BORDER_CHAIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`),
    );

    const option = extractRule(
      componentsCss,
      'body:has(.wf-voice-picker-modal) > .wf-custom-select-dropdown .wf-custom-select-option',
    );
    assert.match(option, /color:\s*var\(--dsw-alias-label-primary\);/);
    const optionHover = extractRule(
      componentsCss,
      'body:has(.wf-voice-picker-modal) > .wf-custom-select-dropdown .wf-custom-select-option:hover',
    );
    assert.match(optionHover, /background:\s*var\(--dsw-alias-interactive-bg-hover\);/);
    const optionSelected = extractRule(
      componentsCss,
      'body:has(.wf-voice-picker-modal) > .wf-custom-select-dropdown .wf-custom-select-option--selected',
    );
    assert.match(optionSelected, /background:\s*var\(--dsw-alias-interactive-bg-active\);/);
    const check = extractRule(
      componentsCss,
      'body:has(.wf-voice-picker-modal) > .wf-custom-select-dropdown .wf-custom-select-option-check',
    );
    assert.match(check, /color:\s*var\(--dsw-alias-label-primary\);/);

    const overlay = extractRule(componentsCss, '.wf-modal-overlay:has(> .wf-voice-picker-modal)');
    assert.match(overlay, /background:\s*var\(--dsw-alias-bg-mask-1\);/);
  });

  it('REQ-WF-VOICE-MODAL-NO-ESCAPE: 限定区内无裸色/无 --wb-* 残留/不全局重涂 modal 与 select', () => {
    const voiceBlock = extractBlock(
      componentsCss,
      '/* T04：音色选择弹窗',
      '/* 3058 theme-correction end */',
    );
    assert.doesNotMatch(
      voiceBlock,
      /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/,
      '音色弹窗限定区禁止裸 hex/rgba 颜色',
    );
    assert.doesNotMatch(voiceBlock, /var\(--wb-[a-z-]+\)/, '限定区禁止 --wb-* 桥接变量残留');
    // 只允许 var() 消费既有 token；行首自定义属性声明（--foo: ...;）一律禁止
    assert.doesNotMatch(voiceBlock, /^\s+--[a-zA-Z][\w-]*\s*:/m, '限定区禁止声明新变量');

    // 全局规则不得被直接重涂：overlay/card/dropdown/option 通用类规则保持原状
    assert.doesNotMatch(
      componentsCss,
      /^\.wf-modal-card\s*\{[^}]*var\(--dsw-alias-bg-elevated/m,
      '不得把 .wf-modal-card 全局改为 token（只允许 .wf-voice-picker-modal 限定）',
    );
    assert.doesNotMatch(
      componentsCss,
      /^\.wf-custom-select-dropdown,?\s*\{[^}]*var\(--dsw-alias-bg-elevated/m,
      '不得全局重涂 .wf-custom-select-dropdown',
    );
  });
});
