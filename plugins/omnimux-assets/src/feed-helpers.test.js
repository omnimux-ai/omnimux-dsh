import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  citeOf,
  cleanRemovedSelection,
  computeEmptyState,
  countAssetsByType,
  errText,
  filterAndSortAssets,
  messageOf,
  parsePickedPathsResult,
  pickErrorText,
  toggleAssetIdInSet,
} from './client/feed-helpers.js'

describe('Assets feed pure helpers', () => {
  const dummyT = (key) => `t:${key}`

  describe('messageOf', () => {
    it('handles name-conflict specially', () => {
      const res = { ok: false, status: 409, body: { error: 'name-conflict' } }
      assert.equal(messageOf(res, dummyT), 't:error.nameConflict')
    })

    it('prefers body.message when present', () => {
      const res = { ok: false, status: 400, body: { message: 'Custom message' } }
      assert.equal(messageOf(res, dummyT), 'Custom message')
    })

    it('falls back to body.error', () => {
      const res = { ok: false, status: 400, body: { error: 'some-error-code' } }
      assert.equal(messageOf(res, dummyT), 'some-error-code')
    })

    it('falls back to status code', () => {
      const res = { ok: false, status: 500, body: {} }
      assert.equal(messageOf(res, dummyT), 'HTTP 500')
    })

    it('falls back to generic error', () => {
      assert.equal(messageOf({}, dummyT), 't:error.generic')
      assert.equal(messageOf(null, dummyT), 't:error.generic')
    })
  })

  describe('errText', () => {
    it('unwraps Error instances', () => {
      assert.equal(errText(new Error('boom')), 'boom')
    })

    it('stringifies non-Error thrown objects', () => {
      assert.equal(errText('network fail'), 'network fail')
      assert.equal(errText({ code: 123 }), '[object Object]')
    })
  })

  describe('pickErrorText', () => {
    it('maps picker-unsupported to translated string', () => {
      const res = { ok: false, body: { error: 'picker-unsupported' } }
      assert.equal(pickErrorText(res, dummyT), 't:error.pickerUnsupported')
    })

    it('maps picker-failed to translated string', () => {
      const res = { ok: false, body: { error: 'picker-failed' } }
      assert.equal(pickErrorText(res, dummyT), 't:error.pickerFailed')
    })

    it('falls back to messageOf for generic error codes', () => {
      const res = { ok: false, body: { error: 'custom' } }
      assert.equal(pickErrorText(res, dummyT), 'custom')
    })
  })

  describe('citeOf', () => {
    it('returns empty string for falsy asset', () => {
      assert.equal(citeOf(null), '')
      assert.equal(citeOf(undefined), '')
    })

    it('uses custom cite when present', () => {
      const asset = { id: '1', name: 'Hero', type: 'character', cite: '@custom/hero' }
      assert.equal(citeOf(asset), '@custom/hero')
    })

    it('formats @type/name as default cite', () => {
      const asset = { id: '1', name: 'Hero', type: 'character' }
      assert.equal(citeOf(asset), '@character/Hero')
    })
  })

  describe('filterAndSortAssets', () => {
    const assets = [
      { id: '1', name: 'Zack', type: 'character', description: 'Hero fighter', tags: ['protagonist', 'male'], updated_at: '2026-01-01T10:00:00Z' },
      { id: '2', name: 'Alice', type: 'character', description: 'Mage girl', tags: ['magic', 'female'], updated_at: '2026-01-02T10:00:00Z' },
      { id: '3', name: 'Castle', type: 'scene', description: 'Ancient fortress', tags: ['stone'], updated_at: '2026-01-03T10:00:00Z' },
    ]

    it('filters by type', () => {
      const result = filterAndSortAssets(assets, 'scene', '', 'name')
      assert.equal(result.length, 1)
      assert.equal(result[0].id, '3')
    })

    it('filters by search keyword matching description or tags', () => {
      const byDesc = filterAndSortAssets(assets, '', 'mage', 'name')
      assert.equal(byDesc.length, 1)
      assert.equal(byDesc[0].id, '2')

      const byTag = filterAndSortAssets(assets, '', 'stone', 'name')
      assert.equal(byTag.length, 1)
      assert.equal(byTag[0].id, '3')
    })

    it('sorts by name ascending', () => {
      const result = filterAndSortAssets(assets, 'character', '', 'name')
      assert.equal(result.length, 2)
      assert.equal(result[0].name, 'Alice')
      assert.equal(result[1].name, 'Zack')
    })

    it('sorts by updated_at descending', () => {
      const result = filterAndSortAssets(assets, 'character', '', 'updated_at')
      assert.equal(result.length, 2)
      assert.equal(result[0].name, 'Alice')
      assert.equal(result[1].name, 'Zack')
    })
  })

  describe('parsePickedPathsResult', () => {
    it('returns error on unsuccessful result', () => {
      const res = { ok: false, body: { error: 'picker-unsupported' } }
      const parsed = parsePickedPathsResult(res, dummyT)
      assert.equal(parsed.ok, false)
      assert.equal(parsed.error, 't:error.pickerUnsupported')
      assert.deepEqual(parsed.paths, [])
    })

    it('returns multiple paths when array present', () => {
      const res = { ok: true, body: { paths: ['/path/a', '/path/b', ''] } }
      const parsed = parsePickedPathsResult(res, dummyT)
      assert.equal(parsed.ok, true)
      assert.deepEqual(parsed.paths, ['/path/a', '/path/b'])
    })

    it('returns single path when only path string present', () => {
      const res = { ok: true, body: { path: '/path/single' } }
      const parsed = parsePickedPathsResult(res, dummyT)
      assert.equal(parsed.ok, true)
      assert.deepEqual(parsed.paths, ['/path/single'])
    })

    it('returns empty array when neither exists', () => {
      const res = { ok: true, body: {} }
      const parsed = parsePickedPathsResult(res, dummyT)
      assert.equal(parsed.ok, true)
      assert.deepEqual(parsed.paths, [])
    })
  })

  describe('toggleAssetIdInSet', () => {
    it('toggles presence of asset id immutably', () => {
      const s1 = new Set(['1', '2'])
      const s2 = toggleAssetIdInSet(s1, '3')
      assert.deepEqual([...s2], ['1', '2', '3'])
      assert.deepEqual([...s1], ['1', '2'])

      const s3 = toggleAssetIdInSet(s2, '2')
      assert.deepEqual([...s3], ['1', '3'])
    })
  })

  describe('cleanRemovedSelection', () => {
    it('retains only IDs present in liveAssets', () => {
      const s1 = new Set(['1', '2', '3'])
      const live = [{ id: '1' }, { id: '3' }]
      const s2 = cleanRemovedSelection(s1, live)
      assert.deepEqual([...s2], ['1', '3'])
    })

    it('returns same Set reference when nothing removed', () => {
      const s1 = new Set(['1', '2'])
      const live = [{ id: '1' }, { id: '2' }, { id: '3' }]
      const s2 = cleanRemovedSelection(s1, live)
      assert.equal(s1, s2)
    })
  })

  describe('computeEmptyState', () => {
    it('handles empty with no query and no filter', () => {
      const res = computeEmptyState('', '', dummyT)
      assert.equal(res.searching, false)
      assert.equal(res.emptyLabel, 't:empty.all')
      assert.equal(res.emptyActionLabel, 't:add.button')
    })

    it('handles empty with searching active', () => {
      const res = computeEmptyState('character', 'wizard', dummyT)
      assert.equal(res.searching, true)
      assert.equal(res.emptyLabel, 't:empty.noMatch')
      assert.equal(res.emptyActionLabel, undefined)
    })
  })

  describe('countAssetsByType', () => {
    it('tallies each type it sees', () => {
      const rows = [
        { type: 'character' },
        { type: 'character' },
        { type: 'scene' },
        { type: 'custom' },
      ]
      assert.deepEqual(countAssetsByType(rows), { character: 2, scene: 1, custom: 1 })
    })

    it('reports only the types that are present, never a zero bucket', () => {
      const counts = countAssetsByType([{ type: 'scene' }])
      assert.deepEqual(Object.keys(counts), ['scene'])
    })

    it('skips rows a chip could never select', () => {
      const rows = [
        { type: 'scene' },
        { type: '' },
        { type: '   ' },
        { type: 42 },
        { name: 'typeless' },
        null,
        undefined,
      ]
      assert.deepEqual(countAssetsByType(rows), { scene: 1 })
    })

    it('survives a feed that has not loaded yet', () => {
      assert.deepEqual(countAssetsByType([]), {})
      assert.deepEqual(countAssetsByType(undefined), {})
      assert.deepEqual(countAssetsByType(null), {})
    })
  })
})
