import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getAspectRatioGeometry,
  ASPECT_RATIO_GEOMETRIES,
  SUPPORTED_ASPECT_RATIOS,
} from './aspectRatioGeometry.ts';

test('aspectRatioGeometry defines accurate 3:2 and 2:3 geometric presets', () => {
  const g32 = getAspectRatioGeometry('3:2');
  assert.equal(g32.ratio, '3:2');
  assert.equal(g32.width, 21);
  assert.equal(g32.height, 14);
  assert.equal(g32.x, 1.5);
  assert.equal(g32.y, 5);
  assert.equal(g32.isDashed, false);

  const g23 = getAspectRatioGeometry('2:3');
  assert.equal(g23.ratio, '2:3');
  assert.equal(g23.width, 14);
  assert.equal(g23.height, 21);
  assert.equal(g23.x, 5);
  assert.equal(g23.y, 1.5);
  assert.equal(g23.isDashed, false);

  assert.ok(SUPPORTED_ASPECT_RATIOS.includes('3:2'));
  assert.ok(SUPPORTED_ASPECT_RATIOS.includes('2:3'));
});
