#!/usr/bin/env node
/** CI verdict projects static/test readiness, not post-merge Dev acceptance. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveImpactMatrix, impactFilesFromGit, postMergeAcceptance } from './impact-matrix.mjs'
import { syncQaPassLabel } from './qa-label.mjs'

function parseArgs(argv) {
  const options = {
    pr: process.env.PR_NUMBER || '', report: '', impact: '',
    base: process.env.QA_BASE || 'origin/main', dryRun: false,
  }
  const values = {
    '--pr': 'pr', '--report': 'report', '--impact': 'impact', '--base': 'base', '--ci-status': 'ciStatus',
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--json') options.json = true
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
  const matrix = options.impactMatrix ?? derived
  if (!matrix) throw new Error('缺少影响面矩阵或 changedFiles，不能判断合并后 Dev 适用性')
  const { l0, browser, dev } = matrix.dimensions || {}
  if (l0?.required !== true || l0.phase !== 'pre-merge'
      || typeof browser?.required !== 'boolean' || typeof dev?.required !== 'boolean'
      || browser.phase !== 'post-merge' || dev.phase !== 'post-merge' || browser.target !== 'dev' || dev.target !== 'dev'
      || typeof matrix.isUiChange !== 'boolean' || matrix.isUiChange !== browser.required || (browser.required && !dev.required)
      || !l0.reason?.trim() || !browser.reason?.trim() || !dev.reason?.trim()) {
    throw new Error('影响面矩阵无效：必须声明合并前 L0 与合并后 Dev/ego-browser 的适用性及理由')
  }
  if (derived && ['browser', 'dev'].some(name => derived.dimensions[name].required !== matrix.dimensions[name].required)) {
    throw new Error('影响面矩阵与 changedFiles 不匹配')
  }
  return matrix
}

export function evaluateVerdict(qaReport, options = {}) {
  const errors = [...(options.inputErrors || [])]
  if (options.ciStatus && options.ciStatus !== 'success') errors.push(`前序 CI 检查未通过: ${options.ciStatus}`)
  const l0Pass = qaReport?.pass === true
  if (!qaReport) errors.push('缺少 L0 auto-qa-report.json 报告')
  else if (!l0Pass) errors.push(`L0 QA 未通过: ${qaReport.summary || '存在未通过维度'}`)
  let impactMatrix = null
  try { impactMatrix = resolveImpact(qaReport, options) } catch (error) { errors.push(error.message) }
  const postMerge = impactMatrix ? postMergeAcceptance(impactMatrix) : null
  const dimensions = {
    l0: { required: true, phase: 'pre-merge', pass: l0Pass, status: l0Pass ? 'passed' : 'failed', reason: impactMatrix?.dimensions.l0.reason || 'L0 始终必需' },
    ...(postMerge || {}),
  }
  return {
    pass: errors.length === 0, scope: 'pre-merge-static-tests', errors, impactMatrix, dimensions,
    summary: errors.length ? `FAIL: ${errors.join('；')}`
      : `PASS: 合并前静态/测试通过；合并后 Dev ${postMerge.dev.status}；ego-browser ${postMerge.browser.status}（${postMerge.browser.reason}）`,
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
  const verdict = evaluateVerdict(qaReport, { ...options, impactMatrix, inputErrors })
  const label = applyVerdictLabel(options.pr, verdict.pass, options.dryRun)
  if (options.json) process.stdout.write(`${JSON.stringify({ ...verdict, label }, null, 2)}\n`)
  else process.stdout.write(`[ci-verdict] ${verdict.summary}\n`)
  if (!label.ok) process.stderr.write(`${label.errors.join('\n')}\n`)
  return verdict.pass && label.ok ? 0 : 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = await main()
