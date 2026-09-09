import { join, relative } from 'node:path'
import { BASE_BRANCH, PipelineError, REPO, readJsonText, repoRoot, runCommand, writeEvidence } from './auto-pipeline-runtime.mjs'
import { statusPorcelain } from './auto-pipeline-worktree.mjs'

const STATUS_LABELS = [
  'status:triage', 'status:planning', 'status:ready-to-run', 'status:pipeline-running', 'status:in-progress',
  'status:qa-review', 'status:ready-for-boss', 'status:auto-merge-pending', 'status:auto-merged', 'status:blocked',
]
export function transitionIssue(issueId, target, options, extraAdd = [], extraRemove = []) {
  const remove = STATUS_LABELS.filter(label => label !== target).concat(extraRemove)
  const add = target ? [target, ...extraAdd] : extraAdd
  if (options.dryRun) {
    process.stdout.write(`[dry-run] Issue #${issueId} add=${add.join(',')} remove=${remove.join(',')}\n`)
    return
  }
  const args = ['issue', 'edit', String(issueId), '--repo', REPO]
  for (const label of add) args.push('--add-label', label)
  for (const label of remove) args.push('--remove-label', label)
  const execCommand = options.execCommand || runCommand
  execCommand('gh', args, { cwd: repoRoot })
}
export function commitAndPush(wtDir, plugin, title, issueId, branch, options) {
  if (options.dryRun) {
    process.stdout.write(`· [dry-run] commit/push branch=${branch}\n`)
    return { branch, committed: true }
  }
  if (!statusPorcelain(wtDir)) throw new PipelineError('没有可提交的变更')
  runCommand('git', ['add', '--all'], { cwd: wtDir })
  const staged = runCommand('git', ['diff', '--cached', '--quiet'], { cwd: wtDir, allowFailure: true })
  if (staged.status === 0) throw new PipelineError('git add 后没有 staged 变更')
  const type = /^(feat|fix|refactor|docs|chore)\b/i.exec(title)?.[1]?.toLowerCase() || 'feat'
  const scope = plugin && plugin !== 'common' ? plugin : 'contracts'
  const summary = String(title).replace(/\r?\n/g, ' ').trim().slice(0, 60) || `Issue #${issueId} delivery pipeline`
  runCommand('git', ['commit', '-m', `${type}(${scope}): ${summary} (#${issueId})`], { cwd: wtDir })
  runCommand('git', ['push', '-u', 'origin', branch], { cwd: wtDir })
  const headSha = runCommand('git', ['rev-parse', 'HEAD'], { cwd: wtDir }).stdout.trim()
  return { branch, headSha, committed: true }
}
export function findOrCreatePr(wtDir, branch, plugin, title, issueId, reports, risk, options, evidenceDir) {
  const body = [
    `Closes #${issueId}`, '', '## 变更说明', `- Issue: #${issueId}`, `- branch: \`${branch}\``,
    `- risk-tier: ${risk.tier}`, `- merge channel: ${risk.automaticAllowed && !options.manual ? 'auto only with verified Issue authorization' : 'coordinating Agent under task authorization'}`,
    '', '## 机器证据',
    `- L0 report: \`${relative(wtDir, reports.qa.reportPath).replaceAll('\\', '/')}\``,
    `- Browser required: ${reports.browser.required ? 'yes' : 'no'}`,
    `- Browser evidence: ${reports.browser.required ? `\`${relative(wtDir, evidenceDir).replaceAll('\\', '/')}\`` : 'not applicable to changed surface'}`,
    `- Integration gates: ${reports.integration.length} command(s) completed`, '', '## 合入规则',
    '- `qa:pass` 由 CI 聚合门禁写入；本流水线不自授予。',
    '- R0/R1 由协调 Agent 核对任务授权及实际影响后继续；无人值守合入仅限机器预授权完整的 R2/R3。所有通道保留适用验收与 required checks。',
    '- 未确认 `MERGED` 前不物化、不清理 Worktree。',
  ].join('\n')
  const bodyPath = join(evidenceDir, 'pr-body.md')
  writeEvidence(bodyPath, `${body}\n`)
  if (options.dryRun) {
    process.stdout.write(`· [dry-run] PR body -> ${bodyPath}\n`)
    return { number: null, url: null, bodyPath }
  }
  const existingResult = runCommand('gh', ['pr', 'list', '--repo', REPO, '--head', branch, '--state', 'open', '--json', 'number,url,title'], { cwd: wtDir })
  const list = readJsonText(existingResult.stdout, [])
  const existing = Array.isArray(list) && list.length > 0 ? list[0] : null
  if (existing) return { ...existing, bodyPath, reused: true }
  const created = runCommand('gh', ['pr', 'create', '--repo', REPO, '--base', BASE_BRANCH, '--head', branch, '--title', `${title} (#${issueId})`, '--body-file', bodyPath], { cwd: wtDir })
  const url = /(https?:\/\/[^\s]+\/pull\/\d+)/.exec(created.stdout)?.[1]
  if (!url) throw new PipelineError('gh pr create 未返回可解析 PR URL')
  const viewed = runCommand('gh', ['pr', 'view', url, '--repo', REPO, '--json', 'number,url,title'], { cwd: wtDir })
  const pr = readJsonText(viewed.stdout, null)
  if (!pr?.number) throw new PipelineError('无法读取新建 PR number')
  return { ...pr, bodyPath, reused: false }
}
export function labelPr(prNumber, risk, options) {
  if (options.dryRun || !prNumber) return
  const args = ['pr', 'edit', String(prNumber), '--repo', REPO]
  for (const label of ['status:qa-review', `risk:${risk.tier}`]) args.push('--add-label', label)
  runCommand('gh', args, { cwd: repoRoot })
}
function checkRollup(rollup) {
  const entries = Array.isArray(rollup) ? rollup : []
  const states = entries.map(entry => String(entry.conclusion || entry.state || entry.status || '').toUpperCase())
  const failures = states.filter(state => ['FAILURE', 'FAILED', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(state))
  const pending = states.filter(state => ['PENDING', 'QUEUED', 'IN_PROGRESS', 'REQUESTED', 'WAITING', ''].includes(state))
  return { hasChecks: entries.length > 0, pass: entries.length > 0 && failures.length === 0 && pending.length === 0, pending: pending.length > 0, failures }
}
function queryPr(prNumber, options) {
  if (options.dryRun) return { state: 'OPEN', statusCheckRollup: [{ conclusion: 'SUCCESS' }] }
  const result = runCommand('gh', ['pr', 'view', String(prNumber), '--repo', REPO, '--json', 'number,url,state,mergedAt,mergeCommit,statusCheckRollup,headRefName,baseRefName'], { cwd: repoRoot })
  return readJsonText(result.stdout, null)
}
export async function waitForCi(prNumber, options) {
  if (options.dryRun) return { pass: true, checks: { hasChecks: true, pass: true, pending: false, failures: [] } }
  const deadline = Date.now() + options.waitSeconds * 1000
  let last = null
  while (Date.now() <= deadline) {
    last = queryPr(prNumber, options)
    const checks = checkRollup(last?.statusCheckRollup)
    if (checks.pass) return { pass: true, checks }
    if (checks.failures.length > 0) throw new PipelineError(`PR required checks 失败: ${checks.failures.join(', ')}`, { checks })
    if (!checks.hasChecks && Date.now() + 15000 > deadline) break
    await new Promise(resolvePromise => setTimeout(resolvePromise, 15000))
  }
  throw new PipelineError('等待 CI required checks 超时或没有任何 check', { last })
}
export async function requestAndConfirmMerge(prNumber, options) {
  if (options.noMerge) throw new PipelineError('已通过 --no-merge 禁止合入；保留 PR，由协调 Agent 在指定范围内收尾')
  if (options.dryRun) return { state: 'MERGED', mergedAt: 'dry-run', mergeCommit: { oid: 'dry-run' } }
  runCommand('gh', ['pr', 'merge', String(prNumber), '--repo', REPO, '--squash', '--auto', '--delete-branch'], { cwd: repoRoot })
  const deadline = Date.now() + options.waitSeconds * 1000
  let last = null
  while (Date.now() <= deadline) {
    last = queryPr(prNumber, options)
    if (String(last?.state).toUpperCase() === 'MERGED' && last.mergedAt && last.mergeCommit?.oid) return last
    if (String(last?.state).toUpperCase() === 'CLOSED') throw new PipelineError('PR 已关闭但未确认 MERGED', { last })
    await new Promise(resolvePromise => setTimeout(resolvePromise, 10000))
  }
  throw new PipelineError('已请求 auto-merge，但在超时时间内没有确认 MERGED', { last })
}
