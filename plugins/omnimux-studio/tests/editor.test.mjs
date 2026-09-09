import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDocument, textPart, tokenPart, serializeDocument, reduceEditor, validateToken, isComposing } from '../src/client/editor-document.js'

test('F07 A-token-B-token-C maintains order through update/move/remove', () => {
  const product = tokenPart('product', 'PRODUCT_1')
  const video = tokenPart('video', 'https://example.org/v')
  const document = { version: 1, parts: [textPart('A'), product, textPart('B'), video, textPart('C')] }
  assert.equal(serializeDocument(document), 'APRODUCT_1Bhttps://example.org/vC')
  const edited = reduceEditor(document, { type: 'update', id: product.id, patch: { value: 'next' } })
  assert.equal(serializeDocument(edited), 'AnextBhttps://example.org/vC')
  const moved = reduceEditor(edited, { type: 'move', id: video.id, index: 1 })
  assert.equal(moved.parts[1].id, video.id)
  const removed = reduceEditor(moved, { type: 'remove', id: product.id })
  assert.equal(removed.parts.length, 4)
  const initial = createDocument()
  assert.equal(reduceEditor(initial, { type: 'remove', id: initial.parts[0].id }).parts[0].kind, 'text')
})
test('F07 URL syntax rejects credentials, private literals, bad protocols and signed query', () => {
  for (const value of ['', 'javascript:alert(1)', 'ftp://example.org', 'https://user:pw@example.org', 'http://localhost/v', 'http://127.0.0.1', 'http://2130706433', 'http://10.0.0.2', 'http://172.16.0.1', 'http://192.168.0.1', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'https://example.org/?X-Amz-Signature=abc', 'https://example.org/?access_token=abc', 'x'.repeat(2049)]) {
    assert.notEqual(validateToken({ tokenType: 'video', value }).validation, 'valid', value)
  }
  assert.equal(validateToken({ tokenType: 'product', value: 'SKU_123-abc' }).validation, 'valid')
  assert.equal(validateToken({ tokenType: 'video', value: 'SKU_123-abc' }).validation, 'invalid')
  assert.equal(validateToken({ tokenType: 'video', value: 'https://example.org/v?language=zh' }).validation, 'valid')
})
test('F07 IME guard covers native composing and keyCode 229', () => {
  assert.equal(isComposing({ isComposing: true }), true)
  assert.equal(isComposing({ nativeEvent: { isComposing: true } }), true)
  assert.equal(isComposing({ keyCode: 229 }), true)
  assert.equal(isComposing({}, true), true)
  assert.equal(Boolean(isComposing({ keyCode: 13 })), false)
})
