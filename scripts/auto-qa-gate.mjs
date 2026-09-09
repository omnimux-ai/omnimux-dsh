#!/usr/bin/env node
/**
 * auto-qa-gate.mjs — diff-aware L0 static quality gate.
 *
 * This is intentionally a deterministic scanner, not the complete QA process.
 * Package tests and static integration checks precede merge. Browser evidence
 * is validated only when explicitly requested for post-merge Dev acceptance;
 * missing evidence fails there, while CI never claims browser acceptance.
 *
 * Usage:
 *   node scripts/auto-qa-gate.mjs [target] [--plugin <name>] [--diff]
 *     [--base <ref>] [--require-browser] [--evidence-dir <dir>]
 *     [--output <file>] [--json]
 */

import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { maskNonCode, normalizedRelative, staticScan } from './auto-qa-scan.mjs'
import { isForbiddenWorkflowArtifact } from './check-tracked-artifacts.mjs'
import { validateLiveQaReport } from './live-qa-validation.mjs'

export { maskNonCode }

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.workbuddy', 'lib', 'openreel', 'coverage'])

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    targetDir: process.cwd(),
    pluginName: '',
    outputJson: false,
    diff: false,
    base: 'origin/main',
    requireBrowser: false,
    evidenceDir: '',
    output: '',
    browserRunId: '', browserStage: '', browserRoot: '',
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--plugin' && argv[i + 1]) options.pluginName = argv[++i]
    else if (arg === '--base' && argv[i + 1]) options.base = argv[++i]
    else if (arg === '--evidence-dir' && argv[i + 1]) options.evidenceDir = resolve(argv[++i])
    else if (arg === '--output' && argv[i + 1]) options.output = resolve(argv[++i])
    else if (arg === '--browser-run-id' && argv[i + 1]) options.browserRunId = argv[++i]
    else if (arg === '--browser-stage' && argv[i + 1]) options.browserStage = argv[++i]
    else if (arg === '--browser-root' && argv[i + 1]) options.browserRoot = resolve(argv[++i])
    else if (arg === '--json') options.outputJson = true
    else if (arg === '--diff') options.diff = true
    else if (arg === '--require-browser') options.requireBrowser = true
    else if (!arg.startsWith('-')) options.targetDir = resolve(arg)
    else throw new Error(`未知或缺值参数: ${arg}`)
  }
  return options
}

function gitRoot(start) {
  const result = spawnSync('git', ['-C', start, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (result.status !== 0) return null
  return result.stdout.trim() || null
}

function isInside(parent, candidate) {
  const root = resolve(parent)
  const path = resolve(candidate)
  return path === root || path.startsWith(`${root}${sep}`)
}

export function findFiles(dir, extensions = SOURCE_EXTENSIONS) {
  const results = []
  if (!existsSync(dir)) return results
  function walk(current) {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(fullPath)
      } else if (entry.isFile() && extensions.has(extname(entry.name))) {
        results.push(fullPath)
      }
    }
  }
  walk(resolve(dir))
  return results.sort()
}

function parseGitNames(output, { porcelain = false } = {}) {
  const records = String(output || '').includes('\0')
    ? String(output).split('\0').filter(Boolean)
    : String(output).split(/\r?\n/).filter(Boolean)
  const names = []
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (!porcelain) {
      names.push(record.trim())
      continue
    }
    // Porcelain v1 -z stores the two-column status followed by a path. Rename
    // and copy records carry the second path in the next NUL-delimited field.
    const status = record.slice(0, 2)
    const path = record.slice(3)
    if (path) names.push(path)
    if (/[RC]/.test(status) && records[index + 1]) names.push(records[++index])
  }
  return names
    .map(name => name.trim())
    .filter(Boolean)
}

export function isScannableSourceFile(root, file) {
  const rel = normalizedRelative(root, file)
  if (isForbiddenWorkflowArtifact(rel)) return false
  if (!existsSync(file)) return false
  return SOURCE_EXTENSIONS.has(extname(file))
}

export function changedFilesFromGit(root, base = 'origin/main', { strict = false } = {}) {
  const changed = new Set()
  const diff = spawnSync('git', ['-C', root, 'diff', '--name-only', '-z', `${base}...HEAD`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (diff.status !== 0) {
    if (strict) throw new Error(`无法计算 ${base}...HEAD diff：${(diff.stderr || '').trim()}`)
  } else {
    for (const name of parseGitNames(diff.stdout)) changed.add(resolve(root, name))
  }
  const status = spawnSync('git', ['-C', root, 'status', '--porcelain=v1', '-z', '--untracked-files=all'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (status.status !== 0) {
    if (strict) throw new Error(`无法读取工作树状态：${(status.stderr || '').trim()}`)
  } else {
    for (const name of parseGitNames(status.stdout, { porcelain: true })) changed.add(resolve(root, name))
  }
  return [...changed].filter(file => isInside(root, file)).sort()
}

function emptyDimension() {
  return { pass: true, checks: [], errors: [] }
}

export function createReport(options) {
  return {
    timestamp: new Date().toISOString(),
    targetDir: options.targetDir,
    pluginName: options.pluginName,
    diffMode: options.diff,
    base: options.base,
    changedFiles: [],
    scannedFiles: [],
    pass: true,
    dimensions: {
      syntax: emptyDimension(),
      lifecycle: emptyDimension(),
      security: emptyDimension(),
      tokens: emptyDimension(),
      guards: emptyDimension(),
    },
    browser: {
      required: options.requireBrowser, phase: 'post-merge', target: 'dev',
      status: options.requireBrowser ? 'failed' : 'not-requested',
      pass: options.requireBrowser ? false : null,
      evidenceDir: options.evidenceDir || null,
      errors: options.requireBrowser ? ['未提供 ego-browser live QA evidence'] : [],
    },
    summary: '',
  }
}

export function validateBrowserEvidence(evidenceDir, expected = {}) {
  const result = { pass: false, errors: [], report: null }
  if (!evidenceDir) {
    result.errors.push('未提供 ego-browser live QA evidence 目录')
    return result
  }
  const reportPath = join(evidenceDir, 'live-qa-report.json')
  const requestPath = join(evidenceDir, 'ego-browser-qa-request.json')
  if (!existsSync(reportPath)) {
    result.errors.push(`缺少 ${reportPath}`)
    return result
  }
  try {
    const browserReport = JSON.parse(readFileSync(reportPath, 'utf8'))
    const request = JSON.parse(readFileSync(requestPath, 'utf8'))
    result.report = browserReport
    const root = expected.root || gitRoot(evidenceDir)
    assert.ok(root, 'Cannot resolve current worktree for browser evidence')
    assert.ok(expected.runId && expected.stage && expected.target, 'Browser evidence requires the current expected run ID, Stage, and target')
    validateLiveQaReport(browserReport, request, { ...expected, root })
  } catch (error) {
    result.errors.push(`无法解析 ego-browser 报告：${error.message}`)
  }
  result.pass = result.errors.length === 0
  return result
}

export function runGate(options) {
  const report = createReport(options)
  const root = gitRoot(options.targetDir) || options.targetDir
  let files
  if (options.diff) {
    const changed = changedFilesFromGit(root, options.base)
    report.changedFiles = changed.map(file => normalizedRelative(root, file))
    files = changed.filter(file => isInside(options.targetDir, file) && isScannableSourceFile(root, file))
  } else {
    files = findFiles(options.targetDir)
    report.changedFiles = files.map(file => normalizedRelative(root, file))
  }

  staticScan(report, files, root)

  if (options.requireBrowser) {
    const evidence = validateBrowserEvidence(options.evidenceDir, { root: options.browserRoot || root, runId: options.browserRunId, stage: options.browserStage, target: 'dev' })
    report.browser = {
      required: true, phase: 'post-merge', target: 'dev', status: evidence.pass ? 'passed' : 'failed',
      evidenceDir: options.evidenceDir || null, ...evidence,
    }
  }

  report.pass = Object.values(report.dimensions).every(dimension => dimension.pass) && (!options.requireBrowser || report.browser.pass)
  const errorCount = Object.values(report.dimensions).reduce((sum, dimension) => sum + dimension.errors.length, 0) + report.browser.errors.length
  report.summary = report.pass
    ? `PASS: L0 diff-aware 静态门禁通过（扫描 ${files.length} 个文件）${options.requireBrowser ? '；合并后 Dev ego-browser 证据通过' : '；未执行浏览器验收'}`
    : `FAIL: L0 静态/Dev 浏览器证据检查发现 ${errorCount} 项阻断`
  return report
}

function renderHuman(report) {
  const lines = [
    '',
    '======================================================',
    '🛡️ 严过关 L0 Diff-aware 自动化质检报告',
    '======================================================',
    `目标路径: ${report.targetDir}`,
    `变更文件: ${report.changedFiles.length} | 扫描文件: ${report.scannedFiles.length}`,
    `总体评定: ${report.summary}`,
    '',
  ]
  for (const [name, dimension] of Object.entries(report.dimensions)) {
    lines.push(`[${dimension.pass ? '✓' : '✗'}] ${name.toUpperCase()}`)
    for (const check of dimension.checks) lines.push(`   ✓ ${check}`)
    for (const error of dimension.errors) lines.push(`   ✗ [${error.file}${error.line ? `:${error.line}` : ''}] ${error.message}`)
  }
  lines.push(`[${report.browser.required ? report.browser.pass ? '✓' : '✗' : '-'}] DEV EGO-BROWSER (${report.browser.status}, post-merge)`)
  for (const error of report.browser.errors || []) lines.push(`   ✗ ${error}`)
  lines.push('======================================================', '')
  return lines.join('\n')
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const report = runGate(options)
  if (options.output) writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  if (options.outputJson) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else process.stdout.write(renderHuman(report))
  return report.pass ? 0 : 1
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main()
