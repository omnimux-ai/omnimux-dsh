#!/usr/bin/env node
/**
 * scripts/guard-quality-loop.mjs
 * dsh-hooks-plugin PreToolUse Hard Gate for Quality Loop (Spec → Code → Verify → Test → Green)
 * Contract: specs/quality-gate-hardening.spec.md
 *
 * 设计要点（任务级，非仓库级）：
 *  1. 规格门禁：业务源码改动必须伴随「本任务」产出的规格文档（未提交改动或领先 origin/main 的提交）。
 *  2. 验证门禁：写端到端测试前，必须存在晚于本任务规格的验证证据。
 *  3. 完整性门禁：提交/推送/建 PR 时，若改动集合含界面源码，则必须同时含端到端测试。
 *  4. bash 覆盖：终端写入业务源码与提交类命令同样受门禁约束。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, resolve, relative, dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const EVIDENCE_WINDOW_MS = 4 * 60 * 60 * 1000
const MAX_SCAN_ENTRIES = 4000

/* ------------------------------------------------------------------ 仓库根 */

export function findRepoRoot(startDir) {
  let cur = resolve(startDir)
  for (let i = 0; i < 8; i++) {
    try {
      const data = JSON.parse(readFileSync(resolve(cur, 'package.json'), 'utf8'))
      if (data && (data.name === 'omnimux-dsh' || String(data.name || '').endsWith('/omnimux-dsh'))) return cur
    } catch {}
    const parent = dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return resolve(startDir)
}

function git(root, args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 4000 })
  if (r.error || r.status !== 0) return ''
  return String(r.stdout || '')
}

/* -------------------------------------------------------------- 任务改动集合 */

/** 未提交改动 + 相对 origin/main 的领先提交，统一为仓库相对路径。 */
export function taskChangeSet(root) {
  const files = new Set()

  // 必须带 -uall：否则未跟踪目录会被折叠成 "plugins/" 单条，导致文件级判定失效
  for (const line of git(root, ['status', '--porcelain', '-uall']).split('\n')) {
    if (!line || line.length < 4) continue
    const status = line.slice(0, 2)
    if (status.includes('D')) continue
    const raw = line.slice(3).trim()
    if (!raw) continue
    const target = raw.includes(' -> ') ? raw.split(' -> ').pop().trim() : raw
    files.add(target.replace(/^"|"$/g, ''))
  }

  for (const line of git(root, ['diff', '--name-only', 'origin/main...HEAD']).split('\n')) {
    const path = line.trim()
    if (path) files.add(path)
  }

  return [...files]
}

export function isSpecPath(rel) {
  return rel.startsWith('specs/') && rel.endsWith('.md')
}

export function isE2EPath(rel) {
  return (
    rel.includes('/tests/e2e/') ||
    rel.includes('/e2e/') ||
    rel.includes('.e2e.test.') ||
    (/\/tests?\//.test(rel) && (rel.endsWith('.spec.ts') || rel.endsWith('.spec.js')))
  )
}

export function isUiSourcePath(rel) {
  // 测试文件与规格文档不算「界面源码」，避免把测试改动误判成界面改动
  if (rel.includes('/tests/') || rel.includes('.test.') || rel.includes('.spec.') || rel.startsWith('specs/')) {
    return false
  }
  if (rel.endsWith('.css') || rel.endsWith('.tsx') || rel.endsWith('.jsx')) return true
  if (rel.includes('/src/client/')) return true
  if (rel.includes('/extension/src/')) return true
  if (rel.includes('/client/')) return true
  return false
}

/* ------------------------------------------------------------- 规格与证据 */

/** 本任务产出的规格文档（绝对路径 + mtime）。 */
export function taskSpecs(root) {
  const out = []
  for (const rel of taskChangeSet(root)) {
    if (!isSpecPath(rel)) continue
    const abs = resolve(root, rel)
    try {
      const st = statSync(abs)
      if (st.isFile() && st.size > 50) out.push({ path: abs, mtime: st.mtimeMs })
    } catch {}
  }
  return out
}

/** 通用首页冒烟黑名单：禁止以首页通用图冒充功能验收证据。 */
export const BANNED_SMOKE_EVIDENCE_NAMES = new Set([
  'app-home.png',
  'app-home.jpg',
  'app-home.jpeg',
  'app-home.webp',
  'home.png',
  'home.jpg',
])

export function isBannedSmokeEvidence(name) {
  if (!name || typeof name !== 'string') return false
  return BANNED_SMOKE_EVIDENCE_NAMES.has(name.toLowerCase())
}

/** 递归收集证据候选文件（受限深度与数量，排除黑名单首页冒烟）。 */
function collectEvidenceFiles(dir, depth, acc) {
  if (depth > 3 || acc.length >= MAX_SCAN_ENTRIES) return
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (acc.length >= MAX_SCAN_ENTRIES) return
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectEvidenceFiles(abs, depth + 1, acc)
    } else if (entry.isFile()) {
      if (/\.(png|jpg|jpeg|webp|json|log|txt|md)$/i.test(entry.name)) {
        if (!isBannedSmokeEvidence(entry.name)) {
          try {
            acc.push({ path: abs, name: entry.name, mtime: statSync(abs).mtimeMs })
          } catch {}
        }
      }
    }
  }
}

/** 晚于本任务规格产生的验证证据（收敛至受控目录，彻底剔除 tmp/ 临时目录）。 */
export function hasEvidenceAfterSpec(root) {
  const specs = taskSpecs(root)
  if (specs.length === 0) return false
  const since = Math.max(...specs.map((s) => s.mtime))
  const now = Date.now()

  const acc = []
  collectEvidenceFiles(resolve(root, 'docs/evidence'), 0, acc)
  collectEvidenceFiles(resolve(root, '.agent-reports'), 0, acc)
  collectEvidenceFiles(resolve(root, '.workbuddy/evidence'), 0, acc)

  return acc.some((f) => f.mtime >= since && now - f.mtime <= EVIDENCE_WINDOW_MS)
}

/* ------------------------------------------------------------- 源码判定 */

export function isBusinessSourceFile(fullPath, rootDir) {
  const rel = relative(rootDir, fullPath).replace(/\\/g, '/')
  if (!rel || rel.startsWith('..')) return false

  if (
    rel.startsWith('specs/') ||
    rel.endsWith('.md') ||
    rel.startsWith('scripts/') ||
    rel.startsWith('docs/') ||
    rel.startsWith('.dsh/') ||
    rel.startsWith('.workbuddy/') ||
    rel.startsWith('.github/') ||
    rel.startsWith('tmp/') ||
    rel.startsWith('dist/') ||
    rel.startsWith('node_modules/') ||
    rel.includes('/test-fixtures/') ||
    rel.includes('/tests/') ||
    rel.includes('.test.') ||
    rel.includes('.spec.') ||
    rel === 'package.json' ||
    rel.startsWith('tsconfig') ||
    rel === 'design.md'
  ) {
    return false
  }

  if (rel.startsWith('plugins/') && (rel.includes('/src/') || rel.includes('/extension/src/'))) return true
  if (rel.startsWith('packages/') && rel.includes('/src/')) return true
  return false
}

export function isE2ETestFile(fullPath, rootDir) {
  const rel = relative(rootDir, fullPath).replace(/\\/g, '/')
  if (!rel || rel.startsWith('..')) return false
  if (rel.startsWith('specs/')) return false
  return isE2EPath(rel)
}

/** 任务有效实测证据路径：必须在受控持久化目录且非通配首页冒烟图 */
export function isTaskEvidencePath(relPath) {
  if (!relPath || typeof relPath !== 'string') return false
  const norm = relPath.replace(/\\/g, '/')
  const name = norm.split('/').pop() || ''
  if (isBannedSmokeEvidence(name)) return false
  return (
    (norm.startsWith('docs/evidence/') || norm.startsWith('.agent-reports/')) &&
    /\.(png|jpg|jpeg|webp|json|md)$/i.test(norm)
  )
}

/* ------------------------------------------------- bash 命令识别 */

/** 疑似通过终端写入业务源码。 */
export function bashWritesSource(command) {
  if (!command || typeof command !== 'string') return false
  if (!/plugins\/|packages\//.test(command)) return false

  const patterns = [
    />>?\s*['"]?[^\s'"]*(?:plugins|packages)\/[^\s'"]*\/src\//,
    /\btee\b[^\n]*(?:plugins|packages)\/[^\s'"]*\/src\//,
    /\bsed\b[^\n]*-i[^\n]*(?:plugins|packages)\/[^\s'"]*\/src\//,
    /\b(?:cp|mv|install)\b[^\n]*(?:plugins|packages)\/[^\s'"]*\/src\//,
    /(?:writeFileSync|appendFileSync)/,
    /open\([^)]*['"][wa]/,
  ]
  return patterns.some((p) => p.test(command))
}

/** 剥离 git 全局选项（-C/-c/--git-dir/--work-tree 等），避免 `git -C <路径> commit` 这类常见写法漏判。 */
export function stripGitGlobalOptions(command) {
  return String(command).replace(
    /\s-(?:C|-c)\s+(?:"[^"]*"|'[^']*'|\S+)|\s--(?:git-dir|work-tree)(?:=\S+|\s+(?:"[^"]*"|'[^']*'|\S+))/g,
    ' ',
  )
}

/** 提交/推送/建 PR 类命令。 */
export function isDeliveryCommand(command) {
  if (!command || typeof command !== 'string') return false
  const normalized = stripGitGlobalOptions(command)
  return (
    /\bgit\s+commit\b/.test(normalized) ||
    /\bgit\s+push\b/.test(normalized) ||
    /\bgh\s+pr\s+(create|merge|ready)\b/.test(command) ||
    // 弃用入口：只有 finish 是交付，start/dev 等不是，保持既有语义。
    /\bgit-wt\.sh\s+finish\b/.test(command) ||
    // 现行标准入口 `worktree.sh ship|finish <task>`（树建在 <repo>/.worktrees/<task>）。
    // 只列交付子命令，避免把 list/remove/prune/new/help 这类查询与清理误判为交付。
    /\bworktree\.sh\s+(?:ship|finish)\s+\S/.test(command)
  )
}

/* ------------------------------------------------------------- 门禁判定 */

/** 从命令里解析 `-C <path>` 的目标仓库根；无 -C 时回落会话工作目录。 */
export function effectiveRepoRoot(command, cwd) {
  const sessionRoot = findRepoRoot(cwd)
  if (!command || typeof command !== 'string') return sessionRoot
  const m = /(?:^|\s)-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/.exec(command)
  if (!m) return sessionRoot
  const raw = (m[1] || m[2] || m[3] || '').trim()
  if (!raw) return sessionRoot
  const target = isAbsolute(raw) ? raw : resolve(cwd, raw)
  return findRepoRoot(target)
}

export function decideQualityGate({ toolName, toolInput, cwd }) {
  const rawTool = String(toolName || '').toLowerCase()
  const name = rawTool.replace(/^.*:/, '')

  if (name === 'bash') {
    const command = String(toolInput.command || '')
    const workdir = typeof toolInput.workdir === 'string' && toolInput.workdir.trim()
      ? resolve(cwd, toolInput.workdir) : cwd
    const root = effectiveRepoRoot(command, workdir)
    if (isDeliveryCommand(command)) {
      const changed = taskChangeSet(root)
      const ui = changed.filter(isUiSourcePath)
      const e2e = changed.filter(isE2EPath)
      if (ui.length > 0 && e2e.length === 0) {
        return {
          decision: 'deny',
          reason: 'missing-e2e-for-ui-change',
          uiCount: ui.length,
          sample: ui.slice(0, 3).join(', '),
        }
      }
      const evidence = changed.filter(isTaskEvidencePath)
      if (ui.length > 0 && evidence.length === 0) {
        return {
          decision: 'deny',
          reason: 'missing-evidence-for-ui-delivery',
          uiCount: ui.length,
          sample: ui.slice(0, 3).join(', '),
        }
      }
      return { decision: 'allow' }
    }
    if (bashWritesSource(command) && taskSpecs(root).length === 0) {
      return { decision: 'deny', reason: 'missing-spec-for-source-code' }
    }
    return { decision: 'allow' }
  }

  if (name !== 'edit' && name !== 'write') return { decision: 'allow' }

  const rawPath = String(toolInput.file_path || '').trim()
  if (!rawPath) return { decision: 'allow' }
  const fullPath = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath)

  // 判定必须落在「被改文件所在仓库」：工作树里干活就查工作树的规格，
  // 否则会退化成要求把草稿镜像进主检出，与物化洁净门禁方向相反。
  const root = findRepoRoot(dirname(fullPath))

  if (isBusinessSourceFile(fullPath, root)) {
    if (taskSpecs(root).length === 0) {
      return { decision: 'deny', reason: 'missing-spec-for-source-code' }
    }
  }

  if (isE2ETestFile(fullPath, root)) {
    if (!hasEvidenceAfterSpec(root)) {
      return { decision: 'deny', reason: 'missing-verify-evidence-for-e2e' }
    }
  }

  return { decision: 'allow' }
}

/* ------------------------------------------------------------- 输出 */

const REASONS = {
  'missing-spec-for-source-code': () => [
    '🚫【质量五步闭环硬门禁：规格前置拦截】本任务尚未产出规格文档，禁止改动业务源码！',
    '📌 判定规则：必须在「本次任务」中新建或修改 specs/*.md（未提交改动或领先 origin/main 的提交），仓库里的历史规格不算数。',
    '📌 判定范围：只看**被改文件所在的那个仓库**（在自己工作树里干活就查工作树）。',
    '⛔ 严禁把规格草稿镜像/复制到主检出充数：主检出不接受任何镜像草稿，镜像既不会让它通过，也会污染主干工作区。',
    '👉 正确流程：',
    '  1. 先调用规格技能: skill { "name": "spec-driven-development" }；',
    '  2. 在**本任务所在工作树**的 specs/ 目录落盘规格（写清用户操作旅程、期望界面反馈与验收用例）；',
    '  3. 规格落盘后方可编写源码。',
  ],
  'missing-verify-evidence-for-e2e': () => [
    '🚫【质量五步闭环硬门禁：验证前置拦截】尚未在受控目录留存有效实机预演证据，禁止编写端到端测试！',
    '📌 判定规则：必须存在「晚于本任务规格」产生的专属验证证据（落盘于 docs/evidence/、.agent-reports/ 或 .workbuddy/evidence/）。',
    '⛔ 严禁使用通用首页冒烟图（如 app-home.png）或 /tmp 临时文件充数：证据必须具备功能专属特征并持久化！',
    '💡【业务前置数据提示】：若功能依赖画布素材节点等前置数据，测试环境已自动预置带视频的标准工程（ID: ws_qa_media），直接可用！',
    '👉 正确流程：先在真实浏览器中跑通被测功能关键交互并留存专属截图证据，再固化端到端测试。',
  ],
  'missing-e2e-for-ui-change': (extra) => [
    '🚫【质量五步闭环硬门禁：端到端完整性拦截】本任务改动了界面代码，但改动集合中没有端到端测试，禁止提交/推送/建 PR！',
    `📌 判定规则：改动集合含界面源码（本次 ${extra.uiCount || 0} 个，如 ${extra.sample || '-'}）时，必须同时含端到端测试文件。`,
    '👉 正确流程：',
    '  1. 先在隔离环境实机预演并留存证据；',
    '  2. 补齐端到端测试（tests/e2e/**、*.e2e.test.* 或 tests 下的 *.spec.ts/js）；',
    '  3. 单元测试不能替代端到端测试。',
  ],
  'missing-evidence-for-ui-delivery': (extra) => [
    '🚫【质量五步闭环硬门禁：界面实测证据同捆拦截】本任务改动了前端界面代码，但变更集合中没有提交专属实测证据，禁止交付！',
    `📌 判定规则：改动集合含界面源码（本次 ${extra.uiCount || 0} 个，如 ${extra.sample || '-'}）时，必须同时提交 docs/evidence/ 或 .agent-reports/ 下的专属实测截图/证据文件。`,
    '⛔ 严禁使用通配首页冒烟图（app-home.png）或 /tmp 临时截图充数：证据必须具备任务专属特征并持久化入库！',
    '💡【业务前置数据提示】：若功能依赖画布素材节点等前置数据，测试环境已自动预置带视频的标准工程（ID: ws_qa_media），可在浏览器直接访问该工程，无需手动造数据！',
    '👉 正确行动指引（请按以下步骤操作）：',
    '  1. 在无痕真实浏览器中进入本次改动的功能页面（若涉及画布节点可直达：/#/workspace/ws_qa_media）；',
    '  2. 模拟真实用户执行核心交互（点击、切换、输入）；',
    '  3. 将专属实操截图保存至：docs/evidence/<task>-verified.png；',
    '  4. 执行：git add docs/evidence/<task>-verified.png；',
    '  5. 重新执行提交/交付命令。',
  ],
}

export function handle(rawInput) {
  const input = JSON.parse(rawInput || '{}')
  const hookEventName = input.hook_event_name || 'PreToolUse'
  const toolName = String(input.tool_name || '').toLowerCase()
  const toolInput = input.tool_input || {}
  const cwd = String(input.cwd || process.cwd())

  const result = decideQualityGate({ toolName, toolInput, cwd })
  const output = { hookEventName, permissionDecision: result.decision }
  if (result.decision === 'deny') {
    const builder = REASONS[result.reason]
    output.permissionDecisionReason = builder ? builder(result).join('\n') : '🚫 质量五步闭环硬门禁拦截。'
  }
  return { hookSpecificOutput: output }
}

function main() {
  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (c) => (raw += c))
  process.stdin.on('end', () => {
    try {
      process.stdout.write(JSON.stringify(handle(raw)) + '\n')
    } catch (err) {
      process.stderr.write(`[guard-quality-loop error] ${err.message}\n`)
      process.stdout.write(
        JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } }) + '\n',
      )
    }
  })
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) main()
