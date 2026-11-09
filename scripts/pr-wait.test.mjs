import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluatePr, main, parseArgs, summarizeChecks, waitForPr } from './pr-wait.mjs'

function pr(overrides = {}) {
  return { number: 12, state: 'OPEN', statusCheckRollup: [], ...overrides }
}

function checks(...states) {
  return states.map((state, index) => ({
    __typename: 'CheckRun',
    name: `check-${index}`,
    status: state === 'SUCCESS' ? 'COMPLETED' : 'IN_PROGRESS',
    conclusion: state === 'SUCCESS' ? 'SUCCESS' : state === 'IN_PROGRESS' ? null : state,
  }))
}

test('summarizeChecks treats pending and failure states explicitly', () => {
  assert.deepEqual(summarizeChecks([]), { total: 0, hasChecks: false, failures: [], pending: [] })
  const pending = summarizeChecks(checks('IN_PROGRESS'))
  assert.equal(pending.hasChecks, true)
  assert.deepEqual(pending.pending, ['IN_PROGRESS'])
  const failed = summarizeChecks(checks('FAILURE'))
  assert.deepEqual(failed.failures, ['FAILURE'])
})

test('evaluatePr waits for checks and fails on a failed check', () => {
  assert.equal(evaluatePr(pr({ statusCheckRollup: checks('IN_PROGRESS') }), 'checks').status, 'wait')
  assert.equal(evaluatePr(pr({ statusCheckRollup: [] }), 'checks').status, 'wait')
  assert.equal(evaluatePr(pr({ statusCheckRollup: checks('SUCCESS') }), 'checks').status, 'pass')
  const failed = evaluatePr(pr({ statusCheckRollup: checks('SUCCESS', 'FAILURE') }), 'checks')
  assert.equal(failed.status, 'fail')
  assert.match(failed.reason, /FAILURE/)
  assert.equal(evaluatePr(pr({ statusCheckRollup: checks('STARTUP_FAILURE') }), 'checks').status, 'fail')
  assert.equal(evaluatePr(pr({ statusCheckRollup: checks('STALE') }), 'checks').status, 'fail')
  assert.equal(evaluatePr(pr({ statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SKIPPED' }] }), 'checks').status, 'pass')
  const statusContext = [{ __typename: 'StatusContext', context: 'legacy/check', state: 'SUCCESS' }]
  assert.equal(evaluatePr(pr({ statusCheckRollup: statusContext }), 'checks').status, 'pass')
  const pendingContext = [{ __typename: 'StatusContext', context: 'legacy/check', state: 'PENDING' }]
  assert.equal(evaluatePr(pr({ statusCheckRollup: pendingContext }), 'checks').status, 'wait')
})

test('evaluatePr treats MERGED with identity as pass and CLOSED as fail', () => {
  assert.equal(evaluatePr({ state: 'MERGED', mergedAt: 'now', mergeCommit: { oid: 'abc' } }, 'merged').status, 'pass')
  assert.equal(evaluatePr({ state: 'MERGED' }, 'merged').status, 'fail')
  assert.equal(evaluatePr({ state: 'CLOSED' }, 'merged').status, 'fail')
  assert.equal(evaluatePr(pr({ statusCheckRollup: checks('SUCCESS') }), 'merged').status, 'wait')
})

test('waitForPr polls until checks pass without leaving the process stuck', async () => {
  let now = 0
  const responses = [pr({ statusCheckRollup: checks('IN_PROGRESS') }), pr({ statusCheckRollup: checks('SUCCESS') })]
  const result = await waitForPr(
    { pr: '12', until: 'checks', repo: 'owner/repo', intervalMs: 1000, timeoutMs: 10_000 },
    { now: () => now, sleep: async ms => { now += ms }, query: () => responses.shift(), log: () => {} },
  )
  assert.equal(result.ok, true)
  assert.equal(result.status, 'pass')
  assert.equal(result.polls, 2)
  assert.equal(result.pr.number, 12)
})

test('waitForPr reports timeout instead of pretending success', async () => {
  let now = 0
  const result = await waitForPr(
    { pr: '12', until: 'merged', repo: 'owner/repo', intervalMs: 1000, timeoutMs: 2000 },
    { now: () => now, sleep: async ms => { now += ms }, query: () => pr({ statusCheckRollup: checks('SUCCESS') }), log: () => {} },
  )
  assert.equal(result.ok, false)
  assert.equal(result.status, 'timeout')
})

test('waitForPr caps sleep at the remaining timeout budget', async () => {
  let now = 0
  const result = await waitForPr(
    { pr: '12', until: 'merged', repo: 'owner/repo', intervalMs: 30_000, timeoutMs: 2_000 },
    { now: () => now, sleep: async ms => { now += ms }, query: () => pr({ statusCheckRollup: checks('SUCCESS') }), log: () => {} },
  )
  assert.equal(result.ok, false)
  assert.equal(result.status, 'timeout')
  assert.equal(result.elapsedMs, 2_000)
})

test('parseArgs requires a PR, a supported condition, and positive timings', () => {
  assert.deepEqual(parseArgs(['--pr', '12', '--until', 'checks']).until, 'checks')
  assert.throws(() => parseArgs([]), /--pr is required/)
  assert.throws(() => parseArgs(['--pr', '12']), /--until is required/)
  assert.throws(() => parseArgs(['--pr', '0', '--until', 'checks']), /positive integer/)
  assert.throws(() => parseArgs(['--pr', '12', '--until', 'done']), /checks or merged/)
  assert.throws(() => parseArgs(['--pr', '12', '--until', 'checks', '--nope']), /unknown argument/)
})

test('main emits clean JSON and maps pass/fail/timeout to exit codes', async () => {
  const writes = []
  const original = process.stdout.write
  process.stdout.write = chunk => { writes.push(String(chunk)); return true }
  try {
    const pass = await main(
      ['--pr', '12', '--until', 'merged', '--json'],
      { query: () => ({ number: 12, state: 'MERGED', mergedAt: 'now', mergeCommit: { oid: 'abc' } }), now: () => 0 },
    )
    assert.equal(pass, 0)
    assert.equal(JSON.parse(writes.join('')).ok, true)

    const fail = await main(
      ['--pr', '12', '--until', 'checks', '--json'],
      { query: () => pr({ statusCheckRollup: checks('FAILURE') }), now: () => 0 },
    )
    assert.equal(fail, 1)

    let now = 0
    const timeout = await main(
      ['--pr', '12', '--until', 'merged', '--interval', '1', '--timeout', '2', '--json'],
      {
        query: () => pr({ statusCheckRollup: checks('SUCCESS') }),
        now: () => now,
        sleep: async ms => { now += ms },
      },
    )
    assert.equal(timeout, 2)
  } finally {
    process.stdout.write = original
  }
})
