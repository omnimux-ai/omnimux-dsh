import { resolve } from 'node:path'
import { labelNames, normalizeTier, parseFrontmatter } from './authorization.mjs'
import { PipelineError, REPO, repoRoot, runCommand } from './auto-pipeline-runtime.mjs'

const HIGH_RISK_PATHS = [
  /^AGENTS\.md$/, /^CLAUDE\.md$/, /^docs\/contracts\//, /^\.github\//, /^scripts\//,
  /^package\.json$/, /^pnpm-lock\.yaml$/, /(?:^|\/)dsh\.manifest\.json$/, /(?:^|\/)cordis\.patch\.ya?ml$/,
]
export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    issueId: '', plugin: '', topic: '', dryRun: false, manual: false, forceRetry: false, allowExistingChanges: false,
    implementationCommand: process.env.OMNIMUX_IMPLEMENT_COMMAND || '',
    evidenceDir: '',
    waitSeconds: Number(process.env.OMNIMUX_PIPELINE_WAIT_SECONDS || 600), noMerge: false, materialize: true, worktree: '',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      if (!argv[index + 1] || argv[index + 1].startsWith('-')) throw new PipelineError(`参数 ${arg} 需要一个值`)
      index += 1
      return argv[index]
    }
    if (arg === '--plugin') options.plugin = next()
    else if (arg === '--topic') options.topic = next()
    else if (arg === '--implementation-command' || arg === '--implement-command') options.implementationCommand = next()
    else if (arg === '--evidence-dir') options.evidenceDir = resolve(next())
    else if (arg === '--wait-seconds') options.waitSeconds = Number(next())
    else if (arg === '--worktree') options.worktree = resolve(next())
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--manual') options.manual = true
    else if (arg === '--force-retry') options.forceRetry = true
    else if (arg === '--allow-existing-changes') options.allowExistingChanges = true
    else if (arg === '--no-merge') options.noMerge = true
    else if (arg === '--no-materialize') options.materialize = false
    else if (!arg.startsWith('-') && !options.issueId) options.issueId = arg.replace(/^#/, '')
    else throw new PipelineError(`未知参数: ${arg}`)
  }
  if (!options.issueId) throw new PipelineError('必须指定 Issue 编号')
  if (!/^\d+$/.test(options.issueId)) throw new PipelineError(`Issue 编号无效: ${options.issueId}`)
  if (!Number.isFinite(options.waitSeconds) || options.waitSeconds < 0) throw new PipelineError('--wait-seconds 必须是非负数字')
  return options
}
/** Manual means an accountable coordinating Agent, not an additional user approval. */
export function resolveDeliveryChannel(risk, authorization, options = {}) {
  if (options.manual) return 'agent'
  if (risk.automaticAllowed && authorization.eligible) return 'auto'
  throw new PipelineError(`机器预授权不足，未执行远端写入；由已获任务授权的协调 Agent 使用 --manual 接管: ${authorization.reasons.join('；')}`)
}

export function maintainersFor(repo = REPO) {
  const configured = String(process.env.OMNIMUX_PIPELINE_MAINTAINERS || '').split(',').map(value => value.trim()).filter(Boolean)
  if (configured.length > 0) return new Set(configured)
  const owner = repo.split('/')[0]
  return owner ? new Set([owner]) : new Set()
}
export function classifyRisk(issue, changedFiles = []) {
  const frontmatter = parseFrontmatter(issue?.body || '')
  const labels = labelNames(issue || {})
  const declared = normalizeTier(frontmatter['risk-tier'] || frontmatter.riskTier || [...labels].find(label => label.startsWith('risk:')))
  const reasons = []
  let tier = declared || 'R2'
  if (declared === 'R0') reasons.push('Issue 声明为 R0')
  if (declared === 'R1') reasons.push('Issue 声明为 R1')
  if (changedFiles.some(file => HIGH_RISK_PATHS.some(pattern => pattern.test(file)))) {
    if (tier !== 'R0') tier = 'R1'
    reasons.push('变更命中合同/CI/脚本/manifest 等 R1 路径')
  }
  const pluginPaths = new Set(changedFiles.map(file => /^plugins\/([^/]+)\//.exec(file)?.[1]).filter(Boolean))
  if (pluginPaths.size > 1) {
    if (tier !== 'R0') tier = 'R1'
    reasons.push(`跨插件变更（${[...pluginPaths].join(', ')}）`)
  }
  if (changedFiles.some(file => /(?:^|\/)production|rollback|credentials?|secret|token/i.test(file))) {
    tier = 'R0'
    reasons.push('变更命中生产/回滚/凭据边界')
  }
  if (!['R0', 'R1', 'R2', 'R3'].includes(tier)) {
    tier = 'R1'
    reasons.push('无法解析风险等级，按高风险处理')
  }
  return { tier, reasons, automaticAllowed: tier === 'R2' || tier === 'R3' }
}
export function fetchIssue(issueId, options = {}) {
  if (options.dryRun) return {
    number: Number(issueId), title: `Dry-run implementation for #${issueId}`,
    body: '---\nrisk-tier: R2\npre-authorized: true\n---\n',
    labels: [{ name: 'status:ready-to-run' }, { name: 'risk:R2' }],
    comments: [{ author: { login: 'dry-run' }, body: '/auto-approve risk:R2' }], state: 'OPEN', synthetic: true,
  }
  const result = runCommand('gh', [
    'issue', 'view', String(issueId), '--repo', REPO, '--json', 'number,title,labels,body,comments,state,url,author',
  ], { cwd: repoRoot })
  const issue = JSON.parse(result.stdout)
  if (!issue || typeof issue !== 'object') throw new PipelineError('gh 返回的 Issue JSON 无效')
  if (String(issue.state || '').toUpperCase() !== 'OPEN') throw new PipelineError(`Issue #${issueId} 不是 OPEN 状态`)
  return issue
}
export function inferPlugin(issue, explicit) {
  if (explicit) return explicit
  const scope = /^(?:feat|fix|refactor|docs|chore)\(([^)]+)\)/i.exec(String(issue.title || ''))?.[1]
  return scope || 'common'
}
export function slugifyTopic(value, issueId) {
  const slug = String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return slug || `issue-${issueId}`
}
