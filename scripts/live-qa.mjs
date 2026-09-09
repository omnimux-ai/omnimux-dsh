import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import assert from 'node:assert/strict'
import { captureStageContracts, selectStages } from './live-stage-contracts.mjs'

export function resolveTarget({ target = 'dev', url } = {}) {
  assert.equal(target, 'dev', `Unknown target: ${target}`)
  const address = new URL(url || 'http://127.0.0.1:45120/')
  assert.ok(address.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(address.hostname), 'Target must be a local HTTP origin')
  assert.ok(!address.username && !address.password && !address.search && !address.hash && address.pathname === '/', 'Target URL must contain only its origin; authenticate in the browser separately')
  assert.equal(address.port, '45120', 'Dev target must use port 45120')
  return { target, profile: 'omnimux-dev', url: address.href }
}

export async function runLiveQa(args, { root = process.cwd(), now = () => Date.now() } = {}) {
  const report = { runId: randomUUID(), commitSha: null, target: null, profile: null, url: null, stage: null, targets: [], assertions: [], screenshots: [], pass: false, status: 'failed', startedAt: new Date(now()).toISOString(), completedAt: null, errors: [] }
  const reportPath = join(root, 'docs/evidence/live-qa-report.json')
  let evidenceDir = join(root, '.workbuddy/evidence/live-qa', report.runId)
  try {
    report.commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    report.dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim())
    const { values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { target: { type: 'string', default: 'dev' }, url: { type: 'string' }, 'evidence-dir': { type: 'string' } } })
    assert.equal(positionals.length, 1, 'Usage: pnpm verify:live <stage|all> [--target=dev --url=http://127.0.0.1:45120/]')
    report.stage = positionals[0]
    const stages = selectStages(report.stage)
    Object.assign(report, resolveTarget(values))
    const candidateEvidenceDir = values['evidence-dir'] ? resolve(root, values['evidence-dir'], report.runId) : evidenceDir
    const allowedEvidenceRoot = resolve(root, '.workbuddy/evidence/live-qa')
    const evidenceRelative = relative(allowedEvidenceRoot, candidateEvidenceDir)
    assert.ok(evidenceRelative && !evidenceRelative.startsWith('..') && !evidenceRelative.includes('/../'), '--evidence-dir must stay under .workbuddy/evidence/live-qa')
    evidenceDir = candidateEvidenceDir
    report.evidenceDir = evidenceDir
    mkdirSync(evidenceDir, { recursive: true })
    const registry = await captureStageContracts(root)
    if (stages.includes('studio')) registry.push(...await captureStageContracts(root, ['studio']))
    report.targets = registry.filter(entry => stages.includes(entry.stage))
    assert.ok(report.targets.length, 'Zero stage targets')
    report.assertions.push({ name: 'actual-sidebar-contracts', pass: true, count: report.targets.length })
    const expiresAt = new Date(now() + 15 * 60_000).toISOString()
    const requestPath = join(evidenceDir, 'ego-browser-qa-request.json')
    const request = { version: 1, root, runId: report.runId, commitSha: report.commitSha, target: report.target, profile: report.profile, url: report.url, stage: report.stage, targets: report.targets, sidebarSelectors: registry.map(entry => entry.selector).filter(Boolean), evidenceDir, reportPath, createdAt: new Date(now()).toISOString(), expiresAt, consumedAt: null }
    writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    report.requestPath = requestPath; report.expiresAt = expiresAt; report.status = 'pending'
    report.errors.push('Pending post-merge Dev ego-browser execution: follow docs/contracts/plugin-qa.md, import scripts/ego-live-qa.mjs in an ego-browser nodejs heredoc, and call runPreparedQa(requestPath, { tab }); missing ego capabilities are BLOCKED, not PASS')
  } catch (error) { report.errors.push(error instanceof Error ? error.message : String(error)) } finally {
    report.completedAt = new Date(now()).toISOString(); report.evidenceDir = evidenceDir
    mkdirSync(evidenceDir, { recursive: true }); mkdirSync(dirname(reportPath), { recursive: true })
    const json = `${JSON.stringify(report, null, 2)}\n`
    writeFileSync(join(evidenceDir, 'live-qa-report.json'), json, { mode: 0o600 }); writeFileSync(reportPath, json, { mode: 0o600 })
  }
  return report
}
