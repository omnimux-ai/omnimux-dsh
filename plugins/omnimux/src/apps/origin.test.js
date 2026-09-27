import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertLocalWrite, readOriginHeaders } from './origin.js'
import {
  assertLocalWrite as sharedAssertLocalWrite,
  readOriginHeaders as sharedReadOriginHeaders,
} from '../http/local-origin.js'

// The full behavior suite lives in src/http/local-origin.test.js.
// This file only guards the compatibility re-export that existing
// Apps consumers still import.
describe('apps/origin.js compatibility re-export', () => {
  it('re-exports the shared primitives by identity', () => {
    assert.equal(assertLocalWrite, sharedAssertLocalWrite)
    assert.equal(readOriginHeaders, sharedReadOriginHeaders)
  })

  it('keeps the admission contract through the old import path', () => {
    assert.doesNotThrow(() => assertLocalWrite({}))
    assert.doesNotThrow(() => assertLocalWrite({ origin: 'http://127.0.0.1:8787' }))
    assert.doesNotThrow(() => assertLocalWrite({ origin: 'http://localhost:63805' }))
    assert.throws(() => assertLocalWrite({ origin: 'https://evil.example' }), /cross-origin/)
    assert.throws(() => assertLocalWrite({ secFetchSite: 'cross-site' }), /cross-origin/)
    assert.deepEqual(
      readOriginHeaders({ headers: { origin: 'http://localhost:1' } }),
      { origin: 'http://localhost:1', referer: '', secFetchSite: '' },
    )
  })
})
