import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { hasChildExited, waitForChildExit, stopOwnedChild } from './child-lifecycle.mjs'

/**
 * Fake child. Exit state is explicit so a case can prove "exited without ever emitting `close`",
 * which is exactly what a Chrome helper holding the inherited stderr pipe produces.
 */
function fakeChild({ exitCode = null, signalCode = null, onKill = null } = {}) {
  const child = new EventEmitter()
  child.exitCode = exitCode
  child.signalCode = signalCode
  child.killed = []
  child.kill = signal => {
    child.killed.push(signal)
    onKill?.(signal, child)
    return true
  }
  child.exit = ({ code = 0, signal = null } = {}) => {
    child.exitCode = code
    child.signalCode = signal
    child.emit('exit', code, signal)
  }
  return child
}

test('hasChildExited reads exit state instead of event bookkeeping', () => {
  assert.equal(hasChildExited(null), true)
  assert.equal(hasChildExited(fakeChild()), false)
  assert.equal(hasChildExited(fakeChild({ exitCode: 0 })), true)
  assert.equal(hasChildExited(fakeChild({ signalCode: 'SIGTERM' })), true)
})

test('an already exited child resolves without waiting', async () => {
  const child = fakeChild({ exitCode: 0 })
  assert.equal(await waitForChildExit(child, { timeoutMs: 5 }), true)
})

test('exit without close is a completed stop (regression: stdio close is not a precondition)', async () => {
  const child = fakeChild()
  const pending = waitForChildExit(child, { timeoutMs: 200 })
  child.exit({ code: 0 })
  assert.equal(await pending, true)
})

test('a child that never exits fails after the timeout instead of hanging', async () => {
  const child = fakeChild()
  const startedAt = Date.now()
  assert.equal(await waitForChildExit(child, { timeoutMs: 30 }), false)
  assert.ok(Date.now() - startedAt < 2000)
})

test('stopOwnedChild stops a child that honours SIGTERM', async () => {
  const child = fakeChild({ onKill: signal => { if (signal === 'SIGTERM') child.exit({ signal: 'SIGTERM' }) } })
  const verdict = await stopOwnedChild(child, { timeoutMs: 50 })
  assert.deepEqual(verdict, { stopped: true, signals: ['SIGTERM'], killErrors: [] })
  assert.deepEqual(child.killed, ['SIGTERM'])
})

test('stopOwnedChild escalates to SIGKILL only after SIGTERM failed', async () => {
  const child = fakeChild({ onKill: signal => { if (signal === 'SIGKILL') child.exit({ signal: 'SIGKILL' }) } })
  const verdict = await stopOwnedChild(child, { timeoutMs: 30 })
  assert.equal(verdict.stopped, true)
  assert.deepEqual(verdict.signals, ['SIGTERM', 'SIGKILL'])
})

test('stopOwnedChild reports an unkillable child as not stopped', async () => {
  const child = fakeChild()
  const verdict = await stopOwnedChild(child, { timeoutMs: 20 })
  assert.equal(verdict.stopped, false)
  assert.deepEqual(verdict.signals, ['SIGTERM', 'SIGKILL'])
})

test('stopOwnedChild sends no signal to an already exited child', async () => {
  const child = fakeChild({ exitCode: 0 })
  const verdict = await stopOwnedChild(child, { timeoutMs: 20 })
  assert.deepEqual(verdict, { stopped: true, signals: [], killErrors: [] })
  assert.deepEqual(child.killed, [])
})

test('kill failures are returned instead of swallowed', async () => {
  const child = fakeChild()
  const verdict = await stopOwnedChild(child, {
    timeoutMs: 20,
    kill: () => { throw new Error('ESRCH') },
  })
  assert.equal(verdict.stopped, false)
  assert.deepEqual(verdict.killErrors, [
    { signal: 'SIGTERM', message: 'ESRCH' },
    { signal: 'SIGKILL', message: 'ESRCH' },
  ])
})
