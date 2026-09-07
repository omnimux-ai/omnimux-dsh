import { test } from 'node:test'
import assert from 'node:assert/strict'
import { syncQaPassLabel } from './qa-label.mjs'

function run(pass, extra = {}) {
  const calls = []
  const result = syncQaPassLabel({
    prNumber: 605, repo: 'omnimux-ai/omnimux-dsh', pass,
    execCommand(command, args) { calls.push([command, ...args]); return { status: 0 } },
    ...extra,
  })
  return { calls, result }
}

test('CI removes stale qa:pass before adding a new success', () => {
  const { calls, result } = run(true)
  assert.deepEqual(calls.map(call => call.slice(-2)), [['--remove-label', 'qa:pass'], ['--add-label', 'qa:pass']])
  assert.deepEqual(calls[0].slice(0, -2), ['gh', 'pr', 'edit', '605', '--repo', 'omnimux-ai/omnimux-dsh'])
  assert.equal(result.ok, true)
  assert.equal(result.added, true)
})

test('failure and non-boolean verdicts only clear the label', () => {
  for (const pass of [false, undefined, null, 1, 'true']) {
    const { calls, result } = run(pass)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].at(-2), '--remove-label')
    assert.equal(result.added, false)
  }
})

test('dry-run and missing PR never execute gh', () => {
  for (const extra of [{ dryRun: true }, { prNumber: '' }]) {
    const { calls, result } = run(true, extra)
    assert.equal(calls.length, 0)
    assert.equal(result.skipped, true)
  }
})

test('removal failure stops the add and is reported instead of silently passing', () => {
  const calls = []
  const { result } = run(true, { execCommand(...args) { calls.push(args); return { status: 1, stderr: 'permission denied' } } })
  assert.equal(calls.length, 1)
  assert.equal(result.ok, false)
  assert.equal(result.added, false)
  assert.match(result.errors[0], /permission denied/)
})

test('add failure and thrown command errors fail label synchronization', () => {
  let count = 0
  const { result } = run(true, { execCommand() { return { status: ++count === 1 ? 0 : 1, stderr: 'failed' } } })
  assert.equal(result.removed, true)
  assert.equal(result.ok, false)
  assert.equal(run(false, { execCommand() { throw new Error('gh missing') } }).result.ok, false)
})
