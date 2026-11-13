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
 * 第一次修完只修了代码、没有守卫；这次守卫按宿主真实规则拦「结构」，避免下次换个
 * 写法（双引号、模板串、拼变量、干脆不写 kind）又漏过去。
 *
 * 检查项（作用于 `plugins/<pkg>/src` 与 `packages/<pkg>/src`，跳过 build 产物）：
 *   1. `retired-kind`：出现 `kind: 'plugin'` / `"plugin"` / `` `plugin` ``（任何大小写变体不算，
 *      kind 就是小写字符串），或 `kind: ''` / `kind: ""`（空 kind 同样被宿主拒绝）。
 *   2. `missing-kind`：一个形如消息来源的字面量 `source: { … }`，体内出现 `form:` 或
 *      `sections:`，却没有 `kind:` —— 等价于「忘记声明 kind」，正是 rc.3 的第二种失败形态。
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
 * @param {string} text
 * @returns {Array<{ rule: 'retired-kind'|'missing-kind', line: number, text: string }>}
 */
export function scanSourceText(text) {
  const findings = []
  const lines = text.split('\n')

  // Rule 1 — the explicit catch-all literal, on code lines only.
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (isCommentLine(line)) continue
    if (line.includes(ALLOW_MARK)) continue
    const code = line.replace(/\/\/.*$/, '')
    if (RETIRED_KIND.test(code)) {
      findings.push({ rule: 'retired-kind', line: index + 1, text: line.trim() })
    }
  }

  // Rule 2 — a message-source literal that forgot `kind`.
  const codeOnly = stripBlockComments(text)
  const pattern = /(?:^|[^\w$])source\s*:\s*\{/gm
  let match
  while ((match = pattern.exec(codeOnly)) !== null) {
    const openIndex = codeOnly.indexOf('{', match.index)
    const closeIndex = findMatchingBrace(codeOnly, openIndex)
    if (closeIndex === -1) continue
    const body = codeOnly.slice(openIndex + 1, closeIndex)
    const looksLikeMessageSource = /(?:^|[\s,{])form\s*:/.test(body) || /(?:^|[\s,{])sections\s*:/.test(body)
    if (!looksLikeMessageSource) continue
    const line = lineAt(codeOnly, match.index)
    if (lines[line - 1]?.includes(ALLOW_MARK)) continue
    const kindMatch = /(?:^|[\s,{])kind\s*:\s*(?:\n\s*)?(['"`])([^'"`]*)\1/.exec(body)
    const declaresKind = /(?:^|[\s,{])kind\s*:/.test(body)
    if (!declaresKind) {
      // 忘记声明 kind —— rc.3 的第二种失败形态。
      findings.push({ rule: 'missing-kind', line, text: lines[line - 1]?.trim() ?? 'source: { … }' })
    } else if (kindMatch && (kindMatch[2] === '' || kindMatch[2] === 'plugin')) {
      // 显式写成空串 / 'plugin' 也是结构性错误（全局规则只认无歧义的 plugin，这里补空串）。
      findings.push({ rule: 'retired-kind', line, text: lines[line - 1]?.trim() ?? 'source: { … }' })
    }
  }

  return findings
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
