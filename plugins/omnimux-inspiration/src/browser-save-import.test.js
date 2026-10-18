import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { createLocalStore } from './local-store.js'
import { createLocalInspirationDispatcher } from './http-routes.js'

const URL = 'https://x.com/creator/status/2111569272732553535'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
const MP4 = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0])
const image = (id) => ({ type: 'image', source_id: id, url: `https://pbs.twimg.com/media/${id}.jpg` })
const photo = (id) => ({ type: 'photo', id_str: id, media_url_https: image(id).url })
const dirs = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'inspiration-browser-save-'))
  dirs.push(dir)
  const paths = { dir, libraryFile: join(dir, 'library.json'), mediaDir: join(dir, 'media'), videosDir: join(dir, 'media/videos'), imagesDir: join(dir, 'media/images'), coversDir: join(dir, 'media/covers') }
  const store = createLocalStore({ paths, recycleFile: async () => { throw new Error('partial retries must not recycle previous files') } })
  const state = { payload: {}, error: null, failures: new Set(), bytes: new Map(), fetched: [], fetchHook: null, socialHook: null,
    analysisCalls: [], analysisExecute: async () => { throw new Error('analysis deliberately unavailable') } }
  const dispatcher = createLocalInspirationDispatcher({ localStore: store,
    socialFetcher: async () => { if (state.socialHook) await state.socialHook(); if (state.error) throw state.error; return { data: state.payload } },
    resolver: async () => [{ address: '93.184.216.34', family: 4 }],
    runFfmpeg: async () => { throw new Error('No poster fixture') },
    textComplete: { execute: async (args) => { state.analysisCalls.push(args); return state.analysisExecute(args) } },
    fetcher: async (url) => {
      state.fetched.push(url)
      if (state.fetchHook) await state.fetchHook(url)
      if (state.failures.has(url)) return { ok: false, status: 404 }
      return { ok: true, status: 200, arrayBuffer: async () => state.bytes.get(url) || (/\.mp4(?:\?|$)/.test(url) ? MP4 : PNG) }
    },
  })
  const run = (body = {}) => dispatcher.dispatch({ method: 'POST', url: '/omnimux/inspiration/local/import-url', body: {
    url: URL, auto_analyze: false, return_existing: true, preserve_available: true, ...body,
  } })
  return { store, paths, state, run, dispatcher }
}

async function settled(store, id) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const row = store.get(id)
    if (row.import_status !== 'importing') return row
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('background save did not settle')
}

describe('browser capture uses actual import and persistence', () => {
  it('preserves three files and a fixed missing position when one of four downloads fails', async () => {
    const { state, run, store, paths } = setup()
    state.error = new Error('parser unavailable')
    state.failures.add(image('two').url)
    const result = await run({ capture: { url: URL, shape: 'gallery', text: '完整正文', media_items: ['one', 'two', 'three', 'four'].map(image) } })
    assert.equal(result.status, 200)
    const row = createLocalStore({ paths }).get(result.body.data.id)
    assert.equal(row.import_status, 'degraded')
    assert.equal(row.content, '完整正文')
    assert.deepEqual(row.media_items.map((item) => item.status), ['saved', 'missing', 'saved', 'saved'])
    assert.equal(row.media_items[1].url, '')
    assert.equal(row.media_items[1].source_id, 'two')
    assert.equal(row.media_items[1].source_url, image('two').url)
    assert.match(row.import_error, /图片未保存.*404/)
    assert.deepEqual(Object.keys(row.local_paths).sort(), ['cover', 'image_1', 'image_3', 'image_4'])
    assert.equal(readdirSync(paths.imagesDir).length, 3)
    assert.equal(store.list().total, 1)
  })

  it('fills the same missing slot despite reordered parsing and retains unrelated analysis and user work', async () => {
    const { state, run, store, paths } = setup()
    state.payload = { text: 'original', mediaDetails: ['one', 'two', 'three'].map(photo) }
    state.failures.add(image('two').url)
    const first = (await run()).body.data
    const third = first.media_items[2].url
    const analysis = { status: 'done', result: { summary: 'third asset' }, input_fingerprint: 'third-stays' }
    const bodyTranslation = { text: 'translated body', source_fingerprint: 'same-body' }
    const draft = { references: [{ kind: 'media', media_index: 2 }], note: 'user-owned' }
    store.update(first.id, { analysis_results: { 'media:2': analysis }, body_translation: bodyTranslation,
      creation_draft: draft, creation_reference: { source_fingerprint: 'prepared' }, tags: ['keep'], is_favorite: true })
    state.payload = { text: 'original', mediaDetails: ['three', 'two', 'one'].map(photo) }
    state.failures.clear()
    state.fetched = []
    const second = (await run()).body.data
    assert.equal(second.id, first.id)
    assert.equal(second.import_status, 'ready')
    assert.deepEqual(second.media_items.map((item) => item.source_id), ['one', 'two', 'three'])
    assert.equal(second.media_items[2].url, third)
    assert.deepEqual(state.fetched, [image('two').url])
    assert.deepEqual(second.analysis_results['media:2'], analysis)
    assert.deepEqual(second.body_translation, bodyTranslation)
    assert.deepEqual(second.creation_draft, draft)
    assert.deepEqual(second.creation_reference, { source_fingerprint: 'prepared' })
    assert.deepEqual(second.tags, ['keep'])
    assert.equal(second.is_favorite, true)
    assert.equal(readdirSync(paths.imagesDir).length, 3)
  })

  it('keeps body, files and snapshot readable throughout a background retry', async () => {
    const { state, run, store, dispatcher } = setup()
    state.payload = { text: 'read me', images: [image('one').url, image('two').url] }
    state.failures.add(image('two').url)
    const first = (await run({ capture: { url: URL, text: 'capture text', media_items: [image('one'), image('two')] } })).body.data
    let release
    const held = new Promise((resolve) => { release = resolve })
    state.socialHook = () => held
    state.failures.clear()
    const response = await dispatcher.dispatch({ method: 'POST', url: '/omnimux/inspiration/local/import-url', body: { url: URL, background: true } })
    assert.equal(response.status, 202)
    assert.equal(response.body.data.content, 'read me')
    assert.equal(response.body.data.media_items[0].url, first.media_items[0].url)
    assert.deepEqual(response.body.data.capture, first.capture)
    assert.equal(response.body.data.preserve_available, true)
    assert.equal(response.body.data.auto_analyze, false)
    release()
    const row = await settled(store, first.id)
    assert.equal(row.import_status, 'ready')
    assert.equal(row.id, first.id)
  })

  it('keeps a video poster as a preview and never counts it as the missing video', async () => {
    const { run } = setup()
    const cover = 'https://pbs.twimg.com/amplify_video_thumb/1/poster.jpg'
    const result = await run({ capture: { url: URL, shape: 'video', text: 'watch', cover_url: cover,
      media_items: [{ type: 'video', url: '', poster_url: cover, source_id: 'video-1' }] } })
    const row = result.body.data
    assert.equal(row.type, 'video')
    assert.equal(row.import_status, 'degraded')
    assert.equal(row.media_items.length, 1)
    assert.equal(row.media_items[0].type, 'video')
    assert.equal(row.media_items[0].status, 'missing')
    assert.equal(row.media_items[0].url, '')
    assert.deepEqual(row.media_urls, [])
    assert.ok(existsSync(row.local_paths.cover))
  })

  it('saves a complete text post as ready and returns the same id for a duplicate', async () => {
    const { run, state } = setup()
    state.error = new Error('unavailable')
    const request = { capture: { url: URL, shape: 'text', text: '纯文字 &amp; 不重复解码', media_items: [] } }
    const first = await run(request)
    assert.equal(first.body.data.import_status, 'ready')
    assert.equal(first.body.data.content, request.capture.text)
    const duplicate = await run(request)
    assert.equal(duplicate.body.existing, true)
    assert.equal(duplicate.body.data.id, first.body.data.id)
  })

  it('fills a poster-identified video position when the parser later supplies its real media id', async () => {
    const { run, state } = setup()
    const poster = 'https://pbs.twimg.com/amplify_video_thumb/123/poster.jpg'
    const first = (await run({ capture: { url: URL, text: 'watch', shape: 'video', cover_url: poster,
      media_items: [{ type: 'video', url: '', poster_url: poster }] } })).body.data
    assert.match(first.media_items[0].source_id, /^poster:/)
    state.payload = { text: 'watch', mediaDetails: [{ type: 'video', id_str: '123', media_url_https: poster,
      video_info: { variants: [{ content_type: 'video/mp4', url: 'https://video.twimg.com/amplify_video/123/vid/main.mp4' }] } }] }
    const row = (await run()).body.data
    assert.equal(row.id, first.id)
    assert.equal(row.media_items.length, 1)
    assert.equal(row.media_items[0].status, 'saved')
    assert.equal(row.media_items[0].source_id, '123')
    assert.equal(row.import_status, 'ready')
  })

  it('retains all initially unknown missing positions without adding more on a retry', async () => {
    const { run } = setup()
    const capture = { url: URL, text: 'two known missing videos', media_items: [{ type: 'video', url: '' }, { type: 'video', url: '' }] }
    const first = (await run({ capture })).body.data
    assert.equal(first.media_items.length, 2)
    const row = (await run()).body.data
    assert.equal(row.media_items.length, 2)
    assert.ok(row.media_items.every((item) => item.status === 'missing'))
  })

  it('retains only a safe original link when parsing and capture both lack content', async () => {
    const { run, state } = setup()
    state.error = new Error('source offline')
    const result = await run()
    assert.equal(result.body.data.import_status, 'degraded')
    assert.equal(result.body.data.source_url, URL)
    assert.equal(result.body.data.content, '')
    assert.deepEqual(result.body.data.media_items, [])
    assert.match(result.body.data.import_error, /仅保留原帖链接.*source offline/)
  })

  it('prefers parser fields, preserves long capture text and whitelists quote and poll details', async () => {
    const { run, state, paths } = setup()
    state.payload = { author: { name: 'parser author', handle: '' }, stats: { likes: 10, views: null } }
    const text = '中文 &amp; '.repeat(1000)
    const capture = { url: URL, shape: 'quote', title: 'captured', text, local_paths: { video: '/private/file' }, analysis_results: { post: 'injected' },
      author: { name: 'page author', handle: 'page', local_paths: '/private' }, stats: { likes: 5, views: 12, arbitrary: 'ignored' },
      quoted: { text: 'quoted body', author: { name: 'quoted author' }, local_paths: { video: '/private' } },
      poll: { options: [{ label: 'A', pct: 25, path: '/private' }], votes: 4, arbitrary: 'ignored' }, media_items: [] }
    const row = (await run({ capture })).body.data
    assert.equal(row.content, text)
    assert.equal(row.author.name, 'parser author')
    assert.equal(row.author.handle, 'page')
    assert.equal(row.stats.likes, 10)
    assert.equal(row.stats.views, 12)
    assert.deepEqual(row.poll, { options: [{ label: 'A', pct: 25 }], votes: 4 })
    assert.equal(row.quoted.text, 'quoted body')
    assert.equal(row.capture.local_paths, undefined)
    assert.equal(row.capture.analysis_results, undefined)
    assert.equal(row.capture.author.local_paths, undefined)
    assert.equal(row.capture.quoted.local_paths, undefined)
    assert.deepEqual(createLocalStore({ paths }).get(row.id).capture, row.capture)
  })
})

describe('browser source and media safety', () => {
  it('rejects a different post, a home timeline, unsafe source and fake source-host matches', async () => {
    const { run, store } = setup()
    for (const captureUrl of ['https://x.com/creator/status/999', 'https://evil.example/x.com/creator/status/2111569272732553535']) {
      assert.equal((await run({ capture: { url: captureUrl, text: 'wrong post' } })).status, 400)
    }
    assert.equal((await run({ url: 'https://x.com/home', capture: { url: 'https://x.com/home', text: 'timeline' } })).status, 400)
    assert.equal((await run({ url: 'http://127.0.0.1/private' })).status, 400)
    assert.equal(store.list().total, 0)
  })

  it('does not fetch or persist dangerous snapshot media addresses', async () => {
    const { run, state } = setup()
    const row = (await run({ capture: { url: URL, text: 'body', media_items: [
      { type: 'video', source_id: 'unsafe', url: 'http://169.254.169.254/private.mp4', poster_url: 'file:///private' },
    ] } })).body.data
    assert.equal(row.import_status, 'degraded')
    assert.equal(row.media_items[0].status, 'missing')
    assert.equal(row.media_items[0].source_url, undefined)
    assert.equal(row.capture.media_items[0].url, '')
    assert.equal(row.capture.media_items[0].poster_url, undefined)
    assert.deepEqual(state.fetched, [])
  })

  it('keeps a known unusable parser video missing even when its body is available', async () => {
    const { run, state } = setup()
    state.payload = { text: 'body', video_url: 'http://169.254.169.254/private.mp4' }
    const row = (await run()).body.data
    assert.equal(row.import_status, 'degraded')
    assert.equal(row.media_items[0].type, 'video')
    assert.equal(row.media_items[0].status, 'missing')
    assert.deepEqual(state.fetched, [])
  })

  it('keeps unsafe parser image positions missing instead of misreporting a complete text save', async () => {
    const { run, state } = setup()
    state.payload = { text: 'body', images: ['http://127.0.0.1/private.jpg', 'file:///private/image.jpg'] }
    const row = (await run()).body.data
    assert.equal(row.import_status, 'degraded')
    assert.deepEqual(row.media_items.map((item) => item.status), ['missing', 'missing'])
    assert.ok(row.media_items.every((item) => !item.source_url))
    assert.deepEqual(state.fetched, [])
  })

  it('rejects per-attachment wrong file types while preserving correctly saved siblings', async () => {
    const { run, state, paths } = setup()
    const videoUrl = 'https://video.twimg.com/amplify_video/123/vid/main.mp4'
    state.payload = { text: 'wrong type', mediaDetails: [photo('one'), { type: 'video', url: videoUrl }, photo('three')] }
    state.bytes.set(videoUrl, PNG)
    state.bytes.set(image('three').url, Buffer.from('{"error":"not media"}'))
    const row = (await run()).body.data
    assert.deepEqual(row.media_items.map((entry) => entry.status), ['saved', 'missing', 'missing'])
    assert.equal(row.import_status, 'degraded')
    assert.equal(readdirSync(paths.videosDir).length, 0)
    assert.equal(readdirSync(paths.imagesDir).length, 1)
  })

  it('repairs an old remote-only video in place instead of reporting a complete duplicate', async () => {
    const { run, state, store } = setup()
    const videoUrl = 'https://video.twimg.com/amplify_video/123/vid/main.mp4'
    const old = store.add({ title: 'old video', type: 'video', source_url: URL, content: 'old body', media_urls: [videoUrl], local_paths: {} })
    state.payload = { text: 'old body', video_url: videoUrl }
    const result = await run()
    assert.equal(result.body.existing, undefined)
    assert.equal(result.body.data.id, old.id)
    assert.equal(result.body.data.import_status, 'ready')
    assert.ok(existsSync(result.body.data.local_paths.video))
    assert.equal(result.body.data.media_items.length, 1)
    state.fetched = []
    const duplicate = await run()
    assert.equal(duplicate.body.existing, true)
    assert.deepEqual(state.fetched, [])
  })

  it('does not reuse symlinks or missing old files as saved media', async () => {
    const { run, state, store, paths } = setup()
    store.add({ title: 'initialize dirs' })
    const outside = join(paths.dir, 'outside.jpg')
    const link = join(paths.imagesDir, 'linked.jpg')
    writeFileSync(outside, PNG)
    symlinkSync(outside, link)
    const old = store.add({ title: 'old', type: 'image', source_url: URL, import_status: 'ready', media_items: [
      { type: 'image', url: `/omnimux/inspiration/local/media/images/${basename(link)}`, source_id: 'one', source_url: image('one').url },
    ], local_paths: { image_1: link } })
    state.payload = { text: 'body', mediaDetails: [photo('one')] }
    const result = await run()
    assert.equal(result.body.data.id, old.id)
    assert.notEqual(result.body.data.local_paths.image_1, link)
    assert.equal(result.body.data.import_status, 'ready')
    assert.ok(existsSync(outside))
  })
})

describe('browser result reconciliation and failures', () => {
  it('returns at most one exact source match, including canonical tweet aliases', async () => {
    const { run, dispatcher, store } = setup()
    const first = (await run({ capture: { url: URL, text: 'needle', shape: 'text', media_items: [] } })).body.data
    store.add({ title: URL, source_url: 'https://x.com/creator/status/999', content: URL })
    const unrelated = store.add({ title: 'embedded source is unrelated', source_url: `https://evil.example/${URL.slice('https://'.length)}` }, { allowDuplicate: true })
    const lookup = (source) => dispatcher.dispatch({ method: 'GET', url: `/omnimux/inspiration/local?source_url=${encodeURIComponent(source)}` })
    const found = await lookup('https://twitter.com/other/status/2111569272732553535?utm_source=page')
    assert.deepEqual(found.body.data.items.map((item) => item.id), [first.id])
    assert.equal(found.body.data.total, 1)
    assert.equal((await lookup('https://x.com/creator/status/211156927273255353')).body.data.total, 0)
    assert.deepEqual((await lookup('https://evil.example/x.com/creator/status/2111569272732553535')).body.data.items.map((item) => item.id), [unrelated.id])
    assert.equal((await lookup('http://localhost/private')).status, 400)
  })

  it('persists accepted background work then allows receipt-loss lookup of its terminal result', async () => {
    const { state, run, store, dispatcher } = setup()
    state.error = new Error('parser unavailable')
    const response = await run({ background: true, capture: { url: URL, shape: 'text', text: 'fallback body', media_items: [] } })
    assert.equal(response.status, 202)
    assert.ok(response.body.data.id)
    assert.equal(response.body.data.import_status, 'importing')
    await settled(store, response.body.data.id)
    const found = await dispatcher.dispatch({ method: 'GET', url: `/omnimux/inspiration/local?source_url=${encodeURIComponent(URL)}` })
    assert.equal(found.body.data.items[0].id, response.body.data.id)
    assert.equal(found.body.data.items[0].import_status, 'ready')
  })

  it('only cleans new unreferenced files when persistence fails and leaves reused files intact', async () => {
    const { state, run, store, paths } = setup()
    state.payload = { text: 'body', mediaDetails: [photo('one'), photo('two')] }
    state.failures.add(image('two').url)
    const first = (await run()).body.data
    const firstFile = first.local_paths.image_1
    const oldUpdate = store.update.bind(store)
    store.update = (id, patch) => {
      if (patch.media_items?.[1]?.status === 'saved') throw new Error('injected write failure')
      return oldUpdate(id, patch)
    }
    state.failures.clear()
    const response = await run()
    assert.equal(response.status, 500)
    assert.ok(existsSync(firstFile))
    assert.equal(readdirSync(paths.imagesDir).length, 1)
    assert.equal(store.get(first.id).media_items[0].url, first.media_items[0].url)
  })

  it('keeps newly registered files when a later store operation fails', async () => {
    const { state, run, store, paths } = setup()
    state.payload = { text: 'body', mediaDetails: [photo('one'), photo('two')] }
    const oldUpdate = store.update.bind(store)
    store.update = (id, patch) => {
      const result = oldUpdate(id, patch)
      if (patch.media_items?.[1]?.status === 'saved') throw new Error('write completed then response failed')
      return result
    }
    const receipt = await run({ background: true })
    await settled(store, receipt.body.data.id)
    const row = store.get(receipt.body.data.id)
    assert.deepEqual(row.media_items.map((item) => item.status), ['saved', 'saved'])
    assert.equal(readdirSync(paths.imagesDir).length, 2)
    assert.ok(Object.values(row.local_paths).every(existsSync))
  })

  it('appends newly identified media without filling an unidentified old slot by array position', async () => {
    const { run, state, store } = setup()
    const old = store.add({ title: 'unknown old media', type: 'image', source_url: URL, import_status: 'degraded', preserve_available: true,
      media_items: [{ type: 'image', url: '', status: 'missing', error: 'unknown' }] })
    state.payload = { text: 'body', mediaDetails: [photo('one')] }
    const row = (await run()).body.data
    assert.equal(row.id, old.id)
    assert.deepEqual(row.media_items.map((entry) => entry.status), ['missing', 'saved'])
    assert.equal(row.media_items[1].source_id, 'one')
    assert.equal(row.import_status, 'degraded')
  })

  it('keeps a saved video analysis when a retry is still missing a different attachment', async () => {
    const { run, state, store } = setup()
    const videoUrl = 'https://video.twimg.com/amplify_video/123/vid/main.mp4'
    state.payload = { text: 'body', mediaDetails: [{ type: 'video', url: videoUrl }, photo('missing')] }
    state.failures.add(image('missing').url)
    const first = (await run()).body.data
    const analysis = { status: 'done', result: { summary: 'keep actual analysis' }, source: 'live' }
    store.update(first.id, { analysis_results: { 'media:0': analysis }, auto_analyze: true })
    const row = (await run({ auto_analyze: true })).body.data
    assert.equal(row.import_status, 'degraded')
    assert.deepEqual(row.analysis_results['media:0'], analysis)
  })
})

describe('unscoped analysis preserves fixed browser media identities', () => {
  const video = (id, available) => ({ type: 'video', id_str: id,
    media_url_https: `https://pbs.twimg.com/amplify_video_thumb/${id}/poster.jpg`,
    ...(available ? { video_info: { variants: [{ content_type: 'video/mp4', url: `https://video.twimg.com/amplify_video/${id}/vid/main.mp4` }] } } : {}) })
  const analyze = (dispatcher, id) => dispatcher.dispatch({ method: 'POST', url: `/omnimux/inspiration/local/${id}/analyze`, body: undefined })

  it('refuses a missing first video without redownloading the second or changing either position', async () => {
    const { run, state, store, dispatcher } = setup()
    state.payload = { text: 'two videos', mediaDetails: [video('111', false), video('222', true)] }
    const saved = (await run()).body.data
    assert.deepEqual(saved.media_items.map((asset) => [asset.source_id, asset.status]), [['111', 'missing'], ['222', 'saved']])
    const fetched = [...state.fetched]
    const response = await analyze(dispatcher, saved.id)
    assert.equal(response.status, 422)
    assert.match(response.body.error, /首个视频尚未保存/)
    const current = store.get(saved.id)
    assert.deepEqual(current.media_items, saved.media_items)
    assert.deepEqual(current.local_paths, saved.local_paths)
    assert.deepEqual(state.fetched, fetched)
    assert.equal(state.analysisCalls.length, 0)
    assert.deepEqual(current.analysis_results, {})
  })

  it('analyzes the first saved video at its actual index and preserves source identity on provider failure', async () => {
    const { run, state, store, dispatcher } = setup()
    state.payload = { text: 'photo then two videos', mediaDetails: [photo('photo'), video('111', true), video('222', true)] }
    const saved = (await run()).body.data
    const fetched = [...state.fetched]
    const response = await analyze(dispatcher, saved.id)
    assert.equal(response.status, 502)
    assert.equal(response.body.analysis_key, 'media:1')
    assert.deepEqual(state.analysisCalls[0].references, [{ type: 'video', pathOrUrl: realpathSync(saved.local_paths.video) }])
    const current = store.get(saved.id)
    assert.deepEqual(current.media_items, saved.media_items)
    assert.deepEqual(current.local_paths, saved.local_paths)
    assert.deepEqual(state.fetched, fetched)
    assert.equal(current.analysis_results['media:1'].status, 'failed')
    assert.equal(current.analysis_results['media:0'], undefined)
  })

  it('permits a saved first video while a later video remains missing, and mirrors actual analysis for old callers', async () => {
    const { run, state, store, dispatcher } = setup()
    state.payload = { text: 'first available', mediaDetails: [video('111', true), video('222', false)] }
    state.analysisExecute = async () => ({ mode: 'live', model: 'test-model', text: '实际提供的第一段视频分析' })
    const saved = (await run()).body.data
    const response = await analyze(dispatcher, saved.id)
    assert.equal(response.status, 200)
    assert.equal(response.body.analysis_key, 'media:0')
    assert.deepEqual(state.analysisCalls[0].references, [{ type: 'video', pathOrUrl: realpathSync(saved.local_paths.video) }])
    const current = store.get(saved.id)
    assert.deepEqual(current.media_items, saved.media_items)
    assert.deepEqual(current.local_paths, saved.local_paths)
    assert.equal(current.analysis_results['media:0'].source, 'live')
    assert.equal(current.analysis_results['media:1'], undefined)
    assert.equal(current.deconstruction.markdown, '实际提供的第一段视频分析')
  })
})
