#!/usr/bin/env node
/**
 * scripts/report-blocker.mjs
 * 合法阻断出口：把「如实卡住」落成结构化、可评审的记录。
 *
 * 合同：docs/contracts/anti-agent-fake-completion-guard.md §3.5 / §4.5
 *      docs/contracts/agent-issue-lifecycle.md §等待、恢复与阻断
 *
 * 为什么需要它：
 *   治理契约要求「将如实暴露阻断定义为合格行为」，但此前全仓只有一行文字，
 *   没有低成本通道。结果 agent 的真实选项只剩「假装完成」与「硬扛到超时」，
 *   所有门禁最终都在惩罚诚实。本脚本提供最小闭环：有证据的阻断 = 合格手交。
 *
 * 边界（刻意保守）：
 *   - 记录不解除任何门禁，不计入 hasEvidenceAfterSpec() 的验证证据；
 *   - 必须带真实失败尝试（exitCode !== 0）或明确 missing，空口「卡住了」不成立；
 *   - 只写 docs/evidence/blockers/<taskId>.json，不写产品路径、不联网。
 *
 * 用法：
 *   node scripts/report-blocker.mjs --task <id> --phase <phase> \
 *     --summary "<卡在哪>" --next "<下一步>" \
 *     --command "<真实命令>" --exit-code <非零> [--stderr <文件>] \
 *     [--missing "<缺失项>"]... [--evidence <仓库相对路径>]...
 *   node scripts/report-blocker.mjs --json <record.json>
 */

import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const PHASES = ['inspect', 'implement', 'verify', 'deliver']
export const BLOCKER_DIR = 'docs/evidence/blockers'
export const SCHEMA_VERSION = 1
export const KIND = 'omnimux-blocker'

const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const MAX_EXCERPT = 4000

/* ------------------------------------------------------------------ 仓库根 */

/** 与 scripts/verify-silent-catch.mjs 相同的根识别口径：向上找名为 omnimux-dsh 的 package.json。 */
export function findRepoRoot(startDir) {
  let cur = resolve(startDir)
  for (let i = 0; i < 8; i++) {
    try {
      const pkg = readFileSync(join(cur, 'package.json'), 'utf8')
      if (pkg.includes('"name": "omnimux-dsh"')) return cur
    } catch {
      // 继续向上；没有 package.json 不是错误。
    }
    const parent = dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return resolve(startDir)
}

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 4000 })
  if (result.error || result.status !== 0) return null
  return String(result.stdout || '').trim()
}

export function resolveCandidate(root) {
  const head = git(root, ['rev-parse', '--verify', 'HEAD'])
  return {
    baseSha: head && SHA.test(head) ? head : null,
    headSha: head && SHA.test(head) ? head : null,
  }
}

/* ------------------------------------------------------------------ 校验 */

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value, min) {
  return typeof value === 'string' && value.trim().length >= min
}

/** 证据必须是仓库内真实存在的普通文件，且不是符号链接。 */
export function inspectEvidencePath(root, rel) {
  if (typeof rel !== 'string' || rel.trim() === '') return '证据路径不能为空'
  if (isAbsolute(rel)) return `证据路径必须是仓库相对路径：${rel}`
  const parts = rel.replace(/\\/g, '/').split('/')
  if (parts.some((part) => part === '..' || part === '.' || part === '')) return `证据路径含非法片段：${rel}`
  const realRoot = realpathSync(root)
  const absolute = resolve(realRoot, rel)
  if (!absolute.startsWith(realRoot + sep)) return `证据路径越出仓库：${rel}`
  let stat
  try {
    stat = lstatSync(absolute)
  } catch {
    return `证据路径不存在：${rel}`
  }
  if (stat.isSymbolicLink()) return `证据路径不得是符号链接：${rel}`
  if (!stat.isFile()) return `证据路径必须是文件：${rel}`
  return null
}

/**
 * 纯函数校验：不读仓库、不写文件。
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateBlocker(record, { root } = {}) {
  const errors = []
  if (!isPlainObject(record)) return { ok: false, errors: ['记录必须是对象'] }
  if (record.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion 必须是 ${SCHEMA_VERSION}`)
  if (record.kind !== KIND) errors.push(`kind 必须是 ${KIND}`)
  if (typeof record.taskId !== 'string' || !TASK_ID.test(record.taskId)) errors.push('taskId 缺失或非法（1-80 位 [A-Za-z0-9_-]，首字符为字母或数字）')
  if (!PHASES.includes(record.phase)) errors.push(`phase 必须是 ${PHASES.join(' / ')} 之一`)
  if (!text(record.summary, 8)) errors.push('summary 缺失或过短（≥8 字）')
  if (!text(record.nextAction, 4)) errors.push('nextAction 缺失或过短（≥4 字）')
  if (typeof record.createdAt !== 'string' || Number.isNaN(Date.parse(record.createdAt))) errors.push('createdAt 必须是 ISO 时间')
  if (!isPlainObject(record.repo)) {
    errors.push('repo 必须是 {baseSha, headSha} 对象')
  } else {
    for (const key of ['baseSha', 'headSha']) {
      const value = record.repo[key]
      if (value !== null && !SHA.test(String(value))) errors.push(`repo.${key} 必须是 40/64 位 hex 或 null`)
    }
  }

  const attempts = Array.isArray(record.attempts) ? record.attempts : []
  if (!Array.isArray(record.attempts)) errors.push('attempts 必须是数组（可为空）')
  attempts.forEach((attempt, index) => {
    const where = `attempts[${index}]`
    if (!isPlainObject(attempt)) return errors.push(`${where} 必须是对象`)
    if (typeof attempt.command !== 'string' || attempt.command.trim() === '') errors.push(`${where}.command 不能为空`)
    if (!Number.isInteger(attempt.exitCode)) errors.push(`${where}.exitCode 必须是整数`)
    if (attempt.stderrExcerpt !== undefined && (typeof attempt.stderrExcerpt !== 'string' || attempt.stderrExcerpt.length > MAX_EXCERPT)) {
      errors.push(`${where}.stderrExcerpt 必须是不超过 ${MAX_EXCERPT} 字符的字符串`)
    }
  })

  const missing = Array.isArray(record.missing) ? record.missing : []
  if (!Array.isArray(record.missing)) errors.push('missing 必须是字符串数组')
  missing.forEach((item, index) => {
    if (!text(item, 2)) errors.push(`missing[${index}] 必须是有意义的字符串`)
  })

  const failures = attempts.filter((attempt) => isPlainObject(attempt) && attempt.exitCode !== 0)
  if (failures.length === 0 && missing.length === 0) {
    errors.push('必须提供至少一条真实失败尝试（exitCode !== 0）或至少一个 missing 项；空口「卡住了」不构成阻断')
  }

  if (!Array.isArray(record.evidence)) {
    errors.push('evidence 必须是字符串数组')
  } else if (root) {
    record.evidence.forEach((rel, index) => {
      const problem = inspectEvidencePath(root, rel)
      if (problem) errors.push(`evidence[${index}]：${problem}`)
    })
  }

  if (record.authorization !== 'not-granted') errors.push('authorization 必须是 not-granted（阻断记录不授予任何授权）')

  return { ok: errors.length === 0, errors }
}

/* ------------------------------------------------------------------ 构造与写入 */

function excerpt(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > MAX_EXCERPT ? `${trimmed.slice(0, MAX_EXCERPT)}\n…（截断）` : trimmed
}

export function buildBlocker(input) {
  const { taskId, phase, summary, nextAction, missing = [], evidence = [], root, now = new Date() } = input
  const attempts = []
  if (input.command && input.command.trim()) {
    const exitCode = Number(input.exitCode)
    attempts.push({
      command: input.command.trim(),
      exitCode: Number.isInteger(exitCode) ? exitCode : NaN,
      ...(input.stderrExcerpt ? { stderrExcerpt: excerpt(input.stderrExcerpt) } : {}),
    })
  }
  const candidate = input.candidate || (root ? resolveCandidate(root) : { baseSha: null, headSha: null })
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: KIND,
    taskId,
    phase,
    summary,
    createdAt: now.toISOString(),
    repo: { baseSha: candidate.baseSha, headSha: candidate.headSha },
    attempts,
    missing: missing.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean),
    evidence: evidence.filter((item) => typeof item === 'string'),
    nextAction,
    authorization: 'not-granted',
  }
}

export function writeBlocker(root, record) {
  const realRoot = realpathSync(root)
  const dir = join(realRoot, BLOCKER_DIR)
  mkdirSync(dir, { recursive: true })
  if (realpathSync(dir) !== dir) throw new Error(`拒绝写入：${BLOCKER_DIR} 必须是仓库内的普通目录（不允许符号链接）`)
  const file = join(dir, `${record.taskId}.json`)
  const rel = relative(realRoot, file).split(sep).join('/')
  if (!rel.startsWith(`${BLOCKER_DIR}/`)) throw new Error('拒绝写入：阻断记录越出证据目录')
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  return { file, rel }
}

/* ------------------------------------------------------------------ CLI */

export function parseArgs(argv = []) {
  const options = { missing: [], evidence: [] }
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]
    const next = () => {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(`${flag} 缺少参数值`)
      index++
      return value
    }
    switch (flag) {
      case '--task': options.task = next(); break
      case '--phase': options.phase = next(); break
      case '--summary': options.summary = next(); break
      case '--next': options.next = next(); break
      case '--command': options.command = next(); break
      case '--exit-code': options.exitCode = Number(next()); break
      case '--stderr': options.stderrFile = next(); break
      case '--missing': options.missing.push(next()); break
      case '--evidence': options.evidence.push(next()); break
      case '--json': options.json = next(); break
      case '--root': options.root = next(); break
      case '--help': options.help = true; break
      default: throw new Error(`未知参数：${flag}`)
    }
  }
  return options
}

function usage() {
  return [
    '用法：node scripts/report-blocker.mjs --task <id> --phase <inspect|implement|verify|deliver>',
    '        --summary "<卡在哪>" --next "<下一步>"',
    '        (--command "<真实命令>" --exit-code <非零> [--stderr <文件>] | --missing "<缺失项>")',
    '        [--evidence <仓库相对路径>]...',
    '      node scripts/report-blocker.mjs --json <record.json>',
  ].join('\n')
}

export function main(argv = process.argv.slice(2), { cwd = process.cwd(), stdout = process.stdout, stderr = process.stderr } = {}) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    stderr.write(`❌ 参数错误：${error.message}\n${usage()}\n`)
    return 2
  }
  if (options.help) {
    stdout.write(`${usage()}\n`)
    return 0
  }

  const root = options.root ? resolve(cwd, options.root) : findRepoRoot(cwd)

  let record
  if (options.json) {
    const file = isAbsolute(options.json) ? options.json : resolve(cwd, options.json)
    try {
      record = JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      stderr.write(`❌ 无法读取阻断记录 JSON：${file}（${error.message}）\n`)
      return 1
    }
  } else {
    let stderrText = ''
    if (options.stderrFile) {
      try {
        stderrText = readFileSync(resolve(cwd, options.stderrFile), 'utf8')
      } catch (error) {
        stderr.write(`❌ 无法读取 --stderr 文件：${error.message}\n`)
        return 1
      }
    }
    record = buildBlocker({
      taskId: options.task,
      phase: options.phase,
      summary: options.summary,
      nextAction: options.next,
      command: options.command,
      exitCode: options.exitCode,
      stderrExcerpt: stderrText,
      missing: options.missing,
      evidence: options.evidence,
      root,
    })
  }

  const validation = validateBlocker(record, { root })
  if (!validation.ok) {
    stderr.write(`❌ 阻断记录不合格（不写入，避免伪造手交）：\n${validation.errors.map((item) => `   · ${item}`).join('\n')}\n`)
    return 2
  }
  if (!isPlainObject(record.repo) || record.repo.headSha === undefined) {
    record.repo = resolveCandidate(root)
  }

  let written
  try {
    written = writeBlocker(root, record)
  } catch (error) {
    stderr.write(`❌ 写入阻断记录失败：${error.message}\n`)
    return 1
  }

  const failed = record.attempts.filter((attempt) => attempt.exitCode !== 0).length
  stdout.write(
    [
      `🛑 阻断记录已写入 ${written.rel}`,
      `   任务 ${record.taskId} ｜ 阶段 ${record.phase} ｜ 失败尝试 ${failed} ｜ 缺失项 ${record.missing.length}`,
      '   提醒：阻断 ≠ 通过。该记录不解除任何门禁，也不计入验证证据（docs/evidence/blockers/ 被 hasEvidenceAfterSpec 排除）。',
      '',
    ].join('\n'),
  )
  return 0
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  process.exitCode = main()
}
