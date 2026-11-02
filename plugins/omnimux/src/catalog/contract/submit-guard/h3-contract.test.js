import test from 'node:test'
import assert from 'node:assert/strict'
import { guardSubmit } from './guard.js'
import { mapOmnimuxInput, taskPathFor, taskPollPathFor } from '../../../media/vendors/omnimux.js'
import { pollOpenAiMediaTask } from '../../../media/protocols/openai-media.js'

// #1751: the `minimax-h3-max` / `minimax-h3-max-turbo` SKUs left the contract universe;
// `minimax-h3` is the single remaining H3 model, so the honest-limits checks read it directly.
// 2026-10-21 网关对账 #3516：minimax-h3 上游渠道停用 → 仅登记不上架；契约与映射逻辑仍在，
// 故这些合同断言以 requireListed:false（unlisted 放行）保持覆盖，listing 依赖路径由 coverage 测试锁定。
test('minimax-h3 exposes honest resolution and prompt limits', () => {
  const model = 'minimax-h3'
  const plan = guardSubmit({ model, operation: 'text_to_video', prompt: 'a'.repeat(7000), resolution: '768P', duration: 5 }, { seam: 'videoGenerate', requireListed: false })
  assert.equal(plan.ok, true, JSON.stringify(plan))
  assert.equal(plan.vendorPayload.resolution, '768P')
  assert.equal(plan.model.parameters.prompt.maxLength, 7000)
  assert.equal(guardSubmit({ model, operation: 'text_to_video', prompt: 'a'.repeat(7001), duration: 5 }, { seam: 'videoGenerate', requireListed: false }).ok, false)
  // resolution values are case-sensitive: only the published 768P spelling is admitted
  assert.equal(guardSubmit({ model, operation: 'text_to_video', prompt: 'fixture', resolution: '768p', duration: 5 }, { seam: 'videoGenerate', requireListed: false }).ok, false)
  const legacy = guardSubmit({ model, operation: 'text_to_video', prompt: 'fixture', resolution: '720p', duration: 5 }, { seam: 'videoGenerate', requireListed: false })
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
  const plan = guardSubmit({ model: 'minimax-h3', operation: 'video_multi_ref', prompt: 'fixture', references: references.map(r => ({ ...r, sizeBytes: 1000 })), resolution: '768P', duration: 5 }, { seam: 'videoGenerate', requireListed: false })
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

// ---- minimax-h3-video (AutoDL ComfyUI lane) contract assertions ----
// 2026-11-02: every media slot travels through top-level `metadata` slots
// (ref_image_N / ref_audio_N / first_frame / last_frame / audio_duration);
// the legacy image_with_roles / image_urls / video_urls / file_url / link_url
// family is forbidden on this model. Tests use requireListed:false because the
// contract itself must hold even while listing is governed by the snapshot.

const H3_VIDEO_MODEL = 'minimax-h3-video'

test('minimax-h3-video text_to_video emits operation + metadata (no slots)', () => {
  const plan = guardSubmit(
    { model: H3_VIDEO_MODEL, operation: 'text_to_video', prompt: 'a talking head', duration: 5 },
    { seam: 'videoGenerate', requireListed: false },
  )
  assert.equal(plan.ok, true, JSON.stringify(plan))
  assert.equal(plan.vendorPayload.operation, 'text_to_video')
  assert.equal(plan.vendorPayload.metadata, undefined)
  for (const forbidden of ['image_with_roles', 'image_urls', 'video_urls', 'file_url', 'link_url']) {
    assert.equal(forbidden in plan.vendorPayload, false, `${forbidden} must not leak`)
  }
})

test('minimax-h3-video first_last_frame maps frames into metadata', () => {
  const bindings = [
    { type: 'image', role: 'first_frame', slot: 'first_frame', pathOrUrl: 'https://example.invalid/first.png', mime: 'image/png' },
    { type: 'image', role: 'last_frame', slot: 'last_frame', pathOrUrl: 'https://example.invalid/last.png', mime: 'image/png' },
  ]
  const plan = guardSubmit(
    { model: H3_VIDEO_MODEL, operation: 'first_last_frame', prompt: 'transition', duration: 5, references: bindings },
    { seam: 'videoGenerate', requireListed: false },
  )
  assert.equal(plan.ok, true, JSON.stringify(plan))
  assert.equal(plan.vendorPayload.operation, 'first_last_frame')
  assert.equal(plan.vendorPayload.metadata.first_frame, 'https://example.invalid/first.png')
  assert.equal(plan.vendorPayload.metadata.last_frame, 'https://example.invalid/last.png')
  assert.equal('image_with_roles' in plan.vendorPayload, false)
})

test('minimax-h3-video video_multi_ref packs references into metadata.ref_image_N', () => {
  const references = [0, 1, 2].map((i) => ({
    type: 'image', role: 'reference', slot: 'references',
    pathOrUrl: `https://example.invalid/ref-${i}.png`, mime: 'image/png',
  }))
  const plan = guardSubmit(
    { model: H3_VIDEO_MODEL, operation: 'video_multi_ref', prompt: 'multi-ref', duration: 5, references },
    { seam: 'videoGenerate', requireListed: false },
  )
  assert.equal(plan.ok, true, JSON.stringify(plan))
  assert.deepEqual(
    Object.keys(plan.vendorPayload.metadata).sort(),
    ['ref_image_0', 'ref_image_1', 'ref_image_2'],
  )
  for (const forbidden of ['image_urls', 'video_urls', 'audio_urls']) {
    assert.equal(forbidden in plan.vendorPayload, false, `${forbidden} must not leak`)
  }
})

test('minimax-h3-video digital_human emits audio_urls require + metadata audio slot', () => {
  const bindings = [
    { type: 'image', role: 'first_frame', slot: 'character', pathOrUrl: 'https://example.invalid/avatar.png', mime: 'image/png' },
    { type: 'audio', role: 'audio_track', slot: 'driving_audio', pathOrUrl: 'https://example.invalid/voice.mp3', mime: 'audio/mpeg' },
  ]
  const plan = guardSubmit(
    { model: H3_VIDEO_MODEL, operation: 'digital_human', prompt: 'lipsync', duration: 10, references: bindings },
    { seam: 'videoGenerate', requireListed: false },
  )
  assert.equal(plan.ok, true, JSON.stringify(plan))
  // require-level audio_urls is the only top-level reference field emitted;
  // actual slots ride inside metadata per AutoDL collectSlots.
  assert.deepEqual(plan.vendorPayload.audio_urls, ['https://example.invalid/voice.mp3'])
  assert.equal(plan.vendorPayload.metadata.ref_image_0, 'https://example.invalid/avatar.png')
  assert.equal(plan.vendorPayload.metadata.ref_audio_0, 'https://example.invalid/voice.mp3')
  assert.equal(plan.vendorPayload.metadata.audio_duration, 10)
  for (const forbidden of ['image_with_roles', 'image_urls', 'video_urls', 'file_url', 'link_url']) {
    assert.equal(forbidden in plan.vendorPayload, false, `${forbidden} must not leak`)
  }
})

test('minimax-h3-video routes to autodl submit + poll paths', () => {
  assert.equal(taskPathFor('video', H3_VIDEO_MODEL), 'tasks/autodl')
  assert.equal(taskPollPathFor('video', H3_VIDEO_MODEL), 'tasks')
})
