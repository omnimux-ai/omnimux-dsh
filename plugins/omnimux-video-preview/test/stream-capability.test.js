import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, renameSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createVideoStreamUrl } from '../src/stream-capability.js'
import { handleVideoStream } from '../src/stream.js'
import { refreshBreakdownMedia } from '../src/refresh-breakdown-media.js'
test('capabilities bind the opened file for GET HEAD ranges and saved-file refresh', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'video-capability-')); const before = process.env.DSH_HOME; process.env.DSH_HOME = join(dir, 'home')
 const server = createServer(handleVideoStream)
 try {
  const video = join(dir, 'video.mp4'); const other = join(dir, 'other.mp4')
  const bytes = Buffer.from('0000ftypisom0000000000000000'); writeFileSync(video, bytes); writeFileSync(other, 'private fixture')
  const url = createVideoStreamUrl(video)
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const base = `http://127.0.0.1:${server.address().port}`
  for (const method of ['GET', 'HEAD']) {
   const denied = await fetch(`${base}/omnimux/video-preview/stream?path=${encodeURIComponent(other)}`, { method }); assert.equal(denied.status, 404)
   const response = await fetch(base + url, { method }); assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), null)
   if (method === 'GET') assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes)
  }
  const range = await fetch(base + url, { headers: { Range: 'bytes=2-5' } }); assert.equal(range.status, 206); assert.equal(await range.text(), bytes.subarray(2, 6).toString())
  const changed = new URL(url, base); changed.searchParams.set('signature', '0'.repeat(64)); assert.equal((await fetch(changed)).status, 404)
  const doc = join(dir, 'saved.vbreakdown'); const old = { is_video_breakdown: true, shots: [], video: { stream_url: `/omnimux/video-preview/stream?path=${encodeURIComponent(video)}`, title: 'saved' } }; writeFileSync(doc, JSON.stringify(old))
  assert.throws(() => refreshBreakdownMedia(doc, [other])); assert.deepEqual(JSON.parse(readFileSync(doc)), old)
  assert.equal(refreshBreakdownMedia(doc, [video]).refreshed, 1)
  const updated = JSON.parse(readFileSync(doc)); assert.equal(updated.video.title, 'saved'); assert.equal((await fetch(base + updated.video.stream_url)).status, 200)
  renameSync(video, join(dir, 'original.mp4')); symlinkSync(other, video); assert.equal((await fetch(base + url)).status, 404)
 } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); if (before === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = before; rmSync(dir, { recursive: true, force: true }) }
})
