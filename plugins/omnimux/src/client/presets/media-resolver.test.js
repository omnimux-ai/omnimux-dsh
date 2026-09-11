import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveMediaUrl, hasVideoPreview, hasPosterPreview } from './media-resolver.js'

test('resolveMediaUrl: returns empty string for falsy or invalid input', () => {
  assert.equal(resolveMediaUrl(null), '')
  assert.equal(resolveMediaUrl(undefined), '')
  assert.equal(resolveMediaUrl(''), '')
  assert.equal(resolveMediaUrl('   '), '')
})

test('resolveMediaUrl: preserves absolute http/https URLs', () => {
  const httpUrl = 'http://example.com/demo.mp4'
  const httpsUrl = 'https://cdn.example.com/poster.jpg'
  assert.equal(resolveMediaUrl(httpUrl), httpUrl)
  assert.equal(resolveMediaUrl(httpsUrl), httpsUrl)
})

test('resolveMediaUrl: resolves relative path to local-file stream fallback', () => {
  const rel = 'hooks/eye-catching-visuals/01_crash.mp4'
  const resolved = resolveMediaUrl(rel)
  assert.ok(resolved.startsWith('/omnimux-workflow/api/local-file?path='))
  assert.ok(resolved.includes(encodeURIComponent('01_crash.mp4')))
})

test('hasVideoPreview & hasPosterPreview accurately detects media presence', () => {
  assert.equal(hasVideoPreview({ videoPath: 'path.mp4' }), true)
  assert.equal(hasVideoPreview({ videoPath: '' }), false)
  assert.equal(hasVideoPreview({}), false)

  assert.equal(hasPosterPreview({ posterPath: 'poster.jpg' }), true)
  assert.equal(hasPosterPreview({ posterPath: null }), false)
  assert.equal(hasPosterPreview({}), false)
})
