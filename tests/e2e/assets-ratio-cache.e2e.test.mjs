/**
 * tests/e2e/assets-ratio-cache.e2e.test.mjs
 * 资产中心封面比例持久化与请求合并端到端契约测试（Issue #2152）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { coverRatioCache, DEFAULT_RATIO_CACHE_CAPACITY } from '../../plugins/omnimux-assets/src/client/ratio-cache.js'
import { coverRatioOf } from '../../plugins/omnimux-assets/src/client/masonry.js'
import { defaultRequestCoalescer } from '../../plugins/omnimux-assets/src/client/request-coalescer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../../')
const clientDir = path.join(root, 'plugins/omnimux-assets/src/client')

test('E2E 契约一：比例缓存持久化与容量防膨胀保护 (AC-1)', () => {
  assert.equal(DEFAULT_RATIO_CACHE_CAPACITY, 1000)
  coverRatioCache.clear()

  coverRatioCache.set('asset-1', 0.6)
  assert.equal(coverRatioCache.get('asset-1'), 0.6)
  assert.equal(coverRatioCache.has('asset-1'), true)

  coverRatioCache.clear()
  assert.equal(coverRatioCache.has('asset-1'), false)
})

test('E2E 契约二：coverRatioOf 优先读取已缓存的持久化真实比例 (AC-2)', () => {
  coverRatioCache.clear()
  const asset = { id: 'test-cached-asset', mediaType: 'image', hasCover: true }
  
  // 缓存前：回落默认立绘 9/16
  assert.equal(coverRatioOf(asset), 9 / 16)

  // 缓存后：直接取用真实比例
  coverRatioCache.set('test-cached-asset', 0.75)
  assert.equal(coverRatioOf(asset), 0.75)

  coverRatioCache.clear()
})

test('E2E 契约三：封面加载完成后自动持久化记录比例 (AC-3)', () => {
  const cloudSrc = fs.readFileSync(path.join(clientDir, 'CloudAssetsView.jsx'), 'utf8')
  assert.match(cloudSrc, /coverRatioCache\.set\(asset\.id,\s*image\.naturalWidth\s*\/\s*image\.naturalHeight\)/)

  const gridSrc = fs.readFileSync(path.join(clientDir, 'AssetGrid.jsx'), 'utf8')
  assert.match(gridSrc, /coverRatioCache\.set\(asset\.id,\s*image\.naturalWidth\s*\/\s*image\.naturalHeight\)/)
})

test('E2E 契约四：网络请求层合并在飞重复请求 (AC-4)', async () => {
  let executed = 0
  const fetcher = async () => {
    executed += 1
    await new Promise((r) => setTimeout(r, 10))
    return { ok: true }
  }

  const [a, b] = await Promise.all([
    defaultRequestCoalescer.coalesce('e2e-dup-key', fetcher),
    defaultRequestCoalescer.coalesce('e2e-dup-key', fetcher),
  ])

  assert.equal(executed, 1, '并发相同在飞请求必须只执行一次')
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
})
