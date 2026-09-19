import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_CASCADE_MODELS } from './MediaViewerComposerData.js';

describe('MediaViewerComposer Component Contract', () => {
  it('supplies structured cascade models with brand -> model -> channel', () => {
    assert.ok(Array.isArray(DEFAULT_CASCADE_MODELS), 'Must provide model list');
    assert.ok(DEFAULT_CASCADE_MODELS.length >= 2, 'Should have multiple brands');

    const seedanceBrand = DEFAULT_CASCADE_MODELS.find((b) => b.brandId === 'seedance');
    assert.ok(seedanceBrand, 'Must include seedance brand');
    assert.ok(seedanceBrand.models.length >= 1, 'Seedance must have models');

    const seedance20 = seedanceBrand.models.find((m) => m.id === 'seedance-2.0');
    assert.ok(seedance20, 'Must include seedance-2.0 model');
    assert.ok(seedance20.channels.length >= 2, 'Must include channels/versions');

    const flagship = seedance20.channels.find((c) => c.id === 'flagship');
    assert.ok(flagship, 'Must include flagship version');
    assert.equal(flagship.name, '旗舰版');
  });

  it('includes image and video brands in the cascade catalog', () => {
    const brands = DEFAULT_CASCADE_MODELS.map((b) => b.brandId);
    assert.ok(brands.includes('seedance'), 'Should support video brand seedance');
    assert.ok(brands.includes('minimax'), 'Should support video brand minimax');
    assert.ok(brands.includes('openai'), 'Should support image brand openai');
  });
});
