import test from 'node:test'
import assert from 'node:assert/strict'
import { RatioCache } from './ratio-cache.js'

test('RatioCache: 纯内存 LRU 存取与上限淘汰 (AC-1)', () => {
  const cache = new RatioCache({ capacity: 3, storage: null })
  assert.equal(cache.get('a'), undefined)
  assert.equal(cache.has('a'), false)

  cache.set('a', 0.5)
  cache.set('b', 0.75)
  cache.set('c', 1.0)
  assert.equal(cache.size, 3)
  assert.equal(cache.get('a'), 0.5)

  // 写入第 4 个，最久未用的 b 应该被淘汰（因为 a 刚被 get 过）
  cache.set('d', 1.5)
  assert.equal(cache.size, 3)
  assert.equal(cache.has('b'), false)
  assert.equal(cache.has('a'), true)
  assert.equal(cache.has('c'), true)
  assert.equal(cache.has('d'), true)
})

test('RatioCache: 模拟 localStorage 持久化恢复与清空 (AC-1)', () => {
  const store = new Map()
  const mockStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }

  const c1 = new RatioCache({ capacity: 10, storageKey: 'test_ratios', storage: mockStorage })
  c1.set('img1', 0.5625)
  c1.set('img2', 0.75)
  assert.ok(store.has('test_ratios'))

  // 创建新实例，应该从 storage 自动恢复
  const c2 = new RatioCache({ capacity: 10, storageKey: 'test_ratios', storage: mockStorage })
  assert.equal(c2.size, 2)
  assert.equal(c2.get('img1'), 0.5625)
  assert.equal(c2.get('img2'), 0.75)

  c2.clear()
  assert.equal(c2.size, 0)
  assert.equal(store.has('test_ratios'), false)
})

test('RatioCache: 非法比例值容错', () => {
  const cache = new RatioCache({ storage: null })
  cache.set('bad1', 0)
  cache.set('bad2', -1)
  cache.set('bad3', Number.NaN)
  assert.equal(cache.has('bad1'), false)
  assert.equal(cache.has('bad2'), false)
  assert.equal(cache.has('bad3'), false)
})
