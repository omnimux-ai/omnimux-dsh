import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStore } from './local-store.js'
import { extractStructuredBreakdown } from './analyzer.js'
import { createLocalInspirationDispatcher, detectPlatformFromUrl } from './http-routes.js'

describe('Local Inspiration Store', () => {
  let tmp
  let paths

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'omnimux-insp-test-'))
    paths = {
      dir: tmp,
      libraryFile: join(tmp, 'library.json'),
      mediaDir: join(tmp, 'media'),
      coversDir: join(tmp, 'media', 'covers'),
      videosDir: join(tmp, 'media', 'videos'),
      imagesDir: join(tmp, 'media', 'images'),
    }
  })

  it('adds, lists, queries, updates and deletes inspirations', async () => {
    const store = createLocalStore({ paths })

    const item1 = store.add({
      title: 'TikTok Viral Dance Hook',
      source_platform: 'tiktok',
      source_url: 'https://www.tiktok.com/@user/video/1',
      tags: ['dance', 'viral'],
      is_favorite: true,
      hot_score: 95,
    })

    const item2 = store.add({
      title: 'YouTube Tech Review',
      source_platform: 'youtube',
      source_url: 'https://youtube.com/watch?v=2',
      tags: ['tech'],
      is_favorite: false,
      hot_score: 80,
    })

    assert.equal(store.list().total, 2)

    // Query filter
    const searchRes = store.list({ q: 'dance' })
    assert.equal(searchRes.total, 1)
    assert.equal(searchRes.items[0].id, item1.id)

    // Platform filter
    const ytRes = store.list({ platform: 'youtube' })
    assert.equal(ytRes.total, 1)
    assert.equal(ytRes.items[0].id, item2.id)

    // Tag filter
    const tagRes = store.list({ tag: 'viral' })
    assert.equal(tagRes.total, 1)

    // Update
    const updated = store.update(item1.id, { is_favorite: false })
    assert.equal(updated.is_favorite, false)
    assert.equal(store.get(item1.id).is_favorite, false)

    // Delete
    const removed = await store.delete(item2.id)
    assert.equal(removed.id, item2.id)
    assert.equal(store.list().total, 1)
  })

  it('persists optional duration/published_at and stamps favorited_at on first favorite', () => {
    const store = createLocalStore({ paths })
    const item = store.add({
      title: 'Meta',
      source_url: 'https://www.tiktok.com/@u/video/9',
      duration: 17,
      published_at: '2024-02-02T00:00:00.000Z',
    })
    assert.equal(item.duration, 17)
    assert.equal(item.published_at, '2024-02-02T00:00:00.000Z')
    assert.equal(item.favorited_at, '')
    const faved = store.update(item.id, { is_favorite: true })
    assert.equal(faved.is_favorite, true)
    assert.match(faved.favorited_at, /^\d{4}-/)
    const again = store.update(item.id, { is_favorite: true, title: 'Meta 2' })
    assert.equal(again.favorited_at, faved.favorited_at)
  })

  it('filters by multidimensional dimensions and sorts by views', () => {
    const store = createLocalStore({ paths })
    store.add({
      title: 'US Ad Video',
      source_platform: 'tiktok',
      source_url: 'https://www.tiktok.com/@u/video/1',
      country_code: 'US',
      category: '美妆护肤',
      duration: 15,
      views: 500000,
      traffic_type: 'ad',
      posted_at: '2026-09-01T12:00:00.000Z',
    })
    store.add({
      title: 'UK Organic Video',
      source_platform: 'tiktok',
      source_url: 'https://www.tiktok.com/@u/video/2',
      country_code: 'GB',
      category: '家居生活',
      duration: 45,
      views: 1200000,
      traffic_type: 'organic',
      posted_at: '2026-09-05T12:00:00.000Z',
    })

    assert.equal(store.list({ country: 'us' }).total, 1)
    assert.equal(store.list({ country: 'GB' }).total, 1)
    assert.equal(store.list({ category: '美妆' }).total, 1)
    assert.equal(store.list({ traffic_type: 'ad' }).total, 1)
    assert.equal(store.list({ duration_min: 20 }).total, 1)
    assert.equal(store.list({ duration_max: 20 }).total, 1)
    assert.equal(store.list({ views_min: 1000000 }).total, 1)
    assert.equal(store.list({ posted_after: '2026-09-03' }).total, 1)
    assert.equal(store.list({ posted_before: '2026-09-03' }).total, 1)

    const viewsSorted = store.list({ sort: 'views' })
    assert.equal(viewsSorted.items[0].title, 'UK Organic Video')
    assert.equal(viewsSorted.items[1].title, 'US Ad Video')
  })

  it('extracts structured markdown sections', () => {
    const sampleMd = `
## 一句话视频描述
这是一条关于美妆痛点反转的爆款视频。

## I. 核心目标
* **视频目标**: 引导点击转化

## III. 叙事分析
* **[0-3秒] 黄金钩子 (Hook)**:
  抛出素颜反差，引发容貌焦虑共鸣。

## IV. 画面分析
* 整体视觉: 暖光中景

## V. 核心复刻策略
* 复制前3秒反转
`
    const extracted = extractStructuredBreakdown(sampleMd)
    assert.equal(extracted.summary, '这是一条关于美妆痛点反转的爆款视频。')
    assert.ok(extracted.hook_highlight.includes('抛出素颜反差'))
    assert.ok(extracted.target_goal.includes('引导点击转化'))
    assert.ok(extracted.replication_action.includes('复制前3秒反转'))
  })

  it('detects platforms accurately and self-registers unknown platforms', () => {
    assert.equal(detectPlatformFromUrl('https://www.tiktok.com/@creator/video/123'), 'tiktok')
    assert.equal(detectPlatformFromUrl('https://www.instagram.com/reel/abc/'), 'instagram')
    assert.equal(detectPlatformFromUrl('https://youtu.be/xyz'), 'youtube')
    assert.equal(detectPlatformFromUrl('https://x.com/user/status/789'), 'x')
    assert.equal(detectPlatformFromUrl('https://twitter.com/user/status/789'), 'x')
    assert.equal(detectPlatformFromUrl('https://www.bilibili.com/video/BV123'), 'bilibili')
    assert.equal(detectPlatformFromUrl('https://threads.net/@user/post/456'), 'threads')
    assert.equal(detectPlatformFromUrl('https://v.douyin.com/abc/'), 'douyin')
    assert.equal(detectPlatformFromUrl('https://example.com/item'), 'example')
    assert.equal(detectPlatformFromUrl('not-a-valid-url'), 'unknown')
    assert.equal(detectPlatformFromUrl(''), 'unknown')
  })

  it('supports store.platforms() statistics and alias normalization in store.list()', () => {
    const store = createLocalStore({ paths })
    store.add({ title: 'TikTok 1', source_url: 'https://www.tiktok.com/@u/video/111', source_platform: 'tiktok' })
    store.add({ title: 'TikTok 2', source_url: 'https://www.tiktok.com/@u/video/222', source_platform: 'tiktok' })
    store.add({ title: 'X 1', source_url: 'https://x.com/u/status/333', source_platform: 'x' })
    store.add({ title: 'Twitter 2', source_url: 'https://twitter.com/u/status/444', source_platform: 'twitter' })
    store.add({ title: 'Douyin 1', source_url: 'https://www.douyin.com/video/555', source_platform: 'douyin' })

    const platforms = store.platforms()
    assert.ok(Array.isArray(platforms))
    const tiktokEntry = platforms.find((p) => p.name === 'tiktok')
    const xEntry = platforms.find((p) => p.name === 'x')
    const douyinEntry = platforms.find((p) => p.name === 'douyin')
    assert.equal(tiktokEntry?.count, 2)
    assert.equal(xEntry?.count, 2)
    assert.equal(douyinEntry?.count, 1)

    // Filtering by 'x' should return both 'x' and 'twitter'
    const xList = store.list({ platform: 'x' })
    assert.equal(xList.items.length, 2)
    assert.ok(xList.items.some((it) => it.source_platform === 'x'))
    assert.ok(xList.items.some((it) => it.source_platform === 'twitter'))

    // Filtering by 'twitter' should also return both 'x' and 'twitter'
    const twitterList = store.list({ platform: 'twitter' })
    assert.equal(twitterList.items.length, 2)

    // Filtering by 'tiktok'
    const tiktokList = store.list({ platform: 'tiktok' })
    assert.equal(tiktokList.items.length, 2)

    // Filtering by 'douyin'
    const douyinList = store.list({ platform: 'douyin' })
    assert.equal(douyinList.items.length, 1)
    assert.equal(douyinList.items[0].title, 'Douyin 1')
  })

  it('runs automated import with OmniMux social data and video analysis', async () => {
    const store = createLocalStore({ paths })

    // Mock social fetcher returning OmniMux direct metadata
    const mockSocialFetcher = async ({ url }) => ({
      platform: 'tiktok',
      capability: 'video',
      data: {
        title: 'Mock Viral Skit',
        desc: 'Testing viral skit deconstruction',
        cover_url: 'https://example.com/cover.jpg',
        video_url: 'https://example.com/video.mp4',
        author: { name: 'ViralCreator', handle: 'viral_creator' },
        stats: { likes: 50000, comments: 1200 },
      },
    })

    // Mock video analyze tool
    const mockVideoAnalyzeTool = {
      async execute({ video }) {
        return {
          text: `
## 一句话视频描述
素人逆袭爆款短剧。

## I. 核心目标
* 核心目标: 强情绪转化

## III. 叙事分析
* **[0-3秒] 黄金钩子 (Hook)**:
  开场扇巴掌冲突。

## V. 核心复刻策略
* 复刻短剧黄金前三秒
`,
        }
      },
    }

    // Mock fetch for downloading media
    const mockFetcher = async (url) => {
      const buffer = Buffer.from('fake-media-content')
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => buffer,
      }
    }

    const dispatcher = createLocalInspirationDispatcher({
      localStore: store,
      socialFetcher: mockSocialFetcher,
      videoAnalyzeTool: mockVideoAnalyzeTool,
      fetcher: mockFetcher,
    })

    const res = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/inspiration/local/import-url',
      body: {
        url: 'https://www.tiktok.com/@user/video/888999',
        tags: ['skit', 'drama'],
        auto_analyze: true,
      },
    })

    assert.equal(res.status, 200)
    assert.ok(res.body?.data)
    const item = res.body.data

    assert.equal(item.title, 'Mock Viral Skit')
    assert.equal(item.source_platform, 'tiktok')
    assert.equal(item.type, 'video')
    assert.ok(item.local_paths?.video)
    assert.ok(item.local_paths?.cover)
    assert.ok(item.deconstruction)
    assert.equal(item.deconstruction.summary, '素人逆袭爆款短剧。')
    assert.equal(item.deconstruction.hook, '开场扇巴掌冲突。')
    assert.ok(item.deconstruction.markdown)
  })

  it('rejects import when no video URL is provided by social scraper', async () => {
    const store = createLocalStore({ paths })
    const mockSocialFetcher = async () => ({
      platform: 'tiktok',
      capability: 'video',
      data: {
        title: 'Only Text Post',
        cover_url: 'https://example.com/cover.jpg',
        video_url: '', // Missing video stream
      },
    })

    const dispatcher = createLocalInspirationDispatcher({
      localStore: store,
      socialFetcher: mockSocialFetcher,
    })

    const res = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/inspiration/local/import-url',
      body: {
        url: 'https://www.tiktok.com/@user/video/000',
      },
    })

    assert.equal(res.status, 422)
    assert.ok(res.body?.error.includes('未提取到有效无水印视频直链'))
  })

  it('triggers on-demand /analyze endpoint for existing local item with video', async () => {
    const store = createLocalStore({ paths })
    mkdirSync(paths.videosDir, { recursive: true })
    const fakeVideoPath = join(paths.videosDir, 'test.mp4')
    writeFileSync(fakeVideoPath, 'fake-mp4-data')

    const item = store.add({
      title: 'Ecolchi Pro Hair Care Treatment',
      content: 'If you want ecolchipro, you can shop via my profile.',
      tags: ['haircare'],
      source_platform: 'tiktok',
      source_url: 'https://www.tiktok.com/@ecolchipro5/video/112233',
      local_paths: { video: fakeVideoPath },
    })

    const mockVideoAnalyzeTool = {
      async execute({ video }) {
        return {
          text: `
## 一句话视频描述
Ecolchi 发膜核心拆解。

## I. 核心目标
* 核心目标: 强心智种草

## III. 叙事分析
* **[0-3秒] 黄金钩子 (Hook)**:
  开场发质干枯对比。

## V. 核心复刻策略
* 前三秒反差特写
`,
        }
      },
    }

    const dispatcher = createLocalInspirationDispatcher({
      localStore: store,
      videoAnalyzeTool: mockVideoAnalyzeTool,
    })

    const res = await dispatcher.dispatch({
      method: 'POST',
      url: `/omnimux/inspiration/local/${item.id}/analyze`,
    })

    assert.equal(res.status, 200)
    assert.ok(res.body?.data)
    assert.ok(res.body.data.deconstruction)
    assert.equal(res.body.data.deconstruction.summary, 'Ecolchi 发膜核心拆解。')
    assert.equal(res.body.data.deconstruction.hook, '开场发质干枯对比。')
  })

  it('prevents duplicate import and returns 409 with existing record', async () => {
    const store = createLocalStore({ paths })
    const item = store.add({
      title: 'Existing Viral Video',
      source_platform: 'tiktok',
      source_url: 'https://www.tiktok.com/@creator/video/777888999',
    })

    const dispatcher = createLocalInspirationDispatcher({
      localStore: store,
    })

    // Import with tracking parameters attached
    const res = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/inspiration/local/import-url',
      body: {
        url: 'https://www.tiktok.com/@creator/video/777888999?is_from_webapp=1&sender_device=pc',
      },
    })

    assert.equal(res.status, 409)
    assert.equal(res.body?.is_duplicate, true)
    assert.equal(res.body?.data?.id, item.id)
    assert.ok(res.body?.error.includes('请勿重复导入'))
  })

  it('supports batch deleting inspirations and moving media files', async () => {
    const store = createLocalStore({ paths })
    const item1 = store.add({
      title: 'Item 1 to delete',
      source_platform: 'tiktok',
      source_url: 'https://tiktok.com/@u/video/1',
    })
    const item2 = store.add({
      title: 'Item 2 to delete',
      source_platform: 'instagram',
      source_url: 'https://instagram.com/reel/2',
    })
    const item3 = store.add({
      title: 'Item 3 to keep',
      source_platform: 'youtube',
      source_url: 'https://youtube.com/watch?v=3',
    })

    const dispatcher = createLocalInspirationDispatcher({
      localStore: store,
    })

    const res = await dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/inspiration/local/batch-delete',
      body: {
        ids: [item1.id, item2.id],
      },
    })

    assert.equal(res.status, 200)
    assert.equal(res.body?.data?.count, 2)
    assert.deepEqual(new Set(res.body?.data?.deleted), new Set([item1.id, item2.id]))

    // Verify remaining
    const remaining = store.list()
    assert.equal(remaining.total, 1)
    assert.equal(remaining.items[0].id, item3.id)
  })
})
