import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computePillClampShift } from './pillClamp.ts';

test('pillClamp：未超出视口上沿不下移', () => {
  assert.equal(computePillClampShift({ pillTop: 200, boundaryTop: 100, zoom: 1 }), 0);
  assert.equal(computePillClampShift({ pillTop: 104, boundaryTop: 100, zoom: 1, margin: 4 }), 0);
});

test('pillClamp：溢出量按 zoom 换算为本地像素', () => {
  assert.equal(computePillClampShift({ pillTop: 822, boundaryTop: 865, zoom: 0.23 }), 47 / 0.23);
  assert.equal(computePillClampShift({ pillTop: 90, boundaryTop: 100, zoom: 1, margin: 4 }), 14);
});

test('pillClamp：非法 zoom 按 1 兜底，非法坐标返回 0', () => {
  assert.equal(computePillClampShift({ pillTop: 90, boundaryTop: 100, zoom: 0, margin: 0 }), 10);
  assert.equal(computePillClampShift({ pillTop: 90, boundaryTop: 100, zoom: Number.NaN, margin: 0 }), 10);
  assert.equal(computePillClampShift({ pillTop: Number.NaN, boundaryTop: 100, zoom: 1 }), 0);
  assert.equal(computePillClampShift({ pillTop: 90, boundaryTop: Number.NaN, zoom: 1 }), 0);
});

test('pillClamp：下移后基于原始 top 重算保持幂等（不自激）', () => {
  const zoom = 0.23;
  const boundaryTop = 865;
  const originalTop = 822;
  const shift = computePillClampShift({ pillTop: originalTop, boundaryTop, zoom });
  const renderedTop = originalTop + shift * zoom;
  const unclampedTop = renderedTop - shift * zoom;
  const next = computePillClampShift({ pillTop: unclampedTop, boundaryTop, zoom });
  assert.equal(next, shift);
  assert.ok(renderedTop >= boundaryTop, '下移后应落在视口内');
});
