/**
 * 图像生成大橱窗与队列双向纯视觉同步端到端契约测试 (E2E Contract Test)
 * 对应规格：specs/media-viewer-pure-visual-sync.spec.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMediaViewerStore } from '../../../omnimux/src/client/media-viewer/media-viewer-store.js';

const here = dirname(fileURLToPath(import.meta.url));

test('E2E: 图像生成大橱窗与队列双向纯视觉同步及无边框自适应契约验证', async () => {
  // 1. 验证 OrganicShimmerOverlay.jsx 纯视觉契约
  const shimmerSource = await readFile(resolve(here, './OrganicShimmerOverlay.jsx'), 'utf8');
  assert.ok(shimmerSource.includes('wf-organic-shimmer__field'), '必须包含光谱弥散底场');
  assert.ok(shimmerSource.includes('wf-organic-shimmer__distortion'), '必须包含液体波浪折射层');
  assert.ok(shimmerSource.includes('wf-organic-shimmer__glow-layer'), '必须包含微光边缘系统');
  assert.ok(shimmerSource.includes('wf-organic-shimmer__mask'), '必须包含遮罩层');
  // 严禁包含任何文字或按钮节点
  assert.ok(!shimmerSource.includes('<span'), 'OrganicShimmerOverlay 纯视觉组件严禁包含 span 文字节点');
  assert.ok(!shimmerSource.includes('<button'), 'OrganicShimmerOverlay 纯视觉组件严禁包含 button 操作按钮');

  // 2. 验证 MediaViewerTab.jsx 大小卡片同步契约与零文字执行态
  const tabSource = await readFile(resolve(here, './MediaViewerTab.jsx'), 'utf8');
  assert.ok(
    tabSource.includes("item.status === 'generating'"),
    '缩略图栏必须识别并渲染 generating 执行态的小卡槽'
  );
  assert.ok(
    tabSource.includes('omx-thumb-task-slot'),
    '缩略图栏必须使用 omx-thumb-task-slot 渲染执行态微光卡槽'
  );
  assert.ok(
    tabSource.includes("activeItem?.status === 'generating'"),
    '中央大橱窗必须根据 activeItem 状态同步激活大卡片执行态'
  );
  assert.ok(
    !tabSource.includes('<div className="omx-mv-generating-overlay">'),
    '中央大橱窗严禁重新出现独立的全屏黑屏遮罩节点（#2827 后该类名只作为卡槽内标记，不得独立成块覆盖）'
  );

  // 3. 验证 MediaViewerComposer.jsx 上下分层与全宽输入契约
  const composerSource = await readFile(resolve(here, './MediaViewerComposer.jsx'), 'utf8');
  assert.ok(
    composerSource.includes('omx-mv-prompt-row'),
    '输入框必须使用 omx-mv-prompt-row 进行排布'
  );
  assert.ok(
    composerSource.includes("config.imageOpMode !== '文生图'"),
    '在纯文生图模式下必须收敛空卡槽，仅在非文生图或有素材时自适应展示'
  );

  // 4. 验证 styles.js 样式层绝对无边框与自适应比例契约
  const stylesSource = await readFile(resolve(here, '../../../omnimux/src/client/media-viewer/styles.js'), 'utf8');
  assert.ok(
    stylesSource.includes('.omx-media-slot') && stylesSource.includes('border: none !important'),
    '原位卡槽必须声明 border: none !important 彻底消除边框线'
  );
  assert.ok(
    stylesSource.includes('.omx-thumb-task-slot') && stylesSource.includes('border: none !important'),
    '缩略图执行小卡槽必须声明 border: none !important 彻底消除边框线'
  );
  assert.ok(
    stylesSource.includes('.omx-mv-prompt-row') && stylesSource.includes('flex-direction: column'),
    '输入区域必须使用 flex-direction: column 上下分层，彻底释放输入框横向空间'
  );
  assert.ok(
    stylesSource.includes('[data-ratio="1:1"]') && stylesSource.includes('[data-ratio="16:9"]') && stylesSource.includes('[data-ratio="9:16"]'),
    '必须支持 1:1、16:9 与 9:16 等自适应比例，保持素材原生画幅'
  );

  // 5. 验证 media-viewer-store.js 生命周期与结果持久保留
  const store = createMediaViewerStore();
  const task = store.addMedia({
    id: 'e2e-task-1',
    sessionId: 'session-e2e',
    status: 'generating',
    prompt: '赛博朋克城市雨夜',
    aspectRatio: '16:9',
  });
  store.setActiveId(task.id);

  assert.equal(store.getSnapshot().activeId, 'e2e-task-1', '提交后大橱窗必须立即同步激活该任务');
  assert.equal(store.getSnapshot().mediaList.find((m) => m.id === 'e2e-task-1')?.status, 'generating');

  store.updateMedia('e2e-task-1', {
    status: 'completed',
    url: 'https://cdn.test/cyberpunk.png',
  });

  const updated = store.getSnapshot().mediaList.find((m) => m.id === 'e2e-task-1');
  assert.equal(updated.status, 'completed', '任务完成后状态必须转换为 completed');
  assert.equal(updated.url, 'https://cdn.test/cyberpunk.png', '生成产物必须完好回填并持久保留');
});
