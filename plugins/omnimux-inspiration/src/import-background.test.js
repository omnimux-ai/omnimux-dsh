import assert from 'node:assert/strict'
import { after, beforeEach, describe, it } from 'node:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStore } from './local-store.js'
import { createLocalInspirationDispatcher } from './http-routes.js'
import { IMPORT_STALE_AFTER_MS } from './import-status.js'

/**
 * Gate for the background import route.
 *
 * The synchronous contract this route already had is the thing most at risk: the
 * Agent tool `inspiration_create` reads `media_degraded` / `degrade_reason` off
 * the same dispatcher call, so a change that answers 202 on that path would break
 * the tool silently. Every assertion about status codes and response keys is
 * therefore paired with a sync-mode case that must not move.
 *
 * No test here touches the network: the social fetcher is injected, the media
 * fetcher is a stub, and the DNS resolver is replaced so even the download target
 * check never leaves the process.
 */
const X_URL = 'https://x.com/creator/status/2098246364895547904'

const X_VIDEO_ENVELOPE = {
  platform: 'x',
  capability: 'tweet',
  data: {
    text: '开场三秒反杀，这就是钩子',
    media: {
      video: [
        {
          media_url_https: 'https://pbs.twimg.com/amplify_video_thumb/1/img/cover.jpg',
          variants: [
            { content_type: 'video/mp4', bitrate: 2176000, url: 'https://video.twimg.com/amplify_video/1/vid/1280x720/high.mp4' },
          ],
        },
      ],
    },
  },
}

/** Envelope with content but no downloadable stream → degraded import. */
const X_PHOTO_ENVELOPE = {
  platform: 'x',
  capability: 'tweet',
  data: {
    text: '只有一张图',
    entities: { media: [{ media_url_https: 'https://pbs.twimg.com/media/only-photo.jpg', type: 'photo' }] },
  },
}

const mockFetcher = async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('fake-media-content') })

/** Offline `dns.lookup` stand-in: the suite must issue no DNS query at all. */
async function offlineResolver() {
  return [{ address: '93.184.216.34', family: 4 }]
}

function makePaths(tmp) {
  return {
    dir: tmp,
    libraryFile: join(tmp, 'library.json'),
    mediaDir: join(tmp, 'media'),
    coversDir: join(tmp, 'media', 'covers'),
    videosDir: join(tmp, 'media', 'videos'),
    imagesDir: join(tmp, 'media', 'images'),
  }
}

function makeDispatcher(paths, socialFetcher) {
  const store = createLocalStore({ paths })
  const dispatcher = createLocalInspirationDispatcher({
    resolver: offlineResolver,
    localStore: store,
    socialFetcher,
    fetcher: mockFetcher,
  })
  return { store, dispatcher }
}

function postImport(dispatcher, body) {
  return dispatcher.dispatch({
    method: 'POST',
    url: '/omnimux/inspiration/local/import-url',
    body: { auto_analyze: false, ...body },
  })
}

function getItem(dispatcher, id) {
  return dispatcher.dispatch({ method: 'GET', url: `/omnimux/inspiration/local/${id}` })
}

function listItems(dispatcher) {
  return dispatcher.dispatch({ method: 'GET', url: '/omnimux/inspiration/local' })
}

/**
 * Wait for a background job to settle.
 *
 * A job runs asynchronously inside the same process, so the test polls the row it
 * owns until the status leaves `importing` — the same signal a browser uses.
 * @param {{ store: any }} ctx
 * @param {string} id
 * @param {{ timeoutMs?: number }} [options]
 */
async function waitForSettled(ctx, id, options = {}) {
  const timeoutMs = options.timeoutMs ?? 5000
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const row = ctx.store.get(id)
    if (row && row.import_status !== 'importing') return row
    if (Date.now() > deadline) {
      throw new Error(`background import ${id} never settled (status=${row?.import_status}, stage=${row?.import_stage})`)
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe('background import — placeholder and completion', { concurrency: 1 }, () => {
  let tmp
  let paths

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'omnimux-bg-import-'))
    paths = makePaths(tmp)
  })

  after(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('answers 202 with a persisted placeholder before the job starts', async () => {
    const ctx = makeDispatcher(paths, async () => X_VIDEO_ENVELOPE)
    const res = await postImport(ctx.dispatcher, { url: X_URL, background: true, tags: ['钩子'] })

    assert.equal(res.status, 202)
    assert.equal(res.body.data.import_status, 'importing')
    assert.equal(res.body.data.import_stage, 'resolving')
    // The title is the raw URL, never a localized placeholder string: the row is
    // data, and its language must not be frozen by whichever page created it.
    assert.equal(res.body.data.title, X_URL)
    assert.equal(res.body.data.source_url, X_URL)
    assert.equal(res.body.data.type, 'video')
    assert.deepEqual(res.body.data.tags, ['钩子'])
    assert.deepEqual(res.body.data.media_urls, [])
    assert.deepEqual(res.body.data.local_paths, {})
    assert.equal(typeof res.body.data.import_started_at, 'string')

    // Rebuilt from disk: the placeholder must survive the row whitelist. The job
    // advances on its own schedule, so only the presence of the row is asserted
    // here and the settled statuses are covered by the completion cases below.
    const persisted = createLocalStore({ paths }).get(res.body.data.id)
    assert.ok(persisted, 'the placeholder must already be on disk when the 202 is sent')
    assert.ok(
      ['importing', 'ready', 'degraded', 'failed'].includes(persisted.import_status),
      `the persisted placeholder must carry a known status, got ${persisted.import_status}`,
    )
    assert.equal(persisted.source_url, X_URL)

    await waitForSettled(ctx, res.body.data.id)
  })

  it('completes the placeholder in place, keeping id and creation time', async () => {
    const ctx = makeDispatcher(paths, async () => X_VIDEO_ENVELOPE)
    const started = await postImport(ctx.dispatcher, { url: X_URL, background: true })
    const placeholderId = started.body.data.id
    const placeholderCreatedAt = started.body.data.created_at

    const settled = await waitForSettled(ctx, placeholderId)

    assert.equal(settled.id, placeholderId, 'the completion must reuse the placeholder id')
    assert.equal(settled.created_at, placeholderCreatedAt, 'creation time must survive the replace')
    assert.equal(settled.import_status, 'ready')
    assert.equal(settled.import_stage, null)
    assert.equal(settled.import_error, null)
    assert.equal(settled.type, 'video')
    assert.equal(settled.media_urls.length, 1)
    assert.ok(settled.media_urls[0].startsWith('/omnimux/inspiration/local/media/videos/'))
    assert.ok(existsSync(settled.local_paths.video))
    // One link is still one card.
    assert.equal(ctx.store.list().total, 1)
  })

  it('keeps the favourite flag the placeholder accumulated', async () => {
    const ctx = makeDispatcher(paths, async () => X_VIDEO_ENVELOPE)
    const started = await postImport(ctx.dispatcher, { url: X_URL, background: true })
    ctx.store.update(started.body.data.id, { is_favorite: true })

    const settled = await waitForSettled(ctx, started.body.data.id)
    assert.equal(settled.is_favorite, true)
  })

  it('settles a degraded import and reports the state it settled in', async () => {
    const ctx = makeDispatcher(paths, async () => X_PHOTO_ENVELOPE)
    const started = await postImport(ctx.dispatcher, { url: X_URL, background: true })

    const settled = await waitForSettled(ctx, started.body.data.id)
    assert.equal(settled.import_status, 'degraded')
    assert.equal(settled.import_stage, null)
    // A photo post whose envelope carries only text and a poster is a `link`: the
    // classifier promotes to `image` only when the envelope lists image urls.
    assert.equal(settled.type, 'link')
    assert.deepEqual(settled.media_urls, [])
    assert.equal(ctx.store.list().total, 1)
  })

  it('marks a failed import instead of dropping the row', async () => {
    const ctx = makeDispatcher(paths, async () => {
      throw new Error('云端解析失败')
    })
    const started = await postImport(ctx.dispatcher, { url: X_URL, background: true })

    const settled = await waitForSettled(ctx, started.body.data.id)
    assert.equal(settled.import_status, 'failed')
    assert.equal(settled.import_stage, null)
    assert.match(settled.import_error, /云端解析失败/)
    // The row is kept so the failure stays visible and the URL stays retryable.
    assert.equal(ctx.store.list().total, 1)
  })

  it('has no stage for a degraded import, which never reaches the AI', async () => {
    const ctx = makeDispatcher(paths, async () => X_PHOTO_ENVELOPE)
    const started = await postImport(ctx.dispatcher, { url: X_URL, background: true, auto_analyze: true })
    const id = started.body.data.id
    // The row it was created with is the only stage this import may ever have.
    assert.equal(started.body.data.import_stage, 'resolving')

    const settled = await waitForSettled(ctx, id)
    assert.equal(settled.import_status, 'degraded')
    assert.equal(settled.import_stage, null, 'a post without a video must never claim AI work')
  })

  it('reports the download stage while a stream is being fetched', async () => {
    let releaseMedia
    const mediaGate = new Promise((resolve) => { releaseMedia = resolve })
    let startedDownloading = false
    const ctx = makeDispatcher(paths, async () => X_VIDEO_ENVELOPE)
    ctx.dispatcher = createLocalInspirationDispatcher({
      resolver: offlineResolver,
      localStore: ctx.store,
      socialFetcher: async () => X_VIDEO_ENVELOPE,
      fetcher: async () => {
        startedDownloading = true
        await mediaGate
        return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('fake') }
      },
    })

    const started = await postImport(ctx.dispatcher, { url: X_URL, background: true })
    const id = started.body.data.id

    // Hold the media transfer open and read the row while it is in flight.
    for (let attempt = 0; attempt < 200 && !startedDownloading; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
    assert.ok(startedDownloading, 'the media download must have started')
    assert.equal(ctx.store.get(id).import_stage, 'downloading')

    releaseMedia()
    await waitForSettled(ctx, id)
  })

  it('publishes every stage exactly once, in order, and never after the write', async () => {
    const ctx = makeDispatcher(paths, async () => X_VIDEO_ENVELOPE)
    ctx.dispatcher = createLocalInspirationDispatcher({
      resolver: offlineResolver,
      localStore: ctx.store,
      socialFetcher: async () => X_VIDEO_ENVELOPE,
      fetcher: mockFetcher,
      analyzeInspiration: async () => ({ deconstruction: null, error: '' }),
    })
    /** @type {string[]} */
    const published = []
    const update = ctx.store.update.bind(ctx.store)
    ctx.store.update = (id, patch) => {
      if (patch.import_stage !== undefined) published.push(patch.import_stage)
      return update(id, patch)
    }

    const started = await postImport(ctx.dispatcher, { url: X_URL, background: true, auto_analyze: true })
    const settled = await waitForSettled(ctx, started.body.data.id)

    // The card renders `import_stage` verbatim, so the sequence is a user-visible
    // contract: a repeated stage shows a stale label, and a stage published after
    // its step finished shows a label for work that is already done. `persisting`
    // was written twice — once while the completion was being written and again
    // after it was already on disk — which left finished rows reading "写入中…".
    assert.deepEqual(published, ['downloading', 'analyzing', 'persisting', null])
    assert.equal(settled.import_status, 'ready')
    assert.equal(settled.import_stage, null)
  })
})

describe('background import — idempotency and duplicates', { concurrency: 1 }, () => {
  let tmp
  let paths

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'omnimux-bg-idem-'))
    paths = makePaths(tmp)
  })

  after(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('answers 202 with the same row for a second request while the job runs', async () => {
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const ctx = makeDispatcher(paths, async () => {
      await gate
      return X_VIDEO_ENVELOPE
    })

    const first = await postImport(ctx.dispatcher, { url: X_URL, background: true })
    const second = await postImport(ctx.dispatcher, { url: X_URL, background: true })

    assert.equal(first.status, 202)
    assert.equal(second.status, 202, 'a repeated background request must not be rate-limited')
    assert.equal(second.body.data.id, first.body.data.id, 'both answers must name the same row')
    assert.equal(ctx.store.list().total, 1, 'a repeated request must not create a second card')

    release()
    await waitForSettled(ctx, first.body.data.id)
  })

  it('keeps separate rows for separate URLs', async () => {
    const ctx = makeDispatcher(paths, async () => X_VIDEO_ENVELOPE)
    const other = 'https://x.com/creator/status/2098246364895547905'

    const first = await postImport(ctx.dispatcher, { url: X_URL, background: true })
    const second = await postImport(ctx.dispatcher, { url: other, background: true })

    assert.equal(first.status, 202)
    assert.equal(second.status, 202)
    assert.notEqual(second.body.data.id, first.body.data.id)
    assert.equal(ctx.store.list().total, 2)

    await waitForSettled(ctx, first.body.data.id)
    await waitForSettled(ctx, second.body.data.id)
  })

  it('answers 409 for a background request on a URL that already holds a video', async () => {
    const ctx = makeDispatcher(paths, async () => X_VIDEO_ENVELOPE)
    const first = await postImport(ctx.dispatcher, { url: X_URL, background: true })
    await waitForSettled(ctx, first.body.data.id)

    const repeat = await postImport(ctx.dispatcher, { url: X_URL, background: true })
    assert.equal(repeat.status, 409)
    assert.equal(repeat.body.is_duplicate, true)
    assert.equal(ctx.store.list().total, 1)
  })

  it('restarts a failed row in place instead of creating a second card', async () => {
    let shouldFail = true
    const ctx = makeDispatcher(paths, async () => {
      if (shouldFail) throw new Error('第一次失败')
      return X_VIDEO_ENVELOPE
    })

    const started = await postImport(ctx.dispatcher, { url: X_URL, background: true })
    const failed = await waitForSettled(ctx, started.body.data.id)
    assert.equal(failed.import_status, 'failed')

    shouldFail = false
    const retry = await postImport(ctx.dispatcher, { url: X_URL, background: true })
    assert.equal(retry.status, 202)
    assert.equal(retry.body.data.id, started.body.data.id, 'a retry reuses the failed row')
    assert.equal(retry.body.data.import_status, 'importing')

    const settled = await waitForSettled(ctx, started.body.data.id)
    assert.equal(settled.import_status, 'ready')
    assert.equal(ctx.store.list().total, 1)
  })

  it('upgrades a degraded row in place through the background path', async () => {
    const ctx = makeDispatcher(paths, async () => X_PHOTO_ENVELOPE)
    const first = await postImport(ctx.dispatcher, { url: X_URL, background: true })
    const degraded = await waitForSettled(ctx, first.body.data.id)
    assert.equal(degraded.import_status, 'degraded')
    assert.equal(degraded.type, 'link')

    const videoDispatcher = makeDispatcher(paths, async () => X_VIDEO_ENVELOPE)
    const upgrade = await postImport(videoDispatcher.dispatcher, { url: X_URL, background: true })
    assert.equal(upgrade.status, 202)
    assert.equal(upgrade.body.data.id, degraded.id, 'the upgrade must reuse the degraded row')
    // Asserted on the 202 body, which is a snapshot: the job may already have
    // advanced the persisted row by the time this line runs.
    assert.equal(upgrade.body.data.import_status, 'importing')

    const settled = await waitForSettled(videoDispatcher, degraded.id)
    assert.equal(settled.import_status, 'ready')
    assert.equal(settled.type, 'video')
    assert.equal(videoDispatcher.store.list().total, 1)
  })
})

describe('synchronous import — unchanged contract', { concurrency: 1 }, () => {
  let tmp
  let paths

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'omnimux-sync-import-'))
    paths = makePaths(tmp)
  })

  after(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('answers 200 with the complete record when background is absent', async () => {
    const ctx = makeDispatcher(paths, async () => X_VIDEO_ENVELOPE)
    const res = await postImport(ctx.dispatcher, { url: X_URL })

    assert.equal(res.status, 200)
    assert.equal(res.body.media_degraded, undefined)
    assert.equal(res.body.degrade_reason, undefined)
    assert.deepEqual(Object.keys(res.body), ['data'])
    assert.equal(res.body.data.type, 'video')
    assert.equal(res.body.data.import_status, 'ready')
    assert.equal(res.body.data.import_stage, null)
    assert.ok(existsSync(res.body.data.local_paths.video))
  })

  it('keeps its degraded body keys exactly when background is false', async () => {
    const ctx = makeDispatcher(paths, async () => X_PHOTO_ENVELOPE)
    const res = await postImport(ctx.dispatcher, { url: X_URL, background: false })

    assert.equal(res.status, 200)
    assert.equal(res.body.media_degraded, true)
    assert.equal(typeof res.body.degrade_reason, 'string')
    assert.deepEqual(Object.keys(res.body).sort(), ['data', 'degrade_reason', 'media_degraded'])
    assert.equal(res.body.data.import_status, 'degraded')
  })

  it('answers 409 for a stored video and 200 for a re-resolvable duplicate', async () => {
    const ctx = makeDispatcher(paths, async () => X_VIDEO_ENVELOPE)
    await postImport(ctx.dispatcher, { url: X_URL })
    const repeat = await postImport(ctx.dispatcher, { url: X_URL })
    assert.equal(repeat.status, 409)
    assert.equal(repeat.body.is_duplicate, true)

    const withExisting = await postImport(ctx.dispatcher, { url: X_URL, return_existing: true })
    assert.equal(withExisting.status, 200)
    assert.equal(withExisting.body.existing, true)
    assert.equal(withExisting.body.is_duplicate, true)
  })

  it('answers 429 while the same URL is being imported', async () => {
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const ctx = makeDispatcher(paths, async () => {
      await gate
      return X_VIDEO_ENVELOPE
    })

    const first = postImport(ctx.dispatcher, { url: X_URL })
    const second = await postImport(ctx.dispatcher, { url: X_URL })
    assert.equal(second.status, 429)
    assert.match(second.body.error, /正在解析导入中/)
    release()
    assert.equal((await first).status, 200)
  })

  it('answers 400, 422 and 502 unchanged', async () => {
    const empty = makeDispatcher(paths, async () => X_VIDEO_ENVELOPE)
    assert.equal((await postImport(empty.dispatcher, { url: '' })).status, 400)

    const blank = makeDispatcher(paths, async () => ({ platform: 'x', data: {} }))
    const blankRes = await postImport(blank.dispatcher, { url: X_URL })
    assert.equal(blankRes.status, 422)

    const broken = makeDispatcher(paths, async () => {
      throw new Error('网关错误')
    })
    const brokenRes = await postImport(broken.dispatcher, { url: X_URL })
    assert.equal(brokenRes.status, 502)
    assert.match(brokenRes.body.error, /网关错误/)
  })

  it('imports a video on the background=false request of a resumed agent tool call', async () => {
    // `inspiration_create` dispatches with no `background` key at all and reads the
    // record synchronously; that is the call this whole suite protects.
    const ctx = makeDispatcher(paths, async () => X_PHOTO_ENVELOPE)
    const result = await ctx.dispatcher.dispatch({
      method: 'POST',
      url: '/omnimux/inspiration/local/import-url',
      body: { url: X_URL, tags: [], auto_analyze: false },
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.data.title.includes('https://'), false)
    assert.equal(result.body.media_degraded, true)
    assert.equal(typeof result.body.degrade_reason, 'string')
  })
})

describe('stale import sweep', () => {
  let tmp
  let paths

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'omnimux-stale-'))
    paths = makePaths(tmp)
  })

  after(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('fails an abandoned row on the next read and leaves fresh rows alone', async () => {
    const ctx = makeDispatcher(paths, async () => X_VIDEO_ENVELOPE)
    const abandoned = ctx.store.add({
      title: X_URL,
      source_url: X_URL,
      import_status: 'importing',
      import_stage: 'downloading',
      import_started_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    })
    const fresh = ctx.store.add({
      title: 'https://x.com/creator/status/2098246364895547906',
      source_url: 'https://x.com/creator/status/2098246364895547906',
      import_status: 'importing',
      import_stage: 'resolving',
      import_started_at: new Date(Date.now() - 5_000).toISOString(),
    })

    const listed = await listItems(ctx.dispatcher)
    const rows = new Map(listed.body.data.items.map((row) => [row.id, row]))

    assert.equal(rows.get(abandoned.id).import_status, 'failed')
    assert.equal(rows.get(abandoned.id).import_stage, null)
    assert.equal(rows.get(abandoned.id).import_error, '导入中断或超时，请重试')
    // A job that started seconds ago is healthy, however long it may still run.
    assert.equal(rows.get(fresh.id).import_status, 'importing')
    assert.equal(rows.get(fresh.id).import_stage, 'resolving')

    // The verdict is durable, not a presentation-only overlay.
    assert.equal(ctx.store.get(abandoned.id).import_status, 'failed')
    assert.equal(ctx.store.get(fresh.id).import_status, 'importing')
  })

  it('applies the same verdict to a single-row read', async () => {
    const ctx = makeDispatcher(paths, async () => X_VIDEO_ENVELOPE)
    const abandoned = ctx.store.add({
      title: X_URL,
      source_url: X_URL,
      import_status: 'importing',
      import_stage: 'analyzing',
      import_started_at: new Date(Date.now() - IMPORT_STALE_AFTER_MS - 1_000).toISOString(),
    })

    const res = await getItem(ctx.dispatcher, abandoned.id)
    assert.equal(res.status, 200)
    assert.equal(res.body.data.import_status, 'failed')
    assert.equal(res.body.data.import_error, '导入中断或超时，请重试')
  })

  it('never fails a row a live job still owns, however old it is', async () => {
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const ctx = makeDispatcher(paths, async () => {
      await gate
      return X_VIDEO_ENVELOPE
    })

    const started = await postImport(ctx.dispatcher, { url: X_URL, background: true })
    const id = started.body.data.id
    // Backdate the row past every deadline: only the live-job check can save it.
    const library = JSON.parse(readFileSync(paths.libraryFile, 'utf8'))
    library.items[0].import_started_at = new Date(Date.now() - 10 * 60_000).toISOString()
    writeFileSync(paths.libraryFile, JSON.stringify(library), 'utf8')

    const listed = await listItems(ctx.dispatcher)
    const row = listed.body.data.items.find((item) => item.id === id)
    assert.equal(row.import_status, 'importing', 'a slow but live job must not be failed underneath itself')

    release()
    const settled = await waitForSettled(ctx, id)
    assert.equal(settled.import_status, 'ready')
  })

  it('leaves settled rows untouched and costs nothing on a clean library', async () => {
    const ctx = makeDispatcher(paths, async () => X_VIDEO_ENVELOPE)
    await postImport(ctx.dispatcher, { url: X_URL })
    const before = ctx.store.get(ctx.store.list().items[0].id)

    await listItems(ctx.dispatcher)
    const after = ctx.store.get(before.id)
    assert.equal(after.import_status, 'ready')
    assert.equal(after.import_error, null)
  })
})

describe('background import — an AI failure never discards the item', { concurrency: 1 }, () => {
  let tmp
  let paths

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'omnimux-bg-analyze-'))
    paths = makePaths(tmp)
  })

  after(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  /**
   * Dispatcher with a stubbed analysis tool.
   *
   * `analyzeInspirationVideo` swallows a throwing tool and degrades to its local
   * semantic generator, so this is the *partial* failure a real AI outage
   * produces: a breakdown is stored, but never the model's. Both branches must end
   * in a stored item — the point of these cases is that nothing the analysis does
   * may discard the download.
   * @param {{ execute?: (args: object) => Promise<any> }} videoAnalyzeTool
   * @param {object} [extra] additional dispatcher dependencies
   */
  function dispatcherWithAnalyzer(videoAnalyzeTool, extra = {}) {
    const store = createLocalStore({ paths })
    const dispatcher = createLocalInspirationDispatcher({
      resolver: offlineResolver,
      localStore: store,
      socialFetcher: async () => X_VIDEO_ENVELOPE,
      fetcher: mockFetcher,
      videoAnalyzeTool,
      ...extra,
    })
    return { store, dispatcher }
  }

  it('keeps the item and records the reason when the AI reports no breakdown', async () => {
    // The analysis stage answering "no breakdown" is the failure this ruling is
    // about. It must not take the download with it: the video, the cover and the
    // metadata are already on disk, and re-importing to get them back is a waste
    // of the user's time. A `failed` row would do exactly that — this one stays
    // `ready` with the reason written down.
    const reason = 'AI 视频拆解失败，请确保大模型视觉分析服务可用'
    const ctx = dispatcherWithAnalyzer({ execute: async () => '' }, {
      analyzeInspiration: async () => ({ deconstruction: null, error: reason }),
    })

    const started = await postImport(ctx.dispatcher, { url: X_URL, background: true, auto_analyze: true })
    const settled = await waitForSettled(ctx, started.body.data.id)

    assert.equal(ctx.store.list().total, 1, 'the item must still be in the library')
    assert.equal(settled.type, 'video')
    assert.equal(settled.media_urls.length, 1, 'the download must be kept')
    assert.match(settled.media_urls[0], /^\/omnimux\/inspiration\/local\/media\/videos\//)
    assert.equal(settled.import_status, 'ready', 'a stored item is a completion, not a failure')
    assert.equal(settled.import_stage, null)
    assert.equal(settled.import_error, reason, 'the reason must reach the row')
    assert.equal(settled.deconstruction ?? null, null)

    // The user can still get the breakdown afterwards — on the row they kept.
    const analyzed = await ctx.dispatcher.dispatch({
      method: 'POST',
      url: `/omnimux/inspiration/local/${started.body.data.id}/analyze`,
      body: {},
    })
    assert.equal(analyzed.status, 200, `re-analysis must succeed (${analyzed.body?.error || ''})`)
    assert.ok(analyzed.body?.data?.deconstruction, 'the row must come back with a breakdown')
  })

  it('settles a failed breakdown as degraded, not failed, when there is no video', async () => {
    const store = createLocalStore({ paths })
    const dispatcher = createLocalInspirationDispatcher({
      resolver: offlineResolver,
      localStore: store,
      socialFetcher: async () => X_PHOTO_ENVELOPE,
      fetcher: mockFetcher,
      // A photo post never reaches the model, so this must not be called.
      analyzeInspiration: async () => { throw new Error('不该被调用') },
    })

    const started = await postImport(dispatcher, { url: X_URL, background: true, auto_analyze: true })
    const settled = await waitForSettled({ store }, started.body.data.id)

    assert.equal(settled.import_status, 'degraded')
    assert.deepEqual(settled.media_urls, [])
    assert.equal(settled.import_error, null, 'nothing was attempted, so nothing failed')
  })

  it('keeps the downloaded video when the AI tool fails', async () => {
    const ctx = dispatcherWithAnalyzer({
      execute: async () => { throw new Error('AI 视觉分析服务不可用') },
    })

    const started = await postImport(ctx.dispatcher, { url: X_URL, background: true, auto_analyze: true })
    const settled = await waitForSettled(ctx, started.body.data.id)

    // The item is stored and playable: the download, the cover and the metadata
    // were all obtained before the model was ever called, so nothing in the
    // analysis stage may throw them away.
    assert.equal(ctx.store.list().total, 1)
    assert.equal(settled.type, 'video')
    assert.equal(settled.media_urls.length, 1)
    assert.match(settled.media_urls[0], /^\/omnimux\/inspiration\/local\/media\/videos\//)
    assert.ok(settled.cover_url)
    // A stored item is a completion, never `failed`: `failed` would hide the video
    // the user already paid for in download time, leaving re-import as the only
    // way back to it.
    assert.equal(settled.import_status, 'ready')
    assert.equal(settled.import_stage, null)
  })

  it('settles as degraded, never failed, when the import has no video at all', async () => {
    const store = createLocalStore({ paths })
    const dispatcher = createLocalInspirationDispatcher({
      resolver: offlineResolver,
      localStore: store,
      socialFetcher: async () => X_PHOTO_ENVELOPE,
      fetcher: mockFetcher,
      videoAnalyzeTool: { execute: async () => { throw new Error('不该被调用') } },
    })

    const started = await postImport(dispatcher, { url: X_URL, background: true, auto_analyze: true })
    const settled = await waitForSettled({ store }, started.body.data.id)

    assert.equal(settled.import_status, 'degraded')
    assert.deepEqual(settled.media_urls, [])
    // Never reached the model, so there is nothing to report as a failure.
    assert.equal(settled.import_error, null)
  })

  it('still leaves the row analyzable afterwards', async () => {
    const ctx = dispatcherWithAnalyzer({
      execute: async () => { throw new Error('AI 视觉分析服务不可用') },
    })

    const started = await postImport(ctx.dispatcher, { url: X_URL, background: true, auto_analyze: true })
    const id = started.body.data.id
    const settled = await waitForSettled(ctx, id)

    // A row the user can still act on is what makes keeping it worthwhile: the
    // local file is on disk, so the analyze route re-runs without re-downloading.
    assert.ok(existsSync(settled.local_paths.video), 'the downloaded file must still exist')

    const analyzed = await ctx.dispatcher.dispatch({
      method: 'POST',
      url: `/omnimux/inspiration/local/${id}/analyze`,
      body: {},
    })

    assert.equal(analyzed.status, 200, `analysis on the kept row must succeed (${analyzed.body?.error || ''})`)
    assert.ok(analyzed.body?.data?.deconstruction, 'the row must come back with a breakdown')
  })

  it('runs the model when auto_analyze is requested', async () => {
    const calls = []
    const ctx = dispatcherWithAnalyzer({
      execute: async () => {
        calls.push(1)
        return { report: '## 一句话视频描述\n开场三秒反杀\n## I. 核心目标\n拉高完播' }
      },
    })

    const started = await postImport(ctx.dispatcher, { url: X_URL, background: true, auto_analyze: true })
    const settled = await waitForSettled(ctx, started.body.data.id)

    assert.ok(calls.length >= 1, 'auto_analyze: true must reach the analysis tool')
    // The model's own report beats the local fallback: this is the value only the
    // model could have produced, so seeing it proves the tool really ran.
    assert.equal(settled.deconstruction.summary, '开场三秒反杀')
    assert.equal(settled.auto_analyze, true, 'the stored flag must survive the completion')
  })

  it('never calls the model when auto_analyze is false', async () => {
    const calls = []
    const ctx = dispatcherWithAnalyzer({
      execute: async () => {
        calls.push(1)
        return { report: 'x' }
      },
    })

    const started = await postImport(ctx.dispatcher, { url: X_URL, background: true, auto_analyze: false })
    const settled = await waitForSettled(ctx, started.body.data.id)

    assert.deepEqual(calls, [], 'the user asked for no AI, so none may run')
    assert.equal(settled.import_status, 'ready')
    // The stored choice has to survive the completion, or a later retry of the
    // same URL would run the model the user turned off.
    assert.equal(settled.auto_analyze, false)
    // No AI was attempted, so nothing failed: this is a clean completion.
    assert.equal(settled.import_error, null)
  })
})

describe('analyze guard while an import runs', { concurrency: 1 }, () => {
  let tmp
  let paths

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'omnimux-analyze-guard-'))
    paths = makePaths(tmp)
  })

  after(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('refuses analysis on a row that is still importing', async () => {
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const ctx = makeDispatcher(paths, async () => {
      await gate
      return X_VIDEO_ENVELOPE
    })

    const started = await postImport(ctx.dispatcher, { url: X_URL, background: true })
    const res = await ctx.dispatcher.dispatch({
      method: 'POST',
      url: `/omnimux/inspiration/local/${started.body.data.id}/analyze`,
      body: {},
    })

    assert.equal(res.status, 422)
    assert.match(res.body.error, /正在后台导入中/)

    release()
    await waitForSettled(ctx, started.body.data.id)
  })
})
