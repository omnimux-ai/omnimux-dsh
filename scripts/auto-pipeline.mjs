#!/usr/bin/env node
/** Issue-driven delivery: admission -> isolated implementation -> evidence -> authorized merge. */
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireIssueLock, assertSameRun, makeRunKey, readState, transitionState, writeState } from './pipeline-state.mjs'
import { assessAdmission, assessRuntimeAuthorization, parseFrontmatter } from './authorization.mjs'
import { requiresBrowser } from './impact-matrix.mjs'
import { PipelineError, repoRoot, runCommand, writeEvidence } from './auto-pipeline-runtime.mjs'
import { classifyRisk, fetchIssue, inferPlugin, maintainersFor, parseArgs, slugifyTopic } from './auto-pipeline-metadata.mjs'
import { baseSha, changedPaths, ensureBranchAndWorktree, getPackageInfo, hasCodeChanges, materializeAndCleanup, pluginNamesFromChanges, runImplementation } from './auto-pipeline-worktree.mjs'
import { runBrowserQa, runIntegrationGates, runPackageTest, runStaticQa } from './auto-pipeline-qa.mjs'
import { commitAndPush, findOrCreatePr, labelPr, requestAndConfirmMerge, transitionIssue, waitForCi } from './auto-pipeline-github.mjs'

export { assessAdmission, assessRuntimeAuthorization, parseFrontmatter } from './authorization.mjs'
export function assessAuthorization(issue, maintainers = maintainersFor()) {
  return assessAdmission(issue, maintainers)
}
export { PipelineError, runCommand } from './auto-pipeline-runtime.mjs'
export { classifyRisk, fetchIssue, maintainersFor, parseArgs, slugifyTopic } from './auto-pipeline-metadata.mjs'
const saveState = transitionState

function printDryRun(options, issue, plugin, topic) {
  process.stdout.write(`\n================================================================\n`)
  process.stdout.write(`🚀 启动 OmniMux 无人值守全自动交付流水线 (Issue #${options.issueId})\n`)
  process.stdout.write(`================================================================\n`)
  process.stdout.write(`· [dry-run] 不读取远端、不执行写操作、不合入、不物化\n`)
  process.stdout.write(`· 任务定义: 插件=[${plugin}] 主题=[${topic}] 标题=[${issue.title}]\n`)
  process.stdout.write(`\n==> [1/6] 解析 Issue #${options.issueId} 元数据...\n`)
  process.stdout.write('✓ Issue 元数据、风险、预授权与 DoD 校验（dry-run）\n')
  process.stdout.write(`\n==> [2/6] 创建独立 Worktree 物理沙箱...\n`)
  process.stdout.write('✓ Worktree/branch 绑定校验（dry-run）\n')
  process.stdout.write(`\n==> [3/6] 执行 L1 敏捷自动化测试 (Worktree)...\n`)
  process.stdout.write('✓ 真实测试命令与计数门禁（dry-run）\n')
  process.stdout.write(`\n==> [4/6] 执行严过关五维自动化质检门禁...\n`)
  process.stdout.write('✓ L0 diff-aware / L2 integration / ego-browser 条件门禁（dry-run）\n')
  process.stdout.write(`\n==> [5/6] 自动提交、发起 PR 并按风险决定合入...\n`)
  process.stdout.write('✓ PR body、CI required checks、R0-R3 通道（dry-run）\n')
  process.stdout.write(`\n==> [6/6] 合入确认后物化、回滚保护并清理...\n`)
  process.stdout.write('✓ 仅在 state=MERGED 且 mergeCommit 存在后执行（dry-run）\n')
  process.stdout.write(`\n================================================================\n`)
  process.stdout.write('🎉 无人值守全自动流水线执行完毕（dry-run，未修改远端）\n')
  process.stdout.write('================================================================\n\n')
}

export async function executePipeline(options) {
  const issue = fetchIssue(options.issueId, options)
  const plugin = inferPlugin(issue, options.plugin)
  const topic = options.topic || slugifyTopic(issue.title, options.issueId)
  if (options.dryRun) {
    printDryRun(options, issue, plugin, topic)
    return { state: 'dry-run', issue, plugin, topic }
  }

  const lock = acquireIssueLock(repoRoot, options.issueId)
  let current = null
  let stateWritten = false
  try {
    const sha = baseSha(repoRoot, options)
    const runKey = makeRunKey(options.issueId, sha)
    const previous = readState(repoRoot, options.issueId)
    const idem = assertSameRun(previous, runKey)
    if (idem.kind === 'terminal' && !options.forceRetry) {
      process.stdout.write(`· Issue #${options.issueId} 已有相同 runKey 的终态 ${previous.state}，幂等返回\n`)
      return previous
    }
    if ((idem.kind === 'active' || idem.kind === 'different') && !options.forceRetry) {
      throw new PipelineError(`Issue #${options.issueId} 存在未完成或不同 runKey 的流水线状态，使用 --force-retry 前先人工检查现场`)
    }

    const maintainers = maintainersFor()
    const auth = assessAdmission(issue, maintainers)
    const preRisk = classifyRisk(issue, [])
    const channel = preRisk.automaticAllowed && auth.eligible ? 'auto' : 'boss'
    if (!options.manual && !auth.eligible && preRisk.automaticAllowed) {
      throw new PipelineError(`R2/R3 Issue 未满足自动授权，拒绝进入无人值守通道: ${auth.reasons.join('；')}`)
    }
    if (preRisk.tier === 'R0' || preRisk.tier === 'R1') process.stdout.write(`· 风险 ${preRisk.tier}：强制老板人工合入\n`)

    current = 'preflight'
    saveState(repoRoot, options.issueId, null, current, {
      runKey, baseSha: sha, plugin, topic, channel, riskTier: preRisk.tier, authorization: auth,
    })
    stateWritten = true
    transitionIssue(options.issueId, 'status:pipeline-running', options, [`risk:${preRisk.tier}`])

    process.stdout.write(`\n================================================================\n`)
    process.stdout.write(`🚀 启动 OmniMux 无人值守全自动交付流水线 (Issue #${options.issueId})\n`)
    process.stdout.write(`================================================================\n`)
    process.stdout.write(`· 任务定义: 插件=[${plugin}] 主题=[${topic}] 风险=[${preRisk.tier}] 通道=[${channel}]\n`)

    process.stdout.write(`\n==> [1/6] 解析 Issue #${options.issueId} 元数据...\n`)
    current = 'metadata'
    saveState(repoRoot, options.issueId, 'preflight', current, { issueTitle: issue.title })
    transitionIssue(options.issueId, 'status:in-progress', options, [`risk:${preRisk.tier}`])

    process.stdout.write('\n==> [2/6] 创建独立 Worktree 物理沙箱并实施代码...\n')
    const wt = ensureBranchAndWorktree(plugin, topic, options.issueId, options)
    current = 'implementation'
    saveState(repoRoot, options.issueId, 'metadata', current, { worktree: wt.wtDir, branch: wt.expectedBranch })
    runImplementation(wt.wtDir, plugin, topic, options.issueId, options)
    const paths = changedPaths(wt.wtDir, sha, options)
    const risk = classifyRisk(issue, paths)
    const effectiveChannel = risk.automaticAllowed && auth.eligible ? 'auto' : 'boss'
    saveState(repoRoot, options.issueId, current, current, { changedFiles: paths, riskTier: risk.tier, channel: effectiveChannel, riskReasons: risk.reasons })

    process.stdout.write('\n==> [3/6] 执行 L1 敏捷自动化测试 (Worktree)...\n')
    current = 'tests'
    saveState(repoRoot, options.issueId, 'implementation', current)
    const evidenceDir = options.evidenceDir || join(wt.wtDir, '.workbuddy', 'evidence', `issue-${options.issueId}`)
    mkdirSync(evidenceDir, { recursive: true, mode: 0o700 })
    const allowSkips = parseFrontmatter(issue.body || '')['allow-skips'] === true
    const changedPlugins = pluginNamesFromChanges(paths)
    const packages = changedPlugins.length > 0 ? changedPlugins : (plugin !== 'common' ? [plugin] : [])
    const testReports = []
    const codeChanged = hasCodeChanges(paths)
    for (const changedPlugin of packages) {
      const info = getPackageInfo(wt.wtDir, changedPlugin)
      if (!info) throw new PipelineError(`无法定位变更插件 package.json: ${changedPlugin}`)
      testReports.push(runPackageTest(wt.wtDir, changedPlugin, info.dir, options, evidenceDir, codeChanged, allowSkips))
    }
    if (packages.length === 0 || paths.some(file => !file.startsWith('plugins/'))) {
      const rootGate = runCommand('pnpm', ['test:gates'], { cwd: wt.wtDir, dryRun: options.dryRun })
      writeEvidence(join(evidenceDir, 'test-root-gates.log'), `${rootGate.stdout || ''}${rootGate.stderr || ''}`)
      if (rootGate.status !== 0) throw new PipelineError('根级 test:gates 失败')
    }

    process.stdout.write('\n==> [4/6] 执行严过关五维自动化质检门禁与 L2/ego-browser 验收...\n')
    current = 'qa'
    saveState(repoRoot, options.issueId, 'tests', current, { testReports })
    options.browserRequired = requiresBrowser(paths)
    const browser = runBrowserQa(wt.wtDir, options.issueId, plugin, options, evidenceDir)
    const qa = runStaticQa(wt.wtDir, plugin, sha, options, evidenceDir)
    const integration = runIntegrationGates(wt.wtDir, options, evidenceDir)
    const reports = { qa, browser, integration, tests: testReports }
    saveState(repoRoot, options.issueId, 'qa', 'qa', { reports })
    transitionIssue(options.issueId, 'status:qa-review', options, [`risk:${risk.tier}`])

    process.stdout.write('\n==> [5/6] 自动提交、发起 PR 并按风险决定合入...\n')
    current = 'pr'
    saveState(repoRoot, options.issueId, 'qa', current)
    const commit = commitAndPush(wt.wtDir, plugin, issue.title || `Issue #${options.issueId}`, options.issueId, wt.expectedBranch, options)
    const pr = findOrCreatePr(wt.wtDir, wt.expectedBranch, plugin, issue.title || `Issue #${options.issueId}`, options.issueId, reports, risk, options, evidenceDir)
    labelPr(pr.number, risk, options)
    if (risk.tier === 'R0' || risk.tier === 'R1' || effectiveChannel !== 'auto') {
      transitionIssue(options.issueId, 'status:ready-for-boss', options, [`risk:${risk.tier}`])
      saveState(repoRoot, options.issueId, 'pr', 'ready-for-boss', { commit, pr, reports })
      process.stdout.write(`✓ PR #${pr.number || '(dry-run)'} 已交老板人工通道；不自动合入、不物化、不清理\n`)
      return { state: 'ready-for-boss', issue, plugin, topic, risk, pr, reports }
    }

    process.stdout.write('\n==> [6/6] CI、受控合入确认、物化与收尾...\n')
    current = 'ci'
    saveState(repoRoot, options.issueId, 'pr', current, { commit, pr, reports })
    transitionIssue(options.issueId, 'status:auto-merge-pending', options, [`risk:${risk.tier}`])
    const ci = await waitForCi(pr.number, options)

    // Revalidate after waiting for CI so late revocations still prevent a merge request.
    const latestIssue = fetchIssue(options.issueId, options)
    const latestAuth = assessRuntimeAuthorization(latestIssue, maintainers, risk.tier)
    if (!latestAuth.valid) {
      throw new PipelineError(`合入前重新核验授权失败，已被撤销或状态改变: ${latestAuth.reasons.join('；')}`)
    }
    saveState(repoRoot, options.issueId, 'ci', 'auto-merge-pending', { ci })
    const merged = await requestAndConfirmMerge(pr.number, options)
    saveState(repoRoot, options.issueId, 'auto-merge-pending', 'merged-confirmed', { merged })
    materializeAndCleanup(wt, plugin, topic, options.issueId, pr, options)
    transitionIssue(options.issueId, 'status:auto-merged', options, [`risk:${risk.tier}`])
    saveState(repoRoot, options.issueId, 'merged-confirmed', 'succeeded', { merged, materialized: options.materialize })
    process.stdout.write(`\n🎉 Issue #${options.issueId} 已确认 MERGED、物化并完成收尾\n`)
    return { state: 'succeeded', issue, plugin, topic, risk, pr, merged, reports }
  } catch (error) {
    if (stateWritten) {
      const message = error instanceof Error ? error.message : String(error)
      try { writeState(repoRoot, options.issueId, { ...(readState(repoRoot, options.issueId) || {}), state: 'blocked', error: message }) }
      catch (stateError) { process.stderr.write(`无法写入 blocked 状态: ${stateError.message}\n`) }
      try { transitionIssue(options.issueId, 'status:blocked', options, [], []) }
      catch (labelError) { process.stderr.write(`无法更新 Issue blocked 标签: ${labelError.message}\n`) }
    }
    throw error
  } finally { lock.release() }
}

export async function main(argv = process.argv.slice(2)) {
  try {
    await executePipeline(parseArgs(argv))
    return 0
  } catch (error) {
    process.stderr.write(`\n流水线执行阻断: ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}
const entry = process.argv[1] ? resolve(process.argv[1]) : ''
if (entry && fileURLToPath(import.meta.url) === entry) process.exitCode = await main()
