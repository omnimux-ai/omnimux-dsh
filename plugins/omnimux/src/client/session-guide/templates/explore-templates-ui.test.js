import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SHELVES_CONFIG } from './templates-data.js';

// 使用 esbuild 即时编译 ExploreTemplatesSection.jsx
const output = await build({
  entryPoints: [new URL('./ExploreTemplatesSection.jsx', import.meta.url).pathname],
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

test('探索模板核心板块：单分组与 7 大精选应用卡片静态标记渲染', () => {
  let appliedPayload = null;
  const html = renderToStaticMarkup(
    React.createElement(ExploreTemplatesSection, {
      onApplyTemplate: (payload) => {
        appliedPayload = payload;
      },
    })
  );

  // 1. 验证主标题
  assert.ok(html.includes('探索模板'), '必须包含专区主标题');

  // 2. 验证单分组单行货架
  assert.ok(html.includes('omnimux-explore-shelves-view'), '必须渲染单分组货架容器');
  assert.ok(html.includes(SHELVES_CONFIG[0].titleZh), '必须渲染探索模板货架行');

  // 3. 验证卡片与动作
  assert.ok(html.includes('omnimux-tpl-hover-action'), '卡片必须具备悬停动作层');
});
