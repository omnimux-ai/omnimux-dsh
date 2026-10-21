/**
 * 悬浮胶囊视口裁切修复契约（Issue #3604）。
 * 真实浏览器证据见 docs/evidence/workflow-pill-clip-3604/。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computePillClampShift } from '../../src/canvas/editor/utils/pillClamp.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, '../..');
const read = (rel) => readFileSync(join(pluginRoot, rel), 'utf8');
const pillSrc = read('src/canvas/editor/components/FloatingTopPill.tsx');

test('E2E 组件契约：胶囊测量 .react-flow 上沿并应用 clamp', () => {
  assert.match(pillSrc, /computePillClampShift/, '必须使用 clamp 计算');
  assert.match(pillSrc, /closest\('\.react-flow'\)/, '必须测量画布视口边界');
  assert.match(pillSrc, /data-pill-clamp-shift/, '必须暴露 clamp 状态便于验收');
  assert.match(pillSrc, /pillTop - clampShiftRef\.current \* zoom/, '必须基于未偏移 top 计算，避免自激');
});

test('E2E 行为：节点在视口上方时胶囊下移到视口内', () => {
  const shift = computePillClampShift({ pillTop: 700, boundaryTop: 865, zoom: 0.23 });
  const renderedTop = 700 + shift * 0.23;
  assert.ok(renderedTop >= 865, `胶囊应落入视口，实际 ${renderedTop}`);
});

test('E2E 正常位置不改变：未溢出时 shift 为 0', () => {
  assert.equal(computePillClampShift({ pillTop: 900, boundaryTop: 865, zoom: 0.23 }), 0);
});
