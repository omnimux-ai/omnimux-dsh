import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import assert from 'node:assert/strict'
import { captureStageContracts, selectStages } from './live-stage-contracts.mjs'

export function resolveTarget({ target = 'dev', url }, root) {
  assert.ok(target === 'dev' || target === 'l2', `Unknown target: ${target}`)
  assert.ok(target !== 'l2' || url, 'L2 requires --url from this worktree .l2-dev.env')
  const address = new URL(url || 'http://127.0.0.1:45120/')
  assert.ok(address.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(address.hostname), 'Target must be a local HTTP origin')
  assert.ok(!address.username && !address.password && !address.search && !address.hash && address.pathname === '/', 'Target URL must contain only its origin; authenticate in the browser separately')
  if (target === 'dev') {
    assert.equal(address.port, '45120', 'Dev target must use port 45120')
    return { target, profile: 'omnimux-dev', url: address.href }
  }
  assert.ok(Number(address.port) >= 44201 && Number(address.port) <= 44299, 'L2 port must be 44201–44299; 44200 is production')
  const allocation = Object.fromEntries(readFileSync(join(root, '.l2-dev.env'), 'utf8').split('\n').filter(line => /^[A-Z_]+=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
  assert.equal(new URL(allocation.URL).href, address.href, 'L2 URL does not match this worktree allocation')
  assert.equal(allocation.PORT, address.port, 'L2 PORT does not match allocated URL')
  assert.equal(realpathSync(allocation.SOURCE), realpathSync(join(root, 'plugins')), 'L2 SOURCE belongs to another worktree')
  assert.match(allocation.TOPIC || '', /^[a-zA-Z0-9_-]+$/, 'Missing or invalid L2 topic')
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  assert.ok(allocation.COMMIT?.length >= 7 && sha.startsWith(allocation.COMMIT), 'L2 allocation has a stale COMMIT; rerun pnpm wt dev')
  const profile = `omnimux-dev-${allocation.TOPIC}`
  assert.ok(allocation.PROFILE_DIR && isAbsolute(allocation.PROFILE_DIR) && basename(allocation.PROFILE_DIR) === profile, 'Missing L2 PROFILE_DIR; rerun pnpm wt dev')
  assert.match(allocation.PLUGIN || '', /^omnimux(?:-[a-z0-9-]+)?$/, 'Invalid L2 plugin')
  return { target, profile, url: address.href, allocation: { profileDir: allocation.PROFILE_DIR, plugin: allocation.PLUGIN, source: allocation.SOURCE } }
}

export function verifyL2Runtime(target, exec = execFileSync) {
  const { profileDir, plugin, source } = target.allocation
  const port = new URL(target.url).port
  assert.equal(readFileSync(join(profileDir, 'port.txt'), 'utf8').trim(), port, 'L2 profile port changed')
  const linked = join(profileDir, 'node_modules', plugin)
  assert.ok(lstatSync(linked).isSymbolicLink(), 'L2 plugin is not linked')
  assert.equal(realpathSync(linked), realpathSync(join(source, plugin)), 'L2 is running another worktree source')
  const pid = readFileSync(join(profileDir, 'host.pid'), 'utf8').trim()
  assert.match(pid, /^[1-9][0-9]*$/, 'Invalid L2 Host PID')
  const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  assert.ok(exec('lsof', ['-nP', '-a', '-p', pid, `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], options).split('\n').includes(`p${pid}`), 'Allocated L2 Host is not listening on its port')
  assert.ok(exec('ps', ['-p', pid, '-o', 'command='], options).split(/\s+/).includes(target.profile), 'L2 Host profile does not match allocation')
  const startedAt = exec('ps', ['-p', pid, '-o', 'lstart='], options).trim()
  assert.ok(startedAt, 'Missing L2 process identity')
  return { profileDir, plugin, source: realpathSync(linked), pid, port, startedAt }
}

export async function runLiveQa(args, { root = process.cwd(), now = () => Date.now() } = {}) {
  const report = { runId: randomUUID(), commitSha: null, target: null, profile: null, url: null, stage: null, targets: [], assertions: [], screenshots: [], pass: false, status: 'failed', startedAt: new Date(now()).toISOString(), completedAt: null, errors: [] }
  const reportPath = join(root, 'docs/evidence/live-qa-report.json')
  let evidenceDir = join(root, '.workbuddy/evidence/live-qa', report.runId)
  try {
    report.commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    report.dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim())
    const { values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { target: { type: 'string', default: 'dev' }, url: { type: 'string' }, 'evidence-dir': { type: 'string' } } })
    assert.equal(positionals.length, 1, 'Usage: pnpm verify:live <stage|all> [--target=l2 --url=<allocated URL>]')
    report.stage = positionals[0]
    const stages = selectStages(report.stage)
    Object.assign(report, resolveTarget(values, root))
    if (report.target === 'l2') report.runtime = verifyL2Runtime(report)
    const candidateEvidenceDir = values['evidence-dir'] ? resolve(root, values['evidence-dir'], report.runId) : evidenceDir
    const allowedEvidenceRoot = resolve(root, '.workbuddy/evidence/live-qa')
    const evidenceRelative = relative(allowedEvidenceRoot, candidateEvidenceDir)
    assert.ok(evidenceRelative && !evidenceRelative.startsWith('..') && !evidenceRelative.includes('/../'), '--evidence-dir must stay under .workbuddy/evidence/live-qa')
    evidenceDir = candidateEvidenceDir
    report.evidenceDir = evidenceDir
    mkdirSync(evidenceDir, { recursive: true })
    const registry = await captureStageContracts(root)
    report.targets = registry.filter(entry => stages.includes(entry.stage))
    assert.ok(report.targets.length, 'Zero stage targets')
    report.assertions.push({ name: 'actual-sidebar-contracts', pass: true, count: report.targets.length })
    const expiresAt = new Date(now() + 15 * 60_000).toISOString()
    const requestPath = join(evidenceDir, 'ego-browser-qa-request.json')
    const request = { version: 1, root, runId: report.runId, commitSha: report.commitSha, target: report.target, profile: report.profile, url: report.url, allocation: report.allocation || null, runtime: report.runtime || null, stage: report.stage, targets: report.targets, sidebarSelectors: registry.map(entry => entry.selector), evidenceDir, reportPath, createdAt: new Date(now()).toISOString(), expiresAt, consumedAt: null }
    writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    report.requestPath = requestPath; report.expiresAt = expiresAt; report.status = 'pending'
    report.errors.push('Pending ego-browser execution: follow docs/contracts/plugin-qa.md, import scripts/ego-live-qa.mjs in an ego-browser nodejs heredoc, and call runPreparedQa(requestPath, { tab }); missing ego capabilities are BLOCKED, not PASS')
  } catch (error) { report.errors.push(error instanceof Error ? error.message : String(error)) } finally {
    report.completedAt = new Date(now()).toISOString(); report.evidenceDir = evidenceDir
    mkdirSync(evidenceDir, { recursive: true }); mkdirSync(dirname(reportPath), { recursive: true })
    const json = `${JSON.stringify(report, null, 2)}\n`
    writeFileSync(join(evidenceDir, 'live-qa-report.json'), json, { mode: 0o600 }); writeFileSync(reportPath, json, { mode: 0o600 })
  }
  return report
}
