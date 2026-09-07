import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { validateBrowserEvidence } from './auto-qa-gate.mjs'
import { PipelineError, readJsonFile, runCommand, writeEvidence } from './auto-pipeline-runtime.mjs'

function parseTestSummary(output) {
  const lines = String(output || '').split(/\r?\n/)
  const findLast = patterns => {
    let value = null
    for (const line of lines) for (const pattern of patterns) {
      const match = pattern.exec(line)
      if (match) value = Number(match[1])
    }
    return value
  }
  return {
    tests: findLast([/(?:^|\s)[#ℹ]?\s*tests?\s+(\d+)\s*$/i, /(?:^|\s)tests\s*[:=]\s*(\d+)/i]),
    passed: findLast([/(?:^|\s)[#ℹ]?\s*pass(?:ed)?\s+(\d+)\s*$/i, /pass(?:ed)?\s*[:=]\s*(\d+)/i]),
    failed: findLast([/(?:^|\s)[#ℹ]?\s*fail(?:ed)?\s+(\d+)\s*$/i, /fail(?:ed)?\s*[:=]\s*(\d+)/i]),
    skipped: findLast([/(?:^|\s)[#ℹ]?\s*skipped?\s+(\d+)\s*$/i, /skipped?\s*[:=]\s*(\d+)/i]),
  }
}
export function runPackageTest(root, packageName, packageDir, options, evidenceDir, codeChanged, allowSkips) {
  const packageJson = readJsonFile(join(packageDir, 'package.json'))
  if (!packageJson?.scripts?.test) {
    if (codeChanged) throw new PipelineError(`${packageName} 没有 test script，代码变更不能放行`)
    return { packageName, status: 0, tests: 0, skipped: 0, notApplicable: true }
  }
  const result = runCommand('pnpm', ['--filter', packageJson.name || packageName, 'test'], { cwd: root, dryRun: options.dryRun })
  const output = `${result.stdout || ''}${result.stderr || ''}`
  const summary = options.dryRun ? { tests: 1, passed: 1, failed: 0, skipped: 0 } : parseTestSummary(output)
  writeEvidence(join(evidenceDir, `test-${packageName}.log`), output)
  if (result.status !== 0) throw new PipelineError(`${packageName} 测试失败`, { packageName, summary })
  if (summary.tests == null || summary.tests <= 0) throw new PipelineError(`${packageName} 测试未报告实际用例数（0 tests 或输出不可解析）`, { packageName, summary })
  if ((summary.failed || 0) > 0) throw new PipelineError(`${packageName} 存在失败测试`, { packageName, summary })
  if ((summary.skipped || 0) > 0 && !allowSkips) throw new PipelineError(`${packageName} 存在未声明 skip 测试`, { packageName, summary })
  return { packageName, status: result.status, ...summary }
}
function expectedBrowserEvidence(wtDir, options) {
  if (!options.browserRunId || !options.browserStage || !options.browserTarget) {
    throw new PipelineError('ego-browser evidence requires --browser-run-id, --browser-stage, and --browser-target from this pipeline run')
  }
  return { root: wtDir, runId: options.browserRunId, stage: options.browserStage, target: options.browserTarget }
}
export function runStaticQa(wtDir, plugin, base, options, evidenceDir) {
  const qaScript = join(wtDir, 'scripts', 'auto-qa-gate.mjs')
  if (!existsSync(qaScript)) throw new PipelineError(`Worktree 缺少 auto-qa-gate.mjs: ${qaScript}`)
  const reportPath = join(evidenceDir, 'auto-qa-report.json')
  const args = [qaScript, wtDir, '--plugin', plugin, '--diff', '--base', base, '--json', '--output', reportPath]
  const browserRequired = options.browserRequired
  if (browserRequired) {
    const expected = expectedBrowserEvidence(wtDir, options)
    args.push('--require-browser', '--evidence-dir', evidenceDir, '--browser-root', expected.root, '--browser-run-id', expected.runId, '--browser-stage', expected.stage, '--browser-target', expected.target)
  }
  const result = runCommand('node', args, { cwd: wtDir, dryRun: options.dryRun })
  if (options.dryRun) return { pass: true, reportPath, browserRequired }
  const report = readJsonFile(reportPath)
  if (!report || !report.pass || result.status !== 0) throw new PipelineError('L0 auto-qa-gate 未通过', { report })
  if (browserRequired && !validateBrowserEvidence(evidenceDir, expectedBrowserEvidence(wtDir, options)).pass) {
    throw new PipelineError('UI 变更缺少当前运行的 ego-browser 证据')
  }
  return { pass: true, reportPath, browserRequired, report }
}
export function runBrowserQa(wtDir, issueId, plugin, options, evidenceDir) {
  if (!options.browserRequired) return { required: false, pass: true }
  if (options.dryRun) return { required: true, pass: true }
  const evidence = validateBrowserEvidence(evidenceDir, expectedBrowserEvidence(wtDir, options))
  if (!evidence.pass) throw new PipelineError('UI 变更需要同一运行的 ego-browser 验收；能力不足为 BLOCKED，不能伪造或回退到 IAB', { evidence, issueId, plugin })
  return { required: true, pass: true, evidence: evidence.report }
}
export function runIntegrationGates(root, options, evidenceDir) {
  const commands = [['pnpm', ['test:gates']], ['pnpm', ['check:boundaries']], ['pnpm', ['verify:stages']]]
  const results = []
  for (const [command, args] of commands) {
    const result = runCommand(command, args, { cwd: root, dryRun: options.dryRun })
    writeEvidence(join(evidenceDir, `integration-${command}-${args[0]}.log`), `${result.stdout || ''}${result.stderr || ''}`)
    if (result.status !== 0) throw new PipelineError(`集成门禁失败: ${command} ${args.join(' ')}`)
    results.push({ command, args, status: result.status })
  }
  return results
}
