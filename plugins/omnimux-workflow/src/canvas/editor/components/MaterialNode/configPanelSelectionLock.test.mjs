/**
 * 回归：带 ConfigPanel 的生成节点，单选且 selected===true 时面板必须可见。
 * 禁止 click-outside / Esc / panelDismissed 与选中态分叉把面板摘掉。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isConfigPanelVisible } from '../../utils/nodeVisualMath.ts';

const here = dirname(fileURLToPath(import.meta.url));
const nodeSrc = readFileSync(join(here, 'index.tsx'), 'utf8');
const shellSrc = readFileSync(join(here, 'ConfigPanel/ConfigPanelShell.tsx'), 'utf8');
const mathSrc = readFileSync(join(here, '../../utils/nodeVisualMath.ts'), 'utf8');

test('isConfigPanelVisible 不再接受 / 不再尊重 panelDismissed', () => {
  assert.doesNotMatch(mathSrc, /panelDismissed/);
  assert.match(
    mathSrc,
    /export function isConfigPanelVisible\(\s*selected: boolean \| undefined,\s*executionStatus:/,
  );
  assert.equal(isConfigPanelVisible(true, undefined, 'generate', false), true);
  assert.equal(isConfigPanelVisible(true, true), true);
});

test('MaterialNode 不再持有 setPanelDismissed / panelDismissed 隐藏通道', () => {
  assert.doesNotMatch(nodeSrc, /panelDismissed/);
  assert.doesNotMatch(nodeSrc, /setPanelDismissed/);
  assert.match(
    nodeSrc,
    /isConfigPanelVisible\(\s*selected,\s*executionStatus,\s*(?:kind|effectiveKind),\s*isMultiSelected/,
  );
});

test('ConfigPanelShell 不再对 ConfigPanel 调用 useClickOutside / onClose', () => {
  assert.doesNotMatch(shellSrc, /useClickOutside/);
  assert.doesNotMatch(shellSrc, /onClose/);
  assert.match(nodeSrc, /<ConfigPanelShell>/);
  assert.doesNotMatch(nodeSrc, /<ConfigPanelShell onClose=/);
});
