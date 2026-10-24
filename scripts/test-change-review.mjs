#!/usr/bin/env node
/** Fixed-commit evaluation inventory, never an independent-review or publication authorization. */
import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const hash = value => createHash('sha256').update(value).digest('hex')
const safePath = path => typeof path === 'string' && path.length > 0 && path.isWellFormed() && !path.startsWith('/') && !path.includes('\\') && !path.includes('\0') && !path.split('/').some(part => !part || part === '..' || part === '.')
export function isEvaluationPath(path) {
  return /(?:^|\/)(?:tests?|__tests__|e2e|fixtures?|test-fixtures|test-support|__snapshots__)(?:\/|\.[^/]+$)|\.(?:test|spec)\.[^/]+$|(?:^|\/)(?:vitest|jest|playwright|cypress)\.config\.[^/]+$/.test(path)
    || /(?:^|\/)package\.json$/.test(path) || path.startsWith('scripts/') || path.startsWith('.github/workflows/')
    || ['.dsh/hooks.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(path)
}

/** All changes in the bounded evaluation domain require inspection; no semantic safety inference. */
export function analyzeTestChanges({ root, baseCommit, comparisonBase, candidate, changes }) {
  if (![root, baseCommit, comparisonBase, candidate].every(value => typeof value === 'string' && value.length)) throw new Error('missing-candidate-identity')
  if (!Array.isArray(changes)) throw new Error('missing-change-set')
  const files = []
  const risks = []
  const seen = new Set()
  for (const change of changes) {
    if (!change || !/^(?:A|M|D|T|[RC](?:100|[1-9]?\d))$/.test(change.status || '')) throw new Error('unsupported-change-status')
    const oldPath = change.oldPath || change.path
    if (!safePath(change.path) || !safePath(oldPath)) throw new Error('unsupported-change-path')
    if (!isEvaluationPath(change.path) && !isEvaluationPath(oldPath)) continue
    if (seen.has(change.path)) throw new Error('duplicate-change-path')
    seen.add(change.path)
    const before = change.before ?? null
    const after = change.after ?? null
    const validBytes = value => Buffer.isBuffer(value) || typeof value === 'string'
    if (before !== null && !validBytes(before) || after !== null && !validBytes(after)) throw new Error('invalid-blob')
    if ((change.status === 'A') !== (before === null) || (change.status === 'D') !== (after === null)) throw new Error('inconsistent-blob-status')
    for (const [bytes, mode] of [[before, change.beforeMode], [after, change.afterMode]]) {
      if (bytes !== null && !['100644', '100755', '120000'].includes(mode)) throw new Error('unsupported-blob-mode')
      if (bytes === null && mode != null) throw new Error('mode-without-blob')
    }
    const file = { path: change.path, oldPath, status: change.status,
      before: before === null ? null : hash(before), after: after === null ? null : hash(after),
      beforeMode: change.beforeMode ?? null, afterMode: change.afterMode ?? null }
    files.push(file)
    const identical = file.before === file.after
    if (identical && file.beforeMode === file.afterMode && oldPath === change.path) continue
    const kind = after === null ? 'evaluation-deleted' : before === null ? 'evaluation-added'
      : identical ? 'evaluation-location-or-mode-changed' : 'existing-evaluation-changed'
    risks.push({ id: hash(JSON.stringify({ file, kind })), kind, path: file.path, oldPath,
      reason: '需要独立检查实际差异及执行范围；库存不证明测试语义或批准来源。' })
  }
  files.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)))
  risks.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const report = { schemaVersion: 1, identity: { root, baseCommit, comparisonBase, candidate },
    coverage: 'bounded path-based evaluation inventory, not full dependency coverage or review authorization', files, risks }
  return { ...report, reportDigest: hash(JSON.stringify(report)) }
}

function git(root, args, encoding = 'utf8') {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
  return execFileSync('git', ['--no-optional-locks', '--literal-pathspecs', '-C', root, ...args], { encoding, env: { ...env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 16 * 1024 * 1024, timeout: 10000 })
}
function nulFields(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  if (text && !text.endsWith('\0')) throw new Error('truncated-git-path-list')
  return text.split('\0')
}
/**
 * 固定提交身份下的评估域变更，含前后 blob 原文。
 * 扫描前后各校验一次候选身份；`readFixedTestChanges` 与 CI 侧声明校验共用本函数，
 * 避免两处各写一套 merge-base / diff / blob 读取。
 *
 * `requireClean` 默认 true（`scan` 的既有契约：候选检出必须干净）。声明校验只需已提交
 * 范围，工作区是否脏不影响结论，因此可显式关闭——HEAD 身份仍会被前后各校验一次。
 */
export function readEvaluationChanges(root, base = 'origin/main', { requireClean = true, includePath = null } = {}) {
  root = realpathSync(root)
  if (realpathSync(git(root, ['rev-parse', '--show-toplevel']).trim()) !== root) throw new Error('not-repository-root')
  const clean = () => !git(root, ['status', '--porcelain', '-z', '--untracked-files=all'])
  if (requireClean && !clean()) throw new Error('candidate-has-uncommitted-changes')
  const resolveCommit = ref => git(root, ['rev-parse', '--verify', `${ref}^{commit}`]).trim()
  const candidate = resolveCommit('HEAD')
  const baseCommit = resolveCommit(base)
  const bases = git(root, ['merge-base', '--all', baseCommit, candidate]).trim().split('\n')
  if (bases.length !== 1 || !bases[0]) throw new Error('ambiguous-comparison-base')
  const comparisonBase = bases[0]
  const fields = nulFields(git(root, ['diff', '--name-status', '-z', '--find-renames', comparisonBase, candidate], null))
  const blob = (sha, path) => git(root, ['show', `${sha}:${path}`], null)
  const mode = (sha, path) => {
    const entries = nulFields(git(root, ['ls-tree', '-z', sha, '--', path], null)).filter(Boolean)
    if (entries.length !== 1) throw new Error('missing-or-ambiguous-tree-entry')
    return entries[0].split(' ', 1)[0]
  }
  const changes = []
  for (let i = 0; i < fields.length && fields[i];) {
    const status = fields[i++]
    const oldPath = fields[i++]
    const path = /^[RC]/.test(status) ? fields[i++] : oldPath
    if (!path || !oldPath) throw new Error('truncated-change-list')
    // 默认只收评估域；`includePath` 供调用方按同一份提交范围额外收拢路径
    // （声明校验需要 `specs/*.md`，而它不在评估域内）。
    const wanted = value => isEvaluationPath(value) || (typeof includePath === 'function' && includePath(value))
    if (!wanted(path) && !wanted(oldPath)) continue
    changes.push({ status, path, oldPath,
      before: status === 'A' ? null : blob(comparisonBase, oldPath), after: status === 'D' ? null : blob(candidate, path),
      beforeMode: status === 'A' ? null : mode(comparisonBase, oldPath), afterMode: status === 'D' ? null : mode(candidate, path) })
  }
  if (resolveCommit('HEAD') !== candidate || (requireClean && !clean())) throw new Error('candidate-changed-during-scan')
  return { root, baseCommit, comparisonBase, candidate, changes }
}

export function readFixedTestChanges(root, base = 'origin/main') {
  return analyzeTestChanges(readEvaluationChanges(root, base))
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [action, rootArg, base = 'origin/main', ...extra] = process.argv.slice(2)
    if (action !== 'scan' || extra.length) throw new Error('usage: test-change-review.mjs scan <repository-root> [base]')
    const root = realpathSync(rootArg || process.cwd())
    const report = readFixedTestChanges(root, base)
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
