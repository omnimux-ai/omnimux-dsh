/**
 * 展示契约 e2e · Issue #4048
 *
 * 直接读取实际发货源码与主题样式，断言卡槽下方不再存在任何常驻状态文案：
 * - SlotWells 不渲染 `wf-slot-well__state`，也不含状态词
 * - 主题不残留 `.wf-slot-well__state` / `:has(...)` padding 死样式
 * 这是防回归的源码契约检查，不替代 Dev 真机验收。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const slotWells = readFileSync(resolve(here, '../../canvas/editor/components/MaterialNode/ConfigPanel/SlotWells/SlotWells.tsx'), 'utf8');
const theme = readFileSync(resolve(here, '../../canvas/theme/components.css'), 'utf8');
const STATE_WORDS = ['不兼容', '不可用', '等待中', '未使用', '无效'];

test('#4048 e2e：SlotWells 不再渲染常驻状态文案，状态词不出现在卡槽组件', () => {
  assert.equal(/wf-slot-well__state/.test(slotWells), false, '不得再渲染常驻状态节点');
  for (const word of STATE_WORDS) {
    assert.equal(slotWells.includes(word), false, `卡槽组件不得出现「${word}」文案`);
  }
});

test('#4048 e2e：主题不残留 wf-slot-well__state 与 :has padding 死样式', () => {
  assert.equal(theme.includes('wf-slot-well__state'), false, '主题不得残留状态文案样式');
  assert.equal(/wf-slot-wells:has\(\.wf-slot-well__state\)/.test(theme), false, '不得残留 :has 占位 padding');
});
