import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');

const headerControlsPath = join(repoRoot, 'plugins/omnimux-workflow/src/canvas/editor/components/HeaderControls.tsx');
const groupTopBarPath = join(repoRoot, 'plugins/omnimux-workflow/src/canvas/editor/components/GroupNode/GroupTopBar.tsx');
const groupNodePath = join(repoRoot, 'plugins/omnimux-workflow/src/canvas/editor/components/GroupNode/GroupNode.tsx');
const contextMenuPath = join(repoRoot, 'plugins/omnimux-workflow/src/canvas/editor/components/ContextMenu.tsx');
const canvasEditorPath = join(repoRoot, 'plugins/omnimux-workflow/src/canvas/editor/CanvasEditor.tsx');

test('e2e: 工作流打组收敛发布与右键创建工作流端到端规格验证', () => {
  const headerControlsSrc = readFileSync(headerControlsPath, 'utf8');
  const groupTopBarSrc = readFileSync(groupTopBarPath, 'utf8');
  const groupNodeSrc = readFileSync(groupNodePath, 'utf8');
  const contextMenuSrc = readFileSync(contextMenuPath, 'utf8');
  const canvasEditorSrc = readFileSync(canvasEditorPath, 'utf8');

  // 1. 全局控制栏净化：移除全局 onOpenPublish 与 Share2 发布按钮
  assert.equal(
    headerControlsSrc.includes('onOpenPublish'),
    false,
    'HeaderControls 必须移除全局发布 onOpenPublish 参数'
  );
  assert.equal(
    headerControlsSrc.includes('Share2'),
    false,
    'HeaderControls 不得再出现 Share2 发布图标'
  );

  // 2. 右键菜单：在「粘贴」正上方新增「创建工作流」
  const paneBlock = contextMenuSrc.slice(contextMenuSrc.indexOf('const paneItems: MenuItemSpec[]'));
  const paneCreateIdx = paneBlock.indexOf("{ action: 'create-workflow', label: t('menu.createWorkflow')");
  const panePasteIdx = paneBlock.indexOf("{ action: 'paste', label: t('menu.paste')");
  assert.ok(paneCreateIdx > 0, 'pane 菜单必须包含 create-workflow');
  assert.ok(panePasteIdx > paneCreateIdx, 'pane 菜单中的 create-workflow 必须位于 paste 正上方');

  const selBlock = contextMenuSrc.slice(
    contextMenuSrc.indexOf("if (context.type === 'selection')"),
    contextMenuSrc.indexOf('const paneItems: MenuItemSpec[]')
  );
  const selCreateIdx = selBlock.indexOf("{ action: 'create-workflow', label: t('menu.createWorkflow'), shortcut: '⌘G'");
  const selPasteIdx = selBlock.indexOf("{ action: 'paste', label: t('menu.paste')");
  assert.ok(selCreateIdx > 0, 'selection 菜单必须包含 create-workflow');
  assert.ok(selPasteIdx > selCreateIdx, 'selection 菜单中的 create-workflow 必须位于 paste 正上方');

  // 3. 打组工具栏对标图示：药丸标题、整组执行、保存工作流、发布应用、调色板收敛下拉、解体与删除
  assert.ok(groupTopBarSrc.includes('wf-group-topbar__badge'), '打组工具栏必须包含药丸标题徽标');
  assert.ok(groupTopBarSrc.includes('onExecuteGroup'), '打组工具栏必须包含整组执行动作');
  assert.ok(groupTopBarSrc.includes('onCreateWorkflow'), '打组工具栏必须包含保存工作流动作');
  assert.ok(groupTopBarSrc.includes('onPublishApp'), '打组工具栏必须包含发布应用动作（核心收敛）');
  assert.ok(groupTopBarSrc.includes('wf-group-topbar__swatch'), '打组工具栏必须包含当前颜色指示色块');
  assert.ok(groupTopBarSrc.includes('Palette'), '打组工具栏必须收敛颜色为单个图标按钮');
  assert.ok(groupTopBarSrc.includes('wf-group-topbar__palette'), '点击后必须展开调色板下拉气泡');
  assert.ok(groupTopBarSrc.includes('onUngroup'), '打组工具栏必须包含解体动作');
  assert.ok(groupTopBarSrc.includes('onDeleteWorkflow'), '打组工具栏必须包含删除工作流动作');

  // 4. 打组容器与应用发布子图隔离
  assert.match(groupNodeSrc, /omnimux:workflow:publish-app/, 'GroupNode 必须派发组级发布事件');
  assert.match(groupNodeSrc, /omnimux:workflow:delete-group/, 'GroupNode 必须派发组级删除事件');

  // 5. CanvasEditor 收敛约束：空组拦截与子图节点传入
  assert.match(
    canvasEditorSrc,
    /if\s*\(childNodes\.length\s*===\s*0\)\s*\{\s*toast\.warning\(t\('group\.toast\.emptyWarn'\)\);\s*return;\s*\}/,
    '组内节点为空时必须弹出警示并拦截发布向导打开'
  );
  assert.match(
    canvasEditorSrc,
    /nodes=\{targetGroupForPublish\s*\?\s*targetGroupForPublish\.nodes\s*:\s*nodes\}/,
    'PublishWizardModal 必须仅接收属于当前工作流组的节点集合'
  );
});
