/**
 * @file 终端富表格渲染（零依赖，CJK 宽度对齐）。
 *
 * 自研理由：为 14 列数据引 `cli-table3` 不划算，且中文全角字符（`万` / `：`）
 * 会让按 `length` 计算的列宽全部错位。本文件提供按**显示宽度**对齐的最小实现。
 *
 * 本文件属 `src/present/**`：纯变换（输入 → 字符串），不写盘、不发网络。
 */

import { TIER_LABELS } from '../config.js'
import { formatNumber } from '../core/metrics.js'

/** 推文摘要列的默认显示宽度（超出即截断加省略号）。 */
export const SUMMARY_WIDTH = 40

/** 单次渲染的最大数据行数。 */
export const DEFAULT_MAX_ROWS = 20

/** ANSI 转义序列（宽度计算前剥离）。 */
const ANSI_PATTERN = /\u001B\[[0-9;]*m/g

/**
 * 判断码点是否为全角（占 2 个终端列）。
 * @param {number} code 码点
 * @returns {boolean}
 */
function isFullWidth(code) {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3041 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  )
}

/**
 * 计算字符串的终端显示宽度（CJK 全角按 2 计，ANSI 转义序列不计入）。
 * @param {unknown} text 待测文本
 * @returns {number}
 */
export function displayWidth(text) {
  if (typeof text !== 'string' || text === '') return 0
  const plain = text.replace(ANSI_PATTERN, '')
  let width = 0
  for (const char of plain) {
    const code = char.codePointAt(0) ?? 0
    if (code === 0x200d || (code >= 0xfe00 && code <= 0xfe0f)) continue
    width += isFullWidth(code) ? 2 : 1
  }
  return width
}

/**
 * 按显示宽度截断，超出时在末尾补省略号。
 * @param {unknown} text 原文
 * @param {number} maxWidth 最大显示宽度
 * @param {string} [ellipsis] 省略号（默认 `…`）
 * @returns {string} 显示宽度不超过 `maxWidth` 的字符串
 */
export function truncateToWidth(text, maxWidth, ellipsis = '…') {
  const source = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
  const limit = Number.isFinite(maxWidth) ? Math.max(0, Math.trunc(maxWidth)) : 0
  if (limit === 0) return ''
  if (displayWidth(source) <= limit) return source

  const ellipsisWidth = displayWidth(ellipsis)
  const budget = Math.max(0, limit - ellipsisWidth)
  let width = 0
  let output = ''
  for (const char of source) {
    const code = char.codePointAt(0) ?? 0
    const charWidth = isFullWidth(code) ? 2 : 1
    if (width + charWidth > budget) break
    output += char
    width += charWidth
  }
  return `${output}${ellipsis}`
}

/**
 * 按显示宽度补齐到指定列宽。
 * @param {unknown} text 单元格文本
 * @param {number} width 目标显示宽度
 * @param {'left' | 'right'} [align] 对齐方式
 * @returns {string}
 */
export function padCell(text, width, align = 'left') {
  const value = typeof text === 'string' ? text : String(text ?? '')
  const padding = Math.max(0, width - displayWidth(value))
  return align === 'right' ? `${' '.repeat(padding)}${value}` : `${value}${' '.repeat(padding)}`
}

/**
 * 列定义。
 * @typedef {object} Column
 * @property {string} key 字段名
 * @property {string} title 表头
 * @property {'left' | 'right'} align 对齐
 * @property {number} [min] 最小宽度
 * @property {number} [max] 最大宽度
 */

/**
 * 构造列集合（`showDegraded = false` 时去掉警示列）。
 * @param {boolean} showDegraded 是否渲染 `!` 警示列
 * @returns {Column[]}
 */
export function buildColumns(showDegraded) {
  /** @type {Column[]} */
  const columns = []
  if (showDegraded) {
    columns.push({ key: 'flag', title: '!', align: 'left', min: 1, max: 1 })
  }
  columns.push(
    { key: 'index', title: '#', align: 'right', min: 2, max: 4 },
    { key: 'tier', title: '分级', align: 'left', min: 4, max: 6 },
    { key: 'author', title: '作者', align: 'left', min: 6, max: 24 },
    { key: 'pace', title: '时速(次/时)', align: 'right', min: 11, max: 14 },
    { key: 'alive', title: '存活', align: 'right', min: 8, max: 12 },
    { key: 'exposure', title: '预估曝光', align: 'right', min: 8, max: 10 },
    { key: 'engagement', title: '互动(赞/转/评)', align: 'right', min: 14, max: 18 },
    { key: 'summary', title: '推文摘要', align: 'left', min: 12, max: SUMMARY_WIDTH },
  )
  return columns
}

/**
 * 把一条打分结果转成单元格数组。
 * @param {import('../core/sort.js').ScoredTweet} row 打分结果
 * @param {number} index 从 0 开始的行号
 * @param {number} summaryWidth 摘要列宽度
 * @returns {string[]}
 */
export function buildCells(row, index, summaryWidth) {
  const record = row?.record
  const stats = row?.stats
  const metrics = record?.metrics ?? {}
  const tier = String(stats?.tier ?? 'normal')

  return [
    row?.degraded ? '!' : ' ',
    String(index + 1),
    TIER_LABELS[tier] ?? tier,
    record?.authorHandle ? `@${record.authorHandle}` : record?.author || '—',
    formatNumber(stats?.pace),
    `${(stats?.hoursAlive ?? 0).toFixed(1)} 小时`,
    formatNumber(stats?.exposure?.predicted),
    `${formatNumber(metrics.likes)}/${formatNumber(metrics.retweets)}/${formatNumber(metrics.replies)}`,
    truncateToWidth(record?.text ?? '', summaryWidth),
  ]
}

/**
 * 渲染终端表格。
 *
 * 保证：**每一行的显示宽度完全相等**（含表头、分隔行、截断提示行），
 * 因此在等宽终端里不会出现锯齿错位。
 * @param {import('../core/sort.js').ScoredTweet[]} rows 候选清单（应已排序）
 * @param {{ maxRows?: number, color?: boolean, showDegraded?: boolean, summaryWidth?: number }} [options] 渲染选项
 * @returns {string} 表格文本（多行，行尾无换行）
 */
export function renderTable(rows, options = {}) {
  const list = Array.isArray(rows) ? rows : []
  const maxRows =
    typeof options.maxRows === 'number' && Number.isFinite(options.maxRows)
      ? Math.max(0, Math.trunc(options.maxRows))
      : DEFAULT_MAX_ROWS
  const showDegraded = options.showDegraded !== false
  const summaryWidth =
    typeof options.summaryWidth === 'number' && Number.isFinite(options.summaryWidth)
      ? Math.max(8, Math.trunc(options.summaryWidth))
      : SUMMARY_WIDTH

  const columns = buildColumns(showDegraded)
  const actualSummaryWidth = columns[columns.length - 1]?.max ?? summaryWidth
  const visible = list.slice(0, maxRows)
  const bodyCells = visible.map((row, index) =>
    buildCells(row, index, actualSummaryWidth).slice(showDegraded ? 0 : 1),
  )

  /** @type {number[]} */
  const widths = columns.map((column, columnIndex) => {
    let width = displayWidth(column.title)
    for (const cells of bodyCells) {
      width = Math.max(width, displayWidth(cells[columnIndex] ?? ''))
    }
    const min = column.min ?? 1
    const max = column.max ?? Number.MAX_SAFE_INTEGER
    return Math.min(Math.max(width, min), max)
  })

  const totalWidth =
    widths.reduce((sum, width) => sum + width, 0) + 3 * Math.max(0, widths.length - 1)

  const headerLine = columns
    .map((column, columnIndex) => padCell(column.title, widths[columnIndex] ?? 0, column.align))
    .join(' | ')

  const separatorLine = widths.map((width) => '-'.repeat(width)).join('-+-')

  const lines = [headerLine, separatorLine]
  for (const cells of bodyCells) {
    lines.push(
      cells
        .map((cell, columnIndex) => {
          const width = widths[columnIndex] ?? 0
          const clipped = truncateToWidth(cell, width, '…')
          const padded = padCell(clipped, width, columns[columnIndex]?.align ?? 'left')
          return padded
        })
        .join(' | '),
    )
  }

  if (list.length > visible.length) {
    const notice = `… 共 ${list.length} 条，仅显示前 ${visible.length} 条（--limit 可调整抓取量）`
    lines.push(padCell(truncateToWidth(notice, totalWidth, ''), totalWidth, 'left'))
  }

  return lines.join('\n')
}

/**
 * 渲染运行抬头（时间、数据源、参数）。
 * @param {{
 *   runId?: string,
 *   startedAtMs?: number,
 *   source?: string,
 *   fetchedCount?: number,
 *   candidateCount?: number,
 *   dryRun?: boolean,
 *   formatShanghai: (ms: number) => string,
 * }} meta 运行元信息
 * @returns {string}
 */
export function renderHeader(meta) {
  const lines = [
    '推特推文爆速检测与智能截流',
    `运行 ID：${meta?.runId ?? '—'}    开始：${meta?.formatShanghai ? meta.formatShanghai(meta.startedAtMs ?? 0) : '—'}`,
    `数据源：${meta?.source ?? '—'}    采集：${meta?.fetchedCount ?? 0} 条    候选：${meta?.candidateCount ?? 0} 条${meta?.dryRun ? '    （--dry-run：不生成文案、不落盘）' : ''}`,
  ]
  return lines.join('\n')
}

/**
 * 渲染分级小结与数据健康度。
 * @param {import('../core/sort.js').ScoredTweet[]} allRows 全部打分行
 * @param {import('../core/sort.js').ScoredTweet[]} candidates 候选行
 * @param {{ channel?: string, warnings?: string[] }} [meta] 运行元信息
 * @returns {string}
 */
export function renderSummary(allRows, candidates, meta = {}) {
  const list = Array.isArray(allRows) ? allRows : []
  const counts = { viral: 0, surging: 0, normal: 0 }
  for (const row of list) {
    const tier = row?.stats?.tier
    if (tier === 'viral') counts.viral += 1
    else if (tier === 'surging') counts.surging += 1
    else counts.normal += 1
  }

  const degraded = list.filter((row) => row?.degraded === true)
  const lines = [
    `分级分布：爆款 ${counts.viral} / 飙升 ${counts.surging} / 正常 ${counts.normal}`,
    `待截流候选：${Array.isArray(candidates) ? candidates.length : 0} 条（已达到 --min-tier 门槛）`,
  ]

  if (degraded.length > 0) {
    lines.push(`数据健康度：${degraded.length} 条存在数据缺陷（表格中以 ! 标注）`)
    for (const row of degraded.slice(0, 5)) {
      const anomalies = Array.isArray(row?.record?.anomalies) ? row.record.anomalies.join('、') : ''
      lines.push(`  ! ${row?.record?.id || '—'}：${anomalies}`)
    }
    if (degraded.length > 5) lines.push(`  … 其余 ${degraded.length - 5} 条略`)
  } else {
    lines.push('数据健康度：全部字段解析正常')
  }

  if (meta.channel) lines.push(`文案通道：${meta.channel}`)
  for (const warning of Array.isArray(meta.warnings) ? meta.warnings : []) {
    lines.push(`警告：${warning}`)
  }
  return lines.join('\n')
}

/**
 * 渲染草稿区（终端视图）。已生成过的条目使用「已生成过」标注，不重复输出正文。
 * @param {Array<Record<string, any>>} drafts 草稿列表
 * @param {import('../core/sort.js').ScoredTweet[]} rows 候选行（用于取作者与摘要）
 * @returns {string}
 */
export function renderDrafts(drafts, rows) {
  const list = Array.isArray(drafts) ? drafts : []
  if (list.length === 0) return '草稿区：本轮无待生成草稿'

  const byId = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    byId.set(String(row?.record?.id ?? ''), row)
  }

  const lines = ['草稿区：']
  list.forEach((draft, index) => {
    const row = byId.get(String(draft?.tweetId ?? ''))
    const handle = row?.record?.authorHandle ? `@${row.record.authorHandle}` : '未知作者'
    lines.push(`  ${index + 1}. ${handle}（${draft?.tweetId || '—'}）  通道：${draft?.usedChannel ?? '—'}`)
    if (draft?.alreadyDrafted === true) {
      lines.push('     已生成过：本轮跳过重复生成')
      return
    }
    if (draft?.reply) lines.push(`     评论：${draft.reply.text}`)
    if (draft?.quote) lines.push(`     引用：${draft.quote.text}`)
    for (const warning of Array.isArray(draft?.warnings) ? draft.warnings : []) {
      lines.push(`     提示：${warning}`)
    }
  })
  return lines.join('\n')
}
