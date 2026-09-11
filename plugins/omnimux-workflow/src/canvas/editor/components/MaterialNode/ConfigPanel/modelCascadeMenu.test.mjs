import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  getModelChannelGroups,
  getOrGenerateModelChannelGroups,
  parseModelAndGroup,
  resolveShortModelName,
} from './channelGroups.ts';

const here = dirname(fileURLToPath(import.meta.url));
const cascadeSrc = readFileSync(join(here, 'ModelCascadeMenu.tsx'), 'utf8');

describe('ModelCascadeMenu & channelGroups specifications', () => {
  it('resolves short model names for capsule trigger display', () => {
    assert.equal(resolveShortModelName('seedance-2-0-fast'), '2.0 Fast');
    assert.equal(resolveShortModelName('seedance-2-0'), 'Seedance 2.0');
    assert.equal(resolveShortModelName('seedance-2-5'), 'Seedance 2.5');
    assert.equal(resolveShortModelName('seedance-2-0-mini'), '2.0 Mini');
    assert.equal(resolveShortModelName('claude-opus-4-6'), 'Opus 4.6');
    assert.equal(resolveShortModelName('deepseek-v4-flash-vision-exp'), 'Flash Vision');
    assert.equal(resolveShortModelName('gpt-image-2.5'), 'Image 2.5');
    assert.equal(resolveShortModelName('midjourney'), 'Midjourney');
    assert.equal(resolveShortModelName(''), '选择模型');
  });

  it('generates rich channel groups for unconfigured models', () => {
    const generated = getOrGenerateModelChannelGroups('unknown-custom-model');
    assert.ok(generated.length >= 3);
    const labels = generated.map((g) => g.label);
    assert.ok(labels.includes('进阶版'));
    assert.ok(labels.includes('官方版'));
    assert.ok(labels.includes('标准版'));
  });

  it('ModelCascadeMenu source code respects style governance without raw hex', () => {
    const stripComments = (src) => src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const code = stripComments(cascadeSrc);
    assert.doesNotMatch(code, /#[0-9a-fA-F]{3,8}\b/, 'ModelCascadeMenu must not contain raw hex');
    assert.doesNotMatch(code, /--omx-/, 'ModelCascadeMenu must not contain banned tokens');
  });

  it('ModelCascadeMenu declares trigger capsule, 3 columns, and stability dot bar', () => {
    assert.match(cascadeSrc, /StabilityDotBar/);
    assert.match(cascadeSrc, /wf-model-cascade-capsule/);
    assert.match(cascadeSrc, /wf-model-cascade-popover/);
    assert.match(cascadeSrc, /稳定性优先/);
    assert.match(cascadeSrc, /低价优先/);
    assert.match(cascadeSrc, /已选/);
  });
});
