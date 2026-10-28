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
 * 判定口径与 hook 共用：`isProtectedTestPath`、`inspectTestStandardChange`、
 * `parseOldStandardDeclarations`、`matchOldStandardDeclarations`、
 * `DECLARABLE_TEST_STANDARD_REASONS`，避免两处漂移。
 *
 * 四类判定的分工（R1 第二轮评审后收紧）：
 *  1. 两侧都可解析 → 正常比较，按具名用例要求逐条声明。
 *  2. before 可解析、after 不可解析 → **销毁可评估性**，直接违规且不可声明。
 *     否则「把测试改到解析不过去」就是一条零声明通道。
 *  3. before 不可解析、after 可解析或为空 → 无法枚举用例，按**文件级**声明处理，
 *     写法为 `- \`<路径>\` :: \`*\``。
 *  4. 两侧都不可解析 → 既有机制盲区，仅报告、不阻断（否则 254 个 TS 测试文件里
 *     任何一处日常改动都会挂 PR）。
 *
 * 声明必须**本范围新增**：base 上早就存在的声明不能当永久令牌复用——只对 spec 做
 * 无关改动即可放行，是 R1 第二轮的 H2。
 *
 * 保护判定同时看新旧路径：把受保护的测试改名到非保护位置（`.bak`、`fixtures/`、
 * 任意名）等于丢弃既有覆盖，按旧路径处理（H4）。
 *
 * 用法：node scripts/verify-test-standard-declarations.mjs [root] [base]
 *      退出码 0 = 无未声明削弱；1 = 存在未声明削弱或扫描失败。
 */

import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readEvaluationChanges } from './test-change-review.mjs'
import { inspectTestAuthoring, inspectTestStandardChange, parseOldStandardDeclarations, matchOldStandardDeclarations } from './test-authoring-inspection.mjs'
import { readSpecSections, SPEC_SECTION_MIN_CHARS, isSpecPath } from './guard-quality-loop.mjs'
import { OLD_STANDARD_SECTION, isProtectedTestPath, DECLARABLE_TEST_STANDARD_REASONS } from './guard-anti-cheat.mjs'

const UNEVALUABLE_REASON = 'unsupported-or-incomplete-test-syntax'
/** 文件级声明使用的用例名：无法枚举具名用例时的显式写法。 */
export const FILE_LEVEL_CASE = '*'

const text = bytes => (bytes === null || bytes === undefined ? '' : bytes.toString('utf8'))
const parseable = source => inspectTestAuthoring(source).reason !== UNEVALUABLE_REASON

function sectionDeclarations(source) {
  const section = readSpecSections(source).get(OLD_STANDARD_SECTION) ?? ''
  if (section.replace(/\s+/g, '').length < SPEC_SECTION_MIN_CHARS) return []
  return parseOldStandardDeclarations(section)
}

/**
 * 从**本范围内新增**的 spec 声明行收集授权。
 * 只看 after 与 before 的差集：base 上已有的声明不构成本次授权。
 */
export function collectRangeDeclarations(changes) {
  const declarations = []
  for (const change of changes) {
    if (change.status === 'D') continue
    if (!/^specs\/.*\.md$/.test(change.path)) continue
    const previous = sectionDeclarations(text(change.before))
    const added = sectionDeclarations(text(change.after))
      .filter(item => !previous.some(old => old.path === item.path && old.caseName === item.caseName))
    declarations.push(...added)
  }
  return declarations
}

/** 逐条比对；返回缺失的用例名（空数组表示全部命中）。 */
function missingFor({ declarations, path, cases }) {
  return matchOldStandardDeclarations({ declarations, filePath: path, changedCases: cases }).missing
}

/**
 * @returns {{comparisonBase: string, candidate: string, declarationCount: number,
 *            violations: object[], unevaluable: object[]}}
 */
export function verifyTestStandardDeclarations({ root, base = 'origin/main' } = {}) {
  // 只读已提交范围，因此不需要工作区干净；HEAD 身份仍由 readEvaluationChanges 前后校验。
  // `includePath: isSpecPath` 让声明来源与 hook 一致：`specs/*.md` 不在评估域内，
  // 不额外收拢就会出现「hook 认、CI 不认」的漂移（`specs/<feature>.md` 无 `.spec` 后缀）。
  const { comparisonBase, candidate, changes } = readEvaluationChanges(root, base, { requireClean: false, includePath: isSpecPath })
  const declarations = collectRangeDeclarations(changes)
  const violations = []
  const unevaluable = []

  for (const change of changes) {
    const newProtected = isProtectedTestPath(change.path)
    const oldProtected = isProtectedTestPath(change.oldPath)
    if (!newProtected && !oldProtected) continue
    // 新增文件没有 baseline，只可能做加法。不能用 `status === 'A'` 之外的条件判断：
    // `A` 记录的 `oldPath` 等于 `path`，所以「新路径受保护而旧路径不受保护」永不成立。
    // 也正因 baseline 缺失会被读成空串（合法 JS），否则新增 TS 测试会被误判成
    // 「把可解析的测试改成不可解析」而硬拒。
    if (change.before === null) continue
    // 移出保护集 = 丢弃既有覆盖，按删除处理。
    const movedOut = oldProtected && !newProtected
    // 声明点名的始终是「原本受保护的那个文件」：改名时旧路径才是契约的来处，
    // 改名到保护集之外时更是如此（H4）。非改名的 A/M/D 场景两者本就相同。
    const subject = oldProtected ? change.oldPath : change.path
    const before = text(change.before)
    const after = movedOut ? '' : text(change.after)
    const beforeParseable = parseable(before)
    const afterParseable = parseable(after)

    if (beforeParseable && afterParseable) {
      const inspection = inspectTestStandardChange(before, after)
      if (inspection.allowed) continue
      const cases = Array.isArray(inspection.changedCases) ? inspection.changedCases : []
      // 整文件被删除（或移出保护集）且含未落在具名 test/it 内的断言时，
      // `inspectTestStandardChange` 会因 unattributed 断言优先返回 `changedCases: []`。
      // 对在原文件内改写断言，这保持保守拒绝；但对「整文件随模块/插件退役删除」
      // （`after === ''`），没有剩余文件内容可改写，要求文件级声明 `- \`<path>\` :: \`*\`` 即可闭环审查。
      if (after === '' && DECLARABLE_TEST_STANDARD_REASONS.has(inspection.reason) && cases.length === 0) {
        const missing = missingFor({ declarations, path: subject, cases: [FILE_LEVEL_CASE] })
        if (missing.length) violations.push({ path: subject, status: change.status, reason: inspection.reason, missing, declarable: true })
        continue
      }
      if (!DECLARABLE_TEST_STANDARD_REASONS.has(inspection.reason) || cases.length === 0) {
        violations.push({ path: subject, status: change.status, reason: inspection.reason, missing: [], declarable: false })
        continue
      }
      const missing = missingFor({ declarations, path: subject, cases })
      if (missing.length) violations.push({ path: subject, status: change.status, reason: inspection.reason, missing, declarable: true })
      continue
    }

    if (beforeParseable && !afterParseable) {
      // 把可评估的测试改成解析不过去：等于让本机制永久失去对该文件的判断力。
      violations.push({ path: subject, status: change.status, reason: 'evaluation-made-unparseable', missing: [], declarable: false })
      continue
    }

    if (!beforeParseable && afterParseable) {
      // 原本就解析不了（多为 TS），现在被删除或改写：无法枚举用例，要求文件级声明。
      const missing = missingFor({ declarations, path: subject, cases: [FILE_LEVEL_CASE] })
      if (missing.length) violations.push({ path: subject, status: change.status, reason: 'unparseable-baseline-changed', missing, declarable: true })
      continue
    }

    unevaluable.push({ path: subject, status: change.status, reason: UNEVALUABLE_REASON })
  }
  return { comparisonBase, candidate, declarationCount: declarations.length, violations, unevaluable }
}

export function formatReport(result) {
  const lines = []
  lines.push(`== 旧测试标准声明校验 (${result.comparisonBase.slice(0, 12)}..${result.candidate.slice(0, 12)}) ==`)
  lines.push(`范围内新增声明条目：${result.declarationCount}`)
  if (result.unevaluable.length) {
    lines.push('')
    lines.push(`⚠️ 不可评估（两侧都无法解析，既有机制盲区，不阻断）：${result.unevaluable.length} 个文件`)
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
  lines.push(`修复：在本范围内的 specs/<feature>.spec.md 新增 \`## ${OLD_STANDARD_SECTION}\` 一节，逐条写：`)
  lines.push('  - `<仓库相对路径>` :: `<用例名>`')
  lines.push(`无法枚举用例（原本就解析不了的 TS 文件被删或改写）时写文件级声明：- \`<路径>\` :: \`${FILE_LEVEL_CASE}\``)
  lines.push('并写明原断言、必须改的理由与新期望证据。声明必须是**本范围新增**——未跟踪的 spec、base 上已有的旧声明都不算。')
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
