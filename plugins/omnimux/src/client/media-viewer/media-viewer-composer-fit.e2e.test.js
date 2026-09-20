/**
 * 图像生成输入框去分割线与侧边栏宽度自适应端到端契约验证测试 (E2E Contract Test)
 * Issue #2453, specs/media-viewer-composer-sidebar-fit.spec.md
 *
 * 真实浏览器几何证据：tmp/media-viewer-composer-qa/QA-REPORT.md（ego-browser，工作树真实 CSS）
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

test('E2E: 图像生成输入框移除分割线并按面板宽度自适应契约验证', async () => {
  const stylesSource = await readFile(resolve(here, 'styles.js'), 'utf8');

  // 1. 输入框根容器：留白收窄、底部间距收窄、宽画布上限保持
  const rootRule = extractRule(stylesSource, '.omx-mv-composer-root {');
  assert.ok(
    rootRule.includes('width: calc(100% - 24px)'),
    '输入框左右留白必须收窄为各 12px（calc(100% - 24px)），适配侧边栏比例'
  );
  assert.ok(
    !rootRule.includes('calc(100% - 64px)'),
    '旧的 32px 固定留白（calc(100% - 64px)）必须移除'
  );
  assert.ok(
    rootRule.includes('bottom: 12px'),
    '输入框底部间距必须收窄为 12px'
  );
  assert.ok(
    rootRule.includes('max-width: 860px'),
    '宽画布下 max-width 860px 居中行为必须保持不变'
  );

  // 2. 工具栏：分割线必须移除（无 border-top，亦无补偿 padding-top）
  const toolbarRule = extractRule(stylesSource, '.omx-mv-toolbar-bar {');
  assert.ok(
    !toolbarRule.includes('border-top'),
    '输入区与工具栏之间的横向分割线（border-top）必须移除'
  );
  assert.ok(
    !toolbarRule.includes('padding-top'),
    '分割线的补偿内边距（padding-top）必须一并移除，间距由根容器 gap 承接'
  );

  // 3. 根容器 flex 间距契约：移除 padding-top 后间距由 gap 承接，不坍缩
  assert.ok(
    rootRule.includes('gap: 10px'),
    '根容器必须保留 gap: 10px 以承接输入区与工具栏间距'
  );

  // 4. 组件结构未变：提示词区与工具栏挂载关系保持
  const composerSource = await readFile(resolve(here, 'MediaViewerComposer.jsx'), 'utf8');
  assert.ok(
    composerSource.includes('omx-mv-prompt-box') && composerSource.includes('omx-mv-toolbar-bar'),
    'MediaViewerComposer 必须保留提示词区与工具栏结构'
  );
});
