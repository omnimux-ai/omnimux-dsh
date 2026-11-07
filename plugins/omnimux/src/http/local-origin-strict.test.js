import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertLocalWrite } from './local-origin.js'

describe('assertLocalWrite strict mode', () => {
  it('rejects same-site sources for sensitive write routes', () => {
    assert.throws(
      () => assertLocalWrite({ secFetchSite: 'same-site', origin: 'http://127.0.0.1:5173' }, { rejectSameSite: true }),
      /cross-origin/,
    )
  })

  it('keeps same-origin and missing-origin native calls writable', () => {
    assert.doesNotThrow(() => assertLocalWrite({ secFetchSite: 'same-origin' }, { rejectSameSite: true }))
    assert.doesNotThrow(() => assertLocalWrite({}, { rejectSameSite: true }))
  })
})
