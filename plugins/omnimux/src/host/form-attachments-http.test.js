import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { registerFormAttachmentRoutes } from './form-attachments-http.js'
function fixture(rejection) {
  let handler
  registerFormAttachmentRoutes({ register: route => { handler = route.handler; return () => {} } }, {
    homeDir: '/unused', getConnection: () => ({ requestRejection: () => rejection }),
    getWorkspaceRegistry: () => ({ get: () => undefined }), getSessionQuery: () => null,
  })
  return async ({ origin = 'http://localhost:123', method = 'POST', body = '{}' } = {}) => {
    const req = Readable.from([Buffer.from(body)])
    Object.assign(req, { method, url: '/omnimux/forms/attachments/resolve', headers: { host: 'localhost:123', origin }, socket: {} })
    const result = {}
    await handler(req, { writeHead: status => { result.status = status }, end: body => { result.body = JSON.parse(String(body)) } })
    return result
  }
}
test('form attachment routes require Host authentication', async () => {
  assert.equal((await fixture(401)()).status, 401)
})
test('write requests reject absent and foreign browser origins', async () => {
  assert.equal((await fixture()({ origin: '' })).status, 403)
  assert.equal((await fixture()({ origin: 'https://other.example' })).status, 403)
})
test('JSON metadata requests have a bounded body and reject malformed input', async () => {
  assert.equal((await fixture()({ body: 'x'.repeat(65537) })).status, 413)
  assert.equal((await fixture()({ body: '{' })).status, 400)
})
