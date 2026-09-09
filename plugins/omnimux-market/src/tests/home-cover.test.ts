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
