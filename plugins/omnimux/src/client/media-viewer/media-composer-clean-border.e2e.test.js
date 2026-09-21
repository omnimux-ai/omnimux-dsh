/**
 * 图像生成面板输入框编辑聚焦状态消除内部边框验证测试
 * Issue: media-composer-clean-border
 * specs/media-composer-clean-border.spec.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** 从样式源码中提取某个选择器规则块（花括号配对） */
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

test('图像生成输入框及其编辑聚焦状态下消除内部边框与轮廓', async () => {
  const stylesSource = await readFile(resolve(here, 'styles.js'), 'utf8');

  // 1. .omx-mv-prompt-textarea 静态状态
  const promptRule = extractRule(stylesSource, '.omx-mv-prompt-textarea {');
  assert.ok(promptRule.includes('border: none !important'), 'prompt-textarea 必须强制移除边框');
  assert.ok(promptRule.includes('outline: none !important'), 'prompt-textarea 必须强制移除 outline');
  assert.ok(promptRule.includes('box-shadow: none !important'), 'prompt-textarea 必须强制移除 box-shadow');

  // 2. .omx-mv-prompt-textarea:focus, .omx-mv-prompt-textarea:focus-visible 聚焦状态
  const focusRule = extractRule(stylesSource, '.omx-mv-prompt-textarea:focus');
  assert.ok(focusRule.includes('border: none !important'), '聚焦状态下必须强制清除 border');
  assert.ok(focusRule.includes('outline: none !important'), '聚焦状态下必须强制清除 outline');
  assert.ok(focusRule.includes('box-shadow: none !important'), '聚焦状态下必须强制清除 box-shadow');

  // 3. .omx-mv-composer__textarea 静态与聚焦状态
  const composerTextareaRule = extractRule(stylesSource, '.omx-mv-composer__textarea {');
  assert.ok(composerTextareaRule.includes('border: none !important'), 'composer__textarea 必须强制移除边框');
  assert.ok(composerTextareaRule.includes('outline: none !important'), 'composer__textarea 必须强制移除 outline');
  assert.ok(composerTextareaRule.includes('box-shadow: none !important'), 'composer__textarea 必须强制移除 box-shadow');

  const composerFocusRule = extractRule(stylesSource, '.omx-mv-composer__textarea:focus');
  assert.ok(composerFocusRule.includes('border: none !important'), 'composer__textarea 聚焦状态下必须强制清除 border');
  assert.ok(composerFocusRule.includes('outline: none !important'), 'composer__textarea 聚焦状态下必须强制清除 outline');
  assert.ok(composerFocusRule.includes('box-shadow: none !important'), 'composer__textarea 聚焦状态下必须强制清除 box-shadow');
});
