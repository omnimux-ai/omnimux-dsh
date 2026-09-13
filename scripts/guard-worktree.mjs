#!/usr/bin/env node
/**
 * scripts/guard-worktree.mjs
 * dsh-hooks-plugin PreToolUse Guard for OmniMux DSH
 *
 * 全域版本控制守卫 (Universal Version-Control Guard):
 * 严禁在主 checkout 直接对任何已加入 Git 版本管理（Tracked）的文件/文件夹执行 edit/write 操作。
 * 强制所有改动走独立 Worktree 工作区 (./scripts/git-wt.sh) 进行物理隔离，防止主干污染、冲突覆盖与成果丢弃。
 * 同时拦截对未推送提交具有毁灭性覆盖风险的 `git reset --hard` 操作。
 *
 * 豁免清单 (允许在主仓操作):
 *   - 独立 Worktree 目录 (目标路径经 Git 元数据与注册表核实的 linked worktree)
 *   - 临时/衍生目录或文件: node_modules, dist, dist-harness, tmp, temp, coverage, *.log, *.tsbuildinfo, .pnpm-store 等
 *   - 符合 .gitignore 的未跟踪/忽略文件 (git check-ignore)
 *   - 尚未被 git 跟踪的本地临时文件/草稿
 */

import { spawnSync } from 'node:child_process'
import { lstatSync, realpathSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const MAIN_PLUGINS_MARK = `${sep}omnimux-dsh${sep}plugins${sep}`

const EPHEMERAL_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'dist-harness',
  'tmp',
  'temp',
  '.tmp',
  '.cache',
  'coverage',
  '.pnpm-store',
])

const EPHEMERAL_BASENAMES = new Set(['.DS_Store'])
const EPHEMERAL_SUFFIXES = ['.log', '.tsbuildinfo']

const PROTECTED_DIR_PREFIXES = [
  'plugins/',
  'scripts/',
  'docs/',
  'research/',
  '.github/',
  '.agents/',
]

const PROTECTED_ROOT_FILES = new Set([
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'tsconfig.host.json',
  'tsconfig.client.json',
  'AGENTS.md',
  'CLAUDE.md',
  'CONTEXT.md',
  'design.md',
  '.dsh/hooks.json',
])

/** Resolve symlinks before classifying existing files or a new file's parent. */
function canonicalTarget(fullPath) {
  let ancestor = resolve(fullPath)
  const missing = []
  for (;;) {
    try {
      lstatSync(ancestor)
      return resolve(realpathSync(ancestor), ...missing)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      // A dangling symlink must not be mistaken for a missing directory.
      try {
        if (lstatSync(ancestor).isSymbolicLink()) throw new Error('Dangling symlink')
      } catch (statError) {
        if (statError.code !== 'ENOENT') throw statError
      }
      const parent = dirname(ancestor)
      if (parent === ancestor) throw error
      missing.unshift(relative(parent, ancestor))
      ancestor = parent
    }
  }
}

function existingDirectory(fullPath) {
  let current = fullPath
  for (;;) {
    try {
      return lstatSync(current).isDirectory() ? current : dirname(current)
    } catch (error) {
      if (error.code !== 'ENOENT' || dirname(current) === current) throw error
      current = dirname(current)
    }
  }
}

/** Require reciprocal Git metadata and an exact worktree registry entry. */
export function isWorktreePath(fullPath) {
  if (!fullPath) return false
  try {
    const target = canonicalTarget(fullPath)
    const cwd = existingDirectory(target)
    const root = gitRoot(cwd)
    if (!root) return false
    const query = (args) => {
      const result = git(args, cwd)
      if (result.status !== 0 || result.error) throw new Error('Git metadata unavailable')
      return result.stdout.trim()
    }
    const top = realpathSync(root)
    // Git can skip malformed nested .git directories and discover an outer repo.
    for (let parent = cwd; parent !== top; parent = dirname(parent)) {
      if (dirname(parent) === parent) return false
      try {
        lstatSync(resolve(parent, '.git'))
        return false
      } catch (error) {
        if (error.code !== 'ENOENT') return false
      }
    }
    const gitDir = realpathSync(query(['rev-parse', '--absolute-git-dir']))
    const common = realpathSync(query(['rev-parse', '--path-format=absolute', '--git-common-dir']))
    if (gitDir === common || dirname(gitDir) !== resolve(common, 'worktrees')) return false
    const marker = resolve(top, '.git')
    if (!lstatSync(marker).isFile()) return false
    if (realpathSync(readFileSync(resolve(gitDir, 'gitdir'), 'utf8').trim()) !== marker) return false
    const pointer = readFileSync(marker, 'utf8').trim()
    if (!pointer.startsWith('gitdir: ') || realpathSync(resolve(top, pointer.slice(8))) !== gitDir) return false
    const registry = query(['worktree', 'list', '--porcelain', '-z'])
    return registry.split('\0\0').some((record) =>
      record.split('\0').some((field) => field === `worktree ${top}`))
  } catch {
    return false
  }
}

export function isMainRepoPluginPath(fullPath) {
  if (isWorktreePath(fullPath)) return false
  if (fullPath.includes(MAIN_PLUGINS_MARK)) return true
  const normalized = fullPath.replace(/\\/g, '/')
  return normalized.includes('/omnimux-dsh/plugins/') || normalized.startsWith('plugins/') || normalized.includes('/plugins/')
}

export function isEphemeralPath(fullPath) {
  const parts = fullPath.split(/[\\/]/).filter(Boolean)
  if (parts.some((part) => EPHEMERAL_DIR_NAMES.has(part))) return true
  const base = parts[parts.length - 1] || ''
  if (EPHEMERAL_BASENAMES.has(base)) return true
  return EPHEMERAL_SUFFIXES.some((suffix) => base.endsWith(suffix))
}

export function isProtectedScope(fullPath, cwd) {
  const root = gitRoot(cwd) || cwd
  const normalizedFull = String(fullPath || '').replace(/\\/g, '/')
  const normalizedRoot = String(root || '').replace(/\\/g, '/').replace(/\/+$/, '')

  let relative = normalizedFull
  if (normalizedRoot && normalizedFull.startsWith(normalizedRoot + '/')) {
    relative = normalizedFull.slice(normalizedRoot.length + 1)
  } else if (normalizedFull.startsWith('/')) {
    const marker = '/omnimux-dsh/'
    const idx = normalizedFull.lastIndexOf(marker)
    if (idx !== -1) {
      relative = normalizedFull.slice(idx + marker.length)
    }
  }

  // 1. 核心目录前缀匹配
  if (PROTECTED_DIR_PREFIXES.some((prefix) => relative.startsWith(prefix) || relative.includes('/' + prefix))) {
    return true
  }

  // 2. 根目录受保护关键文件
  if (PROTECTED_ROOT_FILES.has(relative) || Array.from(PROTECTED_ROOT_FILES).some((f) => relative.endsWith('/' + f))) {
    return true
  }

  return false
}

function git(args, cwd, preserveEnvironment = false) {
  const env = { ...process.env }
  if (!preserveEnvironment) {
    for (const key of Object.keys(env)) {
      if (key.startsWith('GIT_')) delete env[key]
    }
    // Discovery diagnostics are parsed only in this controlled locale.
    env.LC_ALL = 'C'
    env.LANGUAGE = 'C'
  }
  return spawnSync('git', args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function gitUnavailable(res) {
  return Boolean(res.error) || res.status === 128 || res.status == null
}

function gitRoot(cwd, preserveEnvironment = false) {
  const res = git(['rev-parse', '--show-toplevel'], cwd, preserveEnvironment)
  if (gitUnavailable(res) || res.status !== 0) return ''
  return String(res.stdout || '').trim()
}

export function isGitIgnored(fullPath, cwd) {
  const root = gitRoot(cwd) || cwd
  const res = git(['check-ignore', '-q', '--', fullPath], root)
  if (gitUnavailable(res)) return false
  return res.status === 0
}

/**
 * Confirm failed discovery is not hiding malformed or unreadable metadata.
 * @param {string} cwd Canonical existing target directory.
 * @returns {boolean} Whether every ancestor is free of Git markers.
 */
function hasNoGitMetadata(cwd) {
  for (let parent = cwd; ; parent = dirname(parent)) {
    try {
      lstatSync(resolve(parent, '.git'))
      return false
    } catch (error) {
      if (error.code !== 'ENOENT') return false
    }
    if (dirname(parent) === parent) return true
  }
}

/**
 * Classify Git state without treating a failed read as proof of tracking.
 * @param {string} fullPath Canonical target path.
 * @param {string} cwd Existing target directory.
 * @returns {'non-git-target'|'git-read-error'|'tracked-file'|'untracked-draft'}
 */
function gitFileState(fullPath, cwd) {
  const discovery = git(['rev-parse', '--show-toplevel'], cwd)
  if (discovery.error || discovery.status !== 0) {
    const notRepo = !discovery.error && discovery.status === 128 &&
      !String(discovery.stdout || '').trim() &&
      String(discovery.stderr || '').trim() === 'fatal: not a git repository (or any of the parent directories): .git'
    return notRepo && hasNoGitMetadata(cwd) ? 'non-git-target' : 'git-read-error'
  }
  const root = String(discovery.stdout || '').trim()
  if (!root) return 'git-read-error'
  const res = git(['ls-files', '--error-unmatch', '--', fullPath], root)
  if (res.error || ![0, 1].includes(res.status)) return 'git-read-error'
  return res.status === 0 ? 'tracked-file' : 'untracked-draft'
}

export function isGitTracked(fullPath, cwd) {
  const state = gitFileState(fullPath, cwd)
  // Keep the boolean API conservative for callers that cannot represent errors.
  return state === 'tracked-file' || state === 'git-read-error'
}

function toFullPath(filePath, cwd) {
  if (!filePath) return ''
  return filePath.startsWith('/') || isAbsolute(filePath) ? filePath : resolve(cwd, filePath)
}

export function getUnpushedCommits(cwd) {
  const root = gitRoot(cwd, true) || cwd
  const res = git(['rev-list', 'origin/main..HEAD'], root, true)
  if (gitUnavailable(res) || res.status !== 0) return []
  return String(res.stdout || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

function stripQuotedSpans(command) {
  return String(command)
    .replace(/\\"/g, '')
    .replace(/\\'/g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ')
}

function commandSegments(command) {
  return stripQuotedSpans(command)
    .split(/\s*(?:&&|\|\||;|\n)\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function looksLikeGitInvocation(segment) {
  return /(?:^|\s)git(?:\s|$)/i.test(segment)
}

export function isDestructiveResetCommand(command) {
  if (!command || typeof command !== 'string') return false
  return commandSegments(command).some((seg) => {
    if (!looksLikeGitInvocation(seg)) return false
    if (/\breset\b/i.test(seg) && /(?:^|\s)--hard\b/.test(seg)) return true
    if (/\bcheckout\b/i.test(seg) && /(?:^|\s)-f\b/.test(seg)) return true
    if (/\brestore\b/i.test(seg) && /--source=origin\/(?:main|master)\b/.test(seg)) return true
    if (/\bclean\b/i.test(seg) && /(?:^|\s)-[a-z]*[fx]\b/i.test(seg)) return true
    return false
  })
}

function tokenizeCommandLine(cmd) {
  const tokens = []
  let current = ''
  let inSingle = false
  let inDouble = false
  let escaped = false

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]
    if (escaped) {
      current += ch
      escaped = false
      continue
    }
    if (ch === '\\' && !inSingle) {
      escaped = true
      continue
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      continue
    }
    if (/\s/.test(ch) && !inSingle && !inDouble) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (current) {
    tokens.push(current)
  }
  return tokens
}

export function extractCommandWriteTargets(command) {
  if (!command || typeof command !== 'string') return []
  const targets = []
  const segments = commandSegments(command)

  for (const seg of segments) {
    // 拆分管道符 | (避免管道下游命令如 tee 漏检)，避开 || 逻辑或
    const subSegments = seg.split(/(?<!\|)\|(?!\|)/).map((s) => s.trim()).filter(Boolean)

    for (const sub of subSegments) {
      const cleaned = sub.replace(/^(\s*[a-zA-Z_][a-zA-Z0-9_]*=(?:'[^']*'|"[^"]*"|\S+)\s+)+/, '').trim()
      if (!cleaned) continue

      // 正常 Git 命令完全放行（绝不误杀主目录的合并与同步操作）
      if (looksLikeGitInvocation(cleaned)) {
        continue
      }

      // 提取重定向目标 > 或 >> (避开 2>&1 等描述符重定向)
      const redirectMatches = cleaned.matchAll(/(?:^|[^&>0-9])(?:>>?)\s*(?:"([^"]+)"|'([^']+)'|([^\s;&|<>]+))/g)
      for (const m of redirectMatches) {
        const target = m[1] || m[2] || m[3]
        if (target && target !== '/dev/null') {
          targets.push(target)
        }
      }

      const words = tokenizeCommandLine(cleaned)
      if (words.length === 0) continue

      const verb = words[0].toLowerCase()

      if (['cp', 'mv', 'rsync', 'install'].includes(verb)) {
        let target = null
        for (let i = 1; i < words.length; i++) {
          const arg = words[i]
          if (arg === '-t' || arg === '--target-directory') {
            target = words[i + 1]
            break
          }
          if (arg.startsWith('--target-directory=')) {
            target = arg.slice('--target-directory='.length)
            break
          }
        }
        if (!target) {
          const nonOptions = words.slice(1).filter((w) => !w.startsWith('-'))
          if (nonOptions.length >= 2) {
            target = nonOptions[nonOptions.length - 1]
          }
        }
        if (target) {
          targets.push(target)
        }
      } else if (verb === 'tee') {
        const nonOptions = words.slice(1).filter((w) => !w.startsWith('-'))
        for (const f of nonOptions) {
          targets.push(f)
        }
      } else if (verb === 'sed' && words.some((w) => w === '-i' || w.startsWith('-i'))) {
        const nonOptions = words.slice(1).filter((w) => !w.startsWith('-'))
        if (nonOptions.length >= 1) {
          targets.push(nonOptions[nonOptions.length - 1])
        }
      }
    }
  }

  return targets
}

export function isForbiddenMainCheckoutWriteTarget(targetPath, cwd) {
  if (!targetPath || typeof targetPath !== 'string') return false
  const cleanTarget = targetPath.trim().replace(/^['"]|['"]$/g, '').replace(/\/\*+$/, '')
  if (!cleanTarget) return false
  const fullPath = toFullPath(cleanTarget, cwd)
  if (!fullPath) return false
  if (isWorktreePath(fullPath)) return false
  if (isEphemeralPath(fullPath)) return false
  if (isGitIgnored(fullPath, cwd)) return false
  return isProtectedScope(fullPath, cwd)
}

export function decideBashCommand({ command, cwd }) {
  if (!command || typeof command !== 'string') return { decision: 'allow' }

  // 1. 检查破坏性重置未推送提交
  if (isDestructiveResetCommand(command)) {
    const unpushed = getUnpushedCommits(cwd)
    if (unpushed.length > 0) {
      return {
        decision: 'deny',
        reason: 'unpushed-commits-at-risk',
        unpushedCount: unpushed.length,
        unpushedCommits: unpushed,
      }
    }
    return { decision: 'allow', reason: 'clean-upstream' }
  }

  // 2. 检查试图通过命令行拷贝/写入/移动到主 checkout 受保护目录
  const targets = extractCommandWriteTargets(command)
  for (const target of targets) {
    if (isForbiddenMainCheckoutWriteTarget(target, cwd)) {
      return {
        decision: 'deny',
        reason: 'forbidden-main-checkout-copy',
        target,
      }
    }
  }

  return { decision: 'allow' }
}

export function decideWrite({ filePath, cwd, toolName }) {
  // Normalize toolName to handle namespace e.g. "default_api:edit" -> "edit"
  const rawName = String(toolName || '').toLowerCase()
  const name = rawName.replace(/^.*:/, '')
  if (name !== 'edit' && name !== 'write') return { decision: 'allow' }

  let fullPath = toFullPath(String(filePath || '').trim(), cwd)
  if (!fullPath) return { decision: 'allow' }
  try {
    fullPath = canonicalTarget(fullPath)
    cwd = existingDirectory(fullPath)
  } catch {
    return { decision: 'deny', fullPath, reason: 'unresolved-target' }
  }

  // 1. 独立 Worktree 目录完全豁免放行
  if (isWorktreePath(fullPath)) {
    return { decision: 'allow', fullPath, reason: 'worktree-isolated' }
  }

  // 2. 临时与衍生文件豁免放行 (node_modules, dist, dist-harness, tmp, temp, coverage, *.log, *.tsbuildinfo)
  if (isEphemeralPath(fullPath)) {
    return { decision: 'allow', fullPath, reason: 'ephemeral' }
  }

  // 3. 符合 .gitignore 的被忽略文件豁免放行
  if (isGitIgnored(fullPath, cwd)) {
    return { decision: 'allow', fullPath, reason: 'gitignored' }
  }

  // Classification is not cross-workspace authorization; that remains external.
  const state = gitFileState(fullPath, cwd)
  if (state === 'non-git-target') {
    return { decision: 'allow', fullPath, reason: state }
  }
  if (state === 'tracked-file' || state === 'git-read-error') {
    return { decision: 'deny', fullPath, reason: state }
  }

  // 5. 【新增核心防线：新建未跟踪源码拦截】严禁在主仓核心源码或配置目录下新建任何未跟踪文件！
  if (isProtectedScope(fullPath, cwd)) {
    return { decision: 'deny', fullPath, reason: 'untracked-protected-scope' }
  }

  // 6. 仅允许在主仓创建合法非受保护临时草稿（如 .workbuddy/ 记录、临时排查脚本等）
  return { decision: 'allow', fullPath, reason: 'untracked-draft' }
}

function decisionJson(hookEventName, decision, reason, extra = {}) {
  const output = {
    hookEventName,
    permissionDecision: decision,
  }
  if (decision === 'deny') {
    if (reason === 'unpushed-commits-at-risk') {
      output.permissionDecisionReason = [
        `🚫【DSH 核心安全阻断】拦截破坏性重置：检测到当前本地分支存在尚未推送到远端 origin/main 的提交（共 ${extra.unpushedCount || 0} 个）！`,
        '📌 事故防范守则：执行 git reset --hard 会导致这些未同步的本地工作成果被永久抹去（本会话曾出现同类事故）。',
        '👉 正确流程：',
        '  1. 若成果有效：请切换到工作分支推送远端（git push / 提 PR 合入 main）；',
        '  2. 若确需重置：请先执行备份命令（如 git tag backup/safety-$(date +%s)）后再安全处理。',
      ].join('\n')
    } else if (reason === 'git-read-error') {
      output.permissionDecisionReason = '🚫【OmniMux 仓库 Hook】Git 状态读取失败，无法确认目标的版本管理状态；保守拒绝写入。请检查 Git 可用性、仓库元数据与读取权限，不要绕过门禁。'
    } else if (reason === 'unresolved-target') {
      output.permissionDecisionReason = '🚫【OmniMux 仓库 Hook】目标路径无法安全解析；保守拒绝写入。请检查路径读取权限、符号链接及父目录。'
    } else if (reason === 'forbidden-main-checkout-copy') {
      output.permissionDecisionReason = [
        `🚫【OmniMux 仓库 Hook】严禁通过命令行向主目录核心受保护路径（${extra.target || '目标路径'}）复制、移动或写入文件！`,
        '📌 核心防线原则：主目录仅允许通过 Git 进行常规合并与同步最新代码（如 git pull / git merge），严禁通过 cp/mv/重定向 越过版本管理篡改主干代码。',
        '👉 正确流程：请先调用 bash 运行: ./scripts/git-wt.sh start <plugin> <topic> <issue_id> 在独立 Worktree 中修改并提交，经 PR 合入后再同步到主目录！',
        'ℹ️  豁免范围：独立 Worktree 目录内的操作、临时衍生目录（dist/、node_modules/、tmp/、*.log）与被 gitignore 忽略的文件。',
      ].join('\n')
    } else if (reason === 'untracked-protected-scope') {
      output.permissionDecisionReason = [
        '🚫【OmniMux 仓库 Hook】严禁在主仓库 plugins/、scripts/、docs/ 等核心目录下新建任何源码或配置文件！',
        '📌 核心防线原则：在主目录直接创建未跟踪源码文件会导致主干工作区被污染，并引发构建衍生与多 Agent 冲突覆盖。',
        '👉 正确流程：请先调用 bash 运行: ./scripts/git-wt.sh start <plugin> <topic> <issue_id> 创建并切入独立 Worktree 工作区！',
        'ℹ️  豁免范围：经 Git 元数据与注册表核实的 linked worktree、本地工作台记录 (.workbuddy/)、临时缓存目录 (tmp/、dist/、node_modules/)。',
      ].join('\n')
    } else {
      output.permissionDecisionReason = [
        '🚫【OmniMux 仓库 Hook】严禁在主 checkout 直接修改任何已加入版本管理（Git Tracked）的文件！',
        '📌 核心防线原则：版本管理的文件一旦在主目录被修改，将面临未经审核的脏提交，或者在同步拉取时被覆盖/丢弃。',
        '👉 正确流程：请先调用 bash 运行: ./scripts/git-wt.sh start <plugin> <topic> <issue_id> 创建并切入独立 Worktree 工作区！',
        'ℹ️  豁免范围：独立 Worktree 目录、gitignore 规则文件、临时缓存（node_modules、dist、tmp、*.log）与非受保护草稿文件。',
      ].join('\n')
    }
  }
  return { hookSpecificOutput: output }
}

function handle(rawInput) {
  const input = JSON.parse(rawInput || '{}')
  const hookEventName = input.hook_event_name || 'PreToolUse'
  const rawTool = String(input.tool_name || '').toLowerCase()
  const toolName = rawTool.replace(/^.*:/, '')
  const toolInput = input.tool_input || {}
  const cwd = String(input.cwd || process.cwd())

  if (toolName === 'bash') {
    const command = String(toolInput.command || '').trim()
    const result = decideBashCommand({ command, cwd })
    return decisionJson(hookEventName, result.decision, result.reason, result)
  }

  const filePath = String(toolInput.file_path || '').trim()
  const result = decideWrite({ filePath, cwd, toolName })
  return decisionJson(hookEventName, result.decision, result.reason, result)
}

function main() {
  let rawInput = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    rawInput += chunk
  })
  process.stdin.on('end', () => {
    try {
      process.stdout.write(JSON.stringify(handle(rawInput)) + '\n')
    } catch (err) {
      process.stderr.write(`[guard-worktree error] ${err.message}\n`)
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
          },
        }) + '\n',
      )
    }
  })
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) main()
