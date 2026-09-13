/**
 * @file Markdown 战报 + JSONL 运行台账落盘。
 *
 * 本文件是 `src/present/**` 中**唯一允许写盘**的模块（§7.1 白名单）。
 * 写盘经注入的 `writeFile` / `appendFile`，单测可用假实现断言调用而不碰真实文件系统。
 */

import path from 'node:path'

import { TIER_LABELS } from '../config.js'
import { formatNumber } from '../core/metrics.js'
import { formatIsoUtc, formatShanghai, sanitizeLogData } from '../run-store.js'

/** 台账文件名。 */
export const RUNS_FILE_NAME = 'runs.jsonl'

/**
 * 战报文件名。
 * @param {string} runId 运行 id
 * @returns {string}
 */
export function reportFileName(runId) {
  return `report-${runId}.md`
}

/**
 * 渲染候选清单的 Markdown 表格。
 * @param {import('../core/sort.js').ScoredTweet[]} rows 候选清单
 * @returns {string}
 */
export function renderMarkdownTable(rows) {
  const list = Array.isArray(rows) ? rows : []
  if (list.length === 0) return '_本轮无待截流目标。_'

  const header = '| # | 分级 | 作者 | 时速(次/时) | 存活 | 预估曝光 | 互动(赞/转/评) | 推文摘要 |'
  const separator = '| --- | --- | --- | --- | --- | --- | --- | --- |'
  const lines = [header, separator]

  list.forEach((row, index) => {
    const record = row?.record
    const stats = row?.stats
    const metrics = record?.metrics ?? {}
    const tier = String(stats?.tier ?? 'normal')
    const flag = row?.degraded ? '! ' : ''
    const summary = String(record?.text ?? '')
      .replace(/\s+/g, ' ')
      .replace(/\|/g, '\\|')
      .trim()
      .slice(0, 60)

    lines.push(
      `| ${index + 1} | ${flag}${TIER_LABELS[tier] ?? tier} | ${record?.authorHandle ? `@${record.authorHandle}` : record?.author || '—'} | ${formatNumber(stats?.pace)} | ${(stats?.hoursAlive ?? 0).toFixed(1)} 小时 | ${formatNumber(stats?.exposure?.predicted)} | ${formatNumber(metrics.likes)}/${formatNumber(metrics.retweets)}/${formatNumber(metrics.replies)} | ${summary}${record?.url ? ` [原推](${record.url})` : ''} |`,
    )
  })

  return lines.join('\n')
}

/**
 * 渲染草稿区（Markdown）。已生成过的条目标注「已生成过」。
 * @param {Array<Record<string, any>>} drafts 草稿列表
 * @param {import('../core/sort.js').ScoredTweet[]} rows 候选清单
 * @returns {string}
 */
export function renderMarkdownDrafts(drafts, rows) {
  const list = Array.isArray(drafts) ? drafts : []
  if (list.length === 0) return '_本轮无草稿。_'

  const byId = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    byId.set(String(row?.record?.id ?? ''), row)
  }

  /** @type {string[]} */
  const blocks = []
  list.forEach((draft, index) => {
    const row = byId.get(String(draft?.tweetId ?? ''))
    const handle = row?.record?.authorHandle ? `@${row.record.authorHandle}` : '未知作者'
    const lines = [`### ${index + 1}. ${handle}（${draft?.tweetId || '—'}）`, '']
    lines.push(`- 文案通道：\`${draft?.usedChannel ?? '—'}\``)

    if (draft?.alreadyDrafted === true) {
      lines.push('- 状态：**已生成过**（本轮跳过重复生成）')
      blocks.push(lines.join('\n'))
      return
    }

    lines.push(`- 时速：${formatNumber(row?.stats?.pace)} 次/小时`)
    lines.push(`- 预估曝光：${formatNumber(row?.stats?.exposure?.predicted)}`)
    if (draft?.reply) {
      lines.push('', `**评论草稿**（${draft.reply.strategy}）：`, '', '```text', draft.reply.text, '```')
    }
    if (draft?.quote) {
      lines.push('', '**引用转发草稿**：', '', '```text', draft.quote.text, '```')
    }
    for (const warning of Array.isArray(draft?.warnings) ? draft.warnings : []) {
      lines.push(`- 提示：${warning}`)
    }
    blocks.push(lines.join('\n'))
  })

  return blocks.join('\n\n')
}

/**
 * 渲染 Markdown 战报（纯函数）。
 * @param {Record<string, any>} payload 运行产物
 * @returns {string} Markdown 全文
 */
export function renderMarkdownReport(payload) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : []
  const allRows = Array.isArray(payload?.allRows) ? payload.allRows : []
  const warnings = Array.isArray(payload?.warnings) ? payload.warnings : []
  const meta = payload?.meta ?? {}
  const degraded = allRows.filter((row) => row?.degraded === true)

  const parts = [
    '# 推特推文爆速检测与智能截流 · 战报',
    '',
    `- 运行 ID：\`${payload?.runId ?? '—'}\``,
    `- 开始时间：${formatShanghai(payload?.startedAtMs ?? 0)}（Asia/Shanghai）`,
    `- 结束时间：${formatShanghai(payload?.finishedAtMs ?? 0)}（Asia/Shanghai）`,
    `- 数据源：\`${payload?.source ?? '—'}\``,
    `- 采集条数：${meta?.fetchedCount ?? 0}`,
    `- 候选条数：${rows.length}（爆款 ${meta?.viral ?? 0} / 飙升 ${meta?.surging ?? 0}）`,
    `- 文案通道：\`${meta?.channel ?? '—'}\``,
    '',
    '## 候选清单',
    '',
    renderMarkdownTable(rows),
    '',
    '## 草稿区',
    '',
    renderMarkdownDrafts(payload?.drafts ?? [], rows),
    '',
    '## 数据健康度',
    '',
  ]

  if (degraded.length === 0) {
    parts.push('- 全部字段解析正常，无降级项。')
  } else {
    parts.push(`- ${degraded.length} 条推文存在数据缺陷（数值按 0 参与计算，不得当作真实 0）：`)
    for (const row of degraded) {
      const anomalies = Array.isArray(row?.record?.anomalies) ? row.record.anomalies.join('、') : ''
      parts.push(`  - \`${row?.record?.id || '—'}\`：${anomalies}`)
    }
  }

  if (warnings.length > 0) {
    parts.push('', '### 运行警告', '')
    for (const warning of warnings) parts.push(`- ${warning}`)
  }

  parts.push('', '## 运行参数', '')
  parts.push(`- 排序主键：\`${meta?.rankBy ?? '—'}\``)
  parts.push(`- 最低分级：\`${meta?.minTier ?? '—'}\``)
  parts.push(`- 最低预估曝光：${meta?.minExposure ?? 0}`)
  parts.push(`- 抓取上限：${meta?.limit ?? '—'}`)
  parts.push(`- 试运行：${meta?.dryRun === true ? '是' : '否'}`)
  parts.push('')

  return parts.join('\n')
}

/**
 * 渲染单行 JSONL 台账。
 * @param {Record<string, any>} payload 运行产物
 * @returns {string} 单行 JSON（不含换行）
 */
export function renderRunLogLine(payload) {
  const meta = payload?.meta ?? {}
  return JSON.stringify({
    runId: payload?.runId ?? '',
    startedAtMs: payload?.startedAtMs ?? 0,
    finishedAtMs: payload?.finishedAtMs ?? 0,
    startedAt: formatIsoUtc(payload?.startedAtMs ?? 0),
    source: payload?.source ?? '',
    fetched: meta?.fetchedCount ?? 0,
    candidates: Array.isArray(payload?.rows) ? payload.rows.length : 0,
    viral: meta?.viral ?? 0,
    surging: meta?.surging ?? 0,
    channel: meta?.channel ?? '',
    dryRun: meta?.dryRun === true,
    runOptions: sanitizeLogData(meta?.runOptions ?? {}),
    warnings: (Array.isArray(payload?.warnings) ? payload.warnings : []).slice(0, 20),
  })
}

/**
 * 落盘战报与台账。
 *
 * `--dry-run` 时调用方不应调用本函数（T05 交付标准 8：两者都不产生）。
 * @param {Record<string, any>} payload 运行产物
 * @param {{
 *   outDir: string,
 *   writeFile?: (p: string, content: string) => Promise<void>,
 *   appendFile?: (p: string, content: string) => Promise<void>,
 *   ensureDir?: (p: string) => Promise<void>,
 * }} deps 注入依赖（缺省时懒加载 `node:fs/promises`，供真实 CLI 运行）
 * @returns {Promise<{ markdownPath: string, jsonlPath: string }>}
 */
export async function writeReport(payload, deps) {
  const outDir = typeof deps?.outDir === 'string' && deps.outDir.trim() !== ''
    ? deps.outDir.trim()
    : ''
  if (outDir === '') {
    throw new Error('writeReport 需要 outDir')
  }

  const markdownPath = path.join(outDir, reportFileName(String(payload?.runId ?? 'unknown')))
  const jsonlPath = path.join(outDir, RUNS_FILE_NAME)

  const io = await resolveIo(deps)
  await io.ensureDir(outDir)
  await io.writeFile(markdownPath, renderMarkdownReport(payload))
  await io.appendFile(jsonlPath, `${renderRunLogLine(payload)}\n`)

  return { markdownPath, jsonlPath }
}

/**
 * 解析文件系统实现：优先注入，其次懒加载真实 fs。
 * @param {{
 *   writeFile?: (p: string, content: string) => Promise<void>,
 *   appendFile?: (p: string, content: string) => Promise<void>,
 *   ensureDir?: (p: string) => Promise<void>,
 * }} [deps] 注入依赖
 * @returns {Promise<{
 *   writeFile: (p: string, content: string) => Promise<void>,
 *   appendFile: (p: string, content: string) => Promise<void>,
 *   ensureDir: (p: string) => Promise<void>,
 * }>}
 */
async function resolveIo(deps = {}) {
  const injectedWrite = typeof deps.writeFile === 'function' ? deps.writeFile : null
  const injectedAppend = typeof deps.appendFile === 'function' ? deps.appendFile : null
  const injectedEnsure = typeof deps.ensureDir === 'function' ? deps.ensureDir : null

  if (injectedWrite && injectedAppend && injectedEnsure) {
    return { writeFile: injectedWrite, appendFile: injectedAppend, ensureDir: injectedEnsure }
  }

  const fs = await import('node:fs/promises')
  return {
    writeFile: injectedWrite ?? ((filePath, content) => fs.writeFile(filePath, content, 'utf8')),
    appendFile: injectedAppend ?? ((filePath, content) => fs.appendFile(filePath, content, 'utf8')),
    ensureDir: injectedEnsure ?? ((dirPath) => fs.mkdir(dirPath, { recursive: true }).then(() => undefined)),
  }
}
