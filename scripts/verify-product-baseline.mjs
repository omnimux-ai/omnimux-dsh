#!/usr/bin/env node
/**
 * scripts/verify-product-baseline.mjs
 * 产品基线机械门禁：产品运行时代码不得依赖开发机私有状态。
 *
 * Contract: docs/contracts/product-baseline.md
 * Spec:     specs/product-baseline-guard.spec.md
 *
 * 用法：
 *   node scripts/verify-product-baseline.mjs           全仓扫描（默认）
 *   node scripts/verify-product-baseline.mjs --diff    仅扫描本次改动引入的文件
 *   node scripts/verify-product-baseline.mjs --json    机器可读输出
 *   node scripts/verify-product-baseline.mjs --hook    PreToolUse 钩子（stdin JSON）
 *
 * 退出码：0 通过｜1 命中违规｜2 配置错误（豁免清单非法或失效）
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/* ------------------------------------------------------------------ 常量 */

export const SCAN_ROOTS = ['plugins', 'packages']

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'])

/**
 * 运行时代码所在目录（相对仓库根，POSIX）。
 * 只判源码：`lib/` 一类的构建产物由源重建，重复判定只会产生双份报告与双份修复要求。
 */
const RUNTIME_DIR_RE = /^plugins\/[^/]+\/(?:src|extension\/src)\/|^packages\/[^/]+\/src\//

/** 测试与夹具目录：同样的代码在测试里出现不算产品路径依赖。 */
const TEST_SEGMENTS = new Set(['tests', 'test', '__tests__', 'fixtures', '__fixtures__', '__mocks__', 'e2e'])

/** 第三方 vendor（不得修改，也不参与门禁判定）。 */
const VENDOR_PREFIXES = ['plugins/omnimux-clip/src/client/openreel/']

/** 中枢自身：按 hub.md，它是凭据与 provider 路由的唯一合法持有者。 */
const HUB_PREFIX = 'plugins/omnimux/'

export const RULES = {
  R1: 'dev-identity',
  R2: 'local-channel-discovery',
  R3: 'loopback-provider-endpoint',
  R4: 'plugin-provider-key',
  R5: 'dev-machine-path',
}

const RULE_LABEL = {
  R1: '开发版身份进入产品运行时',
  R2: '本机配置被用来决定模型通道',
  R3: '回环地址被当作模型端点',
  R4: '业务插件读取 provider 密钥',
  R5: '开发机绝对路径进入产品运行时',
}

const DEV_IDENTITY_RE = /omnimux-dev/
/** 只认引号字面量（路径拼接/读取的形态）；文档注释里提到文件名不算违规。 */
const LOCAL_CONFIG_LITERAL_RE = /['"][^'"]*(?:settings\.yaml|\.credentials\.yaml)['"]/
const PROVIDER_MARKER_RE = /\bproviders\b|baseURL|baseUrl|apiKeyEnv|llm-pi-ai/
const LOOPBACK_V1_RE = /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\/v1(?:\/|\b)/
const DEV_MACHINE_PATH_RE = /\/Users\/[^/'"\s]+\/Desktop\/|~\/Desktop\/Project\//
const PROVIDER_KEY_ENV_RE = /process\.env\.([A-Z][A-Z0-9_]*)/g
const PROVIDER_KEY_EXEMPT_PREFIX = /^(?:OMNIMUX_|DSH_)/
const HUB_SEAM_RE = /\bvideoGenerate\b|\bimageGenerate\b|\bvideoProcess\b|\bspeechToText\b|\btextComplete\b|\bmodelCatalog\b|omnimux_[a-z_]+|catalog-defaults/

export const NEW_USER_CHECKLIST = [
  '这段代码在新用户机器上拿什么跑通？新用户只有：安装壳 + 执行中枢 + 登录后的中枢凭据。',
  '有没有只在开发机存在的路径、端口、模型别名或凭据参与进来？有 → 它是否成了默认 / 首选 / 自动回退的下一跳？',
  '中枢未配置或未登录时，用户看到的是明确中文提示，还是一个看起来成功的模板结果？',
  '任务规格里有没有「新用户基线」一节，写清依赖什么、缺什么时报什么错？',
]

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

export function isRuntimeSource(relPath) {
  const rel = toPosix(relPath)
  if (!RUNTIME_DIR_RE.test(rel)) return false
  if (VENDOR_PREFIXES.some((p) => rel.startsWith(p))) return false
  if (!SOURCE_EXTENSIONS.has(extname(rel))) return false
  const segments = rel.split('/')
  if (segments.some((s) => TEST_SEGMENTS.has(s))) return false
  const base = segments[segments.length - 1]
  if (/\.(?:test|spec)\.[^.]+$/.test(base)) return false
  if (/^(?:test|spec)-/.test(base)) return false
  return true
}

function walk(dir, acc, root) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, acc, root)
    } else if (entry.isFile()) {
      const rel = toPosix(relative(root, full))
      if (isRuntimeSource(rel)) acc.push(rel)
    }
  }
  return acc
}

export function listRuntimeSources(root) {
  const acc = []
  for (const scanRoot of SCAN_ROOTS) {
    const abs = join(root, scanRoot)
    if (existsSync(abs) && statSync(abs).isDirectory()) walk(abs, acc, root)
  }
  return acc.sort()
}

/* ------------------------------------------------------------------ 规则 */

function firstLineMatching(content, re) {
  const idx = content.split('\n').findIndex((line) => re.test(line))
  return idx + 1
}

function providerKeyHits(rel, content) {
  if (rel.startsWith(HUB_PREFIX)) return []
  const hits = []
  const lines = content.split('\n')
  lines.forEach((line, i) => {
    PROVIDER_KEY_ENV_RE.lastIndex = 0
    let m
    while ((m = PROVIDER_KEY_ENV_RE.exec(line)) !== null) {
      const name = m[1]
      if (PROVIDER_KEY_EXEMPT_PREFIX.test(name)) continue
      if (!/(?:_API_KEY|_TOKEN|_SECRET|_KEY)$/.test(name)) continue
      hits.push({ rule: 'R4', line: i + 1, detail: name })
    }
  })
  return hits
}

/**
 * 扫描单个文件内容，返回命中列表（未做豁免过滤）。
 */
export function scanContent(relPath, content) {
  const rel = toPosix(relPath)
  if (!isRuntimeSource(rel)) return []
  const hits = []

  if (DEV_IDENTITY_RE.test(content)) {
    hits.push({ rule: 'R1', line: firstLineMatching(content, DEV_IDENTITY_RE), detail: 'omnimux-dev' })
  }

  // 中枢是凭据与 provider 的合法持有者；本规则只约束业务插件。
  if (!rel.startsWith(HUB_PREFIX) && LOCAL_CONFIG_LITERAL_RE.test(content) && PROVIDER_MARKER_RE.test(content)) {
    hits.push({
      rule: 'R2',
      line: firstLineMatching(content, LOCAL_CONFIG_LITERAL_RE),
      detail: '本机 settings.yaml / .credentials.yaml + provider 选择',
    })
  }

  content.split('\n').forEach((line, i) => {
    if (LOOPBACK_V1_RE.test(line)) {
      hits.push({ rule: 'R3', line: i + 1, detail: line.trim().slice(0, 120) })
    }
    if (DEV_MACHINE_PATH_RE.test(line)) {
      hits.push({ rule: 'R5', line: i + 1, detail: line.trim().slice(0, 120) })
    }
  })

  for (const hit of providerKeyHits(rel, content)) hits.push(hit)

  return hits
}

/* ------------------------------------------------------------------ 豁免 */

export const ALLOWLIST_FILENAME = 'scripts/product-baseline-allowlist.json'

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
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 8) {
      errors.push(`${where} 缺少有意义的 reason（≥8 字），无理由的豁免不予接受`)
    }
  })
  return { entries, errors }
}

function entryMatches(entry, rel, hit) {
  if (toPosix(entry.path) !== rel) return false
  if (entry.rule !== hit.rule) return false
  if (Number.isInteger(entry.line) && entry.line !== hit.line) return false
  return true
}

/**
 * @returns {{ violations: object[], allowed: object[], staleEntries: object[] }}
 */
export function evaluate(files, allowlist) {
  const violations = []
  const allowed = []
  const matchedAllowlist = new Set()
  for (const file of files) {
    const { rel, content } = file
    for (const hit of scanContent(rel, content)) {
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
  return { violations, allowed, staleEntries }
}

/* ------------------------------------------------------------------ git */

function git(root, args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 8000 })
  if (r.status !== 0) return null
  return r.stdout
}

export function changedRuntimeSources(root) {
  const sets = [
    git(root, ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']),
    git(root, ['diff', '--name-only', '--diff-filter=ACMR', 'origin/main...HEAD']),
    git(root, ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD~1...HEAD']),
  ].filter(Boolean)
  const all = new Set()
  for (const out of sets) {
    for (const line of out.split('\n')) {
      const rel = toPosix(line.trim())
      if (rel) all.add(rel)
    }
  }
  return [...all]
}

function readSources(root, rels) {
  const files = []
  for (const rel of rels) {
    const abs = join(root, rel)
    if (!existsSync(abs)) continue
    files.push({ rel, content: readFileSync(abs, 'utf8') })
  }
  return files
}

/* ------------------------------------------------------------------ 报告 */

function formatReport(root, result, { diffMode, changedForChecklist }) {
  const lines = []
  const { violations, allowed, staleEntries } = result

  if (violations.length > 0) {
    lines.push(`❌ verify-product-baseline：命中 ${violations.length} 处环境依赖（合同 docs/contracts/product-baseline.md）`)
    for (const v of violations) {
      lines.push(`  · [${v.rule} ${RULE_LABEL[v.rule]}] ${v.path}:${v.line}`)
      if (v.detail) lines.push(`      ${v.detail}`)
    }
    lines.push('  修法：改走执行中枢席位/工具；确属允许的本机用法时，写进 scripts/product-baseline-allowlist.json 并给出理由。')
  }

  if (staleEntries.length > 0) {
    lines.push(`❌ 僵尸豁免 ${staleEntries.length} 条（已匹配不到任何位置，请删除）：`)
    for (const { entry } of staleEntries) lines.push(`  · ${entry.rule} ${entry.path}`)
  }

  if (allowed.length > 0 && !diffMode) {
    lines.push(`ℹ️ 已豁免 ${allowed.length} 处（每条须带理由，修好后必须删除豁免，否则门禁报僵尸豁免）：`)
    for (const a of allowed) lines.push(`  · [${a.rule}] ${a.path}:${a.line} ← ${a.reason}`)
  }

  const touched = (changedForChecklist || []).filter((rel) => {
    if (!isRuntimeSource(rel)) return false
    try {
      return HUB_SEAM_RE.test(readFileSync(join(root, rel), 'utf8'))
    } catch {
      return false
    }
  })

  if (diffMode && violations.length === 0 && staleEntries.length === 0 && touched.length > 0) {
    lines.push('🔎 新用户基线自检（本次改动触及模型 / provider 代码）')
    NEW_USER_CHECKLIST.forEach((item, i) => lines.push(`  ${i + 1}. ${item}`))
  }

  if (violations.length === 0 && staleEntries.length === 0) {
    lines.push('✅ verify-product-baseline：产品运行时未发现未豁免的开发机私有状态依赖')
  }
  return lines.join('\n')
}

/* ------------------------------------------------------------------ 主流程 */

export function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json')
  const diffMode = argv.includes('--diff')
  const root = findRepoRoot(process.cwd())
  const allowlist = loadAllowlist(root)

  if (allowlist.errors.length > 0) {
    process.stderr.write(`❌ ${ALLOWLIST_FILENAME} 配置错误：\n${allowlist.errors.map((e) => `  · ${e}`).join('\n')}\n`)
    return 2
  }

  const rels = diffMode ? changedRuntimeSources(root) : listRuntimeSources(root)
  const files = readSources(root, rels)
  const result = evaluate(files, allowlist)

  if (json) {
    process.stdout.write(
      `${JSON.stringify({ diffMode, scanned: files.length, ...result, staleEntries: result.staleEntries.map((s) => s.entry) }, null, 2)}\n`,
    )
  } else {
    process.stdout.write(`${formatReport(root, result, { diffMode, changedForChecklist: rels })}\n`)
  }

  if (result.violations.length > 0 || result.staleEntries.length > 0) return 1
  return 0
}

/* ------------------------------------------------------------------ hook */

export function handle(rawInput) {
  const input = JSON.parse(rawInput || '{}')
  const hookEventName = input.hook_event_name || 'PreToolUse'
  const rawTool = String(input.tool_name || '').toLowerCase()
  const toolName = rawTool.replace(/^.*:/, '')
  const toolInput = input.tool_input || {}
  const cwd = String(input.cwd || process.cwd())

  const allow = () => ({ hookSpecificOutput: { hookEventName, permissionDecision: 'allow' } })

  if (toolName !== 'write' && toolName !== 'edit') return allow()

  const rawFilePath = String(toolInput.file_path || toolInput.path || toolInput.filePath || '').trim()
  if (!rawFilePath) return allow()

  const root = findRepoRoot(cwd)
  const abs = resolve(cwd, rawFilePath)
  const rel = toPosix(relative(root, abs))
  if (rel.startsWith('..')) return allow()
  if (!isRuntimeSource(rel)) return allow()

  let text = ''
  if (typeof toolInput.content === 'string') text = toolInput.content
  else if (typeof toolInput.new_string === 'string') text = toolInput.new_string
  else if (existsSync(abs)) text = readFileSync(abs, 'utf8')
  if (!text) return allow()

  const allowlist = loadAllowlist(root)
  if (allowlist.errors.length > 0) return allow()

  const hits = scanContent(rel, text).filter((hit) => !allowlist.entries.some((entry) => entryMatches(entry, rel, hit)))
  if (hits.length === 0) return allow()

  const reason = [
    `🚫 产品基线硬门禁拦截：${rel} 依赖了开发机私有状态。`,
    ...hits.map((h) => `  · [${h.rule} ${RULE_LABEL[h.rule]}] 第 ${h.line} 行：${h.detail || ''}`),
    '合同 docs/contracts/product-baseline.md：产品路径只允许依赖「新用户装完就有」的东西。',
    '改走执行中枢席位/工具；确属允许的本机用法时，写进 scripts/product-baseline-allowlist.json 并给出理由。',
  ].join('\n')

  return {
    hookSpecificOutput: {
      hookEventName,
      permissionDecision: 'deny',
      permissionReason: reason,
      permissionDecisionReason: reason,
    },
  }
}

function runHook() {
  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (c) => (raw += c))
  process.stdin.on('end', () => {
    try {
      process.stdout.write(`${JSON.stringify(handle(raw))}\n`)
    } catch (err) {
      process.stderr.write(`[verify-product-baseline error] ${err.message}\n`)
      process.stdout.write(
        `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } })}\n`,
      )
    }
  })
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  if (process.argv.includes('--hook')) runHook()
  else process.exitCode = main()
}
