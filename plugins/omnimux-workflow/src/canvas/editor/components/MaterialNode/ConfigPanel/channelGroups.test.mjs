import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatBillingLabel,
  formatPriceChip,
  formatPriceLabel,
  getModelChannelGroups,
  parseModelAndGroup,
  resolveLineConstraints,
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
    assert.deepEqual(getModelChannelGroups('grok-imagine-image-2-0'), []);
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
        assert.deepEqual(pickerGroup.parameterConstraints ?? null, hubGroup.parameterConstraints ?? null, `${modelId}@${hubGroup.id} parameterConstraints`);
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
    assert.equal(resolveShortModelName('deepseek-v4-flash'), 'Flash Vision');
    assert.equal(resolveShortModelName(''), '选择模型');
  });

  it('keeps the capsule label across the midjourney/nano-banana canonical rename (#1751)', () => {
    // 家族优先：契约 family 不随 canonical 改名变化，这是防「下次改名再断一次」的主路径。
    assert.equal(resolveShortModelName('mj-v8-1', 'midjourney'), 'Midjourney');
    assert.equal(resolveShortModelName('mj-v7', 'midjourney'), 'Midjourney');
    assert.equal(resolveShortModelName('nano-banana-2', 'nanobanana'), 'NanoBanana');
    assert.equal(resolveShortModelName('nano-banana-pro', 'nanobanana'), 'NanoBanana');
    assert.equal(resolveShortModelName('seedream-5-0-pro', 'seedream'), 'Seedream');
    // family 大小写 / 空白不敏感
    assert.equal(resolveShortModelName('mj-v8-1', '  MidJourney '), 'Midjourney');
    // 目录未提供 family 时的显式 id 条目兜底（含动作变体与渠道后缀）
    assert.equal(resolveShortModelName('mj-v8-1'), 'Midjourney');
    assert.equal(resolveShortModelName('mj-v7'), 'Midjourney');
    assert.equal(resolveShortModelName('mj-v7-upscale'), 'Midjourney');
    assert.equal(resolveShortModelName('mj-v8-1@standard'), 'Midjourney');
    assert.equal(resolveShortModelName('nano-banana-2'), 'NanoBanana');
    assert.equal(resolveShortModelName('nano-banana-pro@standard'), 'NanoBanana');
    // 旧写法仍是契约别名，短名不得因此丢失
    assert.equal(resolveShortModelName('midjourney-8.1'), 'Midjourney');
    assert.equal(resolveShortModelName('midjourney-8.1', 'midjourney'), 'Midjourney');
    // 未被 family 命中的 id 不得被家族表误吞
    assert.equal(resolveShortModelName('gpt-5.5', 'openai'), 'GPT-5.5');
  });

  // #1818：线路约束是完整规格——可用生成方式、参数选项集与输入能力，不只是固定时长。
  it('resolves the full spec of the lines the node routes to', () => {
    // 旗舰版目前只固定了时长；标准版与自动路由都不施加约束
    assert.deepEqual(resolveLineConstraints('seedance-2-5', { group: 'pro' }), { parameters: { duration: { fixed: 30 } } });
    assert.deepEqual(resolveLineConstraints('seedance-2-5', { allowedGroups: ['standard'] }), {});
    assert.deepEqual(resolveLineConstraints('seedance-2-5', undefined), {});
    assert.deepEqual(resolveLineConstraints('seedance-2-5', {}), {});
    assert.deepEqual(resolveLineConstraints('seedance-2-5', { allowedGroups: ['nope'] }), {});
    // 未声明约束的模型行为不变
    assert.deepEqual(resolveLineConstraints('seedance-2-0', { allowedGroups: ['pro'] }), {});
  });

  // 30 秒 / 9 图特惠线路（wireGroup seedance-cheap）上游断货已下架：
  // 它不再贡献任何约束，选中它的历史工程也不得把 30 秒 / 9 图能力继续挂在节点上。
  it('drops every constraint of the delisted cheap line', () => {
    assert.deepEqual(resolveLineConstraints('seedance-2-5', { allowedGroups: ['cheap'] }), {});
    assert.deepEqual(resolveLineConstraints('seedance-2-5', { group: 'seedance-cheap' }), {});
    assert.deepEqual(resolveLineConstraints('seedance-2-5@cheap', { allowedGroups: ['cheap'] }), {});
    // 下架线路与仍在售的标准版混选时，只剩标准版（无约束）
    assert.deepEqual(resolveLineConstraints('seedance-2-5', { allowedGroups: ['cheap', 'standard'] }), {});
  });

  // H3 全系列按分组接入：包含标准版、3倍速极速版、ComfyUI工作流双档专线、15秒长片版以及口型同步专线版。
  // 画布必须把各自的独立契约落到节点上。
  it('applies the H3 task line contract and leaves the standard line unconstrained', () => {
    const task = resolveLineConstraints('minimax-h3', { allowedGroups: ['task'] });
    assert.deepEqual(task.parameters.duration, { fixed: 15 });
    assert.deepEqual(task.parameters.resolution, { only: ['768P', '2K'] });
    assert.deepEqual(task.operations, [
      'text_to_video',
      'first_frame',
      'first_last_frame',
      'video_multi_ref',
    ]);

    // 口型同步专线：约束分辨率 768P/2K，生成方式仅 digital_human（对口型）
    const lipsync = resolveLineConstraints('minimax-h3', { allowedGroups: ['lipsync'] });
    assert.deepEqual(lipsync.parameters.resolution, { only: ['768P', '2K'] });
    assert.deepEqual(lipsync.operations, ['digital_human']);

    // 工作流双档专线：约束分辨率 768P/2K
    const videoFast = resolveLineConstraints('minimax-h3', { allowedGroups: ['video_fast'] });
    assert.deepEqual(videoFast.parameters.resolution, { only: ['768P', '2K'] });
    const videoPro = resolveLineConstraints('minimax-h3', { allowedGroups: ['video_pro'] });
    assert.deepEqual(videoPro.parameters.resolution, { only: ['768P', '2K'] });

    // 极速版与标准版沿用模型契约（4–15 秒可选），不额外施加分组时长约束
    assert.deepEqual(resolveLineConstraints('minimax-h3', { allowedGroups: ['turbo'] }), {});
    assert.deepEqual(resolveLineConstraints('minimax-h3', { allowedGroups: ['standard'] }), {});
    assert.deepEqual(resolveLineConstraints('minimax-h3', undefined), {});

    // 两组同选时取交集：长片版固定 15 秒会赢（标准版不施加时长约束）
    const mixed = resolveLineConstraints('minimax-h3', { allowedGroups: ['standard', 'task'] });
    assert.deepEqual(mixed.parameters.duration, { fixed: 15 });
  });
});
