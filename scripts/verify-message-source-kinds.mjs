#!/usr/bin/env node
/**
 * Issue #4110 防回归守卫：禁止 session/context 消息再写 catch-all `kind: 'plugin'`。
 *
 * 背景：DSH 0.2.1-rc.3 删除了 `@deepseek-ai/dsh-llm` 的共享 `kind: 'plugin'`，
 * 每个 producer 必须声明自己的 kind。同一个错误已经犯过两次：
 *   - 第一次：#3742 之前的 browser/viewer 等包；
 *   - 第二次：#3742 的迁移漏掉 `plugins/omnimux`，导致**每一轮对话都失败**
 *     （`format v4 message requires a producer-owned source kind`）。
 * 第一次修完没有守卫，所以同形状的代码静默存活到了第二次。这个脚本就是那条守卫。
 *
 * 规则：`plugins/<pkg>/src` 与 `packages/<pkg>/src` 下的源码不得出现
 * `kind: 'plugin'` / `kind: "plugin"`。
 *
 * 豁免（说明性质，不承载运行时行为）：
 *   - 测试文件（`*.test.*` / `*.spec.*`）与 `tests/`、`__fixtures__/`、`fixtures/` 下的夹具；
 *   - 注释行（`//`、`/*`、`*` 开头）；
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
const CATCH_ALL = /\bkind\s*:\s*(['"])plugin\1/
const ALLOW_MARK = 'message-source-guard: allow'
const SKIP_DIRS = new Set(['node_modules', 'dist', 'lib', '.git', '.worktrees', 'coverage', 'dist-harness'])
const FIXTURE_SEGMENTS = new Set(['tests', '__fixtures__', 'fixtures'])

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
 * Scan one repository root for retired catch-all message-source kinds.
 * @param {string} [root]
 * @returns {{ root: string, scanned: number, violations: Array<{ file: string, line: number, text: string }> }}
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
        const lines = readFileSync(file, 'utf8').split('\n')
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index]
          if (isCommentLine(line)) continue
          if (line.includes(ALLOW_MARK)) continue
          if (!CATCH_ALL.test(line)) continue
          violations.push({ file: relative(root, file), line: index + 1, text: line.trim() })
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
    console.error('❌ verify-message-source-kinds: 发现被淘汰的 catch-all message source（kind: \'plugin\'）')
    for (const violation of violations) {
      console.error(`   - ${violation.file}:${violation.line}  ${violation.text}`)
    }
    console.error('')
    console.error('DSH 0.2.1-rc.3 起每个 producer 必须声明自己的 source kind；')
    console.error('这条规则已经让「每一轮对话都失败」复发过两次（#3742 迁移漏掉 plugins/omnimux，见 #4110）。')
    console.error('修法：在包的 message-source.js 里声明常量，injector 用常量而不是字面量。')
    process.exit(1)
  }
  console.log(`✅ verify-message-source-kinds: ${scanned} source file(s) checked, no retired catch-all source kind`)
}
