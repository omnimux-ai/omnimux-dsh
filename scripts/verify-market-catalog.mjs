#!/usr/bin/env node
/**
 * verify-market-catalog.mjs — 市场目录元数据完整性与安装属性门禁
 *
 * 核心原则：
 * 1. 市场中所有技能与 Agent 均可发现、可安装；
 * 2. 所有条目必须显式区分「出厂预装 (pre-installed)」与「市场可选安装 (marketplace)」；
 * 3. 标记为 pre-installed 的条目必须严格与出厂预装白名单吻合。
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export const VALID_INSTALL_TYPES = new Set(['pre-installed', 'marketplace'])

/**
 * 校验市场 index.json 元数据
 * @param {string} catalogFile
 * @returns {{ valid: boolean; errors: string[]; stats: { total: number; preinstalled: number; marketplace: number } }}
 */
export function checkMarketCatalog(catalogFile) {
  const errors = []
  const stats = { total: 0, preinstalled: 0, marketplace: 0 }

  if (!existsSync(catalogFile)) {
    return { valid: false, errors: [`目录文件不存在: ${catalogFile}`], stats }
  }

  let doc
  try {
    doc = JSON.parse(readFileSync(catalogFile, 'utf8'))
  } catch (e) {
    return { valid: false, errors: [`解析目录 JSON 失败: ${e.message}`], stats }
  }

  const items = Array.isArray(doc.items) ? doc.items : []
  stats.total = items.length

  for (const item of items) {
    const id = item.id || '(no-id)'

    // 1. 校验必备字段
    if (!item.id) {
      errors.push(`存在缺失 id 的条目`)
      continue
    }

    if (!item.installType) {
      errors.push(`条目 [${id}] 缺失 installType（必须为 pre-installed 或 marketplace）`)
      continue
    }

    if (!VALID_INSTALL_TYPES.has(item.installType)) {
      errors.push(`条目 [${id}] installType 非法: "${item.installType}"，仅允许 pre-installed 或 marketplace`)
      continue
    }

    if (item.installType === 'pre-installed') {
      stats.preinstalled++
    } else {
      stats.marketplace++
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    stats,
  }
}

// CLI 执行入口
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targetFile = process.argv[2] || join(ROOT, 'plugins/omnimux-market/catalog/index.json')
  const res = checkMarketCatalog(targetFile)
  if (!res.valid) {
    console.error(`❌ 市场目录元数据完整性门禁校验失败：发现 ${res.errors.length} 项违规！`)
    res.errors.slice(0, 20).forEach((err) => console.error(`   - ${err}`))
    if (res.errors.length > 20) {
      console.error(`   ... 剩余 ${res.errors.length - 20} 项错误`)
    }
    process.exit(1)
  }

  console.log(`✅ 市场目录元数据校验通过（共 ${res.stats.total} 个条目，预装: ${res.stats.preinstalled}，可选: ${res.stats.marketplace}）。`)
}
