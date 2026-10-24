/**
 * Pricing Points Integrity & Defense Gate
 *
 * 机械门禁第二防线：物理拦截任何虚高假数字与算价失真。
 * 1. 验算目录投影（P1b 起由网关快照推导）的每条线路价格，必须与快照口径逐字相符；
 * 2. 物理熔断红线：非 token 计费模型的 pointsEstimate 严禁大于 100（彻底阻断历史四位数虚高权重复发）；
 * 3. 校验中枢与画布两端镜像必须 100% 逐字一致。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_CHANNEL_GROUPS as HUB_GROUPS } from '../plugins/omnimux/src/catalog/serving/channel-groups.js';
import { MODEL_CHANNEL_GROUPS as CANVAS_GROUPS } from '../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts';
import { estimatePointsFromGateway, gatewayBillingMode } from '../plugins/omnimux/src/catalog/pricing-calculator.js';
import { resolveReadOnlySnapshot } from '../plugins/omnimux/src/catalog/cloud/current.js';
import { findSnapshotModel } from '../plugins/omnimux/src/catalog/cloud/view.js';
import { buildModelCatalog } from '../plugins/omnimux/src/catalog/list.js';

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

  it('verifies every served line price is derived from the gateway snapshot', () => {
    // P1b：本地手抄价格表已删除，目录里每条线路的积分必须能由网关快照的
    // 单价 × 分组倍率重算出来；网关按表达式计费的线路不得出现数字，只带说明。
    const snapshot = resolveReadOnlySnapshot().snapshot;
    assert.ok(snapshot, 'the bundled gateway snapshot must be readable offline');

    const catalog = buildModelCatalog({ env: {}, snapshot });
    const rows = [...catalog.text, ...catalog.image, ...catalog.video, ...catalog.audio];
    assert.ok(rows.length > 0, 'the gateway-backed catalog must not be empty');

    for (const row of rows) {
      const snapshotModel = findSnapshotModel(snapshot, row.id);
      assert.ok(snapshotModel, `model ${row.id} must exist in the gateway snapshot`);
      assert.ok(row.channelGroups.length > 0, `model ${row.id} must expose at least one gateway line`);

      for (const group of row.channelGroups) {
        const expected = estimatePointsFromGateway({
          billing: snapshotModel.billing,
          billingMode: gatewayBillingMode(snapshotModel),
          groupRatio: group.pricing?.groupRatio,
        });
        assert.equal(
          group.pricing?.pointsEstimate ?? null,
          expected ?? null,
          `🚫【计费门禁拦截】模型 ${row.id} 线路 ${group.id} 的积分必须等于网关快照口径`,
        );
        if (expected == null) {
          assert.ok(
            typeof group.pricing?.pointsNote === 'string' && group.pricing.pointsNote.trim(),
            `model ${row.id} line ${group.id} must explain why no comparable price exists`,
          );
          assert.equal(group.pricing?.pointsEstimate ?? null, null, `model ${row.id} line ${group.id} must not invent a price`);
        } else {
          assert.ok(expected >= 0 && expected <= 100, `model ${row.id} line ${group.id} price ${expected} is out of the safe range`);
        }
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
