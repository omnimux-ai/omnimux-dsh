// @ts-nocheck — 纯 JS 测试语法（写前测试门禁口径）。
import assert from 'node:assert/strict'
import test, { afterEach, beforeEach } from 'node:test'
import { handleMoveToTop, handleResetOrder, reportHomeOrderWriteFailure } from './plaza/plazaUtils.js'

/**
 * Issue #3528：首页自定义排序写失败必须在客户端留痕，不得静默吞掉；
 * 本地乐观状态与后续交互不受影响，也不能产生 unhandled rejection。
 */

let warnings = []
const originalWarn = console.warn

beforeEach(() => {
  warnings = []
  console.warn = (message) => {
    warnings.push(String(message))
  }
})

afterEach(() => {
  console.warn = originalWarn
})

function failingApi() {
  return () => Promise.reject(new Error('home custom order not saved: home order state not writable (EACCES)'))
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve))
}

test('handleMoveToTop：乐观顺序保留，失败 warn 一次且无 unhandled rejection', async () => {
  const seen = []
  const state = {
    setCustomOrder(value) {
      seen.push(value)
    },
  }
  const unhandled = []
  const onUnhandled = (reason) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  try {
    handleMoveToTop('b', [{ id: 'a' }, { id: 'b' }], state, failingApi())
    await tick()
    assert.deepEqual(seen, [['b', 'a']], 'optimistic local order must still be applied')
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /^\[omnimux-market\] home custom order write failed \(move-to-top\): .*not writable \(EACCES\)$/)
    assert.deepEqual(unhandled, [])
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
})

test('handleResetOrder：重置状态保留，失败 warn 一次且无 unhandled rejection', async () => {
  const seen = []
  const state = {
    setCustomOrder(value) {
      seen.push(value)
    },
  }
  const unhandled = []
  const onUnhandled = (reason) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  try {
    handleResetOrder(state, failingApi())
    await tick()
    assert.deepEqual(seen, [null], 'reset must clear the local custom order optimistically')
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /^\[omnimux-market\] home custom order write failed \(reset\): .*not writable \(EACCES\)$/)
    assert.deepEqual(unhandled, [])
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
})

test('reportHomeOrderWriteFailure：非 Error 值可字符串化且从不抛错', () => {
  assert.doesNotThrow(() => reportHomeOrderWriteFailure('reset', 'boom'))
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /\(reset\): boom$/)
  assert.doesNotThrow(() => reportHomeOrderWriteFailure('move-to-top', undefined))
  assert.match(warnings[1], /\(move-to-top\): undefined$/)
})

test('无 apiFn 时不发请求也不产生 warn', async () => {
  const seen = []
  const state = {
    setCustomOrder(value) {
      seen.push(value)
    },
  }
  handleResetOrder(state)
  await tick()
  assert.deepEqual(seen, [null])
  assert.equal(warnings.length, 0)
})

test('console.warn 被替换为抛错实现时仍不产生 unhandled rejection', async () => {
  const activeWarn = console.warn
  console.warn = () => {
    throw new Error('warn exploded')
  }
  const unhandled = []
  const onUnhandled = (reason) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  try {
    const seen = []
    handleResetOrder({ setCustomOrder(value) { seen.push(value) } }, failingApi())
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.deepEqual(seen, [null])
    assert.deepEqual(unhandled, [])
  } finally {
    process.off('unhandledRejection', onUnhandled)
    console.warn = activeWarn
  }
})
