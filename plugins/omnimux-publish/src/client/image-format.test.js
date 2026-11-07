import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isSupportedImageFormat, SUPPORTED_IMAGE_MIME_TYPES, unsupportedImageRows } from './image-format.js'

describe('isSupportedImageFormat', () => {
  it('accepts JPEG and WebP MIME types', () => {
    for (const mime of ['image/jpeg', 'image/jpg', 'image/webp']) {
      assert.equal(isSupportedImageFormat(mime, 'photo.jpg'), true, mime)
    }
  })

  it('ignores MIME parameters and case', () => {
    assert.equal(isSupportedImageFormat('IMAGE/JPEG; charset=binary', 'photo.jpg'), true)
    assert.equal(isSupportedImageFormat(' Image/WebP ', 'photo.webp'), true)
  })

  it('rejects PNG and other image formats', () => {
    for (const mime of ['image/png', 'image/gif', 'image/bmp', 'image/tiff', 'image/avif']) {
      assert.equal(isSupportedImageFormat(mime, 'x'), false, mime)
    }
  })

  it('falls back to the extension when MIME is missing', () => {
    assert.equal(isSupportedImageFormat('', 'photo.JPG'), true)
    assert.equal(isSupportedImageFormat(undefined, 'photo.jpeg'), true)
    assert.equal(isSupportedImageFormat('', 'photo.webp'), true)
    assert.equal(isSupportedImageFormat('', 'photo.png'), false)
    assert.equal(isSupportedImageFormat('', 'photo'), false)
  })

  it('keeps the supported MIME list in sync with docs (WebP/JPEG only)', () => {
    assert.deepEqual([...SUPPORTED_IMAGE_MIME_TYPES], ['image/jpeg', 'image/jpg', 'image/webp'])
    assert.equal(SUPPORTED_IMAGE_MIME_TYPES.includes('image/png'), false)
  })
})

describe('unsupportedImageRows', () => {
  it('returns only unsupported image rows and keeps names for the message', () => {
    const rows = [
      { id: '1', kind: 'image', filename: 'a.png', content_type: 'image/png' },
      { id: '2', kind: 'image', filename: 'b.jpg', content_type: 'image/jpeg' },
      { id: '3', kind: 'video', filename: 'c.mp4', content_type: 'video/mp4' },
      { id: '4', kind: 'image', filename: 'd.webp', content_type: 'image/webp' },
      { id: '5', kind: 'image', filename: 'e', content_type: '' },
    ]
    const unsupported = unsupportedImageRows(rows)
    assert.deepEqual(unsupported.map((row) => row.filename), ['a.png', 'e'])
  })

  it('tolerates non-array input', () => {
    assert.deepEqual(unsupportedImageRows(undefined), [])
    assert.deepEqual(unsupportedImageRows(null), [])
  })
})
