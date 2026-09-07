#!/usr/bin/env node
/** CI verdict: required evidence must pass before projecting qa:pass. */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateLiveQaReport } from './live-qa-validation.mjs'
import { deriveImpactMatrix, impactFilesFromGit } from './impact-matrix.mjs'
import { syncQaPassLabel } from './qa-label.mjs'

function parseArgs(argv) {
  const options = {
    pr: process.env.PR_NUMBER || '', report: '', browserReport: '', impact: '',
    browserRunId: process.env.OMNIMUX_BROWSER_RUN_ID || '',
    browserStage: process.env.OMNIMUX_BROWSER_STAGE || '',
    browserTarget: process.env.OMNIMUX_BROWSER_TARGET || '',
    browserRoot: process.env.GITHUB_WORKSPACE || process.cwd(),
    base: process.env.QA_BASE || 'origin/main', dryRun: false,
  }
  const values = {
    '--pr': 'pr', '--report': 'report', '--browser-report': 'browserReport', '--impact': 'impact',
    '--browser-run-id': 'browserRunId', '--browser-stage': 'browserStage',
    '--browser-target': 'browserTarget', '--browser-root': 'browserRoot',
    '--base': 'base', '--ci-status': 'ciStatus',
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--json') options.json = true
    else if (arg === '--require-browser') options.requireBrowser = true
    else if (arg === '--files-from-git') options.filesFromGit = true
    else if ((arg === '--changed-files' || values[arg]) && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) {
      const value = argv[++i]
      if (arg === '--changed-files') options.changedFiles = value.split(',').map(file => file.trim()).filter(Boolean)
      else options[values[arg]] = value
    } else throw new Error(`未知或缺值参数: ${arg}`)
  }
  if (options.filesFromGit && options.changedFiles) throw new Error('--changed-files 与 --files-from-git 不能同时使用')
  return options
}

function readJson(path) {
  try { return path ? JSON.parse(readFileSync(path, 'utf8')) : null } catch { return null }
}

function resolveImpact(qaReport, options) {
  const files = options.changedFiles ?? qaReport?.changedFiles
  const derived = files === undefined ? null : deriveImpactMatrix(files)
  const matrix = options.impactMatrix ?? options.impact ?? derived
  if (!matrix) throw new Error('缺少影响面矩阵或 changedFiles，不能仅凭 L0 授予 qa:pass')
  const { l0, iab } = matrix.dimensions || {}
  if (l0?.required !== true || typeof iab?.required !== 'boolean'
      || typeof matrix.isUiChange !== 'boolean' || matrix.isUiChange !== iab.required
      || !l0.reason?.trim() || !iab.reason?.trim()) {
    throw new Error('影响面矩阵无效：必须声明 L0 与 IAB 的适用性及理由')
  }
  if (derived && derived.dimensions.iab.required !== iab.required) throw new Error('影响面矩阵与 changedFiles 不匹配')
  return matrix
}

export function evaluateVerdict(qaReport, browserReport, options = {}) {
  const errors = [...(options.inputErrors || [])]
  if (options.ciStatus && options.ciStatus !== 'success') errors.push(`前序 CI 检查未通过: ${options.ciStatus}`)
  const l0Pass = qaReport?.pass === true
  if (!qaReport) errors.push('缺少 L0 auto-qa-report.json 报告')
  else if (!l0Pass) errors.push(`L0 QA 未通过: ${qaReport.summary || '存在未通过维度'}`)

  let impactMatrix = null
  try { impactMatrix = resolveImpact(qaReport, options) } catch (error) { errors.push(error.message) }
  const required = impactMatrix?.dimensions.iab.required
  let iabPass = required === false
  if (required === true) {
    if (!browserReport) errors.push('缺少 Codex IAB live-qa-report.json 浏览器验收报告')
    else {
      try {
        if (!options.browserRunId || !options.browserStage || !options.browserTarget || !options.browserRoot) {
          throw new Error('Missing CI expected browser run ID, Stage, target, or worktree')
        }
        validateLiveQaReport(browserReport, options.browserRequest, {
          root: options.browserRoot, runId: options.browserRunId,
          stage: options.browserStage, target: options.browserTarget,
        })
        iabPass = true
      } catch (error) { errors.push(`Codex IAB 证据无效: ${error.message}`) }
    }
  }
  const dimensions = {
    l0: { required: true, pass: l0Pass, status: l0Pass ? 'passed' : 'failed', reason: impactMatrix?.dimensions.l0.reason || 'L0 始终必需' },
    iab: {
      required: required ?? null, pass: iabPass,
      status: required === false ? 'not-applicable' : iabPass ? 'passed' : 'failed',
      reason: impactMatrix?.dimensions.iab.reason || '缺少有效影响面，不能判断 IAB 适用性',
    },
  }
  return {
    pass: errors.length === 0, errors, impactMatrix, dimensions,
    summary: errors.length ? `FAIL: ${errors.join('；')}`
      : `PASS: L0 通过；IAB ${required ? '通过' : `not-applicable（${dimensions.iab.reason}）`}`,
  }
}

export function applyVerdictLabel(prNumber, pass, dryRun = false, dependencies = {}) {
  return syncQaPassLabel({ prNumber, pass, dryRun, ...dependencies })
}

export async function main(argv = process.argv.slice(2)) {
  // Retain label-cleanup context even if argument parsing fails.
  let options = { pr: process.env.PR_NUMBER || '', dryRun: argv.includes('--dry-run') }
  const prIndex = argv.indexOf('--pr')
  if (prIndex >= 0) options.pr = argv[prIndex + 1] || options.pr
  const inputErrors = []
  let impactMatrix
  try {
    options = parseArgs(argv)
    if (options.filesFromGit) options.changedFiles = await impactFilesFromGit(process.cwd(), options.base)
    if (options.impact) {
      impactMatrix = readJson(options.impact)
      if (!impactMatrix) throw new Error('无法读取 --impact 影响面矩阵')
    }
  } catch (error) { inputErrors.push(error.message) }
  const qaReport = readJson(options.report)
  const browserReport = readJson(options.browserReport)
  const browserRequest = options.browserReport ? readJson(join(dirname(options.browserReport), 'codex-browser-qa-request.json')) : null
  const verdict = evaluateVerdict(qaReport, browserReport, { ...options, impact: undefined, impactMatrix, browserRequest, inputErrors })
  const label = applyVerdictLabel(options.pr, verdict.pass, options.dryRun)
  if (options.json) process.stdout.write(`${JSON.stringify({ ...verdict, label }, null, 2)}\n`)
  else process.stdout.write(`[ci-verdict] ${verdict.summary}\n`)
  if (!label.ok) process.stderr.write(`${label.errors.join('\n')}\n`)
  return verdict.pass && label.ok ? 0 : 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = await main()
