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
