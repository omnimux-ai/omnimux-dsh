import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseSocialMeta } from './http-handlers.js'
import { createLocalStore } from './local-store.js'
import { createLocalInspirationDispatcher } from './http-routes.js'

const video = (id) => ({
  type: 'video', media_url_https: `https://pbs.twimg.com/amplify_video_thumb/${id}/img/poster.jpg`,
  video_info: { variants: [
    { content_type: 'application/x-mpegURL', url: `https://video.twimg.com/amplify_video/${id}/pl/stream.m3u8` },
    { content_type: 'video/mp4', bitrate: 100, url: `https://video.twimg.com/amplify_video/${id}/vid/320x180/low.mp4` },
    { content_type: 'video/mp4', bitrate: 900, url: `https://video.twimg.com/amplify_video/${id}/vid/1080x1920/high.mp4` },
  ] },
})
const photo = (id) => ({ type: 'photo', media_url_https: `https://pbs.twimg.com/media/${id}.jpg` })
const high = (id) => video(id).video_info.variants[2].url
const resolver = async () => [{ address: '93.184.216.34', family: 4 }]
const dirs = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function setup(payload, fetcher, signal) {
  const dir = mkdtempSync(join(tmpdir(), 'inspiration-media-collection-'))
  dirs.push(dir)
  const paths = { dir, libraryFile: join(dir, 'library.json'), mediaDir: join(dir, 'media'), videosDir: join(dir, 'media/videos'), coversDir: join(dir, 'media/covers'), imagesDir: join(dir, 'media/images') }
  const store = createLocalStore({ paths })
  const dispatcher = createLocalInspirationDispatcher({ localStore: store, socialFetcher: async () => ({ data: payload }), resolver, fetcher: fetcher || (async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('image and video bytes') })) })
  return { store, paths, run: () => dispatcher.dispatch({ method: 'POST', url: '/omnimux/inspiration/local/import-url', body: { url: 'https://x.com/creator/status/2111569272732553535', auto_analyze: false }, signal }) }
}

describe('post media collection parsing', () => {
  it('preserves official mixed order, ranks each video and deduplicates mirror fields', () => {
    const first = video('123')
    const second = video('456')
    const meta = parseSocialMeta({ text: 'mixed post', mediaDetails: [first, photo('one'), second, photo('two')],
      extended_entities: { media: [first, photo('one'), second] },
      video: { poster: first.media_url_https, variants: [{ type: 'video/mp4', src: high('123') }] },
      photos: [{ url: photo('one').media_url_https }], images: [first.media_url_https, photo('two').media_url_https],
    })
    assert.deepEqual(meta.media_items, [
      { type: 'video', url: high('123') }, { type: 'image', url: photo('one').media_url_https },
      { type: 'video', url: high('456') }, { type: 'image', url: photo('two').media_url_https },
    ])
    assert.deepEqual(meta.images, [photo('one').media_url_https, photo('two').media_url_https])
    assert.equal(meta.video_url, high('123'))
    assert.equal(meta.cover_url, first.media_url_https)
  })

  it('ranks syndication src/type variants by resolution when bitrate is absent', () => {
    const meta = parseSocialMeta({ video: { poster: video('123').media_url_https, variants: [
      { type: 'video/mp4', src: high('123') },
      { type: 'video/mp4', src: 'https://video.twimg.com/amplify_video/123/vid/320x180/low.mp4' },
    ] } })
    assert.deepEqual(meta.media_items, [{ type: 'video', url: high('123') }])
    assert.equal(meta.cover_url, video('123').media_url_https)
  })

  it('aggregates image mirrors across envelopes and does not import video posters as photos', () => {
    const meta = parseSocialMeta({ media: { video: [video('123')], photo: [photo('one')] }, data: { images: [photo('one').media_url_https, photo('two').media_url_https] } })
    assert.deepEqual(meta.media_items, [{ type: 'video', url: high('123') }, { type: 'image', url: photo('one').media_url_https }, { type: 'image', url: photo('two').media_url_https }])
  })

  it('keeps the official attachment order ahead of flat wrapper mirrors', () => {
    const meta = parseSocialMeta({ video_url: high('123'), data: { mediaDetails: [photo('one'), video('123')] } })
    assert.deepEqual(meta.media_items, [{ type: 'image', url: photo('one').media_url_https }, { type: 'video', url: high('123') }])
  })

  it('deduplicates X image-size URL aliases across mirror fields', () => {
    const meta = parseSocialMeta({ mediaDetails: [photo('one')], images: ['https://pbs.twimg.com/media/one?format=jpg&name=orig', 'https://pbs.twimg.com/media/one.jpg:large'] })
    assert.deepEqual(meta.media_items, [{ type: 'image', url: photo('one').media_url_https }])
  })

  it('reconciles a complete video with its simplified same-layer entity mirror', async () => {
    const complete = { ...video('123'), id_str: '123' }
    const simplified = { type: 'video', id_str: '123', media_url_https: complete.media_url_https }
    const payload = { text: 'same video mirrors', extended_entities: { media: [complete] }, entities: { media: [simplified] } }
    const meta = parseSocialMeta(payload)
    assert.equal(meta.unavailable_media, false)
    assert.deepEqual(meta.media_items, [{ type: 'video', url: high('123') }])
    assert.equal(parseSocialMeta({ ...payload, entities: { media: [{ type: 'video', media_url_https: complete.media_url_https }] } }).unavailable_media, false)
    const { run } = setup(payload)
    assert.equal((await run()).status, 200)
  })

  it('still refuses a distinct unavailable video in a simplified mirror', async () => {
    const complete = { ...video('123'), id_str: '123' }
    const extra = { type: 'video', id_str: '456', media_url_https: complete.media_url_https }
    const { run } = setup({ text: 'missing additional video', extended_entities: { media: [complete] }, entities: { media: [complete, extra] } })
    const res = await run()
    assert.equal(res.status, 422)
    assert.match(res.body.error, /部分素材.*可下载/)
  })
})

describe('complete post media persistence', () => {
  it('saves each video and photo in order with video-only legacy urls', async () => {
    const { run, store } = setup({ text: 'mixed', mediaDetails: [video('123'), photo('one'), video('456'), photo('two')] })
    const res = await run()
    assert.equal(res.status, 200)
    const row = store.get(res.body.data.id)
    assert.equal(row.import_status, 'ready')
    assert.deepEqual(row.media_items.map((item) => item.type), ['video', 'image', 'video', 'image'])
    assert.equal(row.media_urls.length, 2)
    assert.ok(row.media_urls.every((url) => url.includes('/videos/')))
    assert.deepEqual(Object.keys(row.local_paths).sort(), ['cover', 'image_1', 'image_2', 'video', 'video_2'])
    assert.ok(Object.values(row.local_paths).every((path) => typeof path === 'string' && existsSync(path)))
  })

  it('saves every photo and marks a four-photo post ready', async () => {
    const { run } = setup({ text: 'gallery', extended_entities: { media: ['one', 'two', 'three', 'four'].map(photo) } })
    const res = await run()
    assert.equal(res.status, 200)
    assert.equal(res.body.media_degraded, undefined)
    assert.equal(res.body.data.type, 'image')
    assert.equal(res.body.data.import_status, 'ready')
    assert.equal(res.body.data.media_items.length, 4)
    assert.deepEqual(res.body.data.media_urls, [])
    assert.equal(res.body.data.cover_url, res.body.data.media_items[0].url)
  })

  it('recognizes a complete photo gallery as already imported', async () => {
    const { run } = setup({ text: 'gallery', images: [photo('one').media_url_https, photo('two').media_url_https] })
    assert.equal((await run()).status, 200)
    const duplicate = await run()
    assert.equal(duplicate.status, 409)
    assert.equal(duplicate.body.upgradable, false)
  })

  it('fails the whole import and removes saved files when a later asset fails', async () => {
    const { run, paths, store } = setup({ text: 'mixed', mediaDetails: [video('123'), photo('broken')] }, async (url) => {
      if (String(url).includes('broken')) return { ok: false, status: 404 }
      return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('video') }
    })
    const res = await run()
    assert.equal(res.status, 502)
    assert.match(res.body.error, /图片素材下载落盘失败/)
    assert.equal(store.list().total, 0)
    for (const dir of [paths.videosDir, paths.imagesDir, paths.coversDir]) assert.deepEqual(existsSync(dir) ? readdirSync(dir) : [], [])
  })

  it('does not call a gallery complete when an accompanying video has no downloadable variant', async () => {
    const { run, store } = setup({ text: 'incomplete mixed post', mediaDetails: [
      { type: 'video', media_url_https: video('123').media_url_https, video_info: { variants: [video('123').video_info.variants[0]] } },
      photo('one'),
    ] })
    const res = await run()
    assert.equal(res.status, 422)
    assert.match(res.body.error, /部分素材.*可下载/)
    assert.equal(store.list().total, 0)
  })

  it('cleans every saved asset when cancellation arrives after the second transfer', async () => {
    const controller = new AbortController()
    let calls = 0
    const { run, paths } = setup({ text: 'gallery', images: [photo('one').media_url_https, photo('two').media_url_https] }, async () => ({
      ok: true, status: 200, arrayBuffer: async () => { if (++calls === 2) controller.abort(); return Buffer.from('image') },
    }), controller.signal)
    const res = await run()
    assert.ok(res.status >= 400)
    for (const dir of [paths.videosDir, paths.imagesDir, paths.coversDir]) assert.deepEqual(existsSync(dir) ? readdirSync(dir) : [], [])
  })
})

describe('all saved media lifecycle', () => {
  it('preserves typed collections and recycles all replaced, deleted and batch-deleted assets once', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'inspiration-media-lifecycle-'))
    dirs.push(dir)
    const paths = { dir, libraryFile: join(dir, 'library.json'), videosDir: join(dir, 'media/videos'), imagesDir: join(dir, 'media/images'), coversDir: join(dir, 'media/covers') }
    const recycled = []
    const store = createLocalStore({ paths, recycleFile: async (path) => { recycled.push(path); return true } })
    store.add({ title: 'initialize' })
    const file = (folder, name) => { const path = join(folder, name); writeFileSync(path, 'owned'); return path }
    const kept = file(paths.imagesDir, 'kept.jpg')
    const old = { video: file(paths.videosDir, 'first.mp4'), video_2: file(paths.videosDir, 'second.mp4'), image_1: kept, image_2: file(paths.imagesDir, 'old.jpg'), cover: file(paths.coversDir, 'cover.jpg') }
    const media_items = [{ type: 'image', url: '/omnimux/inspiration/local/media/images/kept.jpg' }]
    const row = store.add({ title: 'mixed', local_paths: old, media_items })
    assert.deepEqual(store.get(row.id).media_items, media_items)
    await store.replace(row.id, { title: 'replaced', local_paths: { image_1: kept, cover: kept }, media_items })
    assert.deepEqual(new Set(recycled), new Set(Object.values(old).filter((path) => path !== kept).map((path) => realpathSync(path))))
    await store.delete(row.id)
    assert.equal(recycled.filter((path) => path === realpathSync(kept)).length, 1)
    const batch = store.add({ title: 'batch', local_paths: { image_1: file(paths.imagesDir, 'batch.jpg'), video_2: file(paths.videosDir, 'batch.mp4') } })
    await store.deleteBatch([batch.id])
    assert.equal(recycled.length, 7)
  })
})
