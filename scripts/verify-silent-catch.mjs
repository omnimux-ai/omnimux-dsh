#!/usr/bin/env node
/**
 * scripts/verify-silent-catch.mjs
 * 静默吞错存量扫描门禁（Issue #3233）
 *
 * 合同：docs/contracts/hub.md § channels、docs/contracts/anti-agent-fake-completion-guard.md
 * 规格：specs/silent-catch-gate-3233.spec.md
 *
 * 为什么需要它：
 *   scripts/guard-anti-cheat.mjs 的 RULE-03 只拦「catch 带括号 + catch 体内 return 含
 *   ok/status/success 键的对象」，而且它是 edit|write 的写时钩子，对磁盘存量无感知。
 *   本仓 `catch {}`（可选绑定）形态的存量与那条规则完全不相交，所以一直没人管。
 *   本扫描器补上存量测量：数据源是静态分析结果，不是任何界面黑名单。
 *
 * 口径（本脚本自报数即唯一基线）：
 *   SC1 empty-catch        catch 体内没有任何语句、也没有注释（确证形态，含跨行）
 *   SC2 comment-only-catch catch 体内只有注释、没有任何可执行语句（确证形态）
 *   SC3 untraced-catch     catch 体内有语句，但不抛错、不记日志、不上报（疑似形态）
 *   实测本仓 `catch (e) {}`（带括号空 catch）0 处，与 guard-anti-cheat 的规则不相交。
 *
 * 扫描范围：plugins/<name>/src/** 的 .js/.mjs/.cjs/.ts/.tsx/.jsx
 * 排除：node_modules、lib、测试与夹具目录、随包第三方编辑器
 *       plugins/omnimux-clip/src/client/openreel/**
 *
 * 用法：
 *   node scripts/verify-silent-catch.mjs          扫描并打印存量清单（告警档）
 *   node scripts/verify-silent-catch.mjs --json   机器可读输出
 *   node scripts/verify-silent-catch.mjs --quiet  只打印统计，不打印逐条清单
 *
 * 退出码：0 告警档（含发现存量吞错）｜1 僵尸豁免条目｜2 豁免清单配置错误
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/* ------------------------------------------------------------------ 常量 */

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'])

/**
 * 只扫源码：Markdown、YAML、JSON 等文档与配置不在扫描范围内。
 * 教训：现有写时钩子曾误拦 Markdown 报告。
 */
const SCAN_DIR_RE = /^plugins\/[^/]+\/src\//

/** 构建产物目录：`lib/` 由源重建，重复判定只会产生双份报告。 */
const SKIPPED_DIR_SEGMENTS = new Set(['node_modules', 'lib'])

/** 测试与夹具目录：同样的代码在测试里出现不算产品路径吞错。 */
const TEST_SEGMENTS = new Set([
  'tests',
  'test',
  '__tests__',
  'fixtures',
  '__fixtures__',
  '__mocks__',
  'e2e',
])

/** 随包第三方编辑器目录（MIT OpenReel），不得修改也不参与门禁判定。 */
const VENDOR_PREFIXES = ['plugins/omnimux-clip/src/client/openreel/']

export const RULES = {
  SC1: 'empty-catch',
  SC2: 'comment-only-catch',
  SC3: 'untraced-catch',
}

const RULE_LABEL = {
  SC1: '空 catch（体内无语句、无注释）',
  SC2: '仅注释的 catch（体内无可执行语句）',
  SC3: '有语句但无痕迹的 catch（不抛、不记、不上报）',
}

/** 确证形态：catch 体内没有任何可执行语句。其余（SC3）为疑似形态。 */
export const DEFINITE_RULES = new Set(['SC1', 'SC2'])

export const SCOPE_NOTE = 'plugins/*/src/** 的 .js/.mjs/.cjs/.ts/.tsx/.jsx'

export const CALIBER_NOTE =
  'SC1/SC2 为确证形态（catch 体内没有任何可执行语句，含跨行）；' +
  'SC3 为疑似形态（有语句但不抛错、不记日志、不上报）。本脚本自报数为唯一基线。'

/**
 * catch 体内的「痕迹」信号：向上抛错、写日志、上报、或把错误交给回调。
 * 命中任意一条即认为该 catch 没有静默吞错。
 */
const TRACE_RE = new RegExp(
  [
    '\\bthrow\\b',
    '\\bconsole\\s*\\.',
    '\\b(?:logger|log)\\s*\\.',
    '\\b(?:warn|error|info|debug|trace|fatal)\\s*\\(',
    '\\breport\\w*\\s*\\(',
    '\\btelemetry\\b',
    '\\bemitWarning\\b',
    '\\bprocess\\s*\\.\\s*emit\\b',
    '\\bnotify\\w*\\s*\\(',
    '\\btoast\\w*\\s*\\(',
    '\\bshow\\w*(?:Error|Warning|Toast)\\b',
    '\\bhandle\\w*Error\\s*\\(',
    '\\bonError\\s*\\(',
    '\\bfail\\w*\\s*\\(',
    '\\breject\\s*\\(',
    '\\bnext\\s*\\(',
    '\\bcallback\\s*\\(',
    '\\bcb\\s*\\(',
    '\\bemit\\s*\\(',
  ].join('|'),
)

/** 正则字面量判定：这些字符之后出现的 `/` 是正则开始而不是除号。 */
const REGEX_PREFIX_CHARS = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';', '+', '-', '*', '%', '~', '^', '<', '>',
])

const REGEX_PREFIX_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'case', 'in', 'of', 'delete', 'void', 'new', 'do', 'else',
  'yield', 'await', 'default',
])

/* ------------------------------------------------------------------ 路径 */

export function findRepoRoot(startDir) {
  let cur = resolve(startDir)
  for (let i = 0; i < 8; i++) {
    try {
      const pkg = readFileSync(resolve(cur, 'package.json'), 'utf8')
      if (pkg.includes('"name": "omnimux-dsh"')) return cur
    } catch {}
    const parent = dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return resolve(startDir)
}

function toPosix(p) {
  return p.replace(/\\/g, '/')
}

export function isScannableSource(relPath) {
  const rel = toPosix(relPath)
  if (!SCAN_DIR_RE.test(rel)) return false
  if (!SOURCE_EXTENSIONS.has(extname(rel))) return false
  if (VENDOR_PREFIXES.some((p) => rel.startsWith(p))) return false
  const segments = rel.split('/')
  if (segments.some((s) => SKIPPED_DIR_SEGMENTS.has(s) || TEST_SEGMENTS.has(s))) return false
  const base = segments[segments.length - 1]
  if (/\.(?:test|spec)\.[^.]+$/.test(base)) return false
  if (/^(?:test|spec)-/.test(base)) return false
  return true
}

export function pluginOf(relPath) {
  const segments = toPosix(relPath).split('/')
  return segments[0] === 'plugins' ? segments[1] : ''
}

function walk(dir, acc, root) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      walk(full, acc, root)
    } else if (entry.isFile()) {
      const rel = toPosix(relative(root, full))
      if (isScannableSource(rel)) acc.push(rel)
    }
  }
  return acc
}

/** @returns {string[]} 仓库相对（POSIX）的待扫描文件清单，已排序。 */
export function listScanTargets(root) {
  const abs = join(root, 'plugins')
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return []
  return walk(abs, [], root).sort()
}

/* ------------------------------------------------------------------ 词法遮罩 */

/** 判断 src[i] 处的 `/` 是否开启一个正则字面量（需要前一显著字符/标识符）。 */
function startsRegex(prevChar, prevWord) {
  if (!prevChar) return true
  if (REGEX_PREFIX_CHARS.has(prevChar)) return true
  return REGEX_PREFIX_KEYWORDS.has(prevWord)
}

/** 正则字面量的收尾下标；同一行内找不到收尾则返回 -1（说明其实是除号）。 */
function regexEnd(src, start) {
  let i = start + 1
  let inClass = false
  while (i < src.length) {
    const c = src[i]
    if (c === '\n') return -1
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '[') inClass = true
    else if (c === ']') inClass = false
    else if (c === '/' && !inClass) return i
    i++
  }
  return -1
}

/**
 * 把注释、字符串、模板字面量与正则字面量替换成空格（保留长度与换行）。
 * 这样后续的括号配对与关键字匹配不会被字符串内容或注释误导。
 */
export function maskSource(src) {
  const out = src.split('')
  const blank = (i) => {
    if (i < src.length && src[i] !== '\n') out[i] = ' '
  }
  let prevChar = ''
  let prevWord = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]

    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') {
        out[i] = ' '
        i++
      }
      continue
    }

    if (c === '/' && n === '*') {
      out[i] = ' '
      out[i + 1] = ' '
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        blank(i)
        i++
      }
      if (i < src.length) {
        out[i] = ' '
        out[i + 1] = ' '
        i += 2
      }
      continue
    }

    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      out[i] = ' '
      i++
      while (i < src.length) {
        if (src[i] === '\\') {
          blank(i)
          blank(i + 1)
          i += 2
          continue
        }
        if (src[i] === quote) {
          out[i] = ' '
          i++
          break
        }
        blank(i)
        i++
      }
      prevChar = 'x'
      prevWord = ''
      continue
    }

    if (c === '/' && startsRegex(prevChar, prevWord)) {
      const end = regexEnd(src, i)
      if (end >= 0) {
        for (let k = i; k <= end; k++) blank(k)
        i = end + 1
        prevChar = 'x'
        prevWord = ''
        continue
      }
    }

    if (/\s/.test(c)) {
      i++
      continue
    }

    if (/[A-Za-z0-9_$]/.test(c)) {
      prevWord = /[A-Za-z0-9_$]/.test(prevChar) ? prevWord + c : c
      prevChar = c
    } else {
      prevChar = c
      prevWord = ''
    }
    i++
  }
  return out.join('')
}

/* ------------------------------------------------------------------ 规则 */

const CATCH_RE = /(?<![\w$.])catch\s*(?:\(([^)]*)\))?\s*\{/g

/**
 * catch 子句必须紧跟在 `try { ... }` 的收尾 `}` 之后。
 * 这条约束排除 `.catch(...)` 调用与 class/object 里名为 catch 的方法。
 */
function precededByTryBlock(masked, start) {
  let i = start - 1
  while (i >= 0 && /\s/.test(masked[i])) i--
  if (i < 0 || masked[i] !== '}') return false
  let depth = 0
  for (; i >= 0; i--) {
    if (masked[i] === '}') depth++
    else if (masked[i] === '{') {
      depth--
      if (depth === 0) break
    }
  }
  if (i < 0) return false
  let j = i - 1
  while (j >= 0 && /\s/.test(masked[j])) j--
  if (j < 2) return false
  if (masked.slice(j - 2, j + 1) !== 'try') return false
  // 词边界：排除以 "try" 结尾的标识符（entry 一类）。
  return j - 3 < 0 || !/[A-Za-z0-9_$]/.test(masked[j - 3])
}

function matchBrace(masked, openIndex) {
  let depth = 0
  for (let i = openIndex; i < masked.length; i++) {
    if (masked[i] === '{') depth++
    else if (masked[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

export function findCatchClauses(masked) {
  const clauses = []
  CATCH_RE.lastIndex = 0
  let m
  while ((m = CATCH_RE.exec(masked)) !== null) {
    const start = m.index
    if (!precededByTryBlock(masked, start)) continue
    const bodyStart = start + m[0].length - 1
    const bodyEnd = matchBrace(masked, bodyStart)
    if (bodyEnd < 0) continue
    clauses.push({ start, bodyStart, bodyEnd, hasBinding: Boolean(m[1]) })
    // 故意不跳过 body：catch 体内嵌套的 try/catch 同样要计入存量。
  }
  return clauses
}

function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line++
  }
  return line
}

function oneLine(text, max = 120) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

/**
 * 扫描单个文件内容，返回命中列表（未做豁免过滤）。
 * @returns {{rule: string, line: number, form: string, detail: string}[]}
 */
export function scanContent(relPath, content) {
  if (!isScannableSource(relPath)) return []
  const masked = maskSource(content)
  const hits = []
  for (const clause of findCatchClauses(masked)) {
    const rawBody = content.slice(clause.bodyStart + 1, clause.bodyEnd)
    const codeBody = masked.slice(clause.bodyStart + 1, clause.bodyEnd)
    const line = lineOf(masked, clause.start)
    const detail = oneLine(content.slice(clause.start, clause.bodyEnd + 1))
    // 单行口径：catch 关键字与收尾 `}` 在同一行。历史基线（279 处）就是这个口径。
    const singleLine = !content.slice(clause.start, clause.bodyEnd + 1).includes('\n')
    if (codeBody.trim() === '') {
      const bare = rawBody.trim() === ''
      hits.push({
        rule: bare ? 'SC1' : 'SC2',
        line,
        form: bare ? 'bare-empty' : 'comment-only',
        singleLine,
        hasBinding: clause.hasBinding,
        detail,
      })
      continue
    }
    if (!TRACE_RE.test(codeBody)) {
      hits.push({
        rule: 'SC3',
        line,
        form: 'untraced',
        singleLine,
        hasBinding: clause.hasBinding,
        detail,
      })
    }
  }
  return hits
}

/* ------------------------------------------------------------------ 豁免 */

export const ALLOWLIST_FILENAME = 'scripts/silent-catch-allowlist.json'

export function loadAllowlist(root) {
  const abs = join(root, ALLOWLIST_FILENAME)
  if (!existsSync(abs)) return { entries: [], errors: [] }
  let doc
  try {
    doc = JSON.parse(readFileSync(abs, 'utf8'))
  } catch (err) {
    return { entries: [], errors: [`${ALLOWLIST_FILENAME} 不是合法 JSON：${err.message}`] }
  }
  const entries = Array.isArray(doc?.entries) ? doc.entries : []
  const errors = []
  entries.forEach((entry, idx) => {
    const where = `${ALLOWLIST_FILENAME} entries[${idx}]`
    if (!entry || typeof entry !== 'object') {
      errors.push(`${where} 必须是对象`)
      return
    }
    if (!Object.prototype.hasOwnProperty.call(RULES, entry.rule)) {
      errors.push(`${where} 的 rule 必须是 ${Object.keys(RULES).join(' / ')} 之一`)
    }
    if (typeof entry.path !== 'string' || entry.path.trim() === '') {
      errors.push(`${where} 缺少 path`)
    }
    if (!Number.isInteger(entry.line) || entry.line < 1) {
      errors.push(`${where} 缺少 line（正整数；行号绑定使修好后必然变成僵尸条目）`)
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 8) {
      errors.push(`${where} 缺少有意义的 reason（≥8 字），无理由的豁免不予接受`)
    }
  })
  return { entries, errors }
}

function entryMatches(entry, rel, hit) {
  if (toPosix(entry.path) !== rel) return false
  if (entry.rule !== hit.rule) return false
  return entry.line === hit.line
}

/**
 * @returns {{violations: object[], allowed: object[], staleEntries: object[],
 *            byRule: Record<string, number>, byPlugin: Record<string, number>,
 *            byPluginRule: Record<string, Record<string, number>>, total: number}}
 */
export function evaluate(files, allowlist) {
  const violations = []
  const allowed = []
  const matchedAllowlist = new Set()
  const byRule = { SC1: 0, SC2: 0, SC3: 0 }
  const byPlugin = {}
  const byPluginRule = {}
  /** 口径对照：单行 = catch 关键字与收尾 `}` 同行（历史基线 279 处用的就是这个口径）。 */
  const byCaliber = { singleLine: 0, multiLine: 0, singleLineSc1: 0, singleLineDefinite: 0, singleLineSuspected: 0 }
  /** 绑定形态：`catch {}`（可选绑定）vs `catch (e) {}`。 */
  const byBinding = { withBinding: 0, withoutBinding: 0 }
  let total = 0

  for (const file of files) {
    const { rel, content } = file
    const plugin = pluginOf(rel)
    for (const hit of scanContent(rel, content)) {
      total++
      byRule[hit.rule] = (byRule[hit.rule] || 0) + 1
      byPlugin[plugin] = (byPlugin[plugin] || 0) + 1
      byPluginRule[plugin] = byPluginRule[plugin] || { SC1: 0, SC2: 0, SC3: 0 }
      byPluginRule[plugin][hit.rule] = (byPluginRule[plugin][hit.rule] || 0) + 1

      if (hit.hasBinding) byBinding.withBinding++
      else byBinding.withoutBinding++

      if (hit.singleLine) {
        byCaliber.singleLine++
        if (hit.rule === 'SC1') byCaliber.singleLineSc1++
        if (DEFINITE_RULES.has(hit.rule)) byCaliber.singleLineDefinite++
        else byCaliber.singleLineSuspected++
      } else {
        byCaliber.multiLine++
      }

      const idx = allowlist.entries.findIndex((entry) => entryMatches(entry, rel, hit))
      if (idx >= 0) {
        matchedAllowlist.add(idx)
        allowed.push({ path: rel, ...hit, reason: allowlist.entries[idx].reason })
        continue
      }
      violations.push({ path: rel, ...hit })
    }
  }

  const staleEntries = allowlist.entries
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ idx }) => !matchedAllowlist.has(idx))

  return { violations, allowed, staleEntries, byRule, byPlugin, byPluginRule, byCaliber, byBinding, total }
}

/* ------------------------------------------------------------------ 报告 */

function countBy(list, rule) {
  return list.filter((h) => h.rule === rule).length
}

export function formatReport(result, { scannedFiles, quiet }) {
  const { violations, allowed, staleEntries, byRule, byPlugin, byPluginRule, byCaliber, byBinding, total } =
    result
  const lines = []

  lines.push('🔎 verify-silent-catch：静默吞错存量扫描（告警档，恒以成功状态退出，不阻断交付）')
  lines.push(`   口径：${CALIBER_NOTE}`)
  lines.push(
    `   范围：${SCOPE_NOTE}；已排除 node_modules、lib、测试与夹具目录、${VENDOR_PREFIXES[0]}**`,
  )

  if (scannedFiles === 0) {
    lines.push('   ⚠️ 本次没有扫描到任何文件（范围为空），不能据此认为通过。')
  }

  const definite = (byRule.SC1 || 0) + (byRule.SC2 || 0)
  const suspected = byRule.SC3 || 0
  lines.push(
    `   扫描 ${scannedFiles} 个文件，命中 ${total} 处（确证 SC1+SC2 ${definite} 处 ｜ 疑似 SC3 ${suspected} 处）`,
  )
  lines.push(
    `   其中 SC1 空 catch ${byRule.SC1 || 0} 处 ｜ SC2 仅注释 catch ${byRule.SC2 || 0} 处 ｜ SC3 有语句无痕迹 ${suspected} 处`,
  )
  lines.push(
    `   口径对照·单行（catch 与收尾 } 同行）：SC1 空 catch ${byCaliber.singleLineSc1} 处 ｜ 确证 SC1+SC2 ${byCaliber.singleLineDefinite} 处 ｜ ` +
      `全部 ${byCaliber.singleLine} 处；跨行 ${byCaliber.multiLine} 处（本脚本含跨行，历史基线 279 处为单行口径）`,
  )
  lines.push(
    `   绑定形态：catch {}（可选绑定）${byBinding.withoutBinding} 处 ｜ catch (e) {}（带括号）${byBinding.withBinding} 处`,
  )

  const plugins = Object.keys(byPlugin).sort()
  if (plugins.length > 0) {
    lines.push('   按插件统计（合计 ｜ 确证 SC1+SC2 ｜ 疑似 SC3）：')
    for (const plugin of plugins) {
      const per = byPluginRule[plugin] || {}
      const def = (per.SC1 || 0) + (per.SC2 || 0)
      lines.push(`     ${plugin.padEnd(26)} ${String(byPlugin[plugin]).padStart(5)} ｜ ${String(def).padStart(4)} ｜ ${String(per.SC3 || 0).padStart(4)}`)
    }
  }

  if (staleEntries.length > 0) {
    lines.push(`❌ 僵尸豁免 ${staleEntries.length} 条（对应代码已修好或已不存在，必须删除）：`)
    for (const { entry } of staleEntries) {
      lines.push(`   · ${entry.rule} ${entry.path}:${entry.line}`)
    }
  }

  if (allowed.length > 0) {
    lines.push(`ℹ️ 已豁免 ${allowed.length} 处（每条须带理由，修好后必须删除豁免，否则门禁报僵尸豁免）：`)
    for (const a of allowed) {
      lines.push(`   · [${a.rule} ${RULES[a.rule]}] ${a.path}:${a.line} ← ${a.reason}`)
    }
  }

  if (violations.length > 0 && !quiet) {
    lines.push(`   清单（${violations.length} 处，按插件、按行号；{rule, path, line}）：`)
    for (const plugin of plugins) {
      const rows = violations
        .filter((v) => pluginOf(v.path) === plugin)
        .sort((a, b) => (a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1))
      if (rows.length === 0) continue
      lines.push(`   ## ${plugin}（${rows.length} 处）`)
      for (const v of rows) {
        lines.push(`   · [${v.rule} ${RULES[v.rule]}] ${v.path}:${v.line}  ${v.detail}`)
      }
    }
  } else if (violations.length > 0) {
    lines.push(`   已发现 ${violations.length} 处存量吞错点（--quiet：不打印逐条清单）`)
  }

  if (total === 0 && staleEntries.length === 0) {
    lines.push('✅ verify-silent-catch：扫描范围内没有发现吞错点')
  } else if (staleEntries.length === 0) {
    lines.push(
      '   ⚠️ 告警档：以上为存量吞错点，不阻塞交付。治理方向是「先测量、后阻断」——' +
        '修好的位置必须同步删除豁免条目，基线数字只能下降。',
    )
  }
  return lines.join('\n')
}

/* ------------------------------------------------------------------ 主流程 */

function readSources(root, rels) {
  const files = []
  for (const rel of rels) {
    const abs = join(root, rel)
    if (!existsSync(abs)) continue
    files.push({ rel, content: readFileSync(abs, 'utf8') })
  }
  return files
}

export function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json')
  const quiet = argv.includes('--quiet')
  const root = findRepoRoot(process.cwd())

  // 豁免清单先校验：配置坏了必须在任何早退之前报出来。
  const allowlist = loadAllowlist(root)
  if (allowlist.errors.length > 0) {
    process.stderr.write(
      `❌ ${ALLOWLIST_FILENAME} 配置错误：\n${allowlist.errors.map((e) => `   · ${e}`).join('\n')}\n`,
    )
    return 2
  }

  const pluginsDir = join(root, 'plugins')
  const hasPlugins = existsSync(pluginsDir) && statSync(pluginsDir).isDirectory()

  if (!hasPlugins) {
    // 缺少 plugins/ 目录：以成功状态退出并说明未扫描，不谎报 PASS。
    const message = `ℹ️ verify-silent-catch：未发现 ${join(root, 'plugins')}，本次未扫描（这不代表通过）。`
    if (json) {
      process.stdout.write(`${JSON.stringify({ scanned: 0, skipped: 'plugins/ 目录不存在', total: 0 }, null, 2)}\n`)
    } else {
      process.stdout.write(`${message}\n`)
    }
    return 0
  }

  const rels = listScanTargets(root)
  const files = readSources(root, rels)
  const result = evaluate(files, allowlist)

  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          scope: SCOPE_NOTE,
          caliber: CALIBER_NOTE,
          scanned: files.length,
          total: result.total,
          byRule: result.byRule,
          byCaliber: result.byCaliber,
          byBinding: result.byBinding,
          byPlugin: result.byPlugin,
          byPluginRule: result.byPluginRule,
          violations: result.violations,
          allowed: result.allowed,
          staleEntries: result.staleEntries.map((s) => s.entry),
        },
        null,
        2,
      )}\n`,
    )
  } else {
    process.stdout.write(`${formatReport(result, { scannedFiles: files.length, quiet })}\n`)
  }

  if (result.staleEntries.length > 0) return 1
  return 0
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  process.exitCode = main()
}
