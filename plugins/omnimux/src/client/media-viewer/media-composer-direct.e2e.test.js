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
  // 「生成方式 / 模型 / 参数」三件套已抽到共享控件 MediaConfigControls.jsx，
  // 由媒体面板与输入框快捷方式共同消费（Issue #2562）。
  // 两个文件**分别**断言：媒体面板断言使用形态，共享控件断言自身结构；
  // 把两份源码拼成一个字符串会让「媒体面板是否仍渲染三件套」失去判据。
  const composerSource = await readFile(resolve(here, 'MediaViewerComposer.jsx'), 'utf8');
  const controlsSource = await readFile(resolve(here, 'MediaConfigControls.jsx'), 'utf8');

  assert.ok(
    /<MediaConfigControls[^>]*showModeSwitch/.test(composerSource),
    '媒体面板必须以内置生成方式切换器的形态消费共享控件（生成方式 ｜ 模型 ｜ 参数展示）'
  );
  assert.ok(
    composerSource.includes('omx-send-cta-btn'),
    '必须提供直连提交主按钮 (Ink CTA)'
  );
  assert.ok(
    !composerSource.includes('omx-media-config-summary'),
    '媒体面板不得渲染共享控件里的模型回执节点（抽取前后零新增可见节点）'
  );

  // 1b. 共享控件自身的结构契约
  assert.ok(
    controlsSource.includes('opModeTriggerBtn'),
    '必须提供生成方式切换触发器 (生成方式)'
  );
  assert.ok(
    controlsSource.includes('modelCascadeTriggerBtn'),
    '必须提供模型级联选择触发器 (模型)'
  );
  assert.ok(
    controlsSource.includes('paramSummaryTriggerBtn'),
    '必须提供参数展示与配置触发器 (参数展示)'
  );

  // 2. 验证三列级联模型面板与参数面板结构
  assert.ok(
    controlsSource.includes('omx-cascade-panel'),
    '必须复刻三列级联模型面板结构'
  );
  assert.ok(
    controlsSource.includes('omx-params-panel'),
    '必须复刻模型参数配置面板结构'
  );
  assert.ok(
    controlsSource.includes('omx-ratio-grid'),
    '必须包含 7 列比例微框网格卡片'
  );

  // 2b. 共享控件的容器必须仍是单行弹性布局：三个子节点都是 .omx-popover-anchor
  // （块级盒），容器不声明弹性布局就会把工具条拆成竖排。
  const mvStyles = await readFile(resolve(here, 'styles.js'), 'utf8');
  const containerRule = mvStyles.match(/\.omx-media-config-controls\s*\{[^}]*\}/);
  assert.ok(containerRule, '必须存在 .omx-media-config-controls 样式规则');
  for (const declaration of ['display: flex', 'align-items: center', 'gap: 8px', 'flex-wrap: nowrap', 'min-width: 0']) {
    assert.ok(
      containerRule[0].includes(declaration),
      `.omx-media-config-controls 必须声明 ${declaration}（否则工具条竖排）`
    );
  }
  assert.ok(
    /showModelSummary = false/.test(controlsSource),
    '模型回执默认不渲染，只有快捷方式消费方显式打开'
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
    composerSource.includes('slots.length > 0'),
    '当前模型没有契约槽位时不渲染卡槽，也不放静态占位图'
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
