import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cascadePath = join(here, '../../src/canvas/editor/components/MaterialNode/ConfigPanel/ModelCascadeMenu.tsx');
const cascadeSrc = readFileSync(cascadePath, 'utf8');

test('e2e: model cascade menu channel card removes stability data bar completely', () => {
  // 1. 确认 StabilityDotBar 组件及引用已彻底清除
  assert.doesNotMatch(cascadeSrc, /StabilityDotBar/, 'StabilityDotBar component must be completely removed');

  // 2. 确认 24h 稳定率文字与稳定性暂无数据已不再出现
  assert.doesNotMatch(cascadeSrc, /24h 稳定率/, '24h stability rate text must not exist');
  assert.doesNotMatch(cascadeSrc, /稳定性暂无数据/, 'Stability placeholder must not exist');

  // 3. 确认 ChannelRow 中不含 avgWaitTimeSec 耗时条目
  assert.doesNotMatch(cascadeSrc, /avgWaitTimeSec/, 'Wait time logic should be removed from ChannelRow');
  assert.doesNotMatch(cascadeSrc, /约.*min/, 'Wait time display text must not exist');

  // 4. 确认核心元数据展示依然保持完备
  assert.match(cascadeSrc, /formatPriceLabel/, 'ChannelRow must still format price label');
  assert.match(cascadeSrc, /formatPriceChip/, 'ChannelRow must still format price discount chip');
  assert.match(cascadeSrc, /formatBillingLabel/, 'ChannelRow must still format billing label');
  assert.match(cascadeSrc, /wf-cascade-channel-row/, 'ChannelRow class must be retained');
});
