import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertLocalWrite } from './http-routes.js'

describe('publish local write guard', () => {
  it('rejects same-site browser origins', () => {
    assert.throws(
      () => assertLocalWrite({ secFetchSite: 'same-site', origin: 'http://127.0.0.1:5173' }),
      /cross-origin/,
    )
  })

  it('rejects a localhost origin whose port does not match the Host header', () => {
    assert.throws(
      () => assertLocalWrite({ origin: 'http://127.0.0.1:5173', host: '127.0.0.1:64245' }),
      /cross-origin/,
    )
  })

  it('keeps same-origin and native no-origin calls', () => {
    assert.doesNotThrow(() => assertLocalWrite({ secFetchSite: 'same-origin' }))
    assert.doesNotThrow(() => assertLocalWrite({}))
  })
})
