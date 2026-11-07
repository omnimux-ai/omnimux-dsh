import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertLocalWrite, sendJson } from './http-routes.js'

function fakeRes() {
  return {
    status: 0,
    headers: {},
    writeHead(status, headers) { this.status = status; this.headers = headers || {} },
    end() {},
  }
}

describe('inspiration local HTTP trust boundary', () => {
  it('does not emit wildcard CORS on real JSON responses', () => {
    const res = fakeRes()
    sendJson(res, 200, { data: [] })
    assert.equal(res.headers['Access-Control-Allow-Origin'], undefined)
  })

  it('keeps the OPTIONS preflight contract without exposing data', () => {
    const res = fakeRes()
    sendJson(res, 204, {})
    assert.equal(res.headers['Access-Control-Allow-Origin'], undefined)
  })

  it('rejects foreign and same-site write origins', () => {
    assert.throws(() => assertLocalWrite({ headers: { origin: 'https://evil.example' } }), /cross-origin/)
    assert.throws(() => assertLocalWrite({ headers: { origin: 'http://127.0.0.1:5173', 'sec-fetch-site': 'same-site' } }), /cross-origin/)
    assert.throws(() => assertLocalWrite({ headers: { origin: 'http://127.0.0.1:64245', host: '127.0.0.1:9999' } }), /cross-origin/)
  })

  it('allows same-origin and native no-origin writes', () => {
    assert.doesNotThrow(() => assertLocalWrite({ headers: { origin: 'http://127.0.0.1:64245', host: '127.0.0.1:64245' } }))
    assert.doesNotThrow(() => assertLocalWrite({ headers: {} }))
  })
})
