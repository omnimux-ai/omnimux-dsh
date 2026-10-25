#!/usr/bin/env node
/**
 * scripts/verify-channel-group-pricing.mjs
 *
 * 渠道分组定价真实性硬门禁（P1b 之后）。
 *
 * 真源只有一个：中枢目录的 `channelGroups` 投影，它的线路来自网关快照的
 * `enable_groups`、价格来自 `group_ratio` + 每模型计费。画布消费同一份投影，
 * 本地不得再抄一份价格表。
 *
 * 校验项：
 *   1. PROJECTION_PRICE_DRIFT —— 目录每条线路的积分必须能由快照口径逐项重算
 *      （`estimatePointsFromGateway`：快照单价/按次价 × 分组倍率）。
 *   2. PROJECTION_PRICE_UNEXPLAINED —— 没有可比数字的线路必须带 `pointsNote` 说明，
 *      且不得编造数字（网关按表达式/token 计费时）。
 *   3. PROJECTION_PRICE_OUT_OF_RANGE —— 非 token 计费的线路积分必须落在 0–100 安全区间。
 *   4. CANVAS_LOCAL_PRICE_TABLE —— 画布渠道模块不得再持有线路集合或价格数字。
 *
 * 退出码：0 全部通过；1 存在违规。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { buildModelCatalog } from '../plugins/omnimux/src/catalog/list.js'
import { resolveReadOnlySnapshot } from '../plugins/omnimux/src/catalog/cloud/current.js'
import { findSnapshotModel } from '../plugins/omnimux/src/catalog/cloud/view.js'
import { estimatePointsFromGateway, gatewayBillingMode } from '../plugins/omnimux/src/catalog/pricing-calculator.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

/** 画布渠道模块：只允许格式化与运行期自备渠道。 */
export const CANVAS_CHANNEL_MODULE =
  'plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts'

/** 非 token 计费线路的积分安全上限（防止把内部排序权重当成对外积分）。 */
export const MAX_NON_TOKEN_POINTS = 100

/**
 * 校验目录投影的每条线路价格都能由网关快照口径重算出来。
 * @param {object} snapshot 网关快照
 * @param {object} catalog 目录 DTO（`buildModelCatalog` 结果）
 * @returns {{ violations: Array<object>, comparable: number, explained: number }}
 */
export function checkProjectionPricing(snapshot, catalog) {
  const violations = []
  const rows = ['text', 'image', 'video', 'audio'].flatMap((kind) => catalog?.[kind] ?? [])
  if (rows.length === 0) {
    violations.push({ rule: 'CATALOG_EMPTY', modelId: '-', groupId: '-', detail: '目录没有任何行，定价门禁无从校验' })
    return { violations, comparable: 0, explained: 0 }
  }

  let comparable = 0
  let explained = 0
  for (const row of rows) {
    const snapshotModel = findSnapshotModel(snapshot, row.id)
    if (!snapshotModel) {
      violations.push({ rule: 'SNAPSHOT_MODEL_MISSING', modelId: row.id, groupId: '-', detail: '目录行在网关快照里不存在，线路与价格无依据' })
      continue
    }
    const lines = Array.isArray(row.channelGroups) ? row.channelGroups : []
    if (lines.length === 0) {
      violations.push({ rule: 'CATALOG_LINE_MISSING', modelId: row.id, groupId: '-', detail: '目录行没有任何线路，画布将显示空渠道池' })
      continue
    }
    const billingMode = gatewayBillingMode(snapshotModel)
    for (const group of lines) {
      const expected = estimatePointsFromGateway({
        billing: snapshotModel.billing,
        billingMode,
        groupRatio: group.pricing?.groupRatio,
      })
      const declared = group.pricing?.pointsEstimate ?? null
      if (declared !== (expected ?? null)) {
        violations.push({
          rule: 'PROJECTION_PRICE_DRIFT',
          modelId: row.id,
          groupId: group.id,
          detail: `目录 pointsEstimate=${declared}，但按快照单价 × 分组倍率应为 ${expected}；画布与中枢必须消费同一份快照口径`,
        })
        continue
      }
      if (expected == null) {
        const note = group.pricing?.pointsNote
        if (typeof note !== 'string' || !note.trim()) {
          violations.push({
            rule: 'PROJECTION_PRICE_UNEXPLAINED',
            modelId: row.id,
            groupId: group.id,
            detail: '该线路没有可比价格，却没有 pointsNote 说明为什么无法比对',
          })
          continue
        }
        explained++
        continue
      }
      comparable++
      if (billingMode !== 'per_token' && (expected < 0 || expected > MAX_NON_TOKEN_POINTS)) {
        violations.push({
          rule: 'PROJECTION_PRICE_OUT_OF_RANGE',
          modelId: row.id,
          groupId: group.id,
          detail: `非 token 计费线路积分 ${expected} 超出 0–${MAX_NON_TOKEN_POINTS} 安全区间`,
        })
      }
    }
  }
  return { violations, comparable, explained }
}

/**
 * 校验画布渠道模块不再持有任何线路集合或价格数字。
 * @param {string} source 画布 channelGroups 模块源码
 * @returns {Array<object>}
 */
export function checkCanvasPricingSource(source) {
  const violations = []
  if (/MODEL_CHANNEL_GROUPS/.test(source)) {
    violations.push({
      rule: 'CANVAS_LOCAL_PRICE_TABLE',
      modelId: '-',
      groupId: '-',
      detail: '画布 channelGroups 模块仍声明本地线路/价格表；线路与价格必须只来自目录投影',
    })
  }
  if (/pointsEstimate\s*:\s*-?\d/.test(source)) {
    violations.push({
      rule: 'CANVAS_LOCAL_PRICE_LITERAL',
      modelId: '-',
      groupId: '-',
      detail: '画布 channelGroups 模块仍硬编码 pointsEstimate 数字',
    })
  }
  if (/groupRatio\s*:\s*-?\d/.test(source)) {
    violations.push({
      rule: 'CANVAS_LOCAL_RATIO_LITERAL',
      modelId: '-',
      groupId: '-',
      detail: '画布 channelGroups 模块仍硬编码分组倍率',
    })
  }
  return violations
}

function main() {
  const snapshot = resolveReadOnlySnapshot().snapshot
  const catalog = buildModelCatalog({ env: {}, snapshot })
  const canvasSource = readFileSync(resolve(REPO_ROOT, CANVAS_CHANNEL_MODULE), 'utf8')
  const pricing = checkProjectionPricing(snapshot, catalog)
  const violations = [...pricing.violations, ...checkCanvasPricingSource(canvasSource)]

  if (violations.length === 0) {
    console.log(
      `✅ 渠道定价真实性门禁通过：${pricing.comparable} 条线路积分与网关快照口径逐项一致，` +
      `${pricing.explained} 条无可比价格的线路带明确说明，画布零本地价格表。`,
    )
    process.exit(0)
  }

  console.error(`❌ 渠道定价真实性门禁失败：发现 ${violations.length} 处违规。`)
  for (const v of violations) {
    console.error(`   - [${v.rule}] ${v.modelId}@${v.groupId}：${v.detail}`)
  }
  process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}
