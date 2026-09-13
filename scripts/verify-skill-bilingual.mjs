#!/usr/bin/env node
/**
 * 技能中英双语的**静态硬门禁**（CI / 本地）。
 *
 * 判据真源是 `plugins/omnimux-market/src/skill-bilingual.ts` 的 `checkSkillBilingual`。
 * 脚本层不得 import 该 TS 模块：CI 的回归步骤不跑 `pnpm install` / `build`，
 * 只能依赖 Node 内置能力。因此字段域在此**镜像**声明，并由
 * `scripts/verify-skill-bilingual.test.mjs` 的源码级一致性断言守卫漂移。
 *
 * 用法：
 *   node scripts/verify-skill-bilingual.mjs                # 审计市场目录
 *   node scripts/verify-skill-bilingual.mjs --catalog <p>  # 审计指定目录（自测 / 故障复现）
 *   node scripts/verify-skill-bilingual.mjs --json         # 机器可读报告（CI 归档）
 *
 * 退出码：0 = 全部通过；1 = 存在缺字段，或选不到任何条目（防空转），或目录不可读。
 */
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const CATALOG_PATH = join(ROOT, 'plugins/omnimux-market/catalog/index.json')

/** 双语字段域：顺序即报错输出顺序（与 `src/skill-bilingual.ts` 一致）。 */
export const BILINGUAL_FIELDS = ['titleZh', 'titleEn', 'summaryZh', 'summaryEn']

/** 字段长度上限：与目录解析层、判据模块一致。 */
export const BILINGUAL_LIMITS = Object.freeze({ titleZh: 80, titleEn: 80, summaryZh: 200, summaryEn: 200 })

/** 门禁适用范围（与 `isOfficialShelfItem` 同口径）。 */
export const SHELF_SCOPE = 'kind:skill && tab:skills && recommended:true'

/** 只认官方货架条目；范围外条目一律不审。 */
export function isOfficialShelfItem(item) {
  return Boolean(item) && typeof item === 'object'
    && String(item.kind || '') === 'skill'
    && String(item.tab || '') === 'skills'
    && item.recommended === true
}

/** 非字符串 / 空白 → ''；超长 → 截断。绝不回退到 title/summary。 */
export function normalizeField(value, field) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  const limit = BILINGUAL_LIMITS[field]
  return Number.isInteger(limit) && trimmed.length > limit ? trimmed.slice(0, limit) : trimmed
}

/**
 * 纯函数审计：不做任何 IO，供 `node --test` 直接引用。
 * @returns {{ checked: number, passed: number,
 *   failed: Array<{ id: string, title: string, missingFields: string[] }>,
 *   warnings: Array<{ id: string, fields: string[] }>, scope: string }}
 */
export function auditSkillBilingual(catalog, options = {}) {
  const items = Array.isArray(catalog && catalog.items) ? catalog.items : []
  const checked = items.filter(isOfficialShelfItem)
  const failed = []
  const warnings = []
  for (const item of checked) {
    const missingFields = BILINGUAL_FIELDS.filter((field) => !normalizeField(item[field], field))
    if (missingFields.length) {
      failed.push({ id: String(item.id || ''), title: String(item.title || ''), missingFields })
      continue
    }
    // B4：英文字段被中文回填时形态合法但体验存疑，告警供人工复核（不阻断）。
    const sameValue = []
    if (normalizeField(item.titleZh, 'titleZh') === normalizeField(item.titleEn, 'titleEn')) sameValue.push('titleZh=titleEn')
    if (normalizeField(item.summaryZh, 'summaryZh') === normalizeField(item.summaryEn, 'summaryEn')) sameValue.push('summaryZh=summaryEn')
    if (sameValue.length && options.warnSameValue !== false) {
      warnings.push({ id: String(item.id || ''), fields: sameValue })
    }
  }
  return { checked: checked.length, passed: checked.length - failed.length, failed, warnings, scope: SHELF_SCOPE }
}

/**
 * 审计结论：`checked === 0` 必须失败，否则「全过」毫无意义（防空转）。
 * @returns {{ ok: boolean, exitCode: number, reasons: string[] }}
 */
export function verdictOf(report) {
  if (report.checked === 0) return { ok: false, exitCode: 1, reasons: ['EMPTY_SCOPE'] }
  if (report.failed.length) return { ok: false, exitCode: 1, reasons: ['MISSING_FIELDS'] }
  return { ok: true, exitCode: 0, reasons: [] }
}

/** 人类可读报告：每条失败都必须能直接照着修。 */
export function formatReport(report, catalogPath) {
  const lines = []
  if (report.checked === 0) {
    lines.push(`❌ 未选中任何官方货架技能（范围 ${SHELF_SCOPE}）——门禁空转比漏判更危险，判定失败。`)
    lines.push(`   目录：${catalogPath}`)
    return lines
  }
  if (report.failed.length) {
    lines.push(`❌ 技能双语门禁失败：${report.failed.length}/${report.checked} 条官方货架技能缺少中英双语字段。`)
    for (const row of report.failed) {
      lines.push(`   - ${row.id}（${row.title}）缺：${row.missingFields.join(', ')}`)
    }
    lines.push('   修复：补齐 plugins/omnimux-market/catalog/index.json 对应条目的 titleZh/titleEn/summaryZh/summaryEn。')
    lines.push(`   期望长度：titleZh/titleEn ≤ ${BILINGUAL_LIMITS.titleZh}，summaryZh/summaryEn ≤ ${BILINGUAL_LIMITS.summaryZh}。`)
    lines.push('   契约：docs/contracts/skill-bilingual.md')
  } else {
    lines.push(`✅ ${report.passed}/${report.checked} 官方货架技能双语齐备（范围 ${SHELF_SCOPE}）。`)
  }
  for (const row of report.warnings) {
    lines.push(`   ⚠️  ${row.id} 的中英字段同值（${row.fields.join(', ')}），形态合法但建议人工复核。`)
  }
  return lines
}

export function parseArgs(argv) {
  const options = { catalog: CATALOG_PATH, json: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') options.json = true
    else if (arg === '--catalog') {
      const next = argv[i + 1]
      if (!next) throw new Error('--catalog 需要一个路径参数')
      options.catalog = isAbsolute(next) ? next : resolve(process.cwd(), next)
      i += 1
    } else if (arg.startsWith('--catalog=')) {
      const value = arg.slice('--catalog='.length)
      options.catalog = isAbsolute(value) ? value : resolve(process.cwd(), value)
    } else {
      throw new Error(`未知参数：${arg}`)
    }
  }
  return options
}

function main(argv) {
  let options
  try {
    options = parseArgs(argv)
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
  let catalog
  try {
    catalog = JSON.parse(readFileSync(options.catalog, 'utf-8'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`❌ 无法读取目录 ${options.catalog}：${message}`)
    if (options.json) console.error(JSON.stringify({ ok: false, reason: 'CATALOG_UNREADABLE', catalog: options.catalog }))
    return 1
  }
  const report = auditSkillBilingual(catalog)
  const verdict = verdictOf(report)
  if (options.json) console.log(JSON.stringify({ ok: verdict.ok, reasons: verdict.reasons, catalog: options.catalog, ...report }))
  else for (const line of formatReport(report, options.catalog)) console.log(line)
  return verdict.exitCode
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)))
}
