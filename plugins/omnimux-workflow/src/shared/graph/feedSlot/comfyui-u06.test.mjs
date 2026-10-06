import test from 'node:test'
import assert from 'node:assert/strict'

import { deriveSlotLayout } from './deriveSlotLayout.ts'
import { autoFillSlots } from './autoFillSlots.ts'

const input = (slot, type, role, min, max, extra = {}) => ({
  slot, type, role, source: 'upstream_edge', min, max, ...extra,
})

const catalog = {
  models: [{
    id: 'minimax-h3',
    label: 'MiniMax H3',
    operations: [
      {
        id: 'video_multi_ref',
        label: '全能参考',
        listed: true,
        output: { type: 'video' },
        inputs: [
          input('prompt', 'text', 'prompt', 1, 1),
          input('reference_images', 'image', 'reference', 0, 9, { allowedMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'], maxSizeMb: 30 }),
          input('reference_videos', 'video', 'reference', 0, 3, { allowedMimes: ['video/mp4', 'video/quicktime'], maxSizeMb: 50, minDurationSec: 2, maxDurationSec: 15 }),
          input('reference_audios', 'audio', 'reference', 0, 3, { allowedMimes: ['audio/wav', 'audio/mp3', 'audio/mpeg'], maxSizeMb: 15, minDurationSec: 2, maxDurationSec: 15 }),
        ],
      },
      { id: 'text_to_video', label: '文生视频', listed: true, output: { type: 'video' }, inputs: [input('prompt', 'text', 'prompt', 1, 1)] },
    ],
  }],
}

// TC-U06-04 画布卡槽布局对齐：9 图 3 视频 3 音频契约
test('TC-U06-04a: minimax-h3 video_multi_ref derives 9/3/3 multimodal slots', () => {
  const layout = deriveSlotLayout(catalog, 'minimax-h3', 'video_multi_ref')
  assert.equal(layout.preset, 'strip')
  assert.equal(layout.addButton, true)
  const bySlot = Object.fromEntries(layout.slots.map((s) => [s.slot, s]))
  assert.equal(bySlot.reference_images.max, 9)
  assert.equal(bySlot.reference_videos.max, 3)
  assert.equal(bySlot.reference_audios.max, 3)
  assert.deepEqual(
    layout.slots.map((s) => s.slot),
    ['reference_images', 'reference_videos', 'reference_audios'],
  )
})

// TC-U06-04b 素材自动装填：9 图 + 3 视频 + 3 音频全部被收编
test('TC-U06-04b: autoFillSlots fills 9 images, 3 videos, 3 audios into the contract', () => {
  const layout = deriveSlotLayout(catalog, 'minimax-h3', 'video_multi_ref')
  const feedAssets = [
    ...Array.from({ length: 9 }, (_, i) => ({
      edgeId: `img-${i}`, sourceNodeId: `img-src-${i}`, type: 'image',
      availability: 'ready', pathOrUrl: `https://cdn.test/i${i}.png`, mimeType: 'image/png', ordinal: i,
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      edgeId: `vid-${i}`, sourceNodeId: `vid-src-${i}`, type: 'video',
      availability: 'ready', pathOrUrl: `https://cdn.test/v${i}.mp4`, mimeType: 'video/mp4', durationSec: 5, ordinal: 20 + i,
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      edgeId: `aud-${i}`, sourceNodeId: `aud-src-${i}`, type: 'audio',
      availability: 'ready', pathOrUrl: `https://cdn.test/a${i}.mp3`, mimeType: 'audio/mp3', durationSec: 5, ordinal: 30 + i,
    })),
  ]
  const result = autoFillSlots(feedAssets, layout)
  assert.equal(result.bindings.reference_images.length, 9)
  assert.equal(result.bindings.reference_videos.length, 3)
  assert.equal(result.bindings.reference_audios.length, 3)
  assert.equal(result.conflicts.length, 0)
})

// TC-U06-04c 超出契约上限时不再收编（第 10 图、第 4 视频、第 4 音频闲置）
test('TC-U06-04c: assets beyond 9/3/3 stay unused', () => {
  const layout = deriveSlotLayout(catalog, 'minimax-h3', 'video_multi_ref')
  const feedAssets = [
    ...Array.from({ length: 10 }, (_, i) => ({
      edgeId: `img-${i}`, sourceNodeId: `img-src-${i}`, type: 'image',
      availability: 'ready', pathOrUrl: `https://cdn.test/i${i}.png`, mimeType: 'image/png', ordinal: i,
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      edgeId: `vid-${i}`, sourceNodeId: `vid-src-${i}`, type: 'video',
      availability: 'ready', pathOrUrl: `https://cdn.test/v${i}.mp4`, mimeType: 'video/mp4', durationSec: 5, ordinal: 20 + i,
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      edgeId: `aud-${i}`, sourceNodeId: `aud-src-${i}`, type: 'audio',
      availability: 'ready', pathOrUrl: `https://cdn.test/a${i}.mp3`, mimeType: 'audio/mp3', durationSec: 5, ordinal: 30 + i,
    })),
  ]
  const result = autoFillSlots(feedAssets, layout)
  assert.equal(result.bindings.reference_images.length, 9)
  assert.equal(result.bindings.reference_videos.length, 3)
  assert.equal(result.bindings.reference_audios.length, 3)
  assert.equal(result.unusedFeed.length, 3)
})
