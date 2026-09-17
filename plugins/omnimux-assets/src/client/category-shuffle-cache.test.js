import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CategoryShuffleCache, shuffleArray } from './category-shuffle-cache.js'

describe('shuffleArray', () => {
  it('handles empty and single-element arrays safely', () => {
    assert.deepEqual(shuffleArray([]), [])
    assert.deepEqual(shuffleArray([42]), [42])
    assert.deepEqual(shuffleArray(null), [])
  })

  it('maintains all elements without mutation of original array', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const originalCopy = [...original]
    const shuffled = shuffleArray(original)

    assert.equal(shuffled.length, original.length)
    assert.deepEqual(original, originalCopy, 'original array must not be mutated')
    assert.deepEqual([...shuffled].sort(), [...original].sort())
  })
})

describe('CategoryShuffleCache', () => {
  it('caches shuffled items and returns the exact same array reference for subsequent gets', () => {
    const cache = new CategoryShuffleCache(10)
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

    const first = cache.getOrShuffle('character', items)
    assert.equal(first.length, 4)
    assert.equal(cache.has('character'), true)

    const second = cache.getOrShuffle('character', items)
    assert.strictEqual(first, second, 'must return identical array reference during session')
  })

  it('clears all cached shuffles on manual clear/refresh', () => {
    const cache = new CategoryShuffleCache(10)
    const items = [{ id: '1' }, { id: '2' }, { id: '3' }]

    cache.getOrShuffle('scene', items)
    assert.equal(cache.has('scene'), true)

    cache.clear()
    assert.equal(cache.has('scene'), false)
    assert.equal(cache.get('scene'), undefined)
  })

  it('evicts oldest entries when exceeding maxEntries capacity', () => {
    const cache = new CategoryShuffleCache(2)
    cache.set('c1', [1])
    cache.set('c2', [2])
    assert.equal(cache.has('c1'), true)
    assert.equal(cache.has('c2'), true)

    cache.set('c3', [3])
    assert.equal(cache.has('c1'), false, 'oldest entry c1 should be evicted')
    assert.equal(cache.has('c2'), true)
    assert.equal(cache.has('c3'), true)
  })
})
