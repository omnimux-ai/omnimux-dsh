import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseRange, getMimeType } from '../src/stream.js'

describe('omnimux-video-preview stream engine', () => {
  it('detects MIME types correctly', () => {
    assert.equal(getMimeType('test.mp4'), 'video/mp4')
    assert.equal(getMimeType('test.webm'), 'video/webm')
    assert.equal(getMimeType('test.mov'), 'video/quicktime')
    assert.equal(getMimeType('test.jpg'), 'image/jpeg')
    assert.equal(getMimeType('test.jpeg'), 'image/jpeg')
    assert.equal(getMimeType('test.png'), 'image/png')
    assert.equal(getMimeType('test.webp'), 'image/webp')
    assert.equal(getMimeType('test.unknown'), 'application/octet-stream')
  })

  it('parses HTTP range headers', () => {
    const total = 1000
    assert.deepEqual(parseRange('bytes=0-499', total), { start: 0, end: 499 })
    assert.deepEqual(parseRange('bytes=500-', total), { start: 500, end: 999 })
    assert.deepEqual(parseRange('bytes=-200', total), { start: 800, end: 999 })
    assert.equal(parseRange('invalid', total).invalid, true)
    assert.equal(parseRange('bytes=1500-2000', total).invalid, true)
  })
})
