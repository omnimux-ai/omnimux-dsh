/**
 * Render a gateway-vs-hub catalog diff for humans and for evidence files.
 *
 * Text output is stable: no timestamps unless the caller passes them, so a
 * report can be diffed between runs and committed as evidence.
 */

import { CLOUD_SNAPSHOT_SCHEMA_VERSION, snapshotDigest } from './snapshot.js'

/** @param {unknown} value @returns {string[]} */
function stringList(value) {
  return Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean) : []
}

/**
 * @param {object} diff result of `diffGatewayAgainstHub()`
 * @param {{ gateway?: object, hub?: object, gatewayLabel?: string, hubLabel?: string }} [context]
 */
export function diffReportDocument(diff, context = {}) {
  const gateway = context.gateway
  return {
    kind: 'omnimux-gateway-catalog-diff',
    schemaVersion: CLOUD_SNAPSHOT_SCHEMA_VERSION,
    gateway: gateway
      ? {
          source: gateway.source ?? null,
          generatedAt: gateway.generatedAt ?? null,
          digest: snapshotDigest(gateway),
          coverage: gateway.coverage ?? null,
          label: context.gatewayLabel ?? null,
        }
      : null,
    hub: context.hubLabel ? { label: context.hubLabel } : null,
    summary: diff.summary,
    limitations: diff.limitations,
    unreachable: diff.unreachable,
    gatewayOnly: diff.gatewayOnly,
    groupMissing: diff.groupMissing,
    groupExtra: diff.groupExtra,
    priceChanged: diff.priceChanged,
    uncomparablePrices: diff.uncomparablePrices ?? [],
  }
}

/**
 * @param {object} diff
 * @param {{ gateway?: object, gatewayLabel?: string, hubLabel?: string }} [context]
 */
export function formatDiffReport(diff, context = {}) {
  const lines = []
  const summary = diff.summary ?? {}
  const gateway = context.gateway ?? {}

  lines.push('# 网关目录 vs 中枢目录 差异报告')
  if (context.gatewayLabel) lines.push(`- 网关快照：${context.gatewayLabel}`)
  if (gateway.source) lines.push(`- 快照来源：${gateway.source}${gateway.generatedAt ? `（${gateway.generatedAt}）` : ''}`)
  if (gateway.source) lines.push(`- 快照摘要：${snapshotDigest(gateway).slice(0, 16)}`)
  if (context.hubLabel) lines.push(`- 中枢目录：${context.hubLabel}`)
  lines.push('')
  lines.push('## 概览')
  lines.push('')
  lines.push(`- 网关在售模型：${summary.gatewayModels ?? 0}`)
  lines.push(`- 中枢上架模型：${summary.hubListed ?? 0}（目录内共 ${summary.hubModels ?? 0}）`)
  lines.push(`- 中枢上架但网关不可达：${summary.unreachable ?? 0}`)
  lines.push(`- 网关在售但中枢未上架：${summary.gatewayOnly ?? 0}`)
  lines.push(`- 中枢分组在网关缺失：${summary.groupMissing ?? 0}`)
  lines.push(`- 网关分组中枢未登记：${summary.groupExtra ?? 0}`)
  lines.push(`- 积分估算与网关口径不一致：${summary.priceChanged ?? 0}（可比对 ${summary.comparablePrices ?? 0} 项）`)
  lines.push(`- 因网关按 billing_expr 计费而无法比对：${summary.uncomparablePrices ?? 0}`)

  const sections = [
    ['中枢上架但网关不可达（调用必然失败）', diff.unreachable, (row) => `- ${row.id}（listed ops: ${row.listedOperations.join(', ') || 'none'}）`],
    ['网关在售但中枢未上架', diff.gatewayOnly, (row) => `- ${row.id}（网关分组: ${row.enableGroups.join(', ')}）`],
    ['中枢分组在网关缺失', diff.groupMissing, (row) => `- ${row.id} @ ${row.wireGroup}（网关现役: ${row.enableGroups.join(', ')}）`],
    ['网关分组中枢未登记', diff.groupExtra, (row) => `- ${row.id} @ ${row.wireGroup}`],
    ['积分估算不一致', diff.priceChanged, (row) => `- ${row.id} @ ${row.wireGroup}：中枢 ${row.hub}，按网关口径 ${row.expected}`],
    [
      '积分无法比对（网关按 billing_expr 计费，model_price 不生效）',
      diff.uncomparablePrices,
      (row) => `- ${row.id} @ ${row.wireGroup}：${row.expr}`,
    ],
  ]
  for (const [title, rows, format] of sections) {
    if (!Array.isArray(rows) || rows.length === 0) continue
    lines.push('')
    lines.push(`## ${title}`)
    lines.push('')
    for (const row of rows) lines.push(format(row))
  }

  const limitations = stringList(diff.limitations)
  if (limitations.length > 0) {
    lines.push('')
    lines.push('## 快照覆盖限制')
    lines.push('')
    for (const item of limitations) lines.push(`- ${item}`)
  }
  lines.push('')
  return `${lines.join('\n')}`
}
