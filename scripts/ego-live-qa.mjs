import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { assertPng, runStageProbe } from './live-stage-probe.mjs'
import { captureRuntimeProof, assertRuntimeProofStable } from './live-runtime-proof.mjs'
import { validateLiveQaReport } from './live-qa-validation.mjs'
import { consumeRequest, validateRequest, writeJson } from './live-qa-request.mjs'
import { boundedRead, evaluateCdp, iso, safeErrorMessage, sameUrl } from './live-browser-utils.mjs'
import { prepareEgoPage } from './live-page-preparation.mjs'
import { acquireTaskLock, releaseTaskLock } from './ego-task-lock.mjs'

export { createEgoPage } from './ego-browser-page.mjs'
export { prepareEgoPage } from './live-page-preparation.mjs'

export async function captureEgoPng(tab) {
  const response = await tab.cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  assert.match(response?.data || '', /^[A-Za-z0-9+/]+={0,2}$/, 'browser-transport: CDP PNG screenshot payload is missing')
  const bytes = Buffer.from(response.data, 'base64')
  assertPng(bytes)
  return bytes
}

function browserFor(tab) {
  return {
    js: expression => evaluateCdp(tab.cdp, expression, 12_000),
    click: selector => tab.click(selector),
    waitForElement: (selector, options) => tab.waitForElement(selector, options),
    captureScreenshot: () => captureEgoPng(tab),
  }
}

function reportBase(request, startedAt) {
  const { runId, commitSha, target, profile, url, stage, targets, sidebarSelectors, evidenceDir, reportPath, createdAt, expiresAt } = request
  return { runId, commitSha, target, profile, url, stage, targets, sidebarSelectors, evidenceDir, reportPath, createdAt, expiresAt, status: 'running', pass: false, errors: [], assertions: [], screenshots: [], tool: 'ego-browser', startedAt }
}

/** Execute one prepared request in the selected isolated ego task and tab. */
export async function runPreparedQa(requestPath, { tab, now = () => Date.now(), prepareOptions = {} } = {}) {
  let request
  let report
  let ownsRequest = false
  let taskLock
  try {
    assert.ok(existsSync(requestPath), 'Prepared QA request does not exist')
    request = JSON.parse(readFileSync(requestPath, 'utf8'))
    const root = validateRequest(requestPath, request, now())
    report = reportBase(request, iso(now()))
    assert.ok(tab?.tool === 'ego-browser' && tab?.cdp?.send && tab?.cdp?.readEvents && typeof tab?.click === 'function' && typeof tab?.waitForElement === 'function' && typeof tab?.url === 'function' && typeof tab?.assertIdentity === 'function', 'A complete ego browser page is required for QA')
    assert.ok(typeof tab.id === 'string' && tab.id.length > 0, 'Selected ego tab has no stable identity')
    assert.ok(Number.isSafeInteger(tab.taskSpaceId) && tab.taskSpaceId > 0, 'Selected ego task has no stable identity')
    const identity = await tab.assertIdentity()
    assert.deepEqual(identity, { taskSpaceId: tab.taskSpaceId, tabId: tab.id }, 'Selected ego identity is inconsistent')
    taskLock = acquireTaskLock(tab.taskSpaceId, request.runId, process.pid)
    const { toolTimeoutMs, fetchTimeoutMs, readyTimeoutMs, pollIntervalMs } = prepareOptions
    const preflight = await prepareEgoPage(tab, { toolTimeoutMs, fetchTimeoutMs, readyTimeoutMs, pollIntervalMs, url: request.url, target: request.target, now })
    report.preflight = preflight
    if (!preflight.ready) {
      report.phase = 'preflight'; report.failureKind = preflight.status
      throw new Error(`browser-preflight: ${preflight.status}: ${preflight.detail}`)
    }
    const preparedUrl = await boundedRead(() => tab.url(), Number.isFinite(toolTimeoutMs) ? Math.min(10_000, Math.max(1, toolTimeoutMs)) : 5_000)
    assert.ok(sameUrl(preparedUrl, request.url), 'browser-transport: selected ego tab URL does not match prepared request')
    const afterPreparation = JSON.parse(readFileSync(requestPath, 'utf8'))
    if (!isDeepStrictEqual(afterPreparation, request)) throw new Error('Prepared QA request changed during browser preparation')
    validateRequest(requestPath, afterPreparation, now())
    request = consumeRequest(requestPath, afterPreparation, now())
    ownsRequest = true
    report.consumedAt = request.consumedAt
    report.phase = 'probe'
    const actualUrl = await tab.url()
    assert.ok(sameUrl(actualUrl, request.url), 'browser-transport: selected ego tab URL does not match prepared request')
    report.tabId = tab.id; report.taskSpaceId = tab.taskSpaceId
    report.browserIdentity = { before: identity }
    const parsedActual = new URL(actualUrl)
    report.actualUrl = `${parsedActual.origin}${parsedActual.pathname}`
    const before = await captureRuntimeProof(tab, { root, targets: request.targets, url: request.url, target: request.target })
    const probe = await runStageProbe(browserFor(tab), { targets: request.targets, sidebarSelectors: request.sidebarSelectors, evidenceDir: request.evidenceDir, onProgress: value => { report.probe = value } })
    const after = await captureRuntimeProof(tab, { root, targets: request.targets, url: request.url, target: request.target })
    assertRuntimeProofStable(before, after)
    report.browserIdentity.after = await tab.assertIdentity()
    assert.deepEqual(report.browserIdentity.after, identity, 'ego task/tab identity changed during verification')
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), request.commitSha, 'Code SHA changed during verification')
    report.probe = probe; report.runtimeProof = { before, after }; report.assertions = probe.assertions; report.screenshots = probe.screenshots
    report.cleanup = { kind: 'workbench-restored', success: probe.assertions.some(item => item.name === 'initial-session-restored' && item.pass) && probe.assertions.some(item => item.name === 'initial-workbench-restored' && item.pass), tabRetained: true }
    report.completedAt = iso(now())
    report.status = 'completed'; report.pass = true
    validateLiveQaReport(report, request, { root, runId: request.runId, commitSha: request.commitSha, stage: request.stage, target: request.target })
  } catch (error) {
    report ||= { runId: request?.runId || 'rejected-request', status: 'failed', pass: false, errors: [], tool: 'ego-browser', startedAt: iso(now()) }
    report.status = 'failed'; report.pass = false
    if (!report.failureKind) report.failureKind = ownsRequest ? 'qa-failed' : 'request-invalid'
    report.errors.push(safeErrorMessage(error, Boolean(report && request && report.url)))
  } finally {
    if (taskLock) {
      try { releaseTaskLock(taskLock) } catch {
        report.status = 'failed'; report.pass = false
        report.failureKind = 'task-lock-release'
        report.errors.push('ego task lock could not be released; inspect the recorded owner before retrying')
      }
    }
    if (report) report.completedAt ||= iso(now())
    if (report && ownsRequest) {
      writeJson(join(request.evidenceDir, 'live-qa-report.json'), report)
      writeJson(request.reportPath, report)
    }
  }
  return report
}
