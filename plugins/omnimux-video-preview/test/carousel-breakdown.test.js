import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mapShotsToCarouselPages,
  resolveCarouselReference,
} from '../src/breakdown/analyzerPipeline.js'

function stubInspirationFetch(item, t) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    calls.push(url)
    return {
      ok: true,
      json: async () => ({ data: item }),
    }
  }
  t.after(() => {
    globalThis.fetch = original
  })
  return calls
}

test('mapShotsToCarouselPages 按页映射分镜', async (t) => {
  const pages = [
    { index: 1, image_url: 'http://x/1.jpg', local_path: '/tmp/a.jpg', stream_url: '/omnimux/video-preview/stream?grant=a&signature=00' },
    { index: 2, image_url: 'http://x/2.jpg', local_path: '/tmp/b.jpg', stream_url: '/omnimux/video-preview/stream?grant=b&signature=00' },
    { index: 3, image_url: 'http://x/3.jpg', local_path: null, stream_url: null },
  ]

  await t.test('显式页码优先，缺省时按序兜底并夹紧', () => {
    const shots = [
      { id: 's1', title: '封面图', time_range: '第2页', start_seconds: 0, end_seconds: 0 },
      { id: 's2', title: '产品卖点', time_range: '', start_seconds: 0, end_seconds: 0 },
      { id: 's3', title: '结尾 CTA', time_range: '', start_seconds: 0, end_seconds: 0 },
    ]
    const mapped = mapShotsToCarouselPages(shots, pages)
    assert.equal(mapped[0].page_index, 2)
    assert.equal(mapped[0].time_range, '第2页')
    assert.equal(mapped[0].start_seconds, 1)
    assert.equal(mapped[0].end_seconds, 2)
    assert.equal(mapped[0].frame_url, '/omnimux/video-preview/stream?grant=b&signature=00')
    assert.equal(mapped[1].page_index, 2)
    assert.equal(mapped[2].page_index, 3)
    assert.equal(mapped[2].frame_url, undefined)
  })

  await t.test('页码越界时回落到顺序', () => {
    const shots = [{ title: '第9页 超界', time_range: '第9页' }]
    const mapped = mapShotsToCarouselPages(shots, pages)
    assert.equal(mapped[0].page_index, 1)
  })
})

test('resolveCarouselReference 识别轮播条目', async (t) => {
  await t.test('type=image 且有图片 media_keys 时返回 pages（过滤非图、相对键补全端口）', async () => {
    const item = {
      type: 'image',
      title: '图文',
      media_keys: ['http://cdn/x/1.jpg', '/omnimux/inspiration/media/2.png', 'http://cdn/x/clip.mp4'],
    }
    stubInspirationFetch(item, t)
    const ref = await resolveCarouselReference('@inspiration/42')
    assert.ok(ref)
    assert.equal(ref.itemId, '42')
    assert.deepEqual(ref.pages, [
      'http://cdn/x/1.jpg',
      'http://127.0.0.1:45120/omnimux/inspiration/media/2.png',
    ])
  })

  await t.test('type=image 但无图可用时回退 cover_url', async () => {
    stubInspirationFetch({ type: 'image', media_keys: [], cover_url: 'http://cdn/cover.jpg' }, t)
    const ref = await resolveCarouselReference('@trending/7')
    assert.deepEqual(ref.pages, ['http://cdn/cover.jpg'])
  })

  await t.test('非 image 类型返回 null', async () => {
    stubInspirationFetch({ type: 'video', media_keys: [] }, t)
    assert.equal(await resolveCarouselReference('@inspiration/9'), null)
  })

  await t.test('非灵感引用串返回 null', async () => {
    assert.equal(await resolveCarouselReference('/local/video.mp4'), null)
    assert.equal(await resolveCarouselReference('https://example.com/a.mp4'), null)
  })
})
