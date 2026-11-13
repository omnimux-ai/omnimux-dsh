/**
 * 画布左侧 Toolbar 不被 xyflow pan/select 抢走点击。
 * 本包测试不装 jsdom，源码契约 + 抽出的 stopPropagation handler 一起测。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  preventToolbarAddContextMenu,
  stopToolbarNativeEvent,
} from './toolbarPointerGuard.ts';

const here = dirname(fileURLToPath(import.meta.url));
const toolbarSrc = readFileSync(join(here, 'Toolbar.tsx'), 'utf8');
const themeSrc = readFileSync(
  join(here, '../../theme/workbench-theme.css'),
  'utf8',
);

test('根节点 class 带 nodrag nopan（xyflow 约定）', () => {
  assert.match(toolbarSrc, /className="wf-canvas-toolbar nodrag nopan"/);
});

test('根节点 onPointerDown / onMouseDown 走 stopToolbarNativeEvent', () => {
  assert.match(toolbarSrc, /onPointerDown=\{stopToolbarNativeEvent\}/);
  assert.match(toolbarSrc, /onMouseDown=\{stopToolbarNativeEvent\}/);
});

test('所有 button 显式 type="button"，添加按钮点击仍调 onAddNode', () => {
  const buttons = [...toolbarSrc.matchAll(/<button\b([^>]*)>/g)].map((m) => m[1]);
  assert.equal(buttons.length >= 3, true, `expected ≥3 buttons, got ${buttons.length}`);
  for (const attrs of buttons) {
    assert.match(attrs, /\btype="button"/);
  }
  assert.match(toolbarSrc, /onSelect=\{handleSelectNodeType\}/);
  assert.match(toolbarSrc, /onAddNode\(type\)/);
});

test('添加按钮有 onContextMenu，不新做工具栏右键菜单', () => {
  assert.match(toolbarSrc, /onContextMenu=\{preventToolbarAddContextMenu\}/);
  assert.equal(toolbarSrc.includes('ToolbarContextMenu'), false);
  assert.equal(toolbarSrc.includes('<ContextMenu'), false);
});

test('Dock 添加菜单挂载 AddNodeMenu scope="dock"，并有外部点击关闭保护', () => {
  assert.match(toolbarSrc, /<AddNodeMenu scope="dock"/);
  assert.match(toolbarSrc, /useClickOutside/);
  assert.match(toolbarSrc, /enabled: isAddOpen/);
  assert.equal(toolbarSrc.includes('ADD_NODE_ITEMS'), false);
  assert.equal(toolbarSrc.includes('wf-dock-add-popover'), false);
  assert.equal(toolbarSrc.includes('toolbar.add.'), false);
});

test('stopToolbarNativeEvent 只 stopPropagation，不 preventDefault', () => {
  let stopped = 0;
  let prevented = 0;
  stopToolbarNativeEvent({
    stopPropagation() {
      stopped += 1;
    },
    preventDefault() {
      prevented += 1;
    },
  });
  assert.equal(stopped, 1);
  assert.equal(prevented, 0);
});

test('preventToolbarAddContextMenu 同时 preventDefault + stopPropagation', () => {
  let stopped = 0;
  let prevented = 0;
  preventToolbarAddContextMenu({
    preventDefault() {
      prevented += 1;
    },
    stopPropagation() {
      stopped += 1;
    },
  });
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
});

test('.wf-canvas-toolbar 有 pointer-events: auto 且 z-index ≥ 10', () => {
  const block = themeSrc.match(/\.wf-canvas-toolbar\s*\{[^}]+\}/);
  assert.ok(block, 'missing .wf-canvas-toolbar rule');
  assert.match(block[0], /pointer-events:\s*auto/);
  const z = block[0].match(/z-index:\s*(\d+)/);
  assert.ok(z, 'missing z-index');
  assert.equal(Number(z[1]) >= 10, true);
});

test('#4112 Dock 不再渲染导出/导入入口与 transfer 面板', () => {
  assert.equal(toolbarSrc.includes('toolbar.exportWorkflow'), false);
  assert.equal(toolbarSrc.includes('toolbar.importWorkflow'), false);
  assert.equal(toolbarSrc.includes('wf-transfer-panel'), false);
  assert.equal(toolbarSrc.includes('useWorkflowTransferStore'), false);
  assert.equal(toolbarSrc.includes('TransferPanel'), false);
  assert.equal(toolbarSrc.includes('fileInputRef'), false);
  assert.equal(toolbarSrc.includes('importNonce'), false);
  assert.equal(toolbarSrc.includes('Download'), false);
  assert.equal(toolbarSrc.includes('Upload'), false);
});

test('#4112 Dock 其余入口仍保留', () => {
  for (const key of ['toolbar.addNode', 'toolbar.insertTemplate', 'toolbar.selectMode', 'toolbar.assets', 'toolbar.help']) {
    assert.equal(toolbarSrc.includes(key), true, `missing Dock entry: ${key}`);
  }
});
