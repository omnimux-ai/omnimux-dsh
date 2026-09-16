import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { transformSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const cascadePath = join(here, '../../src/canvas/editor/components/MaterialNode/ConfigPanel/ModelCascadeMenu.tsx');
const cascadeSrc = readFileSync(cascadePath, 'utf8');

test('Issue #2049 AC1: 策略切换胶囊彻底移除，无任何策略选择按钮', () => {
  assert.doesNotMatch(cascadeSrc, /wf-cascade-strategy-btn/, 'wf-cascade-strategy-btn 必须彻底移除');
  assert.doesNotMatch(cascadeSrc, /wf-cascade-strategy-grid/, 'wf-cascade-strategy-grid 容器必须彻底移除');
  assert.doesNotMatch(cascadeSrc, /稳定性优先|低价优先/, '代码中不应再残留稳定性与低价优先策略按钮文案');
});

test('Issue #2049 AC2: 渠道列表采用单选互斥（Radio）交互', () => {
  assert.match(cascadeSrc, /role="menuitemradio"/, '渠道行必须使用 menuitemradio 语义');
  assert.doesNotMatch(cascadeSrc, /role="menuitemcheckbox"/, '渠道行不得再使用 menuitemcheckbox 语义');
  assert.match(cascadeSrc, /onSelect=\{\(\) => handleSelectGroup\(group\.id\)\}/, '点击渠道行必须直接调用单选切换');
});

test('Issue #2049 AC3: 彻底移除底部批量操作区（已选 X/X 个、清空、全选）', () => {
  assert.doesNotMatch(cascadeSrc, /已选.*个/, '不得再出现已选数量统计');
  assert.doesNotMatch(cascadeSrc, />\s*清空\s*<\/button>/, '清空按钮必须彻底移除');
  assert.doesNotMatch(cascadeSrc, />\s*全选\s*<\/button>/, '全选按钮必须彻底移除');
});

test('Issue #2049 AC4: 触发胶囊展示选中分组标签，不展示策略图标与计数', () => {
  assert.match(cascadeSrc, /activeGroup\s*&&\s*activeChannelGroups\.length\s*>\s*1/, '多分组模型必须展示当前选中的分组标签');
  assert.match(cascadeSrc, /<span>\{activeGroup\.label\}<\/span>/, '徽标内必须渲染选中的分组标签');
  assert.doesNotMatch(cascadeSrc, /ShieldCheck|Percent/, '胶囊内不得再出现稳定性盾牌与低价百分比图标');
});

test('Issue #2049 AC5: 单选分组唯一锁定 allowedGroups 并派发', () => {
  const start = cascadeSrc.indexOf('const emit = useCallback(') + 'const emit = useCallback('.length;
  const end = cascadeSrc.indexOf('}, [onSelect, options]);', start) + 1;
  const expression = transformSync(`const emit = ${cascadeSrc.slice(start, end)};`, { loader: 'ts' }).code;
  const calls = [];
  const options = [{ id: 'seedance-2-0', label: 'Seedance 2.0' }];
  const mockGroups = [{ id: 'cheap', label: '特惠版' }, { id: 'pro', label: '进阶版' }];
  const isPickerCandidate = () => true;
  const getModelChannelGroups = () => mockGroups;
  const onSelect = (val) => calls.push(val);

  const emit = new Function(
    'options', 'isPickerCandidate', 'getModelChannelGroups', 'onSelect',
    `${expression}; return emit;`
  )(options, isPickerCandidate, getModelChannelGroups, onSelect);

  // 单选特惠版
  emit('seedance-2-0', ['cheap']);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    modelId: 'seedance-2-0',
    strategy: 'auto',
    allowedGroups: ['cheap'],
  });

  // 单选进阶版
  emit('seedance-2-0', ['pro']);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], {
    modelId: 'seedance-2-0',
    strategy: 'auto',
    allowedGroups: ['pro'],
  });
});
