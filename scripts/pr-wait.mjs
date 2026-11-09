#!/usr/bin/env node
/**
 * pr-wait — bounded, background-friendly waiter for PR checks and Merge Queue.
 *
 * Why: an agent that polls with `sleep 60; gh pr view` burns whole model turns
 * on wall-clock waiting. Run this once through the harness background-job
 * facility; it polls inside one process and exits when the condition is met,
 * failed, or timed out. The completion notification is the resume trigger.
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_REPO = process.env.OMNIMUX_PR_REPO || 'omnimux-ai/omnimux-dsh'
const DEFAULT_INTERVAL_SECONDS = 20
const DEFAULT_TIMEOUT_SECONDS = 1800

const FAILURE_STATES = new Set(['FAILURE', 'FAILED', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE'])
const PENDING_STATES = new Set(['PENDING', 'QUEUED', 'IN_PROGRESS', 'REQUESTED', 'WAITING', 'EXPECTED', ''])

function positiveInteger(value, name) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`)
  return parsed
}

export function parseArgs(argv) {
  const options = {
    pr: '',
    until: '',
    repo: DEFAULT_REPO,
    intervalMs: DEFAULT_INTERVAL_SECONDS * 1000,
    timeoutMs: DEFAULT_TIMEOUT_SECONDS * 1000,
    json: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new Error(`missing value for ${arg}`)
      i += 1
      return argv[i]
    }
    if (arg === '--pr') options.pr = String(positiveInteger(next(), '--pr'))
    else if (arg === '--until') {
      const until = next()
      if (until !== 'checks' && until !== 'merged') throw new Error('--until must be checks or merged')
      options.until = until
    } else if (arg === '--repo') options.repo = next()
    else if (arg === '--interval') options.intervalMs = positiveInteger(next(), '--interval') * 1000
    else if (arg === '--timeout') options.timeoutMs = positiveInteger(next(), '--timeout') * 1000
    else if (arg === '--json') options.json = true
    else throw new Error(`unknown argument: ${arg}`)
  }
  if (!options.pr) throw new Error('--pr is required')
  if (!options.until) throw new Error('--until is required')
  return options
}

/** Normalize both check-run and status-context entries into one verdict. */
export function summarizeChecks(rollup) {
  const entries = Array.isArray(rollup) ? rollup : []
  const states = entries.map(entry => String(entry?.conclusion || entry?.state || entry?.status || '').toUpperCase())
  const failures = states.filter(state => FAILURE_STATES.has(state))
  const pending = states.filter(state => PENDING_STATES.has(state))
  return { total: entries.length, hasChecks: entries.length > 0, failures, pending }
}

/**
 * Evaluate a `gh pr view` snapshot.
 * @param {object|null} pr
 * @param {'checks'|'merged'} until
 * @returns {{status: 'pass'|'fail'|'wait', reason: string, checks: ReturnType<typeof summarizeChecks>}}
 */
export function evaluatePr(pr, until) {
  const checks = summarizeChecks(pr?.statusCheckRollup)
  const state = String(pr?.state || '').toUpperCase()

  if (state === 'MERGED') {
    if (pr?.mergedAt && pr?.mergeCommit?.oid) return { status: 'pass', reason: 'merged', checks }
    return { status: 'fail', reason: 'MERGED without merge identity', checks }
  }
  if (state === 'CLOSED') return { status: 'fail', reason: 'PR closed without merge', checks }
  if (checks.failures.length > 0) {
    return { status: 'fail', reason: `checks failed: ${checks.failures.join(', ')}`, checks }
  }
  if (until === 'checks') {
    if (!checks.hasChecks) return { status: 'wait', reason: 'no checks reported yet', checks }
    if (checks.pending.length > 0) return { status: 'wait', reason: `checks pending: ${checks.pending.join(', ')}`, checks }
    return { status: 'pass', reason: 'checks passed', checks }
  }
  return { status: 'wait', reason: `state=${state || 'UNKNOWN'}`, checks }
}

function snapshot(pr) {
  return {
    number: pr?.number ?? null,
    url: pr?.url ?? null,
    state: pr?.state ?? null,
    headRefOid: pr?.headRefOid ?? null,
    mergedAt: pr?.mergedAt ?? null,
    mergeCommit: pr?.mergeCommit?.oid ?? null,
  }
}

export function queryPr(prNumber, repo) {
  const result = spawnSync('gh', [
    'pr', 'view', String(prNumber), '--repo', repo, '--json',
    'number,url,state,headRefOid,mergeStateStatus,statusCheckRollup,mergedAt,mergeCommit',
  ], { encoding: 'utf8', timeout: 60_000 })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'gh pr view failed').trim())
  return JSON.parse(result.stdout)
}

/**
 * Poll one PR until the requested condition settles.
 * @param {{pr: string, until: 'checks'|'merged', repo: string, intervalMs: number, timeoutMs: number}} options
 * @param {{query?: Function, sleep?: Function, now?: Function, log?: Function}} deps
 */
export async function waitForPr(options, deps = {}) {
  const query = deps.query || queryPr
  const sleep = deps.sleep || (ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms)))
  const now = deps.now || (() => Date.now())
  const log = deps.log || (() => {})
  const startedAt = now()
  let polls = 0
  let lastReason = ''

  for (;;) {
    polls += 1
    const pr = await query(options.pr, options.repo)
    const verdict = evaluatePr(pr, options.until)
    if (verdict.reason !== lastReason) {
      log(`[pr-wait] #${options.pr} ${verdict.status}: ${verdict.reason} (poll ${polls})`)
      lastReason = verdict.reason
    }
    if (verdict.status === 'pass') {
      return { ok: true, status: 'pass', reason: verdict.reason, checks: verdict.checks, polls, elapsedMs: now() - startedAt, pr: snapshot(pr) }
    }
    if (verdict.status === 'fail') {
      return { ok: false, status: 'fail', reason: verdict.reason, checks: verdict.checks, polls, elapsedMs: now() - startedAt, pr: snapshot(pr) }
    }
    if (now() - startedAt >= options.timeoutMs) {
      return { ok: false, status: 'timeout', reason: `timed out after ${Math.round(options.timeoutMs / 1000)}s`, checks: verdict.checks, polls, elapsedMs: now() - startedAt, pr: snapshot(pr) }
    }
    await sleep(options.intervalMs)
  }
}

export async function main(argv = process.argv.slice(2)) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    process.stderr.write(`[pr-wait] ${error.message}\n`)
    return 2
  }
  let result
  try {
    result = await waitForPr(options, { log: line => (options.json ? process.stderr : process.stdout).write(`${line}\n`) })
  } catch (error) {
    process.stderr.write(`[pr-wait] ERROR ${error.message}\n`)
    return 2
  }
  if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  else process.stdout.write(`[pr-wait] ${result.status.toUpperCase()} ${result.reason} (${result.polls} polls, ${Math.round(result.elapsedMs / 1000)}s)\n`)
  return result.ok ? 0 : result.status === 'timeout' ? 2 : 1
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await main()
}
