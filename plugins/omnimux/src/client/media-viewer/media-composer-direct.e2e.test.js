/**
 * 图像与视频生成专用输入面板直连中枢端到端契约验证测试 (E2E Contract Test)
 * Issue #2416, specs/media-composer-direct.spec.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMediaViewerStore } from './media-viewer-store.js';

const here = dirname(fileURLToPath(import.meta.url));

test('E2E: 图像生成专用输入面板直连执行中枢契约验证', async () => {
  // 1. 验证 MediaViewerComposer.jsx 契约
  const composerSource = await readFile(resolve(here, 'MediaViewerComposer.jsx'), 'utf8');

  // 必须包含三大按钮排布：生成方式 ｜ 模型 ｜ 参数展示
  assert.ok(
    composerSource.includes('opModeTriggerBtn'),
    '必须提供生成方式切换触发器 (生成方式)'
  );
  assert.ok(
    composerSource.includes('modelCascadeTriggerBtn'),
    '必须提供模型级联选择触发器 (模型)'
  );
  assert.ok(
    composerSource.includes('paramSummaryTriggerBtn'),
    '必须提供参数展示与配置触发器 (参数展示)'
  );
  assert.ok(
    composerSource.includes('omx-send-cta-btn'),
    '必须提供直连提交主按钮 (Ink CTA)'
  );

  // 2. 验证三列级联模型面板与参数面板结构
  assert.ok(
    composerSource.includes('omx-cascade-panel'),
    '必须复刻三列级联模型面板结构'
  );
  assert.ok(
    composerSource.includes('omx-params-panel'),
    '必须复刻模型参数配置面板结构'
  );
  assert.ok(
    composerSource.includes('omx-ratio-grid'),
    '必须包含 7 列比例微框网格卡片'
  );

  // 3. 验证 MediaViewerTab.jsx 接入与直连通道契约
  const tabSource = await readFile(resolve(here, 'MediaViewerTab.jsx'), 'utf8');
  assert.ok(
    tabSource.includes('MediaViewerComposer'),
    'MediaViewerTab 必须接入 MediaViewerComposer 组件'
  );
  assert.ok(
    tabSource.includes('handleDirectSubmit'),
    'MediaViewerTab 必须实现 handleDirectSubmit 直连提交逻辑'
  );
  assert.ok(
    tabSource.includes('/omnimux/api/media/generate'),
    'handleDirectSubmit 必须直投后端 /omnimux/api/media/generate 生成路由'
  );
  assert.ok(
    tabSource.includes('GeneratingStateCard') && tabSource.includes('omx-mv-generating-overlay'),
    '大画布中央在生成时必须挂载 GeneratingStateCard 炫彩流光动画'
  );

  // 4. 验证 Issue #2419 真实中枢数据与零死数据契约
  assert.ok(
    composerSource.includes("useState('')"),
    'Prompt 输入框初始值必须为空字符串，严禁预置任何死数据'
  );
  assert.ok(
    composerSource.includes('/omnimux/model-catalog'),
    '必须动态请求执行中枢模型目录 /omnimux/model-catalog'
  );
  assert.ok(
    composerSource.includes('refThumbnails && refThumbnails.length > 0'),
    '无真实参考图时严禁渲染任何静态人像占位'
  );

  // 5. 验证媒体查看器 Store 状态流转与直连产物自动入库
  const store = createMediaViewerStore();
  assert.equal(store.getSnapshot().isGenerating, false);

  // 触发生成状态
  store.setGenerating(true, { prompt: 'a beautiful sunset', model: 'gpt-image-2.5', status: 'running' });
  assert.equal(store.getSnapshot().isGenerating, true);
  assert.equal(store.getSnapshot().generatingTask?.status, 'running');

  // 模拟生成成功，产物入库
  const added = store.addMedia({
    sessionId: 'session-direct-test',
    type: 'image',
    url: 'https://cdn.example.com/sunset.png',
    title: 'a beautiful sunset',
    timestamp: Date.now(),
  });
  store.setGenerating(false);

  const finalSnap = store.getSnapshot();
  assert.equal(finalSnap.isGenerating, false);
  assert.ok(finalSnap.mediaList.some((m) => m.id === added.id));
  assert.equal(finalSnap.activeId, added.id);
});
