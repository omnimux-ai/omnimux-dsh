/**
 * ContextMenu 与 useCanvasContextMenu 契约测试：
 * 验证画布右键菜单靶心归属性、单选/多选/画布上下文迁移，以及删除与工作流创建功能。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const contextMenuSrc = readFileSync(join(here, 'ContextMenu.tsx'), 'utf8');
const useCanvasContextMenuSrc = readFileSync(
  join(here, '../hooks/useCanvasContextMenu.ts'),
  'utf8',
);

test('ContextMenu 契约：pane 分支在 hasSelection 为 true 时必须包含 delete 项', () => {
  // 1. 验证 paneItems 在 hasSelection 时推入 delete
  assert.match(
    contextMenuSrc,
    /if\s*\(hasSelection\)\s*\{\s*paneItems\.push\(\{\s*action:\s*'delete'/s,
    'pane 模式在 hasSelection 为 true 时必须包含 delete 动作',
  );

  // 2. 验证 pane 模式包含 Del 快捷键说明
  assert.match(
    contextMenuSrc,
    /paneItems\.push\(\{\s*action:\s*'delete',\s*label:\s*t\('menu\.delete'\),\s*shortcut:\s*'Del'\s*\}\)/,
    'delete 动作必须使用 Del 快捷键提示',
  );

  // 3. 验证 pane 模式的 delete 项前渲染视觉分割线
  assert.match(
    contextMenuSrc,
    /context\.type\s*===\s*'pane'\s*&&\s*item\.action\s*===\s*'delete'/,
    'pane 模式下的 delete 选项前需渲染分割线',
  );
});

test('useCanvasContextMenu 契约：严格遵循靶心归属性与原子化状态迁移（空白右键清空选择，节点右键精准聚焦）', () => {
  // 1. 验证空白处右键必须原子化取消选中，并唤起 pane 菜单
  assert.match(
    useCanvasContextMenuSrc,
    /const\s+handlePaneContextMenu\s*=\s*useCallback\(\s*\(event:[^)]*\)\s*=>\s*\{[\s\S]*?clearSelection\(\);[\s\S]*?context:\s*\{\s*type:\s*'pane'\s*\}[\s\S]*?\},/s,
    'handlePaneContextMenu 必须原子化调用 clearSelection 并唤起 pane 上下文菜单',
  );

  // 2. 验证节点右键时检测多选：若已属于多选集合则派发 selection 上下文
  assert.match(
    useCanvasContextMenuSrc,
    /if\s*\(isAlreadySelected\s*&&\s*selectedNodes\.length\s*>\s*1\)\s*\{\s*setMenu\(\{[\s\S]*?context:\s*\{\s*type:\s*'selection'\s*\}[\s\S]*?\}\);/s,
    '右键节点若属于多选集合，必须维持多选并激活 selection 批量菜单',
  );

  // 3. 验证节点右键未在多选集时，原子化将焦点转移并锁定为该节点（成为唯一选中）
  assert.match(
    useCanvasContextMenuSrc,
    /if\s*\(!isAlreadySelected\s*\|\|\s*selectedNodes\.length\s*!==\s*1\)\s*\{[\s\S]*?setSelectedElement\?\.\(('node'|"node"),\s*node\.id\);[\s\S]*?\}/s,
    '右键节点未处于单选该节点时，必须原子化更新选中态并同步 setSelectedElement',
  );

  // 4. 验证节点右键最终激活 node 菜单并绑定 nodeId
  assert.match(
    useCanvasContextMenuSrc,
    /context:\s*\{\s*type:\s*'node',\s*nodeId:\s*node\.id\s*\}/,
    '节点右键菜单上下文必须精准绑定到当前点击的 node.id',
  );

  // 5. 验证 delete 动作在 node、selection 以及 pane 下均有健全处理
  assert.match(
    useCanvasContextMenuSrc,
    /case\s+'delete':\s*\{.*deleteSelectedNodes\(\);/s,
    'delete 动作必须最终触发 deleteSelectedNodes',
  );
});

test('ContextMenu 契约：pane 与 selection 模式在 paste 项上方必须包含 create-workflow 项', () => {
  // 1. 验证 pane 菜单片段在 paste 上方包含 create-workflow
  const paneBlock = contextMenuSrc.slice(contextMenuSrc.indexOf('const paneItems: MenuItemSpec[]'));
  const paneCreateIdx = paneBlock.indexOf("{ action: 'create-workflow', label: t('menu.createWorkflow')");
  const panePasteIdx = paneBlock.indexOf("{ action: 'paste', label: t('menu.paste')");
  assert.ok(paneCreateIdx > 0, 'pane 菜单必须包含 create-workflow');
  assert.ok(panePasteIdx > paneCreateIdx, 'pane 菜单的 create-workflow 必须位于 paste 上方');

  // 2. 验证 selection 菜单片段在 paste 上方包含 create-workflow
  const selBlock = contextMenuSrc.slice(
    contextMenuSrc.indexOf("if (context.type === 'selection')"),
    contextMenuSrc.indexOf('const paneItems: MenuItemSpec[]'),
  );
  const selCreateIdx = selBlock.indexOf("{ action: 'create-workflow', label: t('menu.createWorkflow'), shortcut: '⌘G'");
  const selPasteIdx = selBlock.indexOf("{ action: 'paste', label: t('menu.paste')");
  assert.ok(selCreateIdx > 0, 'selection 菜单必须包含 create-workflow 并带有 ⌘G 快捷键提示');
  assert.ok(selPasteIdx > selCreateIdx, 'selection 菜单的 create-workflow 必须位于 paste 上方');

  // 3. 验证 useCanvasContextMenu 支持响应 create-workflow 并调用 onCreateWorkflow
  assert.match(
    useCanvasContextMenuSrc,
    /case\s+'create-workflow':\s*\{\s*onCreateWorkflow\?\.\(flowPosition\);/s,
    'useCanvasContextMenu 必须派发 onCreateWorkflow(flowPosition)',
  );
});
