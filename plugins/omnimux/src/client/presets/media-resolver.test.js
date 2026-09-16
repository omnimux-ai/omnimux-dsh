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

test('resolveMediaUrl: without an explicit asset root a relative path resolves to nothing', () => {
  // 产品基线：不得猜测开发机素材库路径（docs/contracts/product-baseline.md）
  assert.equal(resolveMediaUrl('hooks/eye-catching-visuals/01_crash.mp4'), '')
})

test('resolveMediaUrl: an explicitly configured asset root resolves to the local-file stream', () => {
  const rel = 'hooks/eye-catching-visuals/01_crash.mp4'
  globalThis.window = { __OMNIMUX_CONFIG__: { presetAssetRoot: '/tmp/preset-media/' } }
  try {
    const resolved = resolveMediaUrl(rel)
    assert.ok(resolved.startsWith('/omnimux-workflow/api/local-file?path='))
    assert.ok(resolved.includes(encodeURIComponent('/tmp/preset-media/hooks/eye-catching-visuals/01_crash.mp4')))
  } finally {
    delete globalThis.window
  }
})

test('resolveMediaUrl: gateway origin wins over the local asset root', () => {
  globalThis.window = {
    __OMNIMUX_CONFIG__: { gatewayMediaOrigin: 'https://cdn.example.com/base/', presetAssetRoot: '/tmp/preset-media' },
  }
  try {
    assert.equal(resolveMediaUrl('a/b.mp4'), 'https://cdn.example.com/base/a/b.mp4')
  } finally {
    delete globalThis.window
  }
})

test('hasVideoPreview & hasPosterPreview accurately detects media presence', () => {
  assert.equal(hasVideoPreview({ videoPath: 'path.mp4' }), true)
  assert.equal(hasVideoPreview({ videoPath: '' }), false)
  assert.equal(hasVideoPreview({}), false)

  assert.equal(hasPosterPreview({ posterPath: 'poster.jpg' }), true)
  assert.equal(hasPosterPreview({ posterPath: null }), false)
  assert.equal(hasPosterPreview({}), false)
})
