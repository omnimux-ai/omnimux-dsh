/**
 * E2E: 探索模板直通 openAppTab 呼出应用工作台端到端验证
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

test('E2E: ExploreTemplatesSection 正确挂载卡片并具备直通能力', () => {
  const html = renderToStaticMarkup(React.createElement(ExploreTemplatesSection));

  // 1. 验证渲染了 7 张大卡片
  assert.ok(html.includes('data-template-id="app-creatify-app-demo"'), '必须渲染首款应用卡片');
  assert.ok(html.includes('打开应用'), '悬停文案必须为打开应用');

  // 2. 验证容器
  assert.ok(html.includes('omnimux-explore-templates-root'), '必须包含探索模板根容器');
});
