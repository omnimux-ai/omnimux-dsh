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

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

import { parse } from 'acorn'

import { buildModelCatalog } from '../plugins/omnimux/src/catalog/list.js'
import { resolveReadOnlySnapshot } from '../plugins/omnimux/src/catalog/cloud/current.js'
import { findSnapshotModel } from '../plugins/omnimux/src/catalog/cloud/view.js'
import { estimatePointsFromGateway, gatewayBillingMode } from '../plugins/omnimux/src/catalog/pricing-calculator.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

/** 画布渠道模块：只允许格式化与运行期自备渠道。 */
export const CANVAS_CHANNEL_MODULE =
  'plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts'

/** 画布源码根目录：镜像可能被写到任何新文件里，所以按目录扫而不是只扫一个模块。 */
export const CANVAS_SOURCE_ROOT = 'plugins/omnimux-workflow/src/canvas'

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
/**
 * 画布源码里禁止出现的「本地价格镜像」形态。判定按 AST，不按文本：
 * 正则只能抓三种字面写法，`const RATIO = 4.9`、`{standard: 4.9}`、`pointsEstimate: P[id]`、
 * `[["standard", 4.9]]`、`priceRatio: 0.5`、`import prices from './prices.json'` 全都能绕过。
 *
 * 判据：任何**含价格语义标识符**（ratio/points/price/discount/unit 等）的声明或属性，
 * 只要它的值里出现数字字面量、或指向另一个变量/成员/JSON 引入，就算镜像。
 * 纯格式化（`toFixed(2)`、`Math.round`）与目录投影读取（`row.channelGroups`）不触发。
 */
// `ratio` 单独出现时多半是宽高比（`U06_ASPECT_RATIO_MAP`），只有和价格语境组合才算价格语义。
const PRICE_IDENTIFIER = /(?:points?|price|discount|cost|billing|multiplier|(?:group|model|price|cost)_?ratio|ratio_?(?:price|cost|group))/i
const EXEMPT_PRICING_HELPERS = new Set(['toFixed', 'round', 'ceil', 'floor', 'abs', 'max', 'min', 'Number', 'parseFloat', 'parseInt'])

function isPricingName(name) {
  return typeof name === 'string' && PRICE_IDENTIFIER.test(name)
}

/** 收集一个表达式里是否含「价格来源」：数字字面量、标识符/成员引用、或外部 JSON 引入。 */
function collectPricingSources(node, found) {
  if (!node || typeof node !== 'object') return found
  if (Array.isArray(node)) { node.forEach(child => collectPricingSources(child, found)); return found }
  if (!node.type) return found
  if (node.type === 'Literal' && typeof node.value === 'number') found.add(`literal ${node.value}`)
  if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument?.type === 'Literal' && typeof node.argument.value === 'number') found.add(`literal -${node.argument.value}`)
  if (node.type === 'Identifier') found.add(`identifier ${node.name}`)
  if (node.type === 'MemberExpression' && !node.computed) found.add(`member ${node.property.name}`)
  if (node.type === 'ImportDeclaration' && /\.json$/i.test(String(node.source?.value ?? ''))) found.add(`json import ${node.source.value}`)
  for (const [key, child] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue
    collectPricingSources(child, found)
  }
  return found
}

/** 遍历 AST，找出含价格语义名字的声明/属性/JSON 引入。 */
function scanPricingMirrors(ast) {
  const violations = []
  const visit = node => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(visit); return }
    if (!node.type) return
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && isPricingName(node.id.name)) {
      const found = collectPricingSources(node.init, new Set())
      if (found.size) violations.push({ name: node.id.name, found: [...found] })
    }
    if ((node.type === 'Property' || node.type === 'PropertyDefinition' || node.type === 'MethodDefinition') && !node.computed) {
      const key = node.key?.name ?? node.key?.value
      if (isPricingName(key)) {
        const found = collectPricingSources(node.value, new Set())
        if (found.size) violations.push({ name: String(key), found: [...found] })
      }
    }
    if (node.type === 'ImportDeclaration' && /\.json$/i.test(String(node.source?.value ?? ''))) {
      const bound = node.specifiers.map(spec => spec.local?.name).filter(Boolean)
      if (bound.some(isPricingName)) violations.push({ name: bound.join(','), found: [`json import ${node.source.value}`] })
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue
      visit(child)
    }
  }
  visit(ast)
  return violations
}

/**
 * 扫一个画布源码文件，返回本地价格镜像违规。
 * `.ts` 先剥掉类型标注再解析（门禁只需要表达式结构，不需要类型信息）。
 */
export function checkCanvasPricingSource(source, filePath = CANVAS_CHANNEL_MODULE) {
  const violations = []
  if (/MODEL_CHANNEL_GROUPS/.test(source)) {
    violations.push({
      rule: 'CANVAS_LOCAL_PRICE_TABLE',
      file: filePath,
      detail: '画布仍声明本地线路/价格表（MODEL_CHANNEL_GROUPS）；线路与价格必须只来自目录投影',
    })
  }
  let ast
  try {
    ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true })
  } catch {
    // 解析不了（多为 TS 类型语法）：退回文本判据，宁可多报不可漏报。
    if (/pointsEstimate\s*:\s*-?\d/.test(source) || /groupRatio\s*:\s*-?\d/.test(source)) {
      violations.push({ rule: 'CANVAS_LOCAL_PRICE_LITERAL', file: filePath, detail: '画布仍硬编码价格数字（文本判据，文件无法按 AST 解析）' })
    }
    return violations
  }
  for (const mirror of scanPricingMirrors(ast)) {
    violations.push({
      rule: 'CANVAS_LOCAL_PRICE_MIRROR',
      file: filePath,
      detail: `画布在 \`${mirror.name}\` 上持有本地价格来源（${mirror.found.slice(0, 4).join('、')}）；价格必须只来自目录投影`,
    })
  }
  return violations
}

/** 递归列出画布源码目录下的所有脚本文件。 */
export function listCanvasSources(root = CANVAS_SOURCE_ROOT) {
  const absolute = resolve(REPO_ROOT, root)
  const out = []
  const walk = directory => {
    for (const entry of readdirSync(directory)) {
      const full = join(directory, entry)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (/\.(?:ts|tsx|mts|js|mjs)$/.test(entry) && !/\.test\./.test(entry)) out.push(full)
    }
  }
  walk(absolute)
  return out
}

function main() {
  const snapshot = resolveReadOnlySnapshot().snapshot
  const catalog = buildModelCatalog({ env: {}, snapshot })
  // 扫整个画布源码目录：镜像可能被写进任何新文件，只扫一个模块等于没扫。
  const canvasFiles = listCanvasSources()
  const canvasViolations = canvasFiles.flatMap(file => checkCanvasPricingSource(readFileSync(file, 'utf8'), relative(REPO_ROOT, file)))
  const pricing = checkProjectionPricing(snapshot, catalog)
  const violations = [...pricing.violations, ...canvasViolations]

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
