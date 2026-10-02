/**
 * #2779 Inspiration collaborative cancellation unit & integration tests.
 *
 * Verifies Ticket 1 ~ Ticket 3:
 * - Dispatcher & Signal propagation from Host exec.signal
 * - Downloader stream cancellation & .tmp cleanup
 * - Commit gate preventing partial records & avoiding scraper-fallback / degradation
 */

import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ReadableStream } from 'node:stream/web'
import { apply } from './index.js'
import { downloadMedia } from './downloader.js'
import { createLocalStore } from './local-store.js'
import { createLocalInspirationDispatcher } from './http-routes.js'

const PUBLIC_VIDEO_URL = 'https://video.twimg.com/amplify_video/1/vid/1280x720/high.mp4'

/**
 * Offline resolver stub so no real DNS lookup occurs.
 */
async function offlineResolver(hostname) {
  return [{ address: '93.184.216.34', family: 4 }]
}

function scanAllFiles(dir) {
  if (!existsSync(dir)) return []
  const entries = readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...scanAllFiles(full))
    } else {
      files.push(full)
    }
  }
  return files
}

describe('#2779 Inspiration collaborative cancellation', () => {
  let savedDshHome
  let savedFallbackSwitch
  let testRoot
  let registeredTools
  let mockCtx
  let fallbackCalls

  before(() => {
    savedDshHome = process.env.DSH_HOME
    // `apply` hardcodes the real scraper fallback (a product feature with its
    // own kill-switch), so a test that never wires one would still reach
    // publish.twitter.com. The suite runs under deny-network: switch it off.
    savedFallbackSwitch = process.env.OMNIMUX_INSPIRATION_SOCIAL_FALLBACK
    process.env.OMNIMUX_INSPIRATION_SOCIAL_FALLBACK = 'off'
  })

  after(() => {
    if (savedDshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = savedDshHome
    if (savedFallbackSwitch === undefined) delete process.env.OMNIMUX_INSPIRATION_SOCIAL_FALLBACK
    else process.env.OMNIMUX_INSPIRATION_SOCIAL_FALLBACK = savedFallbackSwitch
  })

  beforeEach(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'omnimux-cancellation-'))
    process.env.DSH_HOME = testRoot
    registeredTools = {}
    fallbackCalls = []
  })

  afterEach(() => {
    if (testRoot && existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true })
    }
  })

  function setupPlugin(opts = {}) {
    mockCtx = {
      tools: {
        register(tool) {
          registeredTools[tool.name] = tool
        },
        get(name) {
          if (name === 'omnimux_social_data') return opts.socialDataTool
          return undefined
        },
      },
      // `ctx.get` is the hub seam `apply` reads for `fetcher`/`resolver` since
      // the direct `ctx.fetcher` properties were retired; without it the
      // dispatcher falls back to the real `fetch` and tests hit the network.
      get(capability) {
        if (capability === 'fetcher') return opts.fetcher
        if (capability === 'resolver') return offlineResolver
        return undefined
      },
      fallback: async (params) => {
        fallbackCalls.push(params)
        return null
      },
    }
    apply(mockCtx)
    return registeredTools
  }

  describe('Ticket 1 & 2: Downloader cancellation & .tmp cleanup', () => {
    it('Seam B (downloader): aborts stream during transfer and unlinks .tmp file', async () => {
      const destDir = join(testRoot, 'videos')
      const controller = new AbortController()
      let chunkCount = 0

      const stream = new ReadableStream({
        async pull(ctrl) {
          chunkCount += 1
          if (chunkCount === 1) {
            ctrl.enqueue(new Uint8Array(1024))
            return
          }
          controller.abort()
          await new Promise((r) => setTimeout(r, 10))
          ctrl.enqueue(new Uint8Array(1024))
          ctrl.close()
        },
      })

      const fetcher = async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'video/mp4' }),
        body: stream,
      })

      await assert.rejects(
        async () => {
          await downloadMedia(PUBLIC_VIDEO_URL, destDir, {
            fetcher,
            resolver: offlineResolver,
            signal: controller.signal,
          })
        },
        (err) => {
          assert.ok(err.name === 'AbortError' || err.code === 'ABORT_ERR', `expected AbortError, got ${err.name}`)
          return true
        },
      )

      // Ensure zero temporary files or target files remain in destDir
      const remainingFiles = scanAllFiles(destDir)
      assert.deepEqual(remainingFiles, [], 'destination directory must have 0 files left on cancellation')
    })
  })

  describe('Ticket 1 ~ 3: inspiration_create collaborative cancellation', () => {
    it('Seam A: pre-aborted signal aborts immediately, zero network, zero store records, zero tmp files', async () => {
      let socialFetcherCalled = false
      const tools = setupPlugin({
        socialDataTool: {
          async execute() {
            socialFetcherCalled = true
            return { data: { text: 'test' } }
          },
        },
      })

      const createTool = tools.inspiration_create
      assert.ok(createTool, 'inspiration_create must be registered')

      const preAbortedSignal = AbortSignal.abort()

      await assert.rejects(
        async () => {
          await createTool.execute(
            { url: 'https://x.com/user/status/123456789' },
            { signal: preAbortedSignal },
          )
        },
        (err) => {
          assert.ok(err.name === 'AbortError' || err.code === 'ABORT_ERR', `expected AbortError, got ${err.name}`)
          return true
        },
      )

      assert.equal(socialFetcherCalled, false, 'socialFetcher must NOT be called on pre-aborted signal')
      assert.equal(fallbackCalls.length, 0, 'fallback scraper must NOT be called')

      // Verify store has zero records
      const mediaFiles = scanAllFiles(join(testRoot, 'omnimux', 'inspirations'))
      const tmpFiles = mediaFiles.filter((f) => f.endsWith('.tmp'))
      assert.deepEqual(tmpFiles, [], 'zero .tmp files must exist')

      // Verify library.json has no items
      const searchTool = tools.inspiration_search
      const searchRes = await searchTool.execute({ query: '' })
      assert.equal(searchRes.inspirations.length, 0, 'store must have zero items')
    })

    it('Seam B: stream aborted during download unlinks .tmp, leaves store untouched, no fallback', async () => {
      const controller = new AbortController()
      let chunksSent = 0

      const stream = new ReadableStream({
        async pull(ctrl) {
          chunksSent += 1
          if (chunksSent === 1) {
            ctrl.enqueue(new Uint8Array(2048))
            return
          }
          controller.abort()
          await new Promise((r) => setTimeout(r, 10))
          ctrl.enqueue(new Uint8Array(2048))
          ctrl.close()
        },
      })

      const fetcher = async (url) => {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'video/mp4' }),
          body: stream,
        }
      }

      const tools = setupPlugin({
        fetcher,
        socialDataTool: {
          async execute() {
            return {
              data: {
                text: 'Amazing hook in 3s',
                author: { name: 'Creator' },
                media: {
                  video: [
                    {
                      variants: [
                        { content_type: 'video/mp4', url: PUBLIC_VIDEO_URL },
                      ],
                    },
                  ],
                },
              },
            }
          },
        },
      })

      const createTool = tools.inspiration_create
      assert.ok(createTool)

      await assert.rejects(
        async () => {
          await createTool.execute(
            { url: 'https://x.com/user/status/987654321', auto_analyze: false },
            { signal: controller.signal },
          )
        },
        (err) => {
          assert.ok(err.name === 'AbortError' || err.code === 'ABORT_ERR', `expected AbortError, got ${err.name}`)
          return true
        },
      )

      assert.equal(fallbackCalls.length, 0, 'cancellation must never trigger scraper-fallback')

      // Verify no temporary files remain
      const allFiles = scanAllFiles(join(testRoot, 'omnimux', 'inspirations'))
      const tmpFiles = allFiles.filter((f) => f.endsWith('.tmp'))
      assert.deepEqual(tmpFiles, [], 'no .tmp files should remain after aborted stream')

      // Verify no partial record in store
      const searchTool = tools.inspiration_search
      const searchRes = await searchTool.execute({ query: '' })
      assert.equal(searchRes.inspirations.length, 0, 'no partial record should be written to library.json')
    })

    it('Seam C: commit gate cleans downloaded media and prevents store write if aborted before persist', async () => {
      const controller = new AbortController()

      const fetcher = async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'video/mp4' }),
        arrayBuffer: async () => Buffer.from('mock-video-bytes'),
      })

      let analyzerCalled = false

      const paths = {
        dir: join(testRoot, 'omnimux', 'inspirations'),
        libraryFile: join(testRoot, 'omnimux', 'inspirations', 'library.json'),
        mediaDir: join(testRoot, 'omnimux', 'inspirations', 'media'),
        coversDir: join(testRoot, 'omnimux', 'inspirations', 'media', 'covers'),
        videosDir: join(testRoot, 'omnimux', 'inspirations', 'media', 'videos'),
        imagesDir: join(testRoot, 'omnimux', 'inspirations', 'media', 'images'),
      }
      const store = createLocalStore({ paths })

      const dispatcher = createLocalInspirationDispatcher({
        localStore: store,
        fetcher,
        resolver: offlineResolver,
        socialFetcher: async () => ({
          data: {
            text: 'Test Content',
            media: {
              video: [
                {
                  variants: [{ content_type: 'video/mp4', url: PUBLIC_VIDEO_URL }],
                },
              ],
            },
          },
        }),
        analyzeInspiration: async () => {
          analyzerCalled = true
          // Abort during analyze phase
          controller.abort()
          return { deconstruction: { hook: 'test' } }
        },
      })

      const res = await dispatcher.dispatch({
        method: 'POST',
        url: '/omnimux/inspiration/local/import-url',
        body: {
          url: 'https://x.com/user/status/55555',
          auto_analyze: true,
        },
        signal: controller.signal,
      })

      assert.equal(res.status, 499, 'dispatcher must answer 499 on cancellation')
      assert.equal(res.body?.error, 'aborted')
      assert.equal(analyzerCalled, true, 'analyzer was triggered')

      // Assert store was NOT updated
      assert.equal(store.list().items.length, 0, 'store must contain 0 records')

      // Assert video file that was downloaded before analyze was cleaned up
      const remainingMedia = scanAllFiles(paths.mediaDir)
      assert.deepEqual(remainingMedia, [], 'media files must be cleaned up if aborted before commit')
    })

    it('Dispatcher returns 499 with error: aborted for pre-aborted request', async () => {
      const paths = {
        dir: join(testRoot, 'omnimux', 'inspirations'),
        libraryFile: join(testRoot, 'omnimux', 'inspirations', 'library.json'),
        mediaDir: join(testRoot, 'omnimux', 'inspirations', 'media'),
        coversDir: join(testRoot, 'omnimux', 'inspirations', 'media', 'covers'),
        videosDir: join(testRoot, 'omnimux', 'inspirations', 'media', 'videos'),
        imagesDir: join(testRoot, 'omnimux', 'inspirations', 'media', 'images'),
      }
      const store = createLocalStore({ paths })
      const dispatcher = createLocalInspirationDispatcher({
        localStore: store,
        resolver: offlineResolver,
        socialFetcher: async () => {
          throw new Error('should not be called')
        },
      })

      const res = await dispatcher.dispatch({
        method: 'POST',
        url: '/omnimux/inspiration/local/import-url',
        body: { url: 'https://x.com/status/999' },
        signal: AbortSignal.abort(),
      })

      assert.equal(res.status, 499)
      assert.equal(res.body?.error, 'aborted')
      assert.equal(store.list().items.length, 0)
    })

    it('Regular network errors are NOT masked as AbortError (error discrimination)', async () => {
      const tools = setupPlugin({
        socialDataTool: {
          async execute() {
            throw new Error('Upstream network timeout 504')
          },
        },
      })

      const createTool = tools.inspiration_create
      await assert.rejects(
        async () => {
          await createTool.execute({ url: 'https://x.com/user/status/error504' })
        },
        (err) => {
          assert.notEqual(err.name, 'AbortError', 'regular failure must not be AbortError')
          assert.match(err.message, /Upstream network timeout 504|社媒解析/)
          return true
        },
      )
    })

    it('Seam D: abort during cover download deletes previously downloaded video file (no orphan files)', async () => {
      const controller = new AbortController()
      const COVER_URL = 'https://pbs.twimg.com/media/cover.jpg'

      const paths = {
        dir: join(testRoot, 'omnimux', 'inspirations'),
        libraryFile: join(testRoot, 'omnimux', 'inspirations', 'library.json'),
        mediaDir: join(testRoot, 'omnimux', 'inspirations', 'media'),
        coversDir: join(testRoot, 'omnimux', 'inspirations', 'media', 'covers'),
        videosDir: join(testRoot, 'omnimux', 'inspirations', 'media', 'videos'),
        imagesDir: join(testRoot, 'omnimux', 'inspirations', 'media', 'images'),
      }
      const store = createLocalStore({ paths })

      const fetcher = async (url) => {
        if (url === PUBLIC_VIDEO_URL) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'video/mp4' }),
            arrayBuffer: async () => Buffer.from('mock-video-bytes-data'),
          }
        }
        if (url === COVER_URL) {
          controller.abort()
          const abortErr = new Error('This operation was aborted')
          abortErr.name = 'AbortError'
          abortErr.code = 'ABORT_ERR'
          throw abortErr
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'image/jpeg' }),
          arrayBuffer: async () => Buffer.from('mock-cover-bytes'),
        }
      }

      const dispatcher = createLocalInspirationDispatcher({
        localStore: store,
        fetcher,
        resolver: offlineResolver,
        socialFetcher: async () => ({
          data: {
            text: 'Test Video With Cover',
            media: {
              video: [
                {
                  variants: [{ content_type: 'video/mp4', url: PUBLIC_VIDEO_URL }],
                },
              ],
            },
            cover_url: COVER_URL,
          },
        }),
      })

      const res = await dispatcher.dispatch({
        method: 'POST',
        url: '/omnimux/inspiration/local/import-url',
        body: {
          url: 'https://x.com/user/status/77777',
        },
        signal: controller.signal,
      })

      assert.equal(res.status, 499, 'dispatcher must answer 499 on cover download abort')
      assert.equal(res.body?.error, 'aborted')

      // Assert video file was deleted and no orphan file remains in mediaDir
      const remainingFiles = scanAllFiles(paths.mediaDir)
      assert.deepEqual(remainingFiles, [], 'all downloaded video and cover files must be cleanly deleted on abort')
      assert.equal(store.list().items.length, 0, 'store must contain zero records')
    })

    it('Downloader error discrimination: download timeout is not masked as caller AbortError', async () => {
      const destDir = join(testRoot, 'downloader-timeout-test')

      // 1. Download timeout: caller signal was not aborted
      const callerController = new AbortController()
      const hangingFetcher = (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason))
      })

      await assert.rejects(
        async () => {
          await downloadMedia(PUBLIC_VIDEO_URL, destDir, {
            fetcher: hangingFetcher,
            resolver: offlineResolver,
            timeoutMs: 15,
            signal: callerController.signal,
          })
        },
        (err) => {
          assert.notEqual(err.name, 'AbortError', 'timeout must NOT have err.name === AbortError')
          assert.notEqual(err.code, 'ABORT_ERR', 'timeout must NOT have err.code === ABORT_ERR')
          assert.match(err.message, /timed out/i, 'error message must reflect timeout semantics')
          return true
        },
      )
      assert.equal(callerController.signal.aborted, false, 'caller signal remained non-aborted')

      // 2. Caller cancellation: caller explicitly aborted
      const callerAbortController = new AbortController()
      callerAbortController.abort()

      await assert.rejects(
        async () => {
          await downloadMedia(PUBLIC_VIDEO_URL, destDir, {
            fetcher: hangingFetcher,
            resolver: offlineResolver,
            timeoutMs: 5000,
            signal: callerAbortController.signal,
          })
        },
        (err) => {
          assert.ok(err.name === 'AbortError' || err.code === 'ABORT_ERR', 'caller cancellation MUST be AbortError')
          return true
        },
      )
    })

    it('Upstream tool error while signal is aborted produces standard AbortError instead of 500/502', async () => {
      const controller = new AbortController()
      const tools = setupPlugin({
        socialDataTool: {
          async execute() {
            controller.abort()
            throw new TypeError('Upstream internal TypeError')
          },
        },
      })

      const createTool = tools.inspiration_create
      await assert.rejects(
        async () => {
          await createTool.execute(
            { url: 'https://x.com/user/status/upstream-abort' },
            { signal: controller.signal },
          )
        },
        (err) => {
          assert.equal(err.name, 'AbortError', 'must be converted to standard AbortError')
          assert.equal(err.code, 'ABORT_ERR', 'code must be ABORT_ERR')
          return true
        },
      )
    })
  })
})
