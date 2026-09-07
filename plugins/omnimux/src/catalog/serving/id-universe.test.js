import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gatewayCandidates, toProductId } from './id-universe.js'

const grokIds = ['grok-imagine-image-2', 'grok-imagine-image', 'grok-imagine-image-2-0', 'grok-imagine-image-2.0']

for (const id of grokIds) {
  test(`Grok gateway candidates keep product ID first for ${id}`, () => {
    assert.equal(toProductId(` ${id} `), grokIds[0])
    assert.deepEqual(gatewayCandidates(id), grokIds)
  })
}

for (const [productId, alias] of [
  ['seedance-2-0', 'seedance-2.0'],
  ['seedance-2-0-fast', 'seedance-2.0-fast'],
  ['seedance-2-0-mini', 'seedance-2.0-mini'],
  ['seedance-2-5', 'seedance-2.5'],
  ['wan-3.0', 'wan3.0-video'],
  ['minimax-h3', 'MiniMax-H3'],
  ['grok-imagine-video-1-5', 'grok-imagine-video-1.5'],
]) {
  test(`${productId} uses only the documented case-sensitive alias`, () => {
    assert.deepEqual(gatewayCandidates(productId), [productId, alias])
    assert.deepEqual(gatewayCandidates(alias), [productId, alias])
    assert.equal(toProductId(alias), productId)
  })
}

test('IDs without registrations or aliases never guess another model', () => {
  for (const id of ['gpt-image-2', 'grok-imagine-video', 'grok-imagine-image-quality', 'grok-imagine-image-3', 'minimax-H3', '__proto__']) {
    assert.deepEqual(gatewayCandidates(id), [id])
  }
  for (const id of ['', '  ', null, undefined, 2, {}]) assert.deepEqual(gatewayCandidates(id), [])
})

test('documented aliases outside the auto manifest remain normalized', () => {
  assert.deepEqual(gatewayCandidates('nanobanana-2'), ['nano_banana_2', 'nanobanana-2'])
})

test('callers cannot mutate the candidate registry', () => {
  gatewayCandidates(grokIds[0]).reverse().push('foreign-model')
  assert.deepEqual(gatewayCandidates(grokIds[0]), grokIds)
})
