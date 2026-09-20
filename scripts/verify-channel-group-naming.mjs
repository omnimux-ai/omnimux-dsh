#!/usr/bin/env node
/**
 * scripts/verify-channel-group-naming.mjs
 *
 * 渠道分组显示名与副标题命名门禁。
 * 契约：docs/contracts/channel-group-naming.md
 *
 * 校验项：
 *   1. LABEL_NOT_ALLOWED       —— label 必须整体等于白名单档位词
 *   2. LABEL_DUPLICATE_TIER    —— 同一模型族内独占档位词不得重复
 *   3. STANDARD_LABEL_MISSING  —— 每个模型族必须存在「标准版」
 *   4. LABEL_SHAPE_INVALID     —— label 不得含分隔符或以「档」结尾
 *   5. FORBIDDEN_WORD          —— label / badge 禁止出现供应商名、采购层黑话、促销话术、价格自述
 *   6. MIRROR_MISMATCH         —— 画布镜像的 label / badge 序列必须与中枢逐字一致
 *
 * 退出码：0 全部通过；1 存在违规。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { MODEL_CHANNEL_GROUPS } from '../plugins/omnimux/src/catalog/serving/channel-groups.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

export const CONTRACT_PATH = 'docs/contracts/channel-group-naming.md'
export const HUB_PATH = 'plugins/omnimux/src/catalog/serving/channel-groups.js'
export const MIRROR_PATH =
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
 */
export function checkCatalog(catalog) {
  return Object.entries(catalog).flatMap(([family, groups]) => checkFamily(family, groups))
}

/**
 * 校验画布镜像与中枢的 label / badge 序列逐字一致。
 * @param {Record<string, Array<object>>} catalog
 * @param {string} mirrorText
 */
export function checkMirror(catalog, mirrorText) {
  const pick = (key) =>
    Object.values(catalog)
      .flat()
      .filter((g) => g.enabled !== false)
      .map((g) => String(g[key] ?? ''))

  let parsed = null
  try {
    const start = mirrorText.indexOf('export const MODEL_CHANNEL_GROUPS')
    if (start >= 0) {
      const objStart = mirrorText.indexOf('{', start)
      const objEnd = mirrorText.indexOf('\n};', objStart)
      if (objStart >= 0 && objEnd > objStart) {
        parsed = new Function('return (' + mirrorText.slice(objStart, objEnd) + '})')()
      }
    }
  } catch (_e) {
    parsed = null
  }

  const result = []
  for (const key of ['label', 'badge']) {
    const hub = pick(key)
    const mirror = parsed
      ? Object.values(parsed)
          .flat()
          .filter((g) => g.enabled !== false)
          .map((g) => String(g[key] ?? ''))
      : [...mirrorText.matchAll(new RegExp(`"${key}": "([^"]*)"`, 'g'))].map((m) => m[1])
    const hubCount = [...hub].sort().join('\u0001')
    const mirrorCount = [...mirror].sort().join('\u0001')
    if (hubCount !== mirrorCount) {
      result.push({
        rule: 'MIRROR_MISMATCH',
        family: '-',
        id: '-',
        detail: `画布镜像 ${key} 与中枢不一致（中枢 ${hub.length} 项 / 镜像 ${mirror.length} 项）`,
      })
    }
  }
  return result
}

function main() {
  const catalog = MODEL_CHANNEL_GROUPS
  const mirrorText = readFileSync(resolve(REPO_ROOT, MIRROR_PATH), 'utf8')
  const violations = [...checkCatalog(catalog), ...checkMirror(catalog, mirrorText)]

  const familyCount = Object.keys(catalog).length
  const groupCount = Object.values(catalog)
    .flat()
    .filter((g) => g.enabled !== false).length

  if (violations.length === 0) {
    console.log(
      `✅ 渠道分组命名门禁通过：${familyCount} 个模型族 / ${groupCount} 个分组，label 全部命中白名单，禁用词零命中，画布镜像一致。`,
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
