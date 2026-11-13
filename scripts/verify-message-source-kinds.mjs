#!/usr/bin/env node
/**
 * Issue #4110 防回归守卫：注入消息不得再出现「结构性」source kind 问题。
 *
 * 背景：DSH 0.2.1-rc.3 删除了 `@deepseek-ai/dsh-llm` 的共享 `kind: 'plugin'`，
 * 每个 producer 必须声明自己的 kind。宿主 session-format v4 拒绝的是
 * **`source.kind` 缺失、为空、或等于 `'plugin'`** 这三类结构性问题，而不是某一个
 * 字面量。同一个错误已经复发两次：
 *   - 第一次：#3742 之前的 browser/viewer 等包；
 *   - 第二次：#3742 的迁移漏掉 `plugins/omnimux`，导致**每一轮对话都失败**
 *     （`format v4 message requires a producer-owned source kind`）。
 * 第一次修完只修了代码、没有守卫；这次守卫按宿主真实规则拦三类：
 *   ① `kind` 缺失、② `kind` 为空、③ `kind: 'plugin'` 字面量（含双引号/模板串）。
 * 它**不做静态数据流分析**：`const K = 'plugin'; source: { kind: K }` 这类变量间接值
 * 不拦（已知不覆盖），由运行期 e2e 兜底
 * （`plugins/omnimux/src/session/message-source-v4.test.js` 走宿主真实准入）。
 * 宁可漏当前不存在的写法，也不要假阳性。
 *
 * 检查项（作用于 `plugins/<pkg>/src` 与 `packages/<pkg>/src`，跳过 build 产物）：
 *   1. `retired-kind`：出现 `kind: 'plugin'` / `"plugin"` / `` `plugin` ``（任何大小写变体不算，
 *      kind 就是小写字符串），或 `kind: ''` / `kind: ""`（空 kind 同样被宿主拒绝）。
 *   2. `missing-kind`：字面量 `source: { … }` 体内**同时出现 `plugin:` 与（`form:` 或
 *      `sections:`）**，却没有 `kind:` —— 这才是「消息来源忘记声明 kind」。
 *      要求 `plugin:` 是为了避免把别的域里恰好用 form/sections 的对象误判；
 *      宁可漏当前不存在的形状，不要假阳性。
 *
 * 豁免（说明性质，不承载运行时行为）：
 *   - 测试文件（`*.test.*` / `*.spec.*`）与 `tests/`、`__fixtures__/`、`fixtures/` 下的夹具；
 *   - 注释行（`//`、`/*`、`*` 开头）与块注释；
 *   - 同一行带 `// message-source-guard: allow`，用于文档性示例。
 *
 * 用法：node scripts/verify-message-source-kinds.mjs [repoRoot]
 * 退出码：0 = 无违规；1 = 存在违规。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = resolve(HERE, '..')

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'])
const ALLOW_MARK = 'message-source-guard: allow'
const SKIP_DIRS = new Set(['node_modules', 'dist', 'lib', '.git', '.worktrees', 'coverage', 'dist-harness'])
const FIXTURE_SEGMENTS = new Set(['tests', '__fixtures__', 'fixtures'])

/** 全局只拦明确的 catch-all：`kind: 'plugin'`（单/双/模板串）。空 kind 属结构性判断，见下。 */
const RETIRED_KIND = /\bkind\s*:\s*(['"`])plugin\1/

/** Test files may legitimately spell the retired shape (negative fixtures). */
export function isExemptFile(filePath) {
  const parts = filePath.split(/[\\/]/)
  if (parts.some((part) => FIXTURE_SEGMENTS.has(part))) return true
  return /\.(test|spec)\.[^./\\]+$/.test(parts[parts.length - 1] ?? '')
}

/** Comment-only lines explain the retirement; they never carry runtime behaviour. */
export function isCommentLine(line) {
  const trimmed = line.trim()
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')
}

/**
 * Remove block comments so a `source: { … }` inside documentation is not parsed as code.
 * (Line comments are handled per-line.)
 * @param {string} source
 */
function stripBlockComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
}

/**
 * Given text and the index of an opening `{`, return the index of its matching `}`.
 * Tracks quotes / template strings / escapes; returns -1 when unbalanced.
 * @param {string} text
 * @param {number} openIndex
 */
function findMatchingBrace(text, openIndex) {
  let depth = 0
  let quote = null
  let escaped = false
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index]
    if (quote) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/** Offset → 1-based line number. */
function lineAt(text, offset) {
  let line = 1
  for (let index = 0; index < offset && index < text.length; index += 1) {
    if (text[index] === '\n') line += 1
  }
  return line
}

/**
 * Scan one file's text for the two structural rules.
 *
 * 去重按「块」：一个 `source: { … }` 块若已因 kind==='plugin' 被 Rule1 语义覆盖，
 * 就丢弃落在该块行区间内的 Rule1 命中（同一处根因只报 1 条）；不同块各自报 1 条，
 * 不会掩盖真实的多处违规。
 *
 * @param {string} text
 * @returns {Array<{ rule: 'retired-kind'|'missing-kind', line: number, text: string }>}
 */
export function scanSourceText(text) {
  const lines = text.split('\n')
  const codeOnly = stripBlockComments(text)
  const findings = []

  // Rule 1 — the explicit catch-all literal, on code lines only.
  const rule1 = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (isCommentLine(line)) continue
    if (line.includes(ALLOW_MARK)) continue
    const code = line.replace(/\/\/.*$/, '')
    if (RETIRED_KIND.test(code)) rule1.push({ rule: 'retired-kind', line: index + 1, text: line.trim() })
  }

  // Rule 2 — message-source literals that forgot `kind` / wrote a retired kind.
  const blocks = []
  const pattern = /(?:^|[^\w$])source\s*:\s*\{/gm
  let match
  while ((match = pattern.exec(codeOnly)) !== null) {
    const openIndex = codeOnly.indexOf('{', match.index)
    const closeIndex = findMatchingBrace(codeOnly, openIndex)
    if (closeIndex === -1) continue
    const body = codeOnly.slice(openIndex + 1, closeIndex)
    const hasPlugin = /(?:^|[\s,{])plugin\s*:/.test(body)
    const hasFormOrSections = /(?:^|[\s,{])form\s*:/.test(body) || /(?:^|[\s,{])sections\s*:/.test(body)
    const spreads = /(?:^|[\s,{])\.\.\./.test(body)
    if (!hasPlugin || !hasFormOrSections || spreads) continue // 非消息来源 / kind 可能来自 spread
    const startLine = lineAt(codeOnly, match.index)
    const endLine = lineAt(codeOnly, closeIndex)
    const allowLine = lines[startLine - 1] ?? ''
    if (allowLine.includes(ALLOW_MARK)) continue
    const declaresKind = /(?:^|[\s,{])kind\s*:/.test(body)
    const kindMatch = /(?:^|[\s,{])kind\s*:\s*(?:\n\s*)?(['"`])([^'"`]*)\1/.exec(body)
    blocks.push({ startLine, endLine, flagged: true })
    if (!declaresKind) {
      findings.push({ rule: 'missing-kind', line: startLine, text: allowLine.trim() })
    } else if (kindMatch && (kindMatch[2] === '' || kindMatch[2] === 'plugin')) {
      findings.push({ rule: 'retired-kind', line: startLine, text: allowLine.trim() })
    } else {
      blocks[blocks.length - 1].flagged = false
    }
  }

  // Rule1 hits inside a flagged block are the same root cause (source block's kind) → drop.
  for (const hit of rule1) {
    const insideFlaggedBlock = blocks.some(
      (block) => block.flagged && hit.line >= block.startLine && hit.line <= block.endLine,
    )
    if (!insideFlaggedBlock) findings.push(hit)
  }

  // 再按行去重兜底（同块/同行的重复）。
  const seen = new Set()
  return findings
    .sort((left, right) => left.line - right.line)
    .filter((finding) => {
      if (seen.has(finding.line)) return false
      seen.add(finding.line)
      return true
    })
}

function* walk(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    let stats
    try {
      stats = statSync(full)
    } catch {
      continue
    }
    if (stats.isDirectory()) yield* walk(full)
    else if (stats.isFile() && SOURCE_EXTENSIONS.has(extname(entry))) yield full
  }
}

/**
 * Scan one repository root for retired/missing producer-owned message-source kinds.
 * @param {string} [root]
 * @returns {{ root: string, scanned: number, violations: Array<{ file: string, line: number, rule: string, text: string }> }}
 */
export function scanMessageSourceKinds(root = DEFAULT_ROOT) {
  const violations = []
  let scanned = 0
  for (const pkgDir of ['plugins', 'packages']) {
    const base = join(root, pkgDir)
    let names
    try {
      names = readdirSync(base)
    } catch {
      continue
    }
    for (const name of names) {
      const srcDir = join(base, name, 'src')
      try {
        if (!statSync(srcDir).isDirectory()) continue
      } catch {
        continue
      }
      for (const file of walk(srcDir)) {
        if (isExemptFile(file)) continue
        scanned += 1
        const text = readFileSync(file, 'utf8')
        for (const finding of scanSourceText(text)) {
          violations.push({ file: relative(root, file), ...finding })
        }
      }
    }
  }
  return { root, scanned, violations }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const root = resolve(process.argv[2] ?? DEFAULT_ROOT)
  const { scanned, violations } = scanMessageSourceKinds(root)
  if (violations.length > 0) {
    console.error('❌ verify-message-source-kinds: 发现结构性问题 message source')
    for (const violation of violations) {
      console.error(`   - [${violation.rule}] ${violation.file}:${violation.line}  ${violation.text}`)
    }
    console.error('')
    console.error('DSH 0.2.1-rc.3 起每个 producer 必须声明自己的 source kind；')
    console.error('宿主拒绝的是「kind 缺失 / 为空 / 等于 plugin」这三类结构问题。')
    console.error('这条规则已经让「每一轮对话都失败」复发过两次（#3742 迁移漏掉 plugins/omnimux，见 #4110）。')
    console.error('修法：在包的 message-source.js 里声明常量，注入消息写 kind 且不要写 plugin/空值。')
    process.exit(1)
  }
  console.log(`✅ verify-message-source-kinds: ${scanned} source file(s) checked, no retired or missing message-source kind`)
}
