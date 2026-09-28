import test from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { MEDIA_VIEWER_CSS } from './styles.js';
import { createMediaViewerStore, parseMediaRatio } from './media-viewer-store.js';

const here = dirname(fileURLToPath(import.meta.url));
const tempFile = join(here, `.temp-inplace-test-${Date.now()}.mjs`);

let OrganicShimmerOverlay;
let InPlaceTaskSlot;
let normalizeTaskRatio;
let GeneratingStateCard;
let GenerationTasks;

test.before(async () => {
  await esbuild.build({
    stdin: {
      contents: `
        export * from '${join(here, 'OrganicShimmerOverlay.jsx')}';
        export * from '${join(here, 'InPlaceTaskSlot.jsx')}';
        export * from '${join(here, 'GeneratingStateCard.jsx')}';
        export * from '${join(here, 'GenerationTasks.jsx')}';
      `,
      resolveDir: here,
      loader: 'js',
    },
    bundle: true,
    format: 'esm',
    outfile: tempFile,
    external: ['react', 'react-dom', 'react-dom/server'],
  });

  const mod = await import(pathToFileURL(tempFile).href);
  OrganicShimmerOverlay = mod.OrganicShimmerOverlay;
  InPlaceTaskSlot = mod.InPlaceTaskSlot;
  normalizeTaskRatio = mod.normalizeTaskRatio;
  GeneratingStateCard = mod.GeneratingStateCard;
  GenerationTasks = mod.GenerationTasks;
});

test.after(() => {
  try {
    unlinkSync(tempFile);
  } catch {}
});

test('OrganicShimmerOverlay: 纯视觉有机折射层级结构与绝对零文字断言', () => {
  const html = renderToString(React.createElement(OrganicShimmerOverlay));
  
  // 必须包含核心三层体系
  assert.ok(html.includes('wf-organic-shimmer__canvas'), '必须包含 canvas 根层');
  assert.ok(html.includes('wf-organic-shimmer__field'), '必须包含 field 多色光谱底场');
  assert.ok(html.includes('wf-organic-shimmer__distortion'), '必须包含 distortion SVG 湍流折射波浪层');
  assert.ok(html.includes('wf-organic-shimmer__glow-layer'), '必须包含 glow-layer 发光层');
  assert.ok(html.includes('wf-organic-shimmer__glow-deep'), '必须包含 glow-deep');
  assert.ok(html.includes('wf-organic-shimmer__glow-mid'), '必须包含 glow-mid');
  assert.ok(html.includes('wf-organic-shimmer__glow-border'), '必须包含 glow-border');

  // 纯净度断言：严禁包含任何文字或按钮
  assert.ok(!html.includes('<button'), '严禁包含任何 button');
  assert.ok(!html.includes('role="button"'), '严禁包含任何 role="button"');
  // 提取标签外文本
  const textContent = html.replace(/<[^>]+>/g, '').trim();
  assert.strictEqual(textContent, '', 'OrganicShimmerOverlay 内部文本必须绝对为空');
});

test('InPlaceTaskSlot: 比例规范化与白名单约束', () => {
  assert.equal(normalizeTaskRatio('9:16'), '9:16');
  assert.equal(normalizeTaskRatio('9/16'), '9:16');
  assert.equal(normalizeTaskRatio('vertical'), '9:16');
  assert.equal(normalizeTaskRatio('portrait'), '9:16');

  assert.equal(normalizeTaskRatio('16:9'), '16:9');
  assert.equal(normalizeTaskRatio('16/9'), '16:9');
  assert.equal(normalizeTaskRatio('horizontal'), '16:9');
  assert.equal(normalizeTaskRatio('landscape'), '16:9');

  assert.equal(normalizeTaskRatio('1:1'), '1:1');
  assert.equal(normalizeTaskRatio('1/1'), '1:1');
  assert.equal(normalizeTaskRatio('square'), '1:1');

  // 未知或缺失默认兜底 1:1
  assert.equal(normalizeTaskRatio(''), '1:1');
  assert.equal(normalizeTaskRatio(null), '1:1');
  assert.equal(normalizeTaskRatio('invalid'), '1:1');
});

test('InPlaceTaskSlot: 执行态渲染与零文字、零按钮门禁断言 (C-1 & C-2)', () => {
  const html = renderToString(React.createElement(InPlaceTaskSlot, {
    status: 'running',
    ratio: '9:16',
  }));

  assert.ok(html.includes('omx-media-slot'), '必须具备 omx-media-slot 根容器');
  assert.ok(html.includes('data-ratio="9:16"'), '必须锁定 data-ratio="9:16"');
  assert.ok(html.includes('data-state="running"'), '必须标记 data-state="running"');
  assert.ok(html.includes('wf-organic-shimmer'), '执行态必须挂载 OrganicShimmer 动效');

  // 纯净度断言：绝对零文字、零按钮
  const textContent = html.replace(/<[^>]+>/g, '').trim();
  assert.strictEqual(textContent, '', '任务占位卡片内部文本必须绝对为空 (C-1)');

  assert.ok(!html.includes('<button'), '任务占位卡片内严禁出现任何交互按钮 (C-2)');
  assert.ok(!html.includes('<a '), '任务占位卡片内严禁出现任何超链接');
});

test('InPlaceTaskSlot: 完成态就地呈现媒体与视频技术参数标签', () => {
  // 图片完成态
  const imgHtml = renderToString(React.createElement(InPlaceTaskSlot, {
    status: 'success',
    ratio: '1:1',
    media: { url: 'https://example.com/result.jpg', type: 'image' },
  }));

  assert.ok(!imgHtml.includes('omx-media-result active'), 'URL 到达不等于媒体加载完成');
  assert.ok(imgHtml.includes('<img'), '必须呈现 img 媒体');
  assert.ok(!imgHtml.includes('result-badge'), '图片严禁呈现技术徽章');

  // 视频完成态（带客观参数）
  const videoHtml = renderToString(React.createElement(InPlaceTaskSlot, {
    status: 'success',
    ratio: '16:9',
    media: { url: 'https://example.com/result.mp4', type: 'video', duration: '720P · 5s' },
  }));

  assert.ok(videoHtml.includes('<video'), '必须呈现 video 媒体');
  assert.ok(!videoHtml.includes('result-badge'), '媒体加载前不展示未验证的技术参数');
  assert.ok(!videoHtml.includes('720P · 5s'), '不把输入字符串当作已加载视频元数据');
});

test('GeneratingStateCard: 重构后彻底清除文字胶囊，收敛为 OrganicShimmerOverlay', () => {
  const html = renderToString(React.createElement(GeneratingStateCard, {
    status: 'running',
    statusText: '正在生成中...',
  }));

  assert.ok(html.includes('omx-generating-box'), '具备兼容的 omx-generating-box');
  assert.ok(html.includes('wf-organic-shimmer'), '使用统一的 OrganicShimmerOverlay');

  // 校验文字胶囊与圆点已被彻底清除
  assert.ok(!html.includes('正在生成中...'), '严禁输出任何 statusText');
  assert.ok(!html.includes('border-radius: 9999px'), '严禁渲染旧版底部文字胶囊');
  const textContent = html.replace(/<[^>]+>/g, '').trim();
  assert.strictEqual(textContent, '', 'GeneratingStateCard 内部文本必须绝对为空');
});

test('styles.js: wf-organic-shimmer 体系与 omx-media-slot 固定比例样式验证', () => {
  // 动效关键帧与流体折射
  assert.ok(MEDIA_VIEWER_CSS.includes('@keyframes wf-organic-shimmer-sweep'), '必须包含 4000ms 匀速平移动画');
  assert.ok(MEDIA_VIEWER_CSS.includes('.wf-organic-shimmer__distortion'), '必须包含 distortion 样式');
  assert.ok(MEDIA_VIEWER_CSS.includes('.wf-organic-shimmer__glow-layer'), '必须包含三层发光样式');

  // 固定长宽比与圆角
  assert.ok(MEDIA_VIEWER_CSS.includes('.omx-media-slot[data-ratio="9:16"]'), '必须包含 9:16 样式规则');
  assert.ok(MEDIA_VIEWER_CSS.includes('aspect-ratio: 9 / 16'), '9:16 必须使用 CSS aspect-ratio');
  assert.ok(MEDIA_VIEWER_CSS.includes('.omx-media-slot[data-ratio="16:9"]'), '必须包含 16:9 样式规则');
  assert.ok(MEDIA_VIEWER_CSS.includes('aspect-ratio: 16 / 9'), '16:9 必须使用 CSS aspect-ratio');
  assert.ok(MEDIA_VIEWER_CSS.includes('.omx-media-slot[data-ratio="1:1"]'), '必须包含 1:1 样式规则');
  assert.ok(MEDIA_VIEWER_CSS.includes('aspect-ratio: 1 / 1'), '1:1 必须使用 CSS aspect-ratio');

  // 遵循 design.md 圆角契约 (12px 卡片圆角)
  assert.ok(MEDIA_VIEWER_CSS.includes('border-radius: 12px'), '卡片必须遵循 design.md 12px 圆角规范');

  // 旧版破坏性视口重写规则必须已被清除
  assert.ok(!MEDIA_VIEWER_CSS.includes('.omx-mv-viewport[data-has-generation] { flex-direction: column'), '破坏布局的顶部黑色横条 flex 重写必须已被清理');
});

test('media-viewer-store: ratio 解析与持久化驱动', () => {
  const store = createMediaViewerStore();

  assert.equal(parseMediaRatio('9:16'), '9:16');
  assert.equal(parseMediaRatio('16:9'), '16:9');
  assert.equal(parseMediaRatio('1:1'), '1:1');
  assert.equal(parseMediaRatio(''), '1:1');

  // updateGeneration 解析 ratio
  store.updateGeneration({
    sessionId: 'session-ratio-test',
    requestId: 'req-ratio-1',
    status: 'running',
    aspectRatio: '9:16',
  });

  const task = store.getSnapshot().generationTasks.find((t) => t.requestId === 'req-ratio-1');
  assert.ok(task);
  assert.equal(task.ratio, '9:16', 'updateGeneration 必须解析并记录 ratio="9:16"');

  // setGenerating 解析 ratio
  store.setGenerating(true, { prompt: 'a video', aspectRatio: '16:9' });
  assert.equal(store.getSnapshot().generatingTask?.ratio, '16:9', 'setGenerating 必须解析并设置 ratio="16:9"');
});

test('GenerationTasks renders silent running slots and removes abnormal empty tasks', () => {
  const running = renderToString(React.createElement(GenerationTasks, {
    tasks: [{ sessionId: 'a', requestId: 'r', status: 'running', ratio: '9:16' }],
  }));
  assert.ok(running.includes('omx-media-slot'));
  assert.equal(running.replace(/<[^>]+>/g, '').trim(), '');
  assert.ok(!running.includes('<button'));
  for (const status of ['failure', 'cancelled', 'unresolved']) {
    const html = renderToString(React.createElement(GenerationTasks, {
      tasks: [{ sessionId: 'a', requestId: 'r', status, prompt: 'private', message: 'private' }],
    }));
    assert.equal(html, '');
  }
});
