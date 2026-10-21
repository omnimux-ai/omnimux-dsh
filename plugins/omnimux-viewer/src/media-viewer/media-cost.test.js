import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estimateMediaPoints, formatEstimatedPoints } from './media-cost.js';

describe('media cost estimate', () => {
  it('multiplies the catalog estimate by the batch count', () => {
    assert.deepEqual(estimateMediaPoints({ points: 0.13, count: 2 }), { points: 0.26, text: '0.26' });
    assert.deepEqual(estimateMediaPoints({ points: 0.13, count: 4 }), { points: 0.52, text: '0.52' });
    assert.deepEqual(estimateMediaPoints({ points: 8, count: 2 }), { points: 16, text: '16' });
    assert.deepEqual(estimateMediaPoints({ points: 1, count: 2 }), { points: 2, text: '2' });
  });

  it('keeps two decimals below one point', () => {
    assert.deepEqual(estimateMediaPoints({ points: 0.01, count: 4 }), { points: 0.04, text: '0.04' });
    assert.deepEqual(estimateMediaPoints({ points: 0.004, count: 1 }), { points: 0, text: '<0.01' });
  });

  it('accepts a string batch value and clamps to at least one', () => {
    assert.deepEqual(estimateMediaPoints({ points: 2, count: '3' }), { points: 6, text: '6' });
    assert.deepEqual(estimateMediaPoints({ points: 2, count: '9' }), { points: 8, text: '8' });
    assert.deepEqual(estimateMediaPoints({ points: 2, count: '0' }), { points: 2, text: '2' });
    assert.deepEqual(estimateMediaPoints({ points: 2, count: undefined }), { points: 2, text: '2' });
  });

  it('returns null when the catalog has no numeric estimate', () => {
    assert.equal(estimateMediaPoints({ points: null, count: 2 }), null);
    assert.equal(estimateMediaPoints({ points: undefined }), null);
    assert.equal(estimateMediaPoints({ points: Number.NaN }), null);
    assert.equal(estimateMediaPoints({}), null);
  });

  it('formats points for display', () => {
    assert.equal(formatEstimatedPoints(0), '0');
    assert.equal(formatEstimatedPoints(0.5), '0.5');
    assert.equal(formatEstimatedPoints(1.25), '1.3');
    assert.equal(formatEstimatedPoints(16.6), '17');
    assert.equal(formatEstimatedPoints(-1), '');
    assert.equal(formatEstimatedPoints(Number.NaN), '');
  });
});
