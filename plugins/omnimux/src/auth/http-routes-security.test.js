import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sendJson } from './http-routes.js'

function fakeRes() {
  return {
    status: 0,
    headers: {},
    writeHead(status, headers) { this.status = status; this.headers = headers || {} },
    end() {},
  }
}

describe('shared JSON response CORS policy', () => {
  it('does not emit wildcard CORS by default', () => {
    const res = fakeRes()
    sendJson(res, 200, { accounts: [{ id: 'a' }] })
    assert.equal(res.headers['Access-Control-Allow-Origin'], undefined)
    assert.equal(res.headers['Access-Control-Allow-Private-Network'], undefined)
  })

  it('allows an explicit public origin only when the caller opts in', () => {
    const res = fakeRes()
    sendJson(res, 200, { data: [] }, '*')
    assert.equal(res.headers['Access-Control-Allow-Origin'], '*')
  })
})
