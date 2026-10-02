import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { createMediaViewerStore } from '../../../omnimux/src/client/media-viewer/media-viewer-store.js';
import { MEDIA_VIEWER_CSS } from '../../../omnimux/src/client/media-viewer/styles.js';

const here = dirname(fileURLToPath(import.meta.url));
const tempOut = join(here, `.temp-visual-sync-${Date.now()}.mjs`);

let OrganicShimmerOverlay;

test.before(async () => {
  await esbuild.build({
    stdin: {
      contents: `
        export * from '${join(here, './OrganicShimmerOverlay.jsx')}';
      `,
      resolveDir: here,
      loader: 'js',
    },
    bundle: true,
    format: 'esm',
    outfile: tempOut,
    external: ['react', 'react-dom', 'react-dom/server'],
  });

  const mod = await import(pathToFileURL(tempOut).href);
  OrganicShimmerOverlay = mod.OrganicShimmerOverlay;
});

test.after(() => {
  if (existsSync(tempOut)) {
    try {
      unlinkSync(tempOut);
    } catch {}
  }
});

describe('图像生成纯视觉与大小卡片双向深度同步契约测试', () => {

  it('契约 1: OrganicShimmerOverlay 纯视觉组件渲染 100% 零文字', () => {
    assert.ok(OrganicShimmerOverlay, 'OrganicShimmerOverlay 组件必须成功导出');
    const html = renderToString(React.createElement(OrganicShimmerOverlay));

    // 必须包含核心流体图层
    assert.ok(html.includes('wf-organic-shimmer__field'), '必须包含光谱弥散场');
    assert.ok(html.includes('wf-organic-shimmer__distortion'), '必须包含液体波浪折射层');
    assert.ok(html.includes('wf-organic-shimmer__glow-layer'), '必须包含微光边缘系统');
    assert.ok(html.includes('wf-organic-shimmer__mask'), '必须包含遮罩层');

    // 绝对不得包含任何文本内容或文字标签
    const textContent = html.replace(/<[^>]*>/g, '').trim();
    assert.equal(textContent, '', 'OrganicShimmer 动效在执行态中严禁输出任何文字描述');
  });

  it('契约 2: 任务提交即同步激活，且结果在完成后持久保留入库', () => {
    const store = createMediaViewerStore({
      mediaList: [
        { id: 'img-1', title: '历史图片', url: 'https://cdn.test/1.jpg', status: 'completed' },
      ],
      activeId: 'img-1',
    });

    assert.equal(store.getSnapshot().activeId, 'img-1');
    assert.equal(store.getSnapshot().mediaList.length, 1);

    // 1. 提交新任务：生成 task 条目并立即激活
    const taskId = 'task-test-123';
    const taskItem = store.addMedia({
      id: taskId,
      status: 'generating',
      prompt: '极简静物摄影',
      aspectRatio: '16:9',
      type: 'image',
    });
    store.setActiveId(taskItem.id);

    const snapInFlight = store.getSnapshot();
    assert.equal(snapInFlight.activeId, taskId, '大橱窗必须立即同步切换为该新任务');
    const inFlightTask = snapInFlight.mediaList.find((m) => m.id === taskId);
    assert.ok(inFlightTask, '新任务必须存在于媒体列表中');
    assert.equal(inFlightTask.status, 'generating', '状态必须为 generating 执行态');

    // 2. 任务完成：更新为 completed 并赋予产出 URL
    store.updateMedia(taskId, {
      status: 'completed',
      url: 'https://cdn.test/result-123.jpg',
    });

    const snapSettled = store.getSnapshot();
    assert.equal(snapSettled.mediaList.length, 2, '生成成果必须持久保留在媒体库中');
    const completedTask = snapSettled.mediaList.find((m) => m.id === taskId);
    assert.equal(completedTask.status, 'completed', '任务状态必须平滑转换为已完成');
    assert.equal(completedTask.url, 'https://cdn.test/result-123.jpg', '产出素材 URL 必须准确回填');
  });

  it('契约 3: 样式层必须彻底消除卡片边框线，并自适应素材画幅比例', () => {
    // 校验 .omx-media-slot 边框消除
    assert.ok(
      MEDIA_VIEWER_CSS.includes('.omx-media-slot') && MEDIA_VIEWER_CSS.includes('border: none !important'),
      '.omx-media-slot 必须声明 border: none !important 彻底消除突兀边框线'
    );

    // 校验 .omx-thumb-task-slot 边框消除
    assert.ok(
      MEDIA_VIEWER_CSS.includes('.omx-thumb-task-slot') && MEDIA_VIEWER_CSS.includes('border: none !important'),
      '.omx-thumb-task-slot 缩略图小卡槽必须声明 border: none !important'
    );

    // 校验自适应比例规格存在
    assert.ok(MEDIA_VIEWER_CSS.includes('[data-ratio="1:1"]'), '必须支持 1:1 自适应画幅');
    assert.ok(MEDIA_VIEWER_CSS.includes('[data-ratio="16:9"]'), '必须支持 16:9 自适应画幅');
    assert.ok(MEDIA_VIEWER_CSS.includes('[data-ratio="9:16"]'), '必须支持 9:16 自适应画幅');

    // 校验素材原比例自适应
    assert.ok(MEDIA_VIEWER_CSS.includes('object-fit: contain'), '图片必须声明 object-fit: contain 严格保持素材原生比例');
  });

});
