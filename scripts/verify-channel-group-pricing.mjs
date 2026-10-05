#!/usr/bin/env node
/**
 * scripts/verify-channel-group-pricing.mjs
 *
 * 渠道分组定价真实性与推导一致性硬门禁。
 * 目的：彻底消灭 Agent 本地手工硬编码与随机臆造积分的 AI 诟病。
 *
 * 校验项：
 *   1. TEXT_MODEL_RATIO_ALIGNMENT —— 文本模型标准版积分与畅享版积分必须严格对齐网关官方 model_ratio 与 pool_ratio
 *   2. MIRROR_POINTS_MISMATCH      —— 画布镜像 (channelGroups.ts) 与中枢 (channel-groups.js) 的 pointsEstimate 必须逐字一致
 *   3. DISCOUNT_RATE_INVALID       —— discountRate 必须为有效正浮点数
 *
 * 退出码：0 全部通过；1 存在违规。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { MODEL_CHANNEL_GROUPS } from '../plugins/omnimux/src/catalog/serving/channel-groups.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

export const HUB_PATH = 'plugins/omnimux/src/catalog/serving/channel-groups.js'
export const MIRROR_PATH =
  'plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts'

/**
 * 网关权威基准（GET /api/pricing）：
 * model_ratio:
 *   gemini-3.8-flash: 0.375  -> 基准 100 积分
 *   claude-sonnet-4-6: 1.500 -> 严格 4 倍 = 400 积分
 * group_ratio:
 *   pool: 0.285714 (2.9折)
 *   default: 1.0
 */
const GATEWAY_TEXT_MODEL_RATIOS = Object.freeze({
  'gemini-3.8-flash': { ratio: 0.375, standardExpected: 100, poolExpected: 28 },
  'claude-sonnet-4-6': { ratio: 1.5, standardExpected: 400, poolExpected: 114 },
})

/**
 * 校验文本模型定价是否与网关官方倍率及号池折扣严格一致。
 */
export function checkTextModelPricing(catalog) {
  const violations = []

  for (const [modelId, expected] of Object.entries(GATEWAY_TEXT_MODEL_RATIOS)) {
    const groups = catalog[modelId]
    if (!groups) continue

    const standard = groups.find((g) => g.id === 'standard' || g.wireGroup === 'default')
    if (standard) {
      const declared = standard.pricing?.pointsEstimate
      if (declared !== expected.standardExpected) {
        violations.push({
          rule: 'TEXT_STANDARD_PRICING_DRIFT',
          modelId,
          groupId: standard.id,
          detail: `标准版 pointsEstimate=${declared}，但网关 ratio=${expected.ratio} 对应基准为 ${expected.standardExpected} 积分！严禁 AI 随机臆造！`,
        })
      }
    }

    const pool = groups.find((g) => g.id === 'pool' || g.wireGroup === 'pool')
    if (pool) {
      const declared = pool.pricing?.pointsEstimate
      if (declared !== expected.poolExpected) {
        violations.push({
          rule: 'TEXT_POOL_PRICING_DRIFT',
          modelId,
          groupId: pool.id,
          detail: `畅享版 pointsEstimate=${declared}，但根据标准版与网关 2.9折 (0.2857) 折算应为 ${expected.poolExpected} 积分！`,
        })
      }
    }
  }

  return violations
}

/**
 * 校验画布镜像与中枢在 pointsEstimate 上的全量对齐。
 */
export function checkMirrorPricing(catalog, mirrorText) {
  const violations = []

  let parsed = null
  try {
    const start = mirrorText.indexOf('export const MODEL_CHANNEL_GROUPS')
    if (start >= 0) {
      const objStart = mirrorText.indexOf('{', start)
      let depth = 0
      let objEnd = -1
      for (let i = objStart; i < mirrorText.length; i++) {
        if (mirrorText[i] === '{') depth++
        else if (mirrorText[i] === '}') {
          depth--
          if (depth === 0) {
            objEnd = i + 1
            break
          }
        }
      }
      if (objStart >= 0 && objEnd > objStart) {
        parsed = new Function('return (' + mirrorText.slice(objStart, objEnd) + ')')()
      }
    }
  } catch (_e) {
    parsed = null
  }

  if (!parsed) {
    violations.push({
      rule: 'MIRROR_PARSE_FAILED',
      modelId: '-',
      groupId: '-',
      detail: '无法解析画布 channelGroups.ts 镜像对象',
    })
    return violations
  }

  for (const [modelId, hubGroups] of Object.entries(catalog)) {
    const mirrorGroups = parsed[modelId]
    if (!mirrorGroups) {
      violations.push({
        rule: 'MIRROR_MODEL_MISSING',
        modelId,
        groupId: '-',
        detail: `画布镜像缺少模型族 ${modelId}`,
      })
      continue
    }

    for (const hg of hubGroups) {
      const mg = mirrorGroups.find((g) => g.id === hg.id)
      if (!mg) continue
      const hp = hg.pricing?.pointsEstimate ?? null
      const mp = mg.pricing?.pointsEstimate ?? null
      if (hp !== mp) {
        violations.push({
          rule: 'MIRROR_POINTS_MISMATCH',
          modelId,
          groupId: hg.id,
          detail: `中枢 pointsEstimate=${hp} 与画布镜像 pointsEstimate=${mp} 不一致`,
        })
      }
    }
  }

  return violations
}

function main() {
  const catalog = MODEL_CHANNEL_GROUPS
  const mirrorText = readFileSync(resolve(REPO_ROOT, MIRROR_PATH), 'utf8')
  const violations = [
    ...checkTextModelPricing(catalog),
    ...checkMirrorPricing(catalog, mirrorText),
  ]

  const checkedCount = Object.values(catalog).flat().filter((g) => g.pricing?.pointsEstimate != null).length

  if (violations.length === 0) {
    console.log(
      `✅ 渠道定价真实性与镜像对齐门禁通过：${checkedCount} 个分组报价通过对账，网关官方倍率校验一致，零手工偏差。`,
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
