/**
 * 有上限缓存的容量与淘汰顺序。
 *
 * 这三件事决定缓存是不是真的安全：放不下时淘汰谁、命中后新鲜度怎么算、条件顺序不同
 * 会不会被当成两条。任何一条错了，要么内存无限涨，要么切分类时把还要用的页挤掉。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { LruCache } from './lru-cache.js'

describe('LruCache capacity', () => {
  it('never grows past its capacity', () => {
    const cache = new LruCache(3)
    for (let index = 0; index < 50; index += 1) cache.set(`k${index}`, index)
    assert.equal(cache.size, 3)
  })

  it('evicts the least recently used, not the first written', () => {
    const cache = new LruCache(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    // 读一次 a，把它挪到最新端；下一个挤进来的应该是 b。
    assert.equal(cache.get('a'), 1)
    cache.set('d', 4)
    assert.equal(cache.has('b'), false, 'b 是最久未用的，应该被淘汰')
    assert.equal(cache.has('a'), true, 'a 刚被读过，必须留下')
    assert.equal(cache.has('c'), true)
    assert.equal(cache.has('d'), true)
  })

  it('reports a miss as undefined rather than throwing', () => {
    const cache = new LruCache(2)
    assert.equal(cache.get('nothing'), undefined)
  })

  it('rewriting a key does not consume a second slot', () => {
    const cache = new LruCache(2)
    cache.set('a', 1)
    cache.set('a', 2)
    assert.equal(cache.size, 1)
    assert.equal(cache.get('a'), 2)
  })

  it('refuses a capacity that cannot hold anything', () => {
    assert.throws(() => new LruCache(0), RangeError)
    assert.throws(() => new LruCache(-1), RangeError)
    assert.throws(() => new LruCache('many'), RangeError)
  })

  it('clears everything on demand', () => {
    const cache = new LruCache(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.clear()
    assert.equal(cache.size, 0)
    assert.equal(cache.has('a'), false)
  })
})

describe('LruCache.keyOf', () => {
  it('treats the same filter set in a different order as one key', () => {
    const first = LruCache.keyOf('character', ['1female', '1youth'], 0)
    const second = LruCache.keyOf('character', ['1youth', '1female'], 0)
    assert.equal(first, second)
  })

  it('keeps different scopes and pages apart', () => {
    const keys = [
      LruCache.keyOf('character', '', 0),
      LruCache.keyOf('character', '', 1),
      LruCache.keyOf('scene', '', 0),
      LruCache.keyOf('character', ['1female'], 0),
    ]
    assert.equal(new Set(keys).size, keys.length)
  })

  it('normalises absent parts so they never collide with a real value', () => {
    assert.equal(LruCache.keyOf('scene', undefined, 0), LruCache.keyOf('scene', null, 0))
    assert.notEqual(LruCache.keyOf('scene', '', 0), LruCache.keyOf('scene', 'indoor', 0))
  })
})
