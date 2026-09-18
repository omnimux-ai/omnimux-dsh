/**
 * E2E: 探索模板卡片文案对齐与直通 AI 应用详情全链路契约验证
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

test('E2E: 探索模板卡片悬停按钮升级为「打开应用」并剔除「复刻」', () => {
  const html = renderToStaticMarkup(React.createElement(ExploreTemplatesSection));

  // 1. 验证应用卡片悬停按钮文案显示为「打开应用」
  assert.ok(html.includes('打开应用'), '应用卡片悬停操作按键必须显示为「打开应用」');
  assert.ok(!html.includes('aria-label="复刻：手机与网页交互实机演示"'), '严禁在应用卡片上残留「复刻」标签');

  // 2. 验证卡片数据关联
  assert.ok(html.includes('data-template-id="app-creatify-app-demo"'), '必须渲染官方应用卡片 ID');
  assert.ok(html.includes('data-template-type="app"'), '卡片类型必须标记为 app');
});
