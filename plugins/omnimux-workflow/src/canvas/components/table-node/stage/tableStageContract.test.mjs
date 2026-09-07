// 契约测试：表格全屏舞台（SpreadsheetStage）必须贴合 .wf-canvas-editor 画布容器，
// 严禁 createPortal 到 document.body / position: fixed 造成 APP 全局覆盖。
// 对齐参照实现：TextStage（absolute + inset:0 + z-index:1000，CanvasEditor 内直接挂载）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stagePath = resolve(here, 'SpreadsheetStage.tsx');
const cssPath = resolve(here, '../../../theme/table-node.css');
const canvasEditorPath = resolve(here, '../../../editor/CanvasEditor.tsx');

const stageSrc = readFileSync(stagePath, 'utf8');
const cssSrc = readFileSync(cssPath, 'utf8');
const canvasEditorSrc = readFileSync(canvasEditorPath, 'utf8');

// 提取 .wf-stage-overlay 的完整声明块（到第一个右花括号为止）
function extractOverlayBlock(css) {
  const match = css.match(/\.wf-stage-overlay\s*\{[^}]*\}/);
  assert.ok(match, 'table-node.css 中必须存在 .wf-stage-overlay 规则块');
  return match[0];
}

test('SpreadsheetStage.tsx 不得使用 createPortal 或 document.body（禁止 APP 全局传送）', () => {
  assert.ok(
    !stageSrc.includes('createPortal'),
    'SpreadsheetStage.tsx 仍引用 createPortal，舞台会被传送到宿主全局',
  );
  assert.ok(
    !stageSrc.includes('document.body'),
    'SpreadsheetStage.tsx 仍引用 document.body，舞台会脱离 .wf-canvas-editor 画布',
  );
  assert.ok(
    !stageSrc.includes('react-dom'),
    'SpreadsheetStage.tsx 不应再依赖 react-dom（portal 已移除）',
  );
});

test('SpreadsheetStage 从未打开时返回 null，打开时直接返回 wf-stage-overlay JSX', () => {
  assert.match(stageSrc, /if \(!everOpened\) return null;/);
  assert.match(stageSrc, /className="wf-stage-overlay wf-canvas-root"/);
});

test('SpreadsheetStage 使用 everOpened + hidden/display:none 保活隐藏，严禁关页卸树（对齐 TextStage KeepAlive 规范）', () => {
  // 引入 useState 并维护 everOpened 状态
  assert.match(stageSrc, /import React, \{[^}]*useState[^}]*\} from 'react';/);
  assert.match(stageSrc, /const \[everOpened, setEverOpened\] = useState\(false\);/);
  assert.match(stageSrc, /if \(isStageOpen && !everOpened\)/);
  // 严禁关页 return null 卸树反模式（只允许 !everOpened 的首次早退）
  assert.ok(
    !/if \(!isStageOpen\) return null;/.test(stageSrc),
    '禁止 if (!isStageOpen) return null 卸树；关页必须隐藏保活',
  );
  // 根容器必须带 KeepAlive 隐藏三件套：hidden / data-visible / aria-hidden + display 切换
  assert.match(stageSrc, /hidden=\{!isStageOpen\}/);
  assert.match(stageSrc, /data-visible=\{isStageOpen \? 'true' : 'false'\}/);
  assert.match(stageSrc, /aria-hidden=\{isStageOpen \? undefined : 'true'\}/);
  assert.match(stageSrc, /display:\s*isStageOpen \? 'flex' : 'none'/);
});

test('table-node.css 中 .wf-stage-overlay 使用 absolute 贴合画布，严禁 fixed 全局覆盖', () => {
  const block = extractOverlayBlock(cssSrc);
  assert.match(
    block,
    /position:\s*absolute/,
    '.wf-stage-overlay 必须 position: absolute（贴合 position:relative 的 .wf-canvas-editor）',
  );
  assert.ok(
    !/position:\s*fixed/.test(block),
    '.wf-stage-overlay 严禁 position: fixed（会铺满整个宿主 APP 窗口）',
  );
  assert.match(block, /inset:\s*0/, '.wf-stage-overlay 必须 inset: 0');
  assert.match(block, /width:\s*100%/, '.wf-stage-overlay 必须 width: 100%');
  assert.match(block, /height:\s*100%/, '.wf-stage-overlay 必须 height: 100%');
  assert.match(
    block,
    /z-index:\s*1000/,
    '.wf-stage-overlay 的 z-index 必须为 1000，与 TextStage 一致（画布最上层但不盖系统浮层）',
  );
  // 保留的样式不得被误删
  assert.match(block, /display:\s*flex/);
  assert.match(block, /flex-direction:\s*column/);
  assert.match(block, /overflow:\s*hidden/);
});

test('CanvasEditor.tsx 正确引用并在 .wf-canvas-editor 容器内挂载 <SpreadsheetStage>', () => {
  assert.match(
    canvasEditorSrc,
    /import\s*\{\s*SpreadsheetStage\s*\}\s*from\s*['"]\.\.\/components\/table-node\/stage\/SpreadsheetStage['"]/,
    'CanvasEditor.tsx 必须导入 SpreadsheetStage',
  );
  assert.match(
    canvasEditorSrc,
    /<SpreadsheetStage\s*\/>/,
    'CanvasEditor.tsx 必须挂载 <SpreadsheetStage />',
  );
  assert.match(
    canvasEditorSrc,
    /className="wf-canvas-editor"[^>]*position:\s*'relative'/,
    '.wf-canvas-editor 根容器必须保持 position: relative 作为舞台定位锚点',
  );
});
