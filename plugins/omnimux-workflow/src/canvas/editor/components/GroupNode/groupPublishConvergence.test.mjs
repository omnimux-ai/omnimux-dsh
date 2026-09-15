/**
 * groupPublishConvergence.test.mjs
 *
 * 契约与单元测试：验证从原画布全局发布收敛到工作流打组内发布（T04）。
 * 1. 验证 HeaderControls.tsx 移除全局 onOpenPublish / Share2 按钮；
 * 2. 验证 GroupTopBar.tsx 包含名称药丸、整组执行、保存工作流、发布应用、调色盘、解体、删除工作流；
 * 3. 验证 CanvasEditor.tsx 精准组内发布事件、空组拦截与子图节点隔离机制。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const headerControlsSrc = readFileSync(join(here, '../HeaderControls.tsx'), 'utf8');
const groupTopBarSrc = readFileSync(join(here, 'GroupTopBar.tsx'), 'utf8');
const groupNodeSrc = readFileSync(join(here, 'GroupNode.tsx'), 'utf8');
const canvasEditorSrc = readFileSync(join(here, '../../CanvasEditor.tsx'), 'utf8');

test('T04.1: HeaderControls 彻底移除全局 onOpenPublish 与 Share2 图标', () => {
  assert.equal(
    headerControlsSrc.includes('onOpenPublish'),
    false,
    'HeaderControls 接口与参数中不得再包含 onOpenPublish',
  );
  assert.equal(
    headerControlsSrc.includes('Share2'),
    false,
    'HeaderControls 不得再引入或渲染 Share2 发布图标',
  );
  assert.equal(
    headerControlsSrc.includes('发布为 AI 应用'),
    false,
    'HeaderControls 不得再包含全局发布应用按钮',
  );
});

test('T04.2: GroupTopBar 包含名称药丸、整组执行、保存工作流、发布应用、调色板、解体与删除', () => {
  // 1. 验证药丸徽标与名称重命名
  assert.ok(groupTopBarSrc.includes('wf-group-topbar__badge'), '必须渲染工作流药丸徽标');
  assert.ok(groupTopBarSrc.includes('wf-group-topbar__badge-dot'), '药丸徽标中必须带有状态小圆点');
  assert.ok(groupTopBarSrc.includes('onRename'), '支持重命名工作流标题');

  // 2. 验证核心按钮
  assert.ok(groupTopBarSrc.includes('onExecuteGroup'), '必须包含整组执行动作');
  assert.ok(groupTopBarSrc.includes('onCreateWorkflow'), '必须包含保存工作流动作');
  assert.ok(groupTopBarSrc.includes('onPublishApp'), '必须包含发布应用动作（核心收敛）');
  assert.ok(groupTopBarSrc.includes('onUngroup'), '必须包含解体动作');
  assert.ok(groupTopBarSrc.includes('onDeleteWorkflow'), '必须包含删除工作流动作');

  // 3. 验证 8 种调色盘平铺色点
  assert.ok(groupTopBarSrc.includes('wf-group-topbar__palette-row'), '必须平铺调色盘色点容器');
  assert.ok(groupTopBarSrc.includes('PALETTE_COLORS.map'), '必须遍历高对比度调色板');
});

test('T04.3: GroupNode 派发组内发布与删除事件', () => {
  assert.match(
    groupNodeSrc,
    /omnimux:workflow:publish-app/,
    'GroupNode 必须监听发布并在点击时派发 omnimux:workflow:publish-app',
  );
  assert.match(
    groupNodeSrc,
    /omnimux:workflow:delete-group/,
    'GroupNode 必须监听删除并在点击时派发 omnimux:workflow:delete-group',
  );
});

test('T04.4: CanvasEditor 将 PublishWizardModal 严格收敛在组内子图范围', () => {
  // 1. 验证事件处理与空组防护
  assert.match(
    canvasEditorSrc,
    /const\s+handlePublishAppEvent\s*=\s*\(e:\s*Event\)\s*=>\s*\{/s,
    'CanvasEditor 必须实现 handlePublishAppEvent',
  );
  assert.match(
    canvasEditorSrc,
    /if\s*\(childNodes\.length\s*===\s*0\)\s*\{\s*toast\.warning\(t\('group\.toast\.emptyWarn'\)\);\s*return;\s*\}/,
    '空工作流组点击发布应用时必须拦截并警示，禁止发布空应用',
  );

  // 2. 验证向 PublishWizardModal 传入的是目标组的 nodes 与 edges
  assert.match(
    canvasEditorSrc,
    /nodes=\{targetGroupForPublish\s*\?\s*targetGroupForPublish\.nodes\s*:\s*nodes\}/,
    'PublishWizardModal 接收的 nodes 必须为当前打组的子节点',
  );
  assert.match(
    canvasEditorSrc,
    /edges=\{targetGroupForPublish\s*\?\s*targetGroupForPublish\.edges\s*:\s*edges\}/,
    'PublishWizardModal 接收的 edges 必须为当前打组的内部边',
  );

  // 3. 验证右键菜单绑定 onCreateWorkflow
  assert.match(
    canvasEditorSrc,
    /onCreateWorkflow:\s*handleCreateWorkflowFromMenu/,
    'CanvasEditor 必须将 handleCreateWorkflowFromMenu 注入 useCanvasContextMenu',
  );
});
