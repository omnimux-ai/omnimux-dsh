/**
 * 图像生成输入框随文字行数变高，最多露出 10 行。
 * Issue #2575, specs/media-composer-autogrow.spec.md
 *
 * 真实浏览器几何证据：.agent-reports/composer-autogrow/measures.json
 * 空/1 行 52px 且不滚动；10 行 228px 且不滚动；11 行起停在 228px 并在框内滚动。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROMPT_TEXTAREA_MAX_VISIBLE_LINES,
  PROMPT_TEXTAREA_MIN_HEIGHT_PX,
  clampPromptTextareaHeight,
  promptTextareaMaxHeightPx,
} from './prompt-textarea-height.js';

const here = dirname(fileURLToPath(import.meta.url));

function extractRule(source, selector) {
  const start = source.indexOf(selector);
  assert.notEqual(start, -1, `样式中必须存在选择器 ${selector}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`选择器 ${selector} 规则块未闭合`);
}

test('高度夹取：不足一行保持矮高度，正好 10 行顶满，第 11 行不再长高', () => {
  assert.equal(PROMPT_TEXTAREA_MAX_VISIBLE_LINES, 10);
  assert.equal(PROMPT_TEXTAREA_MIN_HEIGHT_PX, 52);
  const max = promptTextareaMaxHeightPx();
  assert.equal(max, 228, '上限必须是 ceil(10 × 14 × 1.6 + 4) = 228');

  assert.equal(clampPromptTextareaHeight(0), 52);
  assert.equal(clampPromptTextareaHeight(22), 52);
  assert.equal(clampPromptTextareaHeight(52), 52);
  assert.equal(clampPromptTextareaHeight(80), 80);
  assert.equal(clampPromptTextareaHeight(228), 228);
  assert.equal(clampPromptTextareaHeight(229), 228);
  assert.equal(clampPromptTextareaHeight(400), 228);
  assert.equal(clampPromptTextareaHeight(Number.NaN), 52);
});

test('样式上限与高度函数是同一个 10 行数字，超出后在框内滚动', async () => {
  const stylesSource = await readFile(resolve(here, 'styles.js'), 'utf8');
  const rule = extractRule(stylesSource, '.omx-mv-prompt-textarea {');
  const max = promptTextareaMaxHeightPx();
  assert.match(rule, new RegExp(`max-height:\\s*${max}px`));
  assert.ok(!rule.includes('max-height: 120px'), '旧的两行上限 120px 必须移除');
  assert.match(rule, /min-height:\s*52px/);
  assert.match(rule, /overflow-y:\s*auto/);
  assert.match(rule, /resize:\s*none/);
});

test('输入变化、粘贴填入和发送清空都会重算高度', async () => {
  const source = await readFile(resolve(here, 'MediaViewerComposer.jsx'), 'utf8');
  assert.match(source, /clampPromptTextareaHeight\(node\.scrollHeight\)/);
  assert.match(source, /useLayoutEffect\([\s\S]*\[prompt\]\)/);
  assert.match(source, /new ResizeObserver\(\(\) => \{/);
  assert.match(source, /box\.clientWidth/);
  assert.match(source, /observer\.disconnect\(\)/);
  assert.match(source, /ref=\{promptRef\}/);
  assert.match(source, /setPrompt\(''\)/);
});
