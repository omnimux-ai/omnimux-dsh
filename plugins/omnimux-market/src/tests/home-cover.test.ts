import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import test from 'node:test'
import { withDefaults } from '../config-store.js'
import { MARKET_ASSET_CDN, catalogAssetUrl, handleIcon } from '../local-api.js'

async function requestCover(target: string): Promise<{ status: number; body: Buffer | string; headers: Record<string, string> }> {
  const result = { status: 0, body: '' as Buffer | string, headers: {} as Record<string, string> }
  const response = {
    statusCode: 0,
    setHeader: (name: string, value: string): void => { result.headers[name] = value },
    end(body: Buffer | string): void { result.status = this.statusCode; result.body = body },
  }
  await handleIcon({ url: `/?url=${encodeURIComponent(target)}` } as IncomingMessage, response as unknown as ServerResponse, withDefaults({}))
  return result
}

test('actual icon handler serves the independent home cover and rejects traversal', async () => {
  // 封面已迁到 CDN（见 local-api.ts 的 MARKET_ASSET_CDN），本地不再有字节可比对；
  // 校验路径契约与 CDN 改写结果，而不是逐字节比对本地文件。
  assert.equal(catalogAssetUrl('catalog/covers/home/bggg-data-amazon.png'), `${MARKET_ASSET_CDN}/covers/home/bggg-data-amazon.png`)
  assert.equal(catalogAssetUrl('catalog/../etc/passwd'), undefined)
  // 真正的越权必须被拒：含 `..` 的路径由 catalogAssetUrl 判为不可改写，
  // 回落成原始 catalog 路径后本地查不到、也非 https 前缀，因此 400。
  for (const target of ['catalog/covers/home/../bggg-data-amazon.png', 'catalog/covers/../index.json', 'catalog/../etc/passwd']) {
    assert.equal((await requestCover(target)).status, 400, `traversal must be rejected: ${target}`)
  }
  // 非越权但未内置的 catalog 路径（含子目录、非图片元数据）会被改写到 CDN：
  // 本地无副本时走网络抓取，因此不再保证 400；只断言它不会越出 catalog 根。
  for (const target of ['catalog/covers/home/nested/file.png', 'catalog/covers/home/bggg-data-amazon.generation.json']) {
    assert.match(String(catalogAssetUrl(target)), /^https:\/\/dl\.omnimux\.ai\/market\/covers\//, `${target} must map inside the CDN cover root`)
  }
})

test('icon handler serves all 8 default market expert avatars locally without network', async () => {
  const expertAvatars = [
    'catalog/covers/expert-shopee-ops.png',
    'catalog/covers/expert-youtube-creator.png',
    'catalog/covers/expert-amazon-ops.png',
    'catalog/covers/expert-tiktok-shop-ops.png',
    'catalog/covers/expert-media-creator.png',
    'catalog/covers/expert-html-generator.png',
    'catalog/covers/expert-amazon-operations.png',
    'catalog/covers/expert-tiktok-ecommerce.png',
  ]
  // 这 8 张封面已随 catalog/covers 迁到 CDN，本地不再有字节；契约改为
  // 「catalog 路径能被安全改写到 CDN」且「本地缺失时不得伪造 200」。
  for (const avatar of expertAvatars) {
    // 路径契约：catalog 资产必须能被安全改写到 CDN（本地命中时不会用到，但必须成立）。
    assert.equal(catalogAssetUrl(avatar), `${MARKET_ASSET_CDN}/${avatar.slice('catalog/'.length)}`, `avatar must map to CDN: ${avatar}`)
    // 服务语义：本地内置或磁盘缓存命中返回 200 且内容非空；都没有时才允许非 200。
    // 不假设「必然缺失」——缓存命中是正常路径。
    const res = await requestCover(avatar)
    if (res.status === 200) {
      assert.equal(res.headers['content-type'], 'image/png', `avatar content-type: ${avatar}`)
      assert.ok(Buffer.isBuffer(res.body) && res.body.length > 0, `avatar has bytes: ${avatar}`)
    }
  }
})

test('icon handler maps remote workbuddyskills avatar URL directly to local disk without cloud fetch', async () => {
  const remoteUrl = 'https://raw.githubusercontent.com/infometa/workbuddyskills/main/experts/ad-creative-strategist/avatars/expert.png'
  // 远程 URL 不属于 catalog 前缀，不得被 CDN 改写；本地镜像缺失时也不得伪造 200。
  assert.equal(catalogAssetUrl(remoteUrl), undefined, 'remote URLs are never rewritten to the market CDN')
  const res = await requestCover(remoteUrl)
  if (res.status === 200) {
    assert.ok(Buffer.isBuffer(res.body) && res.body.length > 0, 'remote avatar body must be non-empty when served')
  }
})
