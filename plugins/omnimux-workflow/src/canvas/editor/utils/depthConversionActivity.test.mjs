import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearDepthConversionActivity,
  isDepthConversionActive,
  registerDepthConversion,
  releaseDepthConversion,
  shouldSelfHealDepthNode,
} from './depthConversionActivity.ts';
import { VIDEO_DEPTH_ORIGIN } from './planVideoDepthDownstream.ts';

test('活跃登记：register / release / isActive 成对生效', () => {
  clearDepthConversionActivity();
  assert.equal(isDepthConversionActive('depth_1'), false);
  registerDepthConversion('depth_1');
  assert.equal(isDepthConversionActive('depth_1'), true);
  releaseDepthConversion('depth_1');
  assert.equal(isDepthConversionActive('depth_1'), false);
});

test('自愈判定：只命中失联的深度派生 running 节点', () => {
  clearDepthConversionActivity();
  const running = { origin: VIDEO_DEPTH_ORIGIN, executionStatus: 'running' };
  assert.equal(shouldSelfHealDepthNode(running, 'depth_1'), true, 'running 且无活跃请求 → 失联');

  registerDepthConversion('depth_1');
  assert.equal(shouldSelfHealDepthNode(running, 'depth_1'), false, '本渲染器在跑 → 不得误判中断');
  releaseDepthConversion('depth_1');

  assert.equal(
    shouldSelfHealDepthNode({ origin: VIDEO_DEPTH_ORIGIN, executionStatus: 'completed' }, 'depth_1'),
    false,
  );
  assert.equal(
    shouldSelfHealDepthNode({ origin: 'audio_extract', executionStatus: 'running' }, 'audio_1'),
    false,
    '不得命中其他派生节点',
  );
  assert.equal(shouldSelfHealDepthNode({ materialType: 'video', executionStatus: 'running' }, 'v1'), false);
  assert.equal(shouldSelfHealDepthNode(undefined, 'depth_1'), false);
});
