/**
 * @file GenUI 看板 spec 生成（本期唯一的「交互呈现」形态）。
 *
 * 插件只**产出 spec**，渲染交给宿主或 Agent；插件不依赖 React、不进客户端构建。
 *
 * 结构纪律（§7.5）：组件全部取自 GenUI 白名单；一条看板一个主题一个主组件
 * （主组件 = 候选清单 `table`）；根节点 ≤ 8、嵌套 ≤ 8 层；摘要截断 60 字不做多行展开。
 *
 * 本文件属 `src/present/**`：纯变换（输入 → 对象），不写盘、不发网络。
 */

import { TIER_LABELS } from '../config.js'
import { formatNumber } from '../core/metrics.js'
import { truncateToWidth } from './table-renderer.js'

/** 看板中推文摘要的截断宽度。 */
export const DASHBOARD_SUMMARY_WIDTH = 60

/** 看板主表格的最大行数（与 `maxTweets` 硬上限一致，保证两视图行数严格相等）。 */
export const DASHBOARD_MAX_ROWS = 200

/** 根节点数量上限。 */
export const MAX_ROOT_NODES = 8

/** 嵌套层级上限。 */
export const MAX_NESTING_DEPTH = 8

/** 节点总数上限。 */
export const MAX_TOTAL_NODES = 200

/**
 * 允许出现的组件类型：§7.5 点名的 7 个展示组件 + 4 个必要布局容器。
 * 任何不在该集合内的 `type` 都会被 `assertDashboardSpec` 判为非法。
 * @type {ReadonlySet<string>}
 */
export const GENUI_COMPONENT_WHITELIST = new Set([
  'stat',
  'table',
  'list',
  'callout',
  'badge',
  'keyvalue',
  'code',
  'row',
  'col',
  'text',
  'divider',
])

/**
 * 看板主表格列（7 列，摘要截断 60 字）。
 * @returns {string[]}
 */
export function dashboardColumns() {
  return ['分级', '作者', '时速', '存活', '预估曝光', '互动', '推文摘要']
}

/**
 * 把一条打分结果转成看板表格行。
 * @param {import('../core/sort.js').ScoredTweet} row 打分结果
 * @returns {string[]}
 */
export function dashboardRow(row) {
  const record = row?.record
  const stats = row?.stats
  const metrics = record?.metrics ?? {}
  const tier = String(stats?.tier ?? 'normal')
  const flag = row?.degraded ? '! ' : ''

  return [
    `${flag}${TIER_LABELS[tier] ?? tier}`,
    record?.authorHandle ? `@${record.authorHandle}` : record?.author || '—',
    formatNumber(stats?.pace),
    `${(stats?.hoursAlive ?? 0).toFixed(1)}h`,
    formatNumber(stats?.exposure?.predicted),
    `${formatNumber(metrics.likes)}/${formatNumber(metrics.retweets)}/${formatNumber(metrics.replies)}`,
    truncateToWidth(record?.text ?? '', DASHBOARD_SUMMARY_WIDTH),
  ]
}

/**
 * 统计分级分布。
 * @param {import('../core/sort.js').ScoredTweet[]} rows 打分行
 * @returns {{ viral: number, surging: number, normal: number }}
 */
export function tierCounts(rows) {
  const counts = { viral: 0, surging: 0, normal: 0 }
  for (const row of Array.isArray(rows) ? rows : []) {
    const tier = row?.stats?.tier
    if (tier === 'viral') counts.viral += 1
    else if (tier === 'surging') counts.surging += 1
    else counts.normal += 1
  }
  return counts
}

/**
 * 生成 GenUI 看板 spec。
 *
 * 组件构成（4 个根节点，≤ 8）：
 * 1. `stat` —— 待截流条数（主指标）
 * 2. `row` of `badge` —— 三档分级分布
 * 3. `table` —— 候选清单（主组件）
 * 4. `callout` —— 数据健康度（有 anomaly 时 `tone = 'warning'`）
 * 5. `keyvalue` —— 运行元信息
 * @param {import('../core/sort.js').ScoredTweet[]} rows 候选清单（已排序）
 * @param {Array<Record<string, any>>} drafts 草稿列表
 * @param {{
 *   runId?: string,
 *   startedAtMs?: number,
 *   source?: string,
 *   fetchedCount?: number,
 *   degradedCount?: number,
 *   allCount?: number,
 *   channel?: string,
 *   warnings?: string[],
 *   dryRun?: boolean,
 *   formatShanghai?: (ms: number) => string,
 * }} meta 运行元信息
 * @returns {{ title: string, gap: number, items: Array<Record<string, unknown>> }}
 */
export function buildDashboard(rows, drafts, meta = {}) {
  const list = Array.isArray(rows) ? rows : []
  const counts = tierCounts(list)
  const draftList = Array.isArray(drafts) ? drafts : []
  const draftByTweet = new Map(draftList.map((draft) => [String(draft?.tweetId ?? ''), draft]))
  const degradedCount = list.filter((row) => row?.degraded === true).length
  const warningList = Array.isArray(meta.warnings) ? meta.warnings : []

  /** @type {Array<Record<string, unknown>>} */
  const items = [
    {
      type: 'stat',
      label: '待截流条数',
      value: String(list.length),
      delta: `爆款 ${counts.viral} / 飙升 ${counts.surging}`,
    },
    {
      type: 'row',
      gap: 8,
      items: [
        { type: 'badge', text: `爆款 ${counts.viral}`, tone: counts.viral > 0 ? 'danger' : 'neutral' },
        { type: 'badge', text: `飙升 ${counts.surging}`, tone: counts.surging > 0 ? 'warning' : 'neutral' },
        { type: 'badge', text: `正常 ${counts.normal}`, tone: 'neutral' },
        { type: 'badge', text: `草稿 ${draftList.filter((draft) => draft?.alreadyDrafted !== true).length}`, tone: 'info' },
      ],
    },
    {
      type: 'table',
      columns: dashboardColumns(),
      rows: list.slice(0, DASHBOARD_MAX_ROWS).map((row) => dashboardRow(row)),
      total: list.length,
    },
    {
      type: 'callout',
      tone: degradedCount > 0 || warningList.length > 0 ? 'warning' : 'info',
      title: '数据健康度',
      content: buildHealthText({ degradedCount, warningList, meta, list, draftByTweet }),
    },
    {
      type: 'keyvalue',
      items: [
        { key: '运行 ID', value: String(meta?.runId ?? '—') },
        {
          key: '开始时间',
          value: meta?.formatShanghai ? meta.formatShanghai(meta.startedAtMs ?? 0) : '—',
        },
        { key: '数据源', value: String(meta?.source ?? '—') },
        { key: '采集 / 打分', value: `${meta?.fetchedCount ?? 0} / ${meta?.allCount ?? list.length} 条` },
        { key: '文案通道', value: String(meta?.channel ?? '—') },
      ],
    },
  ]

  return {
    title: meta?.dryRun === true ? '推特爆速截流看板（试运行）' : '推特爆速截流看板',
    gap: 14,
    items,
  }
}

/**
 * 组装数据健康度文案（有 anomaly 时说明缺陷类型与降级通道）。
 * @param {{
 *   degradedCount: number,
 *   warningList: string[],
 *   meta: Record<string, any>,
 *   list: import('../core/sort.js').ScoredTweet[],
 *   draftByTweet: Map<string, any>,
 * }} input 输入
 * @returns {string}
 */
function buildHealthText(input) {
  const { degradedCount, warningList, meta, list, draftByTweet } = input
  const parts = []

  if (degradedCount > 0) {
    const codes = new Set()
    for (const row of list) {
      if (row?.degraded !== true) continue
      for (const anomaly of Array.isArray(row?.record?.anomalies) ? row.record.anomalies : []) {
        codes.add(String(anomaly))
      }
    }
    parts.push(
      `${degradedCount} 条推文存在数据缺陷（${[...codes].sort().join('、')}），这些条目的数值按 0 参与计算并在表格中以 ! 标注`,
    )
  } else {
    parts.push('全部字段解析正常，无降级项')
  }

  const channels = new Set()
  for (const draft of draftByTweet.values()) {
    channels.add(String(draft?.usedChannel ?? '—'))
  }
  if (channels.size > 0) {
    parts.push(
      [...channels].every((channel) => channel === 'template')
        ? '文案通道：离线模板（模型不可用，草稿为可填充骨架）'
        : `文案通道：${[...channels].sort().join(' / ')}`,
    )
  }

  if (warningList.length > 0) {
    parts.push(`警告 ${warningList.length} 条：${warningList.slice(0, 2).join('；')}`)
  }

  return parts.join('。')
}

/**
 * 判断一个对象是否为「组件节点」（带字符串 `type` 字段）。
 *
 * 表格 `rows` 里的行是**数据**而不是组件，因此不计入节点总数与嵌套深度，
 * 否则一张 200 行的表会把节点预算（200）一次吃光。
 * @param {unknown} node 候选对象
 * @returns {boolean}
 */
function isComponentNode(node) {
  return (
    node !== null &&
    typeof node === 'object' &&
    !Array.isArray(node) &&
    typeof (/** @type {Record<string, unknown>} */ (node).type) === 'string'
  )
}

/**
 * 统计 spec 的根节点数、组件节点总数与最大嵌套深度。
 * @param {unknown} spec 看板 spec
 * @returns {{ roots: number, total: number, depth: number }}
 */
export function measureSpec(spec) {
  const rootItems = Array.isArray(/** @type {any} */ (spec)?.items)
    ? /** @type {any} */ (spec).items
    : []

  let total = 0
  let maxDepth = 0

  /**
   * @param {unknown} node 当前节点
   * @param {number} depth 当前组件嵌套深度（根组件为 1）
   */
  function walk(node, depth) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth)
      return
    }
    const component = isComponentNode(node)
    const nextDepth = component ? depth + 1 : depth
    if (component) {
      total += 1
      maxDepth = Math.max(maxDepth, nextDepth)
    }
    for (const value of Object.values(/** @type {Record<string, unknown>} */ (node))) {
      if (value !== null && typeof value === 'object') walk(value, nextDepth)
    }
  }

  for (const item of rootItems) walk(item, 0)

  return { roots: rootItems.length, total, depth: maxDepth }
}

/**
 * 收集 spec 中出现的全部组件类型（只认组件节点）。
 * @param {unknown} spec 看板 spec
 * @returns {string[]}
 */
export function collectComponentTypes(spec) {
  /** @type {Set<string>} */
  const types = new Set()
  const rootItems = Array.isArray(/** @type {any} */ (spec)?.items)
    ? /** @type {any} */ (spec).items
    : []

  /**
   * @param {unknown} node 当前节点
   */
  function walk(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child)
      return
    }
    if (isComponentNode(node)) {
      types.add(String(/** @type {Record<string, unknown>} */ (node).type))
    }
    for (const value of Object.values(/** @type {Record<string, unknown>} */ (node))) {
      if (value !== null && typeof value === 'object') walk(value)
    }
  }

  for (const item of rootItems) walk(item)
  return [...types]
}

/**
 * 结构校验：组件白名单 + 根节点 ≤ 8 + 嵌套 ≤ 8 层 + 节点总数 ≤ 200。
 *
 * 返回问题列表（空数组 = 合法），供测试直接断言。
 * @param {unknown} spec 看板 spec
 * @returns {string[]} 违规项描述
 */
export function validateDashboardSpec(spec) {
  /** @type {string[]} */
  const problems = []
  const rootItems = /** @type {any} */ (spec)?.items

  if (!Array.isArray(rootItems)) {
    problems.push('spec.items 必须是数组')
    return problems
  }

  const measurement = measureSpec(spec)

  if (measurement.roots > MAX_ROOT_NODES) {
    problems.push(`根节点 ${measurement.roots} 个，超过上限 ${MAX_ROOT_NODES}`)
  }
  if (measurement.depth > MAX_NESTING_DEPTH) {
    problems.push(`嵌套 ${measurement.depth} 层，超过上限 ${MAX_NESTING_DEPTH}`)
  }
  if (measurement.total > MAX_TOTAL_NODES) {
    problems.push(`节点总数 ${measurement.total}，超过上限 ${MAX_TOTAL_NODES}`)
  }

  for (const type of collectComponentTypes(spec)) {
    if (!GENUI_COMPONENT_WHITELIST.has(type)) {
      problems.push(`组件 ${type} 不在 GenUI 白名单内`)
    }
  }

  return problems
}
