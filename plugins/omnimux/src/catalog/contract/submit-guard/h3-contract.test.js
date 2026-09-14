import test from 'node:test'
import assert from 'node:assert/strict'
import { guardSubmit } from './guard.js'
import { mapOmnimuxInput } from '../../../media/vendors/omnimux.js'
import { pollOpenAiMediaTask } from '../../../media/protocols/openai-media.js'

// #1751: the `minimax-h3-max` / `minimax-h3-max-turbo` SKUs left the contract universe;
// `minimax-h3` is the single remaining H3 model, so the honest-limits checks read it directly.
test('minimax-h3 exposes honest resolution and prompt limits', () => {
  const model = 'minimax-h3'
  const plan = guardSubmit({ model, operation: 'text_to_video', prompt: 'a'.repeat(7000), resolution: '768P', duration: 5 }, { seam: 'videoGenerate' })
  assert.equal(plan.ok, true, JSON.stringify(plan))
  assert.equal(plan.vendorPayload.resolution, '768P')
  assert.equal(plan.model.parameters.prompt.maxLength, 7000)
  assert.equal(guardSubmit({ model, operation: 'text_to_video', prompt: 'a'.repeat(7001), duration: 5 }, { seam: 'videoGenerate' }).ok, false)
  // resolution values are case-sensitive: only the published 768P spelling is admitted
  assert.equal(guardSubmit({ model, operation: 'text_to_video', prompt: 'fixture', resolution: '768p', duration: 5 }, { seam: 'videoGenerate' }).ok, false)
  const legacy = guardSubmit({ model, operation: 'text_to_video', prompt: 'fixture', resolution: '720p', duration: 5 }, { seam: 'videoGenerate' })
  assert.equal(legacy.ok, false)
  assert.match(legacy.message, /重新选择 768p/)
})

test('Hub reference payload preserves all selected media in order', () => {
  const references = [
    { type: 'image', role: 'reference', slot: 'reference_images', pathOrUrl: 'https://example.invalid/2.png', mime: 'image/png' },
    { type: 'image', role: 'reference', slot: 'reference_images', pathOrUrl: 'https://example.invalid/1.png', mime: 'image/png' },
    { type: 'video', role: 'reference', slot: 'reference_videos', pathOrUrl: 'https://example.invalid/2.mp4', mime: 'video/mp4', durationSec: 3 },
    { type: 'video', role: 'reference', slot: 'reference_videos', pathOrUrl: 'https://example.invalid/1.mp4', mime: 'video/mp4', durationSec: 3 },
  ]
  const plan = guardSubmit({ model: 'minimax-h3', operation: 'video_multi_ref', prompt: 'fixture', references: references.map(r => ({ ...r, sizeBytes: 1000 })), resolution: '768P', duration: 5 }, { seam: 'videoGenerate' })
  assert.equal(plan.ok, true, JSON.stringify(plan))
  const body = mapOmnimuxInput('video', { prompt: 'fixture', guardPlan: plan })
  assert.deepEqual(body.image_urls, references.slice(0, 2).map(r => r.pathOrUrl))
  assert.deepEqual(body.video_urls, references.slice(2).map(r => r.pathOrUrl))
  assert.equal(body.operation, 'video_multi_ref')
})

for (const status of ['succeeded', 'failure']) {
  test(`#831 actual poll logic handles ${status}`, async () => {
    let calls = 0
    const run = pollOpenAiMediaTask({
      fetcher: async (url) => {
        calls++
        assert.equal(url, 'https://example.invalid/video/generations/task-831')
        return new Response(JSON.stringify({ status, url: 'https://example.invalid/output.mp4' }), { status: 200 })
      },
      baseUrl: 'https://example.invalid', apiKey: 'fixture', taskId: 'task-831', capability: 'video',
      sleep: async () => { throw new Error('terminal alias must not retry') },
    })
    if (status === 'failure') await assert.rejects(run, { code: 'omnimux-failed' })
    else assert.equal((await run).url, 'https://example.invalid/output.mp4')
    assert.equal(calls, 1)
  })
}
