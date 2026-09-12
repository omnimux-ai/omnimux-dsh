import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatBillingLabel,
  formatPriceChip,
  formatPriceLabel,
  getModelChannelGroups,
  parseModelAndGroup,
  resolveShortModelName,
  MODEL_CHANNEL_GROUPS,
} from './channelGroups.ts';
// The picker mirror must equal the hub routing table; the hub is readable from a
// test (product code may not import it). The same comparison runs as a CI gate in
// scripts/verify-cross-plugin-model-alignment.mjs.
import { MODEL_CHANNEL_GROUPS as HUB_CHANNEL_GROUPS } from '../../../../../../../omnimux/src/catalog/serving/channel-groups.js';

describe('Canvas ConfigPanel ChannelGroups', () => {
  it('parses model and group safely', () => {
    assert.deepEqual(parseModelAndGroup('seedance-2-0@standard'), {
      modelId: 'seedance-2-0',
      group: 'standard',
    });
    assert.deepEqual(parseModelAndGroup('seedance-2-0'), {
      modelId: 'seedance-2-0',
      group: null,
    });
    assert.deepEqual(parseModelAndGroup(''), {
      modelId: '',
      group: null,
    });
  });

  it('retrieves channel groups for supported models', () => {
    const seedanceGroups = getModelChannelGroups('seedance-2-0');
    assert.ok(Array.isArray(seedanceGroups));
    assert.ok(seedanceGroups.length >= 3);
    const ids = seedanceGroups.map((g) => g.id);
    assert.ok(ids.includes('pro'));
    assert.ok(ids.includes('official'));
    assert.ok(ids.includes('standard'));

    const claudeGroups = getModelChannelGroups('claude-opus-4-6');
    assert.ok(claudeGroups.length >= 2);
    assert.ok(claudeGroups.map((g) => g.id).includes('claude-plus'));
  });

  it('offers no channels for a model the hub has no pool for', () => {
    // Inventing channels and prices here would promise routing the hub cannot do.
    assert.deepEqual(getModelChannelGroups('unknown-custom-model'), []);
    // 网关定价表未收录该模型 → 没有可依据的分组，画布不得凭空给渠道。
    assert.deepEqual(getModelChannelGroups('grok-imagine-image-2'), []);
  });

  it('mirrors the hub routing table exactly (model keys, ids and every routing field)', () => {
    assert.deepEqual(
      Object.keys(MODEL_CHANNEL_GROUPS).sort(),
      Object.keys(HUB_CHANNEL_GROUPS).sort(),
      'picker and hub must expose the same model pools',
    );
    for (const [modelId, hubGroups] of Object.entries(HUB_CHANNEL_GROUPS)) {
      const pickerGroups = MODEL_CHANNEL_GROUPS[modelId];
      assert.deepEqual(
        pickerGroups.map((g) => g.id).sort(),
        hubGroups.map((g) => g.id).sort(),
        `${modelId} channel ids must match the hub`,
      );
      for (const hubGroup of hubGroups) {
        const pickerGroup = pickerGroups.find((g) => g.id === hubGroup.id);
        assert.ok(pickerGroup, `${modelId}@${hubGroup.id} missing from the picker`);
        assert.equal(pickerGroup.wireGroup, hubGroup.wireGroup, `${modelId}@${hubGroup.id} wireGroup`);
        assert.equal(pickerGroup.pricing?.pointsEstimate, hubGroup.pricing?.pointsEstimate, `${modelId}@${hubGroup.id} points`);
        assert.equal(pickerGroup.pricing?.discountRate, hubGroup.pricing?.discountRate, `${modelId}@${hubGroup.id} discount`);
        assert.equal(pickerGroup.pricing?.priceRatio ?? null, hubGroup.pricing?.priceRatio ?? null, `${modelId}@${hubGroup.id} ratio`);
        assert.equal(pickerGroup.pricing?.billingMode, hubGroup.pricing?.billingMode, `${modelId}@${hubGroup.id} billing`);
        assert.equal(pickerGroup.sla?.stability24h, hubGroup.sla?.stability24h, `${modelId}@${hubGroup.id} stability`);
        assert.equal(pickerGroup.sla?.avgWaitTimeSec, hubGroup.sla?.avgWaitTimeSec, `${modelId}@${hubGroup.id} wait`);
        assert.equal(pickerGroup.enabled, hubGroup.enabled, `${modelId}@${hubGroup.id} enabled`);
      }
    }
  });

  it('derives the price chip and label from the real pricing fields', () => {
    assert.equal(formatPriceChip(0.52), '5.2折');
    assert.equal(formatPriceChip(0.97), '9.7折');
    assert.equal(formatPriceChip(1), '');
    assert.equal(formatPriceChip(undefined), '');
    // 加价组（倍率 > 1）照实显示，不再静默隐藏。
    assert.equal(formatPriceChip(1.428571), '×1.43');
    assert.equal(formatBillingLabel('per_second'), '按秒计费');
    assert.equal(formatBillingLabel('per_task'), '按条计费');
    assert.equal(formatBillingLabel('per_token'), '按量计费');
    assert.equal(formatBillingLabel(undefined), '');
    assert.equal(formatPriceLabel({ pointsEstimate: 1040 }), '≈1040 积分');
    // 只有真实倍率时给倍率，不折算成积分。
    assert.equal(formatPriceLabel({ pointsEstimate: null, priceRatio: 0.5 }), '×0.5 倍率');
    assert.equal(formatPriceLabel({ pointsEstimate: null, priceRatio: null }), '当前参数不支持报价');
    assert.equal(formatPriceLabel(undefined), '当前参数不支持报价');
  });

  it('never invents an SLA for groups the gateway does not publish one for', () => {
    for (const [modelId, groups] of Object.entries(MODEL_CHANNEL_GROUPS)) {
      for (const group of groups) {
        if (!group.sla) continue;
        assert.equal(typeof group.sla.stability24h, 'number', `${modelId}@${group.id} SLA 必须是真实数值`);
      }
    }
    // 网关公开定价接口不提供 SLA，所以这批新条目必须整体缺省。
    for (const modelId of ['gemini-3.8-flash', 'gpt-5.5', 'gpt-image-2.5', 'wan-3.0', 'suno']) {
      for (const group of MODEL_CHANNEL_GROUPS[modelId]) {
        assert.equal(group.sla, undefined, `${modelId}@${group.id} 不应凭空带 SLA`);
      }
    }
  });

  it('never repeats the discount inside a feature badge', () => {
    for (const [modelId, groups] of Object.entries(MODEL_CHANNEL_GROUPS)) {
      for (const group of groups) {
        const chip = formatPriceChip(group.pricing?.priceRatio ?? group.pricing?.discountRate);
        if (!chip) continue;
        assert.ok(
          !group.badge?.includes(chip),
          `${modelId}@${group.id} badge duplicates the price chip (${chip})`,
        );
      }
    }
  });

  it('resolves compact model names for the trigger capsule', () => {
    assert.equal(resolveShortModelName('seedance-2-0-fast'), '2.0 Fast');
    assert.equal(resolveShortModelName('seedance-2-0'), 'Seedance 2.0');
    assert.equal(resolveShortModelName('claude-opus-4-6'), 'Opus 4.6');
    assert.equal(resolveShortModelName('deepseek-v4-flash-vision-exp'), 'Flash Vision');
    assert.equal(resolveShortModelName(''), '选择模型');
  });
});
