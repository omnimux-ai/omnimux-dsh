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

  // 1. 验证主标题与探索全部按钮在单行内呈现
  assert.ok(html.includes('探索模板'), '必须包含专区主标题');
  assert.ok(html.includes('探索全部'), '必须包含探索全部操作按钮');
  assert.ok(!html.includes('精选 7 大分类王牌爆款短视频应用'), '必须彻底移除冗余副标题文字');

  // 2. 验证单分组单行货架
  assert.ok(html.includes('omnimux-explore-shelves-view'), '必须渲染单分组货架容器');
  assert.ok(html.includes(SHELVES_CONFIG[0].titleZh), '必须渲染探索模板货架行');

  // 3. 验证卡片与动作
  assert.ok(html.includes('omnimux-tpl-hover-action'), '卡片必须具备悬停动作层');

  // 4. 验证一级核心大库按钮与专属图标
  assert.ok(html.includes('omnimux-explore-primary-tabs'), '必须包含一级主导航容器');
  const primaryTabs = ['featured', 'assets', 'inspiration', 'products', 'trending', 'skills'];
  for (const tab of primaryTabs) {
    assert.match(
      html,
      new RegExp(`data-primary-tab="${tab}"[^>]*>[\\s\\S]*?<svg`),
      `一级项 ${tab} 按钮必须包含独立的专属 svg 图标`
    );
  }

  // 5. 验证二级极简下划线选项卡与冗余提示移除
  assert.ok(html.includes('omnimux-explore-sub-tabs'), '必须包含二级细分选项卡容器');
  assert.ok(html.includes('data-sub-category="all"'), '必须包含全部二级项');
  assert.ok(html.includes('data-sub-category="hook-intro"'), '精选下必须包含黄金开场二级项');
  assert.ok(!html.includes('filter-meta-hint'), '必须彻底移除当前视图状态提示文本');
});
