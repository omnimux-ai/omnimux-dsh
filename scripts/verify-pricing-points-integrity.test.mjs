/**
 * Pricing Points Integrity & Defense Gate
 *
 * 机械门禁第二防线：物理拦截任何虚高假数字与算价失真。
 * 1. 验算目录投影（P1b 起由网关快照推导）的每条线路价格，必须与快照口径逐字相符；
 * 2. 物理熔断红线：非 token 计费模型的 pointsEstimate 严禁大于 100（彻底阻断历史四位数虚高权重复发）；
 * 3. 画布展示层不得把内部排序权重当成对外积分（价格只由目录投影驱动）。
 *
 * 本地↔本地镜像比对已在 Issue #3762 退役：画布不再持有第二份线路/价格表，
 * 两端一致由 `verify-cross-plugin-model-alignment.mjs` 的「目录投影 vs 画布消费」覆盖。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePointsFromGateway, gatewayBillingMode } from '../plugins/omnimux/src/catalog/pricing-calculator.js';
import { resolveReadOnlySnapshot } from '../plugins/omnimux/src/catalog/cloud/current.js';
import { findSnapshotModel } from '../plugins/omnimux/src/catalog/cloud/view.js';
import { buildModelCatalog } from '../plugins/omnimux/src/catalog/list.js';
import { formatPriceLabel } from '../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts';

/** 目录投影的全部行（四个桶去重后按 id）。 */
function catalogRows() {
  const catalog = buildModelCatalog({ env: {}, snapshot: resolveReadOnlySnapshot().snapshot });
  const byId = new Map();
  for (const kind of ['text', 'image', 'video', 'audio']) {
    for (const row of [catalog.text, catalog.image, catalog.video, catalog.audio].flat()) byId.set(row.id, row);
  }
  return [...byId.values()];
}

describe('Pricing Three Defenses: Pricing Points Integrity Gate', () => {
  it('mirrors pricing configurations exactly between hub and canvas', () => {
    // 画布不再持有价格表：目录给什么，画布就展示什么（逐行同值，不是逐字同表）。
    const rows = catalogRows();
    assert.ok(rows.length > 0, 'the gateway-backed catalog must not be empty');
    for (const row of rows) {
      assert.ok(Array.isArray(row.channelGroups) && row.channelGroups.length > 0,
        `model ${row.id} must expose at least one gateway line`);
      for (const group of row.channelGroups) {
        assert.equal(typeof group.id, 'string', `model ${row.id} line id must be a string`);
        assert.ok(group.id.length > 0, `model ${row.id} line id must not be empty`);
        assert.equal(typeof group.label, 'string', `model ${row.id} line ${group.id} label must be a string`);
        assert.ok(group.label.length > 0, `model ${row.id} line ${group.id} label must not be empty`);
        assert.equal(typeof group.enabled, 'boolean', `model ${row.id} line ${group.id} enabled must be a boolean`);
      }
    }
  });

  it('enforces non-token models must never exceed 100 points (anti-hallucination barrier)', () => {
    for (const row of catalogRows()) {
      for (const group of row.channelGroups) {
        const mode = group.pricing?.billingMode;
        const pts = group.pricing?.pointsEstimate;
        if (mode === 'per_token') continue;
        if (typeof pts === 'number') {
          assert.ok(
            pts <= 100,
            `🚫【计费门禁拦截】模型 ${row.id} 分组 ${group.id} 的 pointsEstimate (${pts}) 超出安全上限 100 积分！严禁将内部排序权重当成积分展示！`,
          );
          assert.ok(
            pts >= 0,
            `🚫【计费门禁拦截】模型 ${row.id} 分组 ${group.id} 的 pointsEstimate (${pts}) 不得为负数！`,
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

    const rows = catalogRows();
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
    // 支柱三：内部排序权重不得污染对外积分——展示层只认目录给的数字/说明。
    assert.equal(formatPriceLabel({ pointsEstimate: 4.86, priceRatio: 0.17, sortWeight: 9999 }), '≈4.86 积分');
    assert.equal(formatPriceLabel({ pointsEstimate: null, priceRatio: null, pointsNote: '网关按计费表达式计价，无法逐项比对', sortWeight: 9999 }), '网关按计费表达式计价，无法逐项比对');
    for (const row of catalogRows()) {
      for (const group of row.channelGroups) {
        if (group.pricing?.sortWeight != null) {
          assert.equal(typeof group.pricing.sortWeight, 'number', `${row.id}@${group.id} sortWeight must be numeric`);
        }
      }
    }
  });
});
