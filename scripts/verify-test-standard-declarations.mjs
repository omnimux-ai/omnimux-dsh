#!/usr/bin/env node
/**
 * scripts/verify-test-standard-declarations.mjs
 *
 * CI 侧闭环：本提交范围内被削弱的既有测试用例，必须在**同一范围**的 spec 里有逐条声明。
 *
 * 为什么需要它：写入时刻的门禁（`guard-anti-cheat.mjs`）只能做早期反馈——声明被消费之后，
 * 没有任何机制再校验它。声明可以写在**未跟踪**的 `specs/*.md` 里（`git status` 读得到、
 * 但不进 PR diff），也可以在放行之后删掉。CI 只看**已提交**内容，因此这里是唯一能真正
 * 闭环的位置。
 *
 * 判定口径与 hook 共用：`isProtectedTestPath`（哪些文件受保护）、
 * `inspectTestStandardChange`（哪些用例被削弱）、`parseOldStandardDeclarations` /
 * `matchOldStandardDeclarations`（声明怎么算命中），避免两处漂移。
 *
 * 已知盲区（显式报告、不阻断）：acorn 解析不了 TypeScript 注解，因此 `.test.ts` /
 * `.spec.ts` 一律得到 `unsupported-or-incomplete-test-syntax`。hook 同样无法处理它们，
 * 这是既有机制的限制而非本脚本引入；关闭它需要 TS 感知的解析器，属独立任务。
 * 本脚本把这类文件计入 `unevaluable` 并在输出中列出，不因此判失败——否则任何触碰
 * 254 个 TS 测试文件之一的 PR 都会挂。
 *
 * 用法：node scripts/verify-test-standard-declarations.mjs [root] [base]
 *      退出码 0 = 无未声明削弱；1 = 存在未声明削弱或扫描失败。
 */

import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readEvaluationChanges } from './test-change-review.mjs'
import { inspectTestStandardChange, parseOldStandardDeclarations, matchOldStandardDeclarations } from './test-authoring-inspection.mjs'
import { readSpecSections, SPEC_SECTION_MIN_CHARS } from './guard-quality-loop.mjs'
import { OLD_STANDARD_SECTION, isProtectedTestPath } from './guard-anti-cheat.mjs'

/** 只有这两类拒绝原因可经声明放行；其余（跳过、聚焦、动态执行等）恒为违规。 */
const DECLARABLE_REASONS = new Set(['test-assertion-removed-or-rewritten', 'test-case-removed-or-renamed'])
const UNEVALUABLE_REASON = 'unsupported-or-incomplete-test-syntax'

const text = bytes => (bytes === null || bytes === undefined ? '' : bytes.toString('utf8'))

/**
 * 从**本范围内已提交**的 spec 收集 `## 旧标准变更` 声明。
 * 未跟踪或仅存在于工作区的 spec 不算数——它们不会出现在 PR 里。
 */
export function collectRangeDeclarations(changes) {
  const declarations = []
  for (const change of changes) {
    if (change.status === 'D') continue
    if (!/^specs\/.*\.md$/.test(change.path)) continue
    const section = readSpecSections(text(change.after)).get(OLD_STANDARD_SECTION) ?? ''
    if (section.replace(/\s+/g, '').length < SPEC_SECTION_MIN_CHARS) continue
    declarations.push(...parseOldStandardDeclarations(section))
  }
  return declarations
}

/**
 * @returns {{comparisonBase: string, candidate: string, declarationCount: number,
 *            violations: object[], unevaluable: object[]}}
 */
export function verifyTestStandardDeclarations({ root, base = 'origin/main' } = {}) {
  // 只读已提交范围，因此不需要工作区干净；HEAD 身份仍由 readEvaluationChanges 前后校验。
  const { comparisonBase, candidate, changes } = readEvaluationChanges(root, base, { requireClean: false })
  const declarations = collectRangeDeclarations(changes)
  const violations = []
  const unevaluable = []
  for (const change of changes) {
    if (!isProtectedTestPath(change.path)) continue
    // 新增测试文件只做加法，不涉及既有标准。
    if (change.status === 'A') continue
    const inspection = inspectTestStandardChange(text(change.before), text(change.after))
    if (inspection.allowed) continue
    if (inspection.reason === UNEVALUABLE_REASON) {
      unevaluable.push({ path: change.path, status: change.status, reason: inspection.reason })
      continue
    }
    const changedCases = Array.isArray(inspection.changedCases) ? inspection.changedCases : []
    if (!DECLARABLE_REASONS.has(inspection.reason) || changedCases.length === 0) {
      violations.push({ path: change.path, status: change.status, reason: inspection.reason, missing: [], declarable: false })
      continue
    }
    const { ok, missing } = matchOldStandardDeclarations({ declarations, filePath: change.path, changedCases })
    if (!ok) violations.push({ path: change.path, status: change.status, reason: inspection.reason, missing, declarable: true })
  }
  return { comparisonBase, candidate, declarationCount: declarations.length, violations, unevaluable }
}

export function formatReport(result) {
  const lines = []
  lines.push(`== 旧测试标准声明校验 (${result.comparisonBase.slice(0, 12)}..${result.candidate.slice(0, 12)}) ==`)
  lines.push(`范围内已提交声明条目：${result.declarationCount}`)
  if (result.unevaluable.length) {
    lines.push('')
    lines.push(`⚠️ 不可评估（既有机制盲区，不阻断）：${result.unevaluable.length} 个文件无法被 acorn 解析（多为 .ts/.tsx）`)
    for (const item of result.unevaluable) lines.push(`   - ${item.path}`)
  }
  if (!result.violations.length) {
    lines.push('')
    lines.push('✅ 没有被削弱的既有测试用例缺少声明。')
    return lines.join('\n')
  }
  lines.push('')
  lines.push(`❌ 发现 ${result.violations.length} 处未声明的既有标准削弱：`)
  for (const item of result.violations) {
    lines.push(`   - [${item.status}] ${item.path}（${item.reason}）`)
    if (item.missing.length) lines.push(`     缺声明：${item.missing.map(name => `\`${name}\``).join('、')}`)
    if (!item.declarable) lines.push('     该原因不可经声明放行，必须撤回改动。')
  }
  lines.push('')
  lines.push('修复：在本范围内的 specs/<feature>.spec.md 新增 `## ' + OLD_STANDARD_SECTION + '` 一节，逐条写：')
  lines.push('  - `<仓库相对路径>` :: `<用例名>`')
  lines.push('并写明原断言、必须改的理由与新期望证据。声明必须随本范围一并提交——未跟踪的 spec 不算。')
  return lines.join('\n')
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [rootArg, base = 'origin/main', ...extra] = process.argv.slice(2)
    if (extra.length) throw new Error('usage: verify-test-standard-declarations.mjs [root] [base]')
    const root = realpathSync(rootArg || process.cwd())
    const result = verifyTestStandardDeclarations({ root, base })
    process.stdout.write(formatReport(result) + '\n')
    if (result.violations.length) process.exitCode = 1
  } catch (error) {
    console.error(`旧测试标准声明校验失败：${error.message}`)
    process.exitCode = 1
  }
}
