/**
 * CanvasNodeHandle.test.mjs —— 节点连接点加号磁吸、高亮与安全契约测试
 * 本包测试不引入 jsdom，采用纯函数单元测试 + TSX/CSS 源码契约校验。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  HANDLE_INWARD_MAGNET_OFFSET,
  HANDLE_OUTWARD_MAGNET_OFFSET,
  HANDLE_VERTICAL_MAGNET_OFFSET,
  clampHandleMagnetOffset,
} from './handleMagnet.ts';

const here = dirname(fileURLToPath(import.meta.url));
const handleTsx = readFileSync(join(here, 'CanvasNodeHandle.tsx'), 'utf8');
const componentsCss = readFileSync(join(here, '../../theme/components.css'), 'utf8');

test('磁吸常量数值对齐 Gxgen（内4 / 外14 / 纵14）', () => {
  assert.equal(HANDLE_INWARD_MAGNET_OFFSET, 4);
  assert.equal(HANDLE_OUTWARD_MAGNET_OFFSET, 14);
  assert.equal(HANDLE_VERTICAL_MAGNET_OFFSET, 14);
});

test('clampHandleMagnetOffset 纯函数：中心点偏移为 0', () => {
  const rightCenter = clampHandleMagnetOffset('right', 0, 0);
  assert.deepEqual(rightCenter, { x: 0, y: 0 });

  const leftCenter = clampHandleMagnetOffset('left', 0, 0);
  assert.deepEqual(leftCenter, { x: 0, y: 0 });
});

test('clampHandleMagnetOffset 纯函数：右柄向外（+X）最大 14，向内（-X）最大 4', () => {
  const rightOutward = clampHandleMagnetOffset('right', 100, 0);
  assert.equal(rightOutward.x, 14);

  const rightInward = clampHandleMagnetOffset('right', -100, 0);
  assert.equal(rightInward.x, -4);
});

test('clampHandleMagnetOffset 纯函数：左柄向外（-X）最大 14，向内（+X）最大 4', () => {
  const leftOutward = clampHandleMagnetOffset('left', -100, 0);
  assert.equal(leftOutward.x, -14);

  const leftInward = clampHandleMagnetOffset('left', 100, 0);
  assert.equal(leftInward.x, 4);
});

test('clampHandleMagnetOffset 纯函数：纵向偏移（±Y）对称 clamp 在 ±14', () => {
  const topOverflow = clampHandleMagnetOffset('right', 0, -80);
  assert.equal(topOverflow.y, -14);

  const bottomOverflow = clampHandleMagnetOffset('right', 0, 80);
  assert.equal(bottomOverflow.y, 14);
});

test('CanvasNodeHandle.tsx 绑定 plusShellRef 并在 pointermove 时写 --wf-handle-offset-x/y', () => {
  assert.match(handleTsx, /ref=\{plusShellRef\}/);
  assert.match(handleTsx, /--wf-handle-offset-x/);
  assert.match(handleTsx, /--wf-handle-offset-y/);
  assert.match(handleTsx, /surface\.addEventListener\('pointermove', handlePointerMove\)/);
});

test('CanvasNodeHandle.tsx 菜单打开时磁吸早退停更，关菜单或离开时 reset', () => {
  assert.match(handleTsx, /if \(dropdownOpen\) return/);
  assert.match(handleTsx, /handleSurfaceLeave = useCallback\(\(\) => \{[\s\S]*?resetShellOffset\(\)/);
  assert.match(handleTsx, /if \(!dropdownOpen\) \{[\s\S]*?resetShellOffset\(\)/);
});

test('components.css 中 .wf-handle__plus transform 消费 offset 变量', () => {
  assert.match(
    componentsCss,
    /transform:\s*translate\(var\(--wf-handle-offset-x\),\s*var\(--wf-handle-offset-y\)\)\s*scale\(var\(--wf-handle-scale\)\);/,
  );
});

test('components.css 包含亮色态 plus-button hover 与 open 高亮规则', () => {
  assert.match(
    componentsCss,
    /\.wf-handle--surface-hovered \.wf-handle__plus-button,\s*\n\.wf-handle--open \.wf-handle__plus-button \{/,
  );
  assert.match(componentsCss, /border-color:\s*var\(--wf-handle-accent\);/);
});

test('坑#1 守门契约：.wf-handle 本体 pointer-events 不被 hover 门控', () => {
  // .wf-handle 本体规则没有 pointer-events: none / auto 的 hover 门控
  const handleBlock = componentsCss.match(/\.wf-handle\s*\{[\s\S]*?\n\}/);
  assert.ok(handleBlock, 'missing .wf-handle base block');
  assert.equal(
    handleBlock[0].includes('pointer-events'),
    false,
    '.wf-handle base block should not touch pointer-events',
  );

  // 只有 plus-hit-area 有 hover/open 时的 pointer-events 门控
  assert.match(
    componentsCss,
    /\.wf-handle--node-hovered \.wf-handle__plus-hit-area,[\s\S]*?pointer-events:\s*auto;/,
  );
});

test('REQ-WF-HANDLE-MONOCHROME: .wf-handle accent 必须是 --wb-node-ring，严禁使用 --wb-accent 避免蓝色边框', () => {
  assert.match(
    componentsCss,
    /--wf-handle-accent:\s*var\(--wb-node-ring\);/,
    '.wf-handle must consume --wb-node-ring for monochrome theme alignment',
  );
  assert.doesNotMatch(
    componentsCss,
    /--wf-handle-accent:\s*var\(--wb-accent\);/,
    '.wf-handle must not consume --wb-accent which introduces blue borders',
  );
});

test('REQ-WF-HANDLE-MONOCHROME: 深色和浅色主题下 plus-button 边框与高亮黑白自适应', () => {
  // 浅色模式默认边框基于黑白中性调色
  assert.match(
    componentsCss,
    /\.wf-handle__plus-button\s*\{[\s\S]*?border:\s*2px solid color-mix\(in srgb,\s*var\(--wf-handle-accent\) 35%,\s*var\(--wb-surface\)\);/,
  );
  // 深色模式下默认边框基于暗色 surface 混合白度
  assert.match(
    componentsCss,
    /body\[data-ds-dark-theme\] \.wf-canvas-root \.wf-handle__plus-button\s*\{[\s\S]*?border-color:\s*color-mix\(in srgb,\s*var\(--wf-handle-accent\) 45%,\s*var\(--wb-surface-raised\)\);/,
  );
  // 深色模式 hover 态边框高亮
  assert.match(
    componentsCss,
    /body\[data-ds-dark-theme\] \.wf-canvas-root \.wf-handle--surface-hovered \.wf-handle__plus-button,[\s\S]*?border-color:\s*var\(--wf-handle-accent\);/,
  );
});

