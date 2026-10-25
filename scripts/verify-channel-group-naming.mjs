#!/usr/bin/env node
/**
 * scripts/verify-channel-group-naming.mjs
 *
 * 渠道分组显示名与副标题命名门禁。
 * 契约：docs/contracts/channel-group-naming.md
 *
 * 真源分工（P1b 之后）：
 * - 产品自己起名的线路（中枢展示覆盖表登记了该 wireGroup）受本规范全量约束；
 * - 网关直接发布、产品未命名的线路（覆盖表没有该 wireGroup）由网关起名，产品无权改名，
 *   因此只受「禁用词」约束，并在输出里单独计数（gateway-labelled），漂移可见；
 * - 画布显示的 label/badge 必须逐字等于目录投影，不得二次命名。
 *
 * 校验项：
 *   1. LABEL_NOT_ALLOWED       —— 产品命名线路的 label 必须整体等于白名单档位词
 *   2. LABEL_DUPLICATE_TIER    —— 同一模型族内独占档位词不得重复
 *   3. STANDARD_LABEL_MISSING  —— 每个模型族必须存在「标准版」
 *   4. LABEL_SHAPE_INVALID     —— label 不得含分隔符或以「档」结尾
 *   5. FORBIDDEN_WORD          —— label / badge 禁止出现供应商名、采购层黑话、促销话术、价格自述
 *   6. LABEL_PRICE_SELF_DESCRIPTION —— 产品命名的 label 不得自述价格数字
 *   7. CANVAS_NAME_DRIFT       —— 画布展示的 label / badge 必须等于目录投影
 *
 * 退出码：0 全部通过；1 存在违规。
 */

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { MODEL_CHANNEL_GROUPS } from '../plugins/omnimux/src/catalog/serving/channel-groups.js'
import { buildModelCatalog } from '../plugins/omnimux/src/catalog/list.js'
import { resolveReadOnlySnapshot } from '../plugins/omnimux/src/catalog/cloud/current.js'
import { readCanvasCatalog } from '../plugins/omnimux-workflow/src/workflow/seam/canvasCatalog.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

export const CONTRACT_PATH = 'docs/contracts/channel-group-naming.md'
export const HUB_PATH = 'plugins/omnimux/src/catalog/serving/channel-groups.js'
export const CANVAS_CHANNEL_MODULE =
  'plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts'

/** 白名单档位词（新增档位必须先进契约文件）。 */
export const ALLOWED_LABELS = Object.freeze([
  '旗舰版',
  '官方版',
  '优选版',
  '标准版',
  '经济版',
  '极速版',
  '高清版',
  '长片版',
  '口型版',
  '畅享版',
])

/** 同一模型族内至多出现一次的档位词。 */
export const UNIQUE_LABELS = Object.freeze(ALLOWED_LABELS.filter((l) => l !== '标准版'))

/** 每个模型族必须存在的基准档。 */
export const REQUIRED_LABEL = '标准版'

/** 禁止词：供应商 / 渠道名、采购层黑话、促销话术、价格自述。 */
export const FORBIDDEN_WORDS = Object.freeze([
  'Pidoi',
  'AutoDL',
  'Evolink',
  'APIMart',
  '维金',
  'goeasy',
  'runninghub',
  '号池',
  '官转',
  '成本池',
  '渠道',
  '专线池',
  '限时',
  '特惠池',
  '秒杀',
  '抢购',
  '高价',
  '超低价',
  '低价档',
])

/** label 形状：禁止分隔符与「档」后缀。 */
const LABEL_SHAPE_RE = /[·・/\\(（)）\s]|档$/

/** 价格自述：产品命名的 label 不得带金额或单价（价格由价格芯片单独呈现）。 */
const LABEL_PRICE_RE = /[¥$€]\s*\d|\d+\s*(?:元|美元|\/秒|\/次)/

/**
 * 校验单个模型族的分组集合。
 * @param {string} family
 * @param {Array<{id: string, label: string, badge?: string, enabled?: boolean}>} groups
 * @returns {Array<{rule: string, family: string, id: string, detail: string}>}
 */
export function checkFamily(family, groups) {
  const violations = []
  const active = groups.filter((g) => g.enabled !== false)
  const seen = new Map()

  for (const g of active) {
    const label = String(g.label ?? '')
    const badge = String(g.badge ?? '')

    if (!ALLOWED_LABELS.includes(label)) {
      violations.push({
        rule: 'LABEL_NOT_ALLOWED',
        family,
        id: g.id,
        detail: `label「${label}」不在白名单 ${ALLOWED_LABELS.join(' / ')}`,
      })
    }

    if (LABEL_SHAPE_RE.test(label)) {
      violations.push({
        rule: 'LABEL_SHAPE_INVALID',
        family,
        id: g.id,
        detail: `label「${label}」含分隔符或以「档」结尾`,
      })
    }

    if (LABEL_PRICE_RE.test(label)) {
      violations.push({
        rule: 'LABEL_PRICE_SELF_DESCRIPTION',
        family,
        id: g.id,
        detail: `label「${label}」自述价格数字；价格由价格芯片呈现`,
      })
    }

    if (UNIQUE_LABELS.includes(label)) {
      if (seen.has(label)) {
        violations.push({
          rule: 'LABEL_DUPLICATE_TIER',
          family,
          id: g.id,
          detail: `档位词「${label}」与分组 ${seen.get(label)} 重复`,
        })
      } else {
        seen.set(label, g.id)
      }
    }

    for (const word of FORBIDDEN_WORDS) {
      const hit = label.includes(word) ? 'label' : badge.includes(word) ? 'badge' : null
      if (hit) {
        violations.push({
          rule: 'FORBIDDEN_WORD',
          family,
          id: g.id,
          detail: `${hit} 含禁止词「${word}」`,
        })
      }
    }
  }

  if (active.length > 0 && !active.some((g) => String(g.label) === REQUIRED_LABEL)) {
    violations.push({
      rule: 'STANDARD_LABEL_MISSING',
      family,
      id: '-',
      detail: `缺少基准档「${REQUIRED_LABEL}」`,
    })
  }

  return violations
}

/**
 * 校验全部模型族。
 * @param {Record<string, Array<object>>} catalog
 * @returns {Array<object>}
 */
export function checkCatalog(catalog) {
  return Object.entries(catalog ?? {}).flatMap(([family, groups]) => checkFamily(family, groups))
}

/** 展示覆盖表里某模型登记的线路键（`wireGroup || id`）。 */
function overrideKeysFor(overrides, modelId) {
  const rows = Array.isArray(overrides?.[modelId]) ? overrides[modelId] : []
  return new Set(rows.map((group) => String(group?.wireGroup || group?.id || '')).filter(Boolean))
}

/**
 * 校验目录投影的显示名。
 *
 * @param {Record<string, Array<object>>} projected 模型 id → 目录线路行
 * @param {Record<string, Array<object>>} overrides 中枢展示覆盖表（`MODEL_CHANNEL_GROUPS`）
 * @returns {{violations: Array<object>, authoredCount: number, gatewayCount: number, gatewayLines: Array<{modelId: string, id: string, label: string}>}}
 */
export function checkProjectedCatalog(projected, overrides = MODEL_CHANNEL_GROUPS) {
  const violations = []
  const authored = {}
  const gatewayLines = []

  for (const [modelId, lines] of Object.entries(projected ?? {})) {
    const keys = overrideKeysFor(overrides, modelId)
    for (const line of Array.isArray(lines) ? lines : []) {
      if (line?.enabled === false) continue
      const wireKey = String(line?.wireGroup || line?.id || '')
      if (keys.has(wireKey)) {
        if (!authored[modelId]) authored[modelId] = []
        authored[modelId].push(line)
      } else {
        // 网关直接发布的线路：产品未命名，因此不做档位词白名单判定，
        // 但采购层黑话/供应商名/促销话术泄露仍然是产品风险，照查。
        gatewayLines.push({ modelId, id: String(line?.id ?? ''), label: String(line?.label ?? '') })
        const label = String(line?.label ?? '')
        const badge = String(line?.badge ?? '')
        for (const word of FORBIDDEN_WORDS) {
          const hit = label.includes(word) ? 'label' : badge.includes(word) ? 'badge' : null
          if (hit) {
            violations.push({
              rule: 'FORBIDDEN_WORD',
              family: modelId,
              id: line?.id ?? '-',
              detail: `${hit} 含禁止词「${word}」（该显示名由网关发布，需在中枢展示覆盖表补条目后再改名）`,
            })
          }
        }
      }
    }
  }

  violations.push(...checkCatalog(authored))
  const authoredCount = Object.values(authored).reduce((sum, rows) => sum + rows.length, 0)
  return { violations, authoredCount, gatewayCount: gatewayLines.length, gatewayLines }
}

/**
 * 校验画布展示的 label / badge 逐字等于目录投影。
 *
 * @param {Record<string, Array<object>>} canvasRows 画布接缝交付的四个桶
 * @param {Record<string, Array<object>>} directoryRows 目录 DTO 的四个桶
 * @returns {Array<object>}
 */
export function checkCanvasNames(canvasRows, directoryRows) {
  const violations = []
  const pick = (rows) => (rows ?? []).flatMap((row) => (row.channelGroups ?? [])
    .filter((group) => group.enabled !== false)
    .map((group) => `${row.id}@${group.id}|${String(group.label ?? '')}|${String(group.badge ?? '')}`))
    .sort()
  for (const kind of ['text', 'image', 'video', 'audio']) {
    const canvas = pick(canvasRows?.[kind])
    const directory = pick(directoryRows?.[kind])
    if (canvas.join('\u0001') !== directory.join('\u0001')) {
      violations.push({
        rule: 'CANVAS_NAME_DRIFT',
        family: kind,
        id: '-',
        detail: `画布 ${kind} 桶的分组显示名与目录投影不一致（画布 ${canvas.length} 项 / 目录 ${directory.length} 项）`,
      })
    }
  }
  return violations
}

function main() {
  const snapshot = resolveReadOnlySnapshot().snapshot
  const catalog = buildModelCatalog({ env: {}, snapshot })
  const projected = {}
  for (const kind of ['text', 'image', 'video', 'audio']) {
    for (const row of catalog[kind] ?? []) projected[row.id] = row.channelGroups ?? []
  }
  const canvasRows = readCanvasCatalog((name) => (name === 'modelCatalog' ? { list: () => catalog } : undefined))
  const naming = checkProjectedCatalog(projected, MODEL_CHANNEL_GROUPS)
  const violations = [...naming.violations, ...checkCanvasNames(canvasRows, catalog)]

  if (violations.length === 0) {
    console.log(
      `✅ 渠道分组命名门禁通过：产品命名 ${naming.authoredCount} 个分组全部命中白名单，` +
      `禁用词零命中；网关命名 ${naming.gatewayCount} 个分组只受禁用词约束（` +
      `${naming.gatewayLines.map((line) => `${line.modelId}@${line.id}`).join(', ') || '无'}）；` +
      '画布显示名与目录逐字一致。',
    )
    process.exit(0)
  }

  console.error(`❌ 渠道分组命名门禁失败：发现 ${violations.length} 处违规。`)
  console.error(`   契约：${CONTRACT_PATH}`)
  for (const v of violations) {
    console.error(`   - [${v.rule}] ${v.family} / ${v.id}：${v.detail}`)
  }
  process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}
