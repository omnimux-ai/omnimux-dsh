import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const contextMenuPath = join(
  here,
  '../../src/canvas/editor/components/ContextMenu.tsx',
);
const hookPath = join(
  here,
  '../../src/canvas/editor/hooks/useCanvasContextMenu.ts',
);

const contextMenuSrc = readFileSync(contextMenuPath, 'utf8');
const hookSrc = readFileSync(hookPath, 'utf8');

test('E2E: 画布右键菜单全链路支持选中节点删除与智能上下文识别', () => {
  // 1. ContextMenu 接收 hasSelection，并在 pane 菜单分支联动提供删除
  assert.match(
    contextMenuSrc,
    /if\s*\(hasSelection\)\s*\{\s*paneItems\.push\(\{\s*action:\s*'delete',\s*label:\s*t\('menu\.delete'\),\s*shortcut:\s*'Del'\s*\}\);\s*\}/,
    '当画布具有选中节点（hasSelection）时，右键 pane 菜单必须包含 delete 选项',
  );

  // 2. pane 分支下的 delete 选项上方附带视觉分割线
  assert.match(
    contextMenuSrc,
    /\{context\.type\s*===\s*'pane'\s*&&\s*item\.action\s*===\s*'delete'\s*\?\s*\(\s*<div\s+className="wf-context-menu__separator"\s*\/>\s*\)\s*:\s*null\}/,
    'pane 分支的 delete 项必须有明确的视觉分组分割线',
  );

  // 3. useCanvasContextMenu 在 openContextMenu 阶段能够自适应单选与多选
  assert.match(
    hookSrc,
    /const\s+selectedNodes\s*=\s*useCanvasStore\.getState\(\)\.nodes\.filter\(\(n\)\s*=>\s*n\.selected\);/,
    'openContextMenu 必须从 store 提取实时选中的节点',
  );
  assert.match(
    hookSrc,
    /if\s*\(selectedNodes\.length\s*===\s*1\)\s*\{\s*context\s*=\s*\{\s*type:\s*'node',\s*nodeId:\s*selectedNodes\[0\]\.id\s*\};/,
    '单选节点未传特定 node 时，智能绑定为该节点的 node 上下文',
  );
  assert.match(
    hookSrc,
    /else\s+if\s*\(selectedNodes\.length\s*>\s*1\)\s*\{\s*context\s*=\s*\{\s*type:\s*'selection'\s*\};/,
    '多选节点未传特定 node 时，智能识别为 selection 上下文',
  );

  // 4. delete 动作响应端到端链路
  assert.match(
    hookSrc,
    /case\s+'delete':\s*\{\s*if\s*\(context\.type\s*===\s*'node'\)\s*\{.*deleteSelectedNodes\(\);/s,
    '节点删除动作必须能够级联调用 deleteSelectedNodes',
  );
});
