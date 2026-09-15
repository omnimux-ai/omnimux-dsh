import test from 'node:test'
import assert from 'node:assert/strict'
import { readBoundedBody } from './read-bounded-body.js'

function streamResponse({ declared, fail = false } = {}) {
  let pulls = 0, cancelled = false
  const body = new ReadableStream({
    pull(controller) { pulls++; if (fail) controller.error(new Error('broken stream')); else controller.enqueue(new Uint8Array(3)) },
    cancel() { cancelled = true },
  }, { highWaterMark: 0 })
  return { response: { ok: true, body, headers: new Headers(declared ? { 'content-length': declared } : {}), arrayBuffer: () => assert.fail('unbounded fallback') }, state: () => ({ pulls, cancelled }) }
}
test('actual byte cap cancels missing/lying length before reading the rest', async () => {
  for (const declared of [undefined, '1']) {
    const { response, state } = streamResponse({ declared })
    await assert.rejects(readBoundedBody(response, 5), /exceeds/)
    assert.deepEqual(state(), { pulls: 2, cancelled: true })
    assert.equal(response.body.locked, false)
  }
})
test('declared oversize cancels without reading', async () => {
  const { response, state } = streamResponse({ declared: '10' })
  await assert.rejects(readBoundedBody(response, 5), /exceeds/)
  assert.deepEqual(state(), { pulls: 0, cancelled: true })
})
test('exact cap and empty body succeed', async () => {
  assert.deepEqual(await readBoundedBody(new Response(new Uint8Array([1, 2, 3])), 3), new Uint8Array([1, 2, 3]))
  assert.equal((await readBoundedBody(new Response(''), 3)).length, 0)
})
test('failure releases reader and pre-abort cancels without consuming', async () => {
  const broken = streamResponse({ fail: true })
  await assert.rejects(readBoundedBody(broken.response, 5), /broken stream/)
  assert.equal(broken.response.body.locked, false)
  const aborted = streamResponse()
  await assert.rejects(readBoundedBody(aborted.response, 5, { signal: AbortSignal.abort() }), /abort/i)
  assert.deepEqual(aborted.state(), { pulls: 0, cancelled: true })
})

test('image/video/audio loaders enforce the bounded boundary and preserve valid media', async () => {
  const { probeTextImage } = await import('../text/image.js')
  const { probeTextVideo } = await import('../text/video.js')
  const { loadAudioBytes, MAX_REMOTE_AUDIO_BYTES } = await import('./stt-audio.js')
  const png = Buffer.from('89504e470d0a1a0a', 'hex')
  const mp4 = Buffer.from('000000186674797069736f6d', 'hex')
  const mp3 = Buffer.from('494433040000', 'hex')
  const image = await probeTextImage('https://cdn.example/a.png', { attachments: { imageLimits: { maxImageBytes: png.length } }, fetcher: async () => new Response(png) })
  assert.equal(image.sizeBytes, png.length)
  const video = await probeTextVideo('https://cdn.example/a.mp4', { maxVideoBytes: mp4.length, fetcher: async () => new Response(mp4) })
  assert.equal(video.sizeBytes, mp4.length)
  assert.deepEqual((await loadAudioBytes('https://cdn.example/a.mp3', { fetcher: async () => new Response(mp3) })).bytes, mp3)
  for (const probe of [
    (response) => probeTextImage('https://cdn.example/a.png', { attachments: { imageLimits: { maxImageBytes: 5 } }, fetcher: async () => response }),
    (response) => probeTextVideo('https://cdn.example/a.mp4', { maxVideoBytes: 5, fetcher: async () => response }),
  ]) {
    const bad = streamResponse()
    await assert.rejects(probe(bad.response), /exceeds/)
    assert.equal(bad.state().cancelled, true)
  }
  const oversizedAudio = streamResponse({ declared: String(MAX_REMOTE_AUDIO_BYTES + 1) })
  oversizedAudio.response.ok = true
  await assert.rejects(loadAudioBytes('https://cdn.example/a.mp3', { fetcher: async () => oversizedAudio.response }), /exceeds/)
  assert.deepEqual(oversizedAudio.state(), { pulls: 0, cancelled: true })
})
test('asset probing releases each body before starting the next reference', async () => {
  const { probeMediaAssets } = await import('./asset-probe.js')
  let active = 0, maxActive = 0
  const assets = await probeMediaAssets({
    references: [1, 2, 3].map(i => ({ type: 'image', role: 'reference', pathOrUrl: `https://cdn.example/${i}.png` })),
    fetcher: async () => {
      active++; maxActive = Math.max(maxActive, active)
      return new Response(new ReadableStream({
        async pull(controller) {
          await new Promise(resolve => setTimeout(resolve, 1))
          controller.enqueue(Buffer.from('89504e470d0a1a0a', 'hex'))
          active--; controller.close()
        },
      }))
    },
  })
  assert.equal(assets.length, 3)
  assert.equal(maxActive, 1)
})
