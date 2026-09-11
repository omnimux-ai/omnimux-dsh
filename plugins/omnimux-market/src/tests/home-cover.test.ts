import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import test from 'node:test'
import { withDefaults } from '../config-store.js'
import { handleIcon } from '../local-api.js'

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
  const response = await requestCover('catalog/covers/home/bggg-data-amazon.png')
  assert.equal(response.status, 200)
  assert.equal(response.headers['content-type'], 'image/png')
  assert.deepEqual(response.body, readFileSync(new URL('../../catalog/covers/home/bggg-data-amazon.png', import.meta.url)))
  for (const target of ['catalog/covers/home/../bggg-data-amazon.png', 'catalog/covers/home/nested/file.png', 'catalog/covers/../index.json', 'catalog/covers/home/bggg-data-amazon.generation.json']) {
    assert.equal((await requestCover(target)).status, 400)
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
  for (const avatar of expertAvatars) {
    const res = await requestCover(avatar)
    assert.equal(res.status, 200, `avatar status 200: ${avatar}`)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.ok(Buffer.isBuffer(res.body) && res.body.length > 0, `avatar has bytes: ${avatar}`)
  }
})

test('icon handler maps remote workbuddyskills avatar URL directly to local disk without cloud fetch', async () => {
  const remoteUrl = 'https://raw.githubusercontent.com/infometa/workbuddyskills/main/experts/ad-creative-strategist/avatars/expert.png'
  const res = await requestCover(remoteUrl)
  assert.equal(res.status, 200)
  assert.equal(res.headers['content-type'], 'image/png')
  assert.ok(Buffer.isBuffer(res.body) && res.body.length > 0)
})
