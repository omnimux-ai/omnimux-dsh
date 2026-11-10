#!/usr/bin/env node
/**
 * scripts/sag-worktree.mjs — 单个 Git 工作树的隔离 SAG 知识库（Issue #4068）。
 *
 * 为什么需要它：本仓开发都在 `.worktrees/<task>` 里，而 SAG 以仓库根为根扫描时
 * 会硬跳过点开头目录、注册父根还会吸收子目录（见 #4060 的实测记录），所以工作树
 * 不能并进共享知识库，必须各自持有一份隔离索引。
 *
 * 为什么收进仓库：此前这套逻辑只存在于开发机的家目录脚本里，它把数据目录**只按
 * 工作树文件夹名**命名 —— 两个仓的同名任务会共用一份索引：后 init 的覆盖归属记录、
 * 先 remove 的删掉别人的索引。这里改为「文件夹名 + 工作树绝对路径哈希」，并把归属
 * 与回收边界写进记录。
 *
 * 边界：缺 `sag` 时只报告 blocked，不写任何记录；所有失败只影响索引，不影响工作树
 * 交付。凭据只从既有 SAG 配置经 stdin 传入，不打印、不落进本仓。
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 与入库 `.sagignore` 托管块保持一致的扩展名白名单。 */
export const DEFAULT_TYPES = ['css', 'go', 'html', 'js', 'json', 'jsx', 'md', 'mjs', 'sql', 'ts', 'tsx', 'yaml', 'yml']

export const RECORD_PATH = 'worktree.path'
export const RECORD_REPO = 'repo.root'

/** 隔离知识库的根目录；`SAG_WT_HOME` 用于测试或换盘。 */
export function dataRoot(env = process.env) {
  const override = (env.SAG_WT_HOME || '').trim()
  if (override) return resolve(override)
  return join(homedir(), 'Library', 'Application Support', 'com.sag.desktop', 'worktrees')
}

/**
 * 工作树路径的规范形式。目录存在时直接 realpath；目录已被删除时（`worktree.sh` 是
 * 先删目录再清理索引）退化到「realpath 父目录 + basename」——否则 `/tmp` 与
 * `/private/tmp` 这类软链会算出不同哈希，索引永远删不掉（评审 F1）。
 */
export function canonicalPath(input) {
  if (typeof input !== 'string' || input === '') return null
  try { return realpathSync(input) } catch { /* 目录已不存在，走父目录归一 */ }
  const absolute = resolve(input)
  try {
    return join(realpathSync(dirname(absolute)), basename(absolute))
  } catch {
    return absolute
  }
}

/** 数据目录名 = 文件夹名 + 绝对路径哈希前 8 位，不同仓的同名工作树不会撞车。 */
export function dataDirName(worktreePath) {
  const canonical = canonicalPath(worktreePath)
  const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 8)
  return `${basename(canonical)}-${hash}`
}

/** 由 `--git-common-dir` 推出主检出根：链接工作树的 `show-toplevel` 只指向它自己。 */
export function repoRootFromCommonDir(commonDir) {
  if (!commonDir) return null
  const absolute = resolve(commonDir)
  if (basename(absolute) !== '.git') return null
  return resolve(absolute, '..')
}

export function dataDir(worktreePath, env = process.env) {
  return join(dataRoot(env), dataDirName(worktreePath))
}

/**
 * 归属判定：`match` 可以删，`mismatch` 必须跳过（目录里是别人的索引），
 * `unrecorded` 是没有归属记录的目录（旧版工具或上个版本留下的），一并跳过。
 */
export function ownershipVerdict({ recorded, requested }) {
  if (!recorded) return 'unrecorded'
  return recorded === requested ? 'match' : 'mismatch'
}

/**
 * 孤儿回收判定。只删「记录路径确实不存在、且记录里的仓根就是当前仓」的目录：
 * 跨仓不删（别的仓的工作树不归这里管），卷未挂载时路径也不存在，靠仓根挡住误删。
 */
export function orphanDecision({ recordedPath, recordedRepo, currentRepo, pathExists }) {
  if (!recordedPath) return 'keep'
  if (pathExists) return 'keep'
  if (!recordedRepo || !currentRepo || recordedRepo !== currentRepo) return 'keep'
  return 'remove'
}

export function readRecord(dir) {
  const read = (name) => {
    try { return readFileSync(join(dir, name), 'utf8').trim() || null } catch { return null }
  }
  return { path: read(RECORD_PATH), repo: read(RECORD_REPO) }
}

export function writeRecord(dir, worktreePath, repoRoot) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, RECORD_PATH), `${canonicalPath(worktreePath)}\n`)
  writeFileSync(join(dir, RECORD_REPO), `${canonicalPath(repoRoot)}\n`)
}

/** 把 `sag --types` 的逗号列表解析成去重有序数组，供测试与 CLI 共用。 */
export function parseTypes(spec) {
  const list = String(spec || '').split(',').map((item) => item.trim().replace(/^\./, '').toLowerCase()).filter(Boolean)
  return list.length ? [...new Set(list)].sort() : [...DEFAULT_TYPES]
}

/** 组装 `init` 需要的 JEV 配置：只读既有配置，不打印密钥。 */
export function configArgs({ url, model }) {
  if (!url || !model) throw new Error('cannot read Jev url/model from the primary SAG config')
  return ['config', '--url', url, '--model', model, '--key-stdin']
}

function run(bin, args, { env = {}, input } = {}) {
  return spawnSync(bin, args, { encoding: 'utf8', env: { ...process.env, ...env }, input })
}

function gitDir(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}

function repoRootOf(worktreePath) {
  const root = repoRootFromCommonDir(gitDir(['-C', worktreePath, 'rev-parse', '--path-format=absolute', '--git-common-dir']))
  return root ? canonicalPath(root) : null
}

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

function requireSag() {
  const probe = run('sag', ['--version'])
  if (probe.error || probe.status !== 0) {
    fail('blocked: sag CLI is not installed; isolated indexing needs it. Install with: npm install -g @zleap-ai/sag', 3)
  }
}

function primaryDataRoot() {
  const override = (process.env.SAG_DATA_DIR || '').trim()
  return override || join(homedir(), 'Library', 'Application Support', 'com.sag.desktop')
}

function ensureJevConfig(dir) {
  const read = run('sag', ['config'])
  let url = ''
  let model = ''
  try {
    const parsed = JSON.parse(read.stdout || '{}')
    url = String(parsed.url || '')
    model = String(parsed.model || '')
  } catch { /* 交给 configArgs 报错，不吞掉原因 */ }
  let key = ''
  try { key = String(JSON.parse(readFileSync(join(primaryDataRoot(), 'credentials.json'), 'utf8')).jev || '') } catch { /* 无 key 时按无鉴权处理 */ }
  const args = configArgs({ url, model })
  const configured = run('sag', args, { env: { SAG_DATA_DIR: dir }, input: key })
  if (configured.status !== 0) throw new Error(`cannot configure isolated SAG data dir (${configured.stderr || configured.stdout || 'no output'})`)
}

function init(worktreePath, env = process.env) {
  const wt = canonicalPath(worktreePath)
  if (!existsSync(wt)) fail(`init failed: worktree not found: ${wt}`, 2)
  const repoRoot = repoRootOf(wt)
  if (!repoRoot) fail(`init failed: not inside a git worktree: ${wt}`, 2)
  const dir = dataDir(wt, env)
  const verdict = ownershipVerdict({ recorded: readRecord(dir).path, requested: wt })
  if (verdict === 'mismatch') {
    fail(`refuse: ${basename(dir)} already belongs to ${readRecord(dir).path}`, 2)
  }
  if (verdict === 'unrecorded' && existsSync(dir) && readdirSync(dir).length > 0) {
    fail(`refuse: ${basename(dir)} exists without ownership record; remove it manually if it is stale`, 2)
  }
  requireSag()
  // 先确保配置可用再落归属记录：配置失败留下半套记录，会让下次 init 报「归属不符」，
  // 用户只能手工删目录（评审 F2）。
  try {
    ensureJevConfig(dir)
  } catch (error) {
    // 配置失败时 sag 可能已经建了数据目录，留下「有数据无记录」会让下次 init 报归属
    // 不符、只能手删。只回收本次新建的目录；`match` 说明这是已有合法索引，失败时
    // 绝不能连它一起删掉（评审第二轮 finding 2）。
    if (verdict !== 'match') rmSync(dir, { recursive: true, force: true })
    throw error
  }
  writeRecord(dir, wt, repoRoot)
  const localIgnore = join(wt, '.sagignore')
  if (!existsSync(localIgnore) && existsSync(join(repoRoot, '.sagignore'))) {
    copyFileSync(join(repoRoot, '.sagignore'), localIgnore)
  }
  const types = parseTypes(env.SAG_WT_TYPES).join(',')
  const added = run('sag', ['add', wt, '--types', types, '--json'], { env: { SAG_DATA_DIR: dir } })
  if (added.status === 0) {
    process.stdout.write(`SAG index ready: ${wt}\n`)
    return
  }
  // SAG 对首次大目录会返回「请求超时，已取消本次请求」，但索引仍在后台继续建；
  // 只要 check 认这个目录（coverage included / status indexing），就不是失败。
  const probe = run('sag', ['check', wt, '--json'], { env: { SAG_DATA_DIR: dir } })
  let parsed = null
  try { parsed = JSON.parse(probe.stdout || '{}') } catch { parsed = null }
  if (parsed && parsed.coverage === 'included') {
    process.stdout.write(`SAG index accepted, still building: ${wt} (indexed_files=${parsed.indexed_files ?? 0}); re-run status to confirm\n`)
    return
  }
  fail(`init failed: sag add rejected (${added.stderr || added.stdout || 'no output'})`)
}

function status(worktreePath, env = process.env) {
  const wt = canonicalPath(worktreePath)
  const dir = dataDir(wt, env)
  const record = readRecord(dir)
  const verdict = ownershipVerdict({ recorded: record.path, requested: wt })
  if (verdict !== 'match') {
    process.stdout.write(`${JSON.stringify({ worktree: wt, index_ready: false, ownership: verdict, hint: `node scripts/sag-worktree.mjs init ${wt}` })}\n`)
    process.exit(1)
  }
  const checked = run('sag', ['check', wt, '--json'], { env: { SAG_DATA_DIR: dir } })
  if (checked.status !== 0) fail(`status failed: sag check rejected (${checked.stderr || checked.stdout || 'no output'})`)
  const parsed = JSON.parse(checked.stdout || '{}')
  process.stdout.write(`${JSON.stringify({ worktree: wt, ownership: verdict, index_ready: Boolean(parsed.index_ready), indexed_files: parsed.indexed_files ?? 0, extensions: parsed.extensions ?? [] })}\n`)
  if (!parsed.index_ready) process.exit(1)
}

function search(argv, env = process.env) {
  const [worktreePath, ...rest] = argv
  if (!worktreePath || rest.length === 0) fail('usage: sag-worktree search <worktree> <question> [-m N]', 2)
  const wt = canonicalPath(worktreePath)
  const dir = dataDir(wt, env)
  if (ownershipVerdict({ recorded: readRecord(dir).path, requested: wt }) !== 'match') init(wt, env)
  const checked = run('sag', ['check', wt, '--json'], { env: { SAG_DATA_DIR: dir } })
  let ready = false
  try { ready = Boolean(JSON.parse(checked.stdout || '{}').index_ready) } catch { ready = false }
  if (!ready) init(wt, env)
  const result = spawnSync('sag', [...rest, wt], { encoding: 'utf8', env: { ...process.env, SAG_DATA_DIR: dir }, stdio: 'inherit' })
  process.exit(result.status ?? 0)
}

function list(env = process.env) {
  const root = dataRoot(env)
  const rows = []
  if (existsSync(root)) {
    for (const name of readdirSync(root).sort()) {
      const dir = join(root, name)
      const record = readRecord(dir)
      const state = !record.path ? 'unrecorded' : existsSync(record.path) ? 'indexed' : 'orphan'
      rows.push({ name, state, worktree: record.path, repo: record.repo })
    }
  }
  process.stdout.write(`${JSON.stringify(rows)}\n`)
}

function remove(worktreePath, env = process.env) {
  const wt = canonicalPath(worktreePath)
  const dir = dataDir(wt, env)
  const record = readRecord(dir)
  const verdict = ownershipVerdict({ recorded: record.path, requested: wt })
  if (verdict !== 'match') {
    // 退出码 2 = 跳过而不是失败：调用方据此播报「跳过清理」，不能报成功。
    process.stderr.write(`skip: ${basename(dir)} is ${verdict} for ${wt}\n`)
    process.exit(2)
  }
  run('sag', ['remove', wt, '--json'], { env: { SAG_DATA_DIR: dir } })
  run('sag', ['service', 'stop'], { env: { SAG_DATA_DIR: dir } })
  rmSync(dir, { recursive: true, force: true })
  if (existsSync(join(wt, '.sagignore'))) {
    const tracked = spawnSync('git', ['-C', wt, 'ls-files', '--error-unmatch', '.sagignore'], { encoding: 'utf8' })
    // 入库的 .sagignore 是项目的检索契约，删掉就变成删除已跟踪文件。
    if (tracked.status !== 0) rmSync(join(wt, '.sagignore'), { force: true })
  }
  process.stdout.write(`removed SAG data for ${wt}\n`)
}

function gc(env = process.env) {
  const root = dataRoot(env)
  const currentRepo = (() => { const root = repoRootFromCommonDir(gitDir(['rev-parse', '--path-format=absolute', '--git-common-dir'])); return root ? canonicalPath(root) : null })()
  if (!existsSync(root)) {
    process.stdout.write(`${JSON.stringify({ removed: [], kept: 0, repo: currentRepo })}\n`)
    return
  }
  const removed = []
  let kept = 0
  for (const name of readdirSync(root)) {
    const dir = join(root, name)
    const record = readRecord(dir)
    const decision = orphanDecision({
      recordedPath: record.path,
      recordedRepo: record.repo,
      currentRepo,
      pathExists: record.path ? existsSync(record.path) : false,
    })
    if (decision !== 'remove') { kept += 1; continue }
    run('sag', ['service', 'stop'], { env: { SAG_DATA_DIR: dir } })
    rmSync(dir, { recursive: true, force: true })
    removed.push(name)
  }
  process.stdout.write(`${JSON.stringify({ removed, kept, repo: currentRepo })}\n`)
}

const USAGE = `Isolated SAG knowledge base for one git worktree.

Usage:
  node scripts/sag-worktree.mjs init   <worktree>
  node scripts/sag-worktree.mjs status <worktree>
  node scripts/sag-worktree.mjs search <worktree> "<question>" [-m N]
  node scripts/sag-worktree.mjs list
  node scripts/sag-worktree.mjs remove <worktree>
  node scripts/sag-worktree.mjs gc

Env:
  SAG_WT_HOME    isolated data root (default: <SAG desktop>/worktrees)
  SAG_WT_TYPES   extension allowlist (default: ${DEFAULT_TYPES.join(',')})
`

function requireWorktree(value, usage) {
  if (typeof value !== 'string' || value === '') fail(`usage: ${usage}`, 2)
  return value
}

function main(argv) {
  const [command, ...rest] = argv
  switch (command) {
    case 'init': return init(requireWorktree(rest[0], 'sag-worktree init <worktree>'))
    case 'status': return status(requireWorktree(rest[0], 'sag-worktree status <worktree>'))
    case 'search': return search(rest)
    case 'list': return list()
    case 'remove': return remove(requireWorktree(rest[0], 'sag-worktree remove <worktree>'))
    case 'gc': return gc()
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      process.stdout.write(USAGE)
      return
    default:
      fail(`unknown command: ${command}\n\n${USAGE}`, 2)
  }
}

if (process.argv[1] && canonicalPath(process.argv[1]) === canonicalPath(fileURLToPath(import.meta.url))) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    // 未预期异常也要一行可读的报错，不要把原始堆栈糊到交付日志里。
    process.stderr.write(`failed: ${error?.message ?? error}\n`)
    process.exit(1)
  }
}
