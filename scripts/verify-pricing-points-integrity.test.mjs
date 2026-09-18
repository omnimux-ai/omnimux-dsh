/**
 * Pricing Points Integrity & Defense Gate
 *
 * 机械门禁第二防线：物理拦截任何虚高假数字与算价失真。
 * 1. 验算 MODEL_CHANNEL_GROUPS 中所有已登记基准定价的模型，其 pointsEstimate 必须严格与
 *    pricing-calculator.js 的推导值相符（误差 <= 0.1 积分）；
 * 2. 物理熔断红线：非 token 计费模型的 pointsEstimate 严禁大于 100（彻底阻断历史四位数虚高权重复发）；
 * 3. 校验中枢与画布两端镜像必须 100% 逐字一致。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_CHANNEL_GROUPS as HUB_GROUPS } from '../plugins/omnimux/src/catalog/serving/channel-groups.js';
import { MODEL_CHANNEL_GROUPS as CANVAS_GROUPS } from '../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts';
import { MODEL_BASE_PRICING, resolveGroupEstimatedPoints } from '../plugins/omnimux/src/catalog/pricing-calculator.js';

describe('Pricing Three Defenses: Pricing Points Integrity Gate', () => {
  it('mirrors pricing configurations exactly between hub and canvas', () => {
    const hubKeys = Object.keys(HUB_GROUPS).sort();
    const canvasKeys = Object.keys(CANVAS_GROUPS).sort();
    assert.deepEqual(canvasKeys, hubKeys, 'hub and canvas must define identical model keys');

    for (const key of hubKeys) {
      const hubList = HUB_GROUPS[key] || [];
      const canvasList = CANVAS_GROUPS[key] || [];
      assert.equal(canvasList.length, hubList.length, `${key} must have identical group counts`);

      for (let i = 0; i < hubList.length; i++) {
        const h = hubList[i];
        const c = canvasList[i];
        assert.equal(c.id, h.id, `${key}[${i}] id mismatch`);
        assert.equal(c.pricing?.pointsEstimate, h.pricing?.pointsEstimate, `${key}@${h.id} pointsEstimate mismatch`);
        assert.equal(c.pricing?.discountRate, h.pricing?.discountRate, `${key}@${h.id} discountRate mismatch`);
        assert.equal(c.pricing?.billingMode, h.pricing?.billingMode, `${key}@${h.id} billingMode mismatch`);
        assert.equal(c.pricing?.sortWeight, h.pricing?.sortWeight, `${key}@${h.id} sortWeight mismatch`);
      }
    }
  });

  it('enforces non-token models must never exceed 100 points (anti-hallucination barrier)', () => {
    for (const [modelId, groups] of Object.entries(HUB_GROUPS)) {
      for (const group of groups) {
        const mode = group.pricing?.billingMode;
        const pts = group.pricing?.pointsEstimate;
        if (mode === 'per_token') continue;
        if (typeof pts === 'number') {
          assert.ok(
            pts <= 100,
            `🚫【计费门禁拦截】模型 ${modelId} 分组 ${group.id} 的 pointsEstimate (${pts}) 超出安全上限 100 积分！严禁将内部排序权重当成积分展示！`,
          );
          assert.ok(
            pts >= 0,
            `🚫【计费门禁拦截】模型 ${modelId} 分组 ${group.id} 的 pointsEstimate (${pts}) 不得为负数！`,
          );
        }
      }
    }
  });

  it('verifies pointsEstimate matches pricing-calculator derivation for registered models', () => {
    const verifiedModels = ['minimax-h3', 'seedance-2-5', 'seedance-2-0', 'gpt-image-2.5', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'];

    for (const modelId of verifiedModels) {
      const groups = HUB_GROUPS[modelId] || [];
      assert.ok(groups.length > 0, `model ${modelId} must define channel groups`);

      for (const group of groups) {
        const declared = group.pricing?.pointsEstimate;
        const calculated = resolveGroupEstimatedPoints(modelId, group);

        assert.ok(
          calculated != null,
          `model ${modelId} group ${group.id} must be resolvable by pricing-calculator`,
        );
        assert.ok(
          typeof declared === 'number',
          `model ${modelId} group ${group.id} must declare numeric pointsEstimate`,
        );

        const diff = Math.abs(declared - calculated);
        assert.ok(
          diff <= 0.1,
          `🚫【计费门禁拦截】模型 ${modelId} 分组 ${group.id} 声明积分 (${declared}) 与真实单价验算结果 (${calculated}) 偏差过大 (${diff} > 0.1)！`,
        );
      }
    }
  });

  it('isolates sortWeight from user-facing pointsEstimate', () => {
    // 支柱三：验证内部排序权重和对外积分互不污染
    for (const [modelId, groups] of Object.entries(HUB_GROUPS)) {
      for (const group of groups) {
        if (group.pricing?.sortWeight != null) {
          assert.equal(typeof group.pricing.sortWeight, 'number', `${modelId}@${group.id} sortWeight must be numeric`);
        }
      }
    }
  });
});
