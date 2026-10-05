// history-cache 纯逻辑回归：往返、逐账号拒绝、版本信封、损坏清理与上限。
// 来源：OmniMux/web/src/features/influencer/__tests__/history-cache.test.ts（只读真源）。
// 本文件自带最小 localStorage 桩，不引入 React。

import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  clearHistoryCache,
  readHistoryCache,
  writeHistoryCache,
} from './lib/history-cache.js'
import { STORAGE_KEYS } from './lib/types.js'

const KEY = STORAGE_KEYS.historyCache
const USER = 7

/** 最小 localStorage 桩：语义与浏览器实现一致。 */
function makeStorage() {
  const map = new Map()
  return {
    getItem(key) {
      return map.has(String(key)) ? map.get(String(key)) : null
    },
    setItem(key, value) {
      map.set(String(key), String(value))
    },
    removeItem(key) {
      map.delete(String(key))
    },
    clear() {
      map.clear()
    },
    key(index) {
      return [...map.keys()][index] ?? null
    },
    get length() {
      return map.size
    },
  }
}

/** @param {object} [over] */
function rec(over = {}) {
  return { id: 1, task_id: 'task_1', status: 'SUCCESS', ...over }
}

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

/** 安装一个全新的存储桩。 */
function installStorage() {
  const store = makeStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    value: store,
    configurable: true,
    writable: true,
  })
  return store
}

beforeEach(() => {
  installStorage()
})

afterEach(() => {
  if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
  else delete globalThis.localStorage
})

describe('history cache', () => {
  it('round-trips terminal records with the server total for the same account', () => {
    writeHistoryCache(USER, [rec()], 42)

    const cached = readHistoryCache(USER)

    assert.deepEqual(cached?.items.map((item) => item.task_id), ['task_1'])
    assert.equal(cached?.total, 42)
    assert.equal(typeof cached?.savedAt, 'number')
  })

  it('drops a payload written for a different account instead of showing it', () => {
    writeHistoryCache(USER, [rec()], 1)

    assert.equal(readHistoryCache(USER + 1), null)
    assert.equal(localStorage.getItem(KEY), null)
  })

  it('drops a payload from an older cache version', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: 0, userId: USER, total: 1, items: [rec()] })
    )

    assert.equal(readHistoryCache(USER), null)
  })

  it('returns null and clears a corrupted payload', () => {
    localStorage.setItem(KEY, '{not json')

    assert.equal(readHistoryCache(USER), null)
    assert.equal(localStorage.getItem(KEY), null)
  })

  it('caches only terminal records', () => {
    writeHistoryCache(
      USER,
      [rec(), rec({ id: 2, task_id: 'task_2', status: 'IN_PROGRESS' })],
      2
    )

    assert.deepEqual(readHistoryCache(USER)?.items.map((item) => item.task_id), ['task_1'])
  })

  it('keeps at most the newest 60 records', () => {
    const items = Array.from({ length: 80 }, (_, index) =>
      rec({ id: index + 1, task_id: `task_${index + 1}` })
    )

    writeHistoryCache(USER, items, items.length)

    assert.equal(readHistoryCache(USER)?.items.length, 60)
  })

  it('writes nothing when no record has finished', () => {
    writeHistoryCache(USER, [rec({ status: 'QUEUED' })], 1)

    assert.equal(localStorage.getItem(KEY), null)
  })

  it('degrades silently when storage refuses the write', () => {
    localStorage.setItem = () => {
      throw new Error('quota exceeded')
    }

    assert.doesNotThrow(() => writeHistoryCache(USER, [rec()], 1))
  })

  it('ignores a missing account id on both read and write', () => {
    assert.equal(readHistoryCache(undefined), null)

    writeHistoryCache(undefined, [rec()], 1)

    assert.equal(localStorage.getItem(KEY), null)
  })

  it('clears the cache on demand', () => {
    writeHistoryCache(USER, [rec()], 1)

    clearHistoryCache()

    assert.equal(readHistoryCache(USER), null)
  })

  it('returns null when storage itself is unavailable', () => {
    delete globalThis.localStorage

    assert.equal(readHistoryCache(USER), null)
    assert.doesNotThrow(() => writeHistoryCache(USER, [rec()], 1))
    assert.doesNotThrow(() => clearHistoryCache())
  })

  it('survives a payload whose items are not an array', () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, userId: USER, items: 'nope' }))

    assert.equal(readHistoryCache(USER), null)
    assert.equal(localStorage.getItem(KEY), null)
  })
})
