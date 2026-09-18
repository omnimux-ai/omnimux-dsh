/**
 * E2E: 探索模板头部极简收敛与单行对齐端到端契约验证
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const output = await build({
  entryPoints: [new URL('../../src/client/session-guide/templates/ExploreTemplatesSection.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react-dom'],
});

const compiledModule = { exports: {} };
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  createRequire(import.meta.url),
  compiledModule,
  compiledModule.exports
);
const { ExploreTemplatesSection } = compiledModule.exports;

test('E2E: 探索模板头部布局极简收敛与单行对齐', () => {
  const html = renderToStaticMarkup(React.createElement(ExploreTemplatesSection));

  // 1. 标题必须有且仅有一行呈现「探索模板」，顶层重复标题已彻底移除
  const headingMatches = html.match(/<h3[^>]*>探索模板<\/h3>/g);
  assert.equal(headingMatches?.length, 1, '全专区仅允许且必须恰好出现一次「探索模板」标题');
  assert.ok(!html.includes('omnimux-explore-main-title'), '顶层重复的大标题必须彻底移除');

  // 2. 必须彻底移除冗余灰色副标题文字与 DOM 节点
  assert.ok(!html.includes('精选 7 大分类王牌爆款短视频应用'), '副标题文本必须彻底移除');
  assert.ok(!html.includes('omnimux-shelf-subheading'), '副标题 DOM 节点必须彻底移除');

  // 3. 按钮文案必须是「探索全部」，彻底废除「查看全部」
  assert.ok(html.includes('探索全部'), '操作按钮必须显示为「探索全部」');
  assert.ok(!html.includes('查看全部'), '严禁残留旧文案「查看全部」');

  // 4. 单行头部两端对齐容器验证
  assert.ok(html.includes('omnimux-shelf-header'), '必须包含单行头部容器');
});
