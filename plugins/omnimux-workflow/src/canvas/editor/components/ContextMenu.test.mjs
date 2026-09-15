/**
 * ContextMenu 与 useCanvasContextMenu 契约测试：
 * 验证画布选中节点时支持删除功能，以及右键识别选中节点逻辑。
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

test('useCanvasContextMenu 契约：未传特定 node 时支持单选与多选节点的上下文智能识别', () => {
  // 1. 验证根据选中的节点列表识别单选与多选
  assert.match(
    useCanvasContextMenuSrc,
    /const\s+selectedNodes\s*=\s*useCanvasStore\.getState\(\)\.nodes\.filter\(\(n\)\s*=>\s*n\.selected\);/,
    '必须提取当前处于选中态的节点列表',
  );

  // 2. 验证单选节点时识别为 { type: 'node', nodeId: selectedNodes[0].id }
  assert.match(
    useCanvasContextMenuSrc,
    /if\s*\(selectedNodes\.length\s*===\s*1\)\s*\{\s*context\s*=\s*\{\s*type:\s*'node',\s*nodeId:\s*selectedNodes\[0\]\.id\s*\};/s,
    '单选节点时必须识别为 node 上下文并绑定对应 nodeId',
  );

  // 3. 验证多选节点时识别为 selection 上下文
  assert.match(
    useCanvasContextMenuSrc,
    /else\s+if\s*\(selectedNodes\.length\s*>\s*1\)\s*\{\s*context\s*=\s*\{\s*type:\s*'selection'\s*\};/s,
    '多选节点时必须识别为 selection 上下文',
  );

  // 4. 验证 delete 动作在 node、selection 以及 pane 下均有健全处理
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
