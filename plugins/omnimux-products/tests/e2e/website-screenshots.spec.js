/**
 * End-to-end acceptance for the website first-screen screenshots.
 *
 * These cases drive the real HTTP dispatcher, the real importer, the real
 * persistence layer and the real form-state merge — the only things replaced
 * are the two boundaries a test must never cross: the network read of the
 * landing page, and the browser that takes the pictures. Geometry against a
 * real browser lives in `scripts/verify-site-screenshots.mjs`.
 *
 * Case numbers map 1:1 onto `specs/digital-product-website-screenshots.spec.md` §5.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { createProductsDispatcher } from '../../src/http-routes.js'
import { importProductFromUrl } from '../../src/link-importer.js'
import { createLibraryStore } from '../../src/library.js'
import { resolveProductsPaths } from '../../src/paths.js'
import {
  SCREENSHOT_REASON,
  SCREENSHOT_STATUS,
  outcomeOf,
  reportOf,
} from '../../src/screenshot-contract.js'
import { bundleFormReturn } from '../../src/client/useProductFormState.js'

const PAGE_URL = 'https://platform.example.com/product/open-platform'
const PRODUCT_NAME = 'MiniMax 开放平台'

const LANDING_HTML = `<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <title>MiniMax 开放平台 | MiniMax</title>
  <meta property="og:description" content="一站式多模态模型服务，支持免费试用与预约演示。">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"SoftwareApplication","name":"MiniMax 开放平台","applicationCategory":"AI 平台",
   "brand":{"@type":"Brand","name":"MiniMax"}}
  </script>
</head>
<body><p>一站式多模态模型服务，适用于 AI 应用开发者。找到我们：support@example.com</p></body></html>`

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

const scratch = []

afterEach(() => {
  while (scratch.length > 0) {
    const dir = scratch.pop()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // Best effort in teardown.
    }
  }
})

function workspace() {
  const home = mkdtempSync(join(tmpdir(), 'omnimux-shots-e2e-'))
  scratch.push(home)
  return { home, paths: resolveProductsPaths({ homeDir: home }) }
}

/** The landing page, read without touching the network. */
function stubFetcher(html = LANDING_HTML) {
  return async () => ({
    ok: true,
    status: 200,
    headers: { get: () => '' },
    text: async () => html,
  })
}

/**
 * The browser boundary: two viewports, both captured, or whatever the case asks for.
 *
 * @param {{ desktop?: boolean, mobile?: boolean, reason?: string }} [over]
 */
function stubCapture(over = {}) {
  const calls = []
  const capture = async (request) => {
    calls.push(request)
    const rows = []
    if (over.desktop !== false) {
      rows.push(outcomeOf('desktop', true, { width: 1440, height: 900 }, PNG.length, null, PNG))
    } else {
      rows.push(outcomeOf('desktop', false, {}, 0, over.reason ?? SCREENSHOT_REASON.NAV_TIMEOUT))
    }
    if (over.mobile !== false) {
      rows.push(outcomeOf('mobile', true, { width: 390, height: 844 }, PNG.length, null, PNG))
    } else {
      rows.push(outcomeOf('mobile', false, {}, 0, over.reason ?? SCREENSHOT_REASON.NAV_TIMEOUT))
    }
    return { outcomes: rows, report: reportOf(rows, null) }
  }
  return { capture, calls }
}

/**
 * A fully wired vertical: real dispatcher, real importer, real store, injected
 * page read and browser.
 */
function vertical({ capture, html } = {}) {
  const { home, paths } = workspace()
  const library = createLibraryStore({ paths })
  const dispatcher = createProductsDispatcher({
    library,
    hub: null,
    importFromUrl: (args) => importProductFromUrl({
      ...args,
      paths,
      fetcher: stubFetcher(html),
      captureScreenshots: capture,
    }),
  })
  return { home, paths, library, dispatcher }
}

function post(url, body) {
  return { method: 'POST', url, body }
}

describe('e2e · website screenshots · capture path', () => {
  it('case 1 + 4 + 5: both screenshots, desktop first, under the media directory, ids kept', async () => {
    const { capture } = stubCapture()
    const { paths, library, dispatcher } = vertical({ capture })

    const response = await dispatcher.dispatch(post('/omnimux/products/import-from-link', {
      url: PAGE_URL,
      kind: 'digital',
    }))
    assert.equal(response.status, 200)
    assert.equal(response.body.success, true)

    const data = response.body.data
    assert.equal(data.kind, 'digital')
    assert.equal(data.name, PRODUCT_NAME)
    assert.equal(data.screenshots.status, SCREENSHOT_STATUS.CAPTURED)
    assert.equal(data.screenshots.reason, null)
    assert.equal(data.media.length, 2)
    assert.equal(data.media[0].original_name.includes('-desktop-'), true)
    assert.equal(data.media[1].original_name.includes('-mobile-'), true)
    assert.equal(data.cover_media_id, data.media[0].id)

    // Case 4: nothing is written outside <dsh home>/omnimux/products/media/.
    for (const row of data.media) {
      assert.equal(row.real_path.startsWith(join(paths.mediaDir, 'site-')), true)
    }

    // Case 5: the library keeps the ids it was handed, so the cover still hits.
    const saved = library.add({
      name: data.name,
      kind: 'digital',
      link: data.link,
      media: data.media,
      cover_media_id: data.cover_media_id,
    })
    assert.deepEqual(saved.media.map((row) => row.id), data.media.map((row) => row.id))
    assert.equal(saved.cover.id, data.media[0].id)
  })

  it('case 3: the files are real, readable, 0o700 / 0o600', async () => {
    const { capture } = stubCapture()
    const { paths, dispatcher } = vertical({ capture })

    const { body } = await dispatcher.dispatch(post('/omnimux/products/import-from-link', { url: PAGE_URL, kind: 'digital' }))
    assert.equal(statSync(paths.mediaDir).mode & 0o777, 0o700)
    for (const row of body.data.media) {
      const info = statSync(row.real_path)
      assert.equal(info.isFile(), true)
      assert.equal(info.mode & 0o777, 0o600)
      assert.equal(readFileSync(row.real_path).length, PNG.length)
    }
  })

  it('case 19: import → create → read back with the desktop shot as the cover', async () => {
    const { capture } = stubCapture()
    const { dispatcher } = vertical({ capture })

    const imported = (await dispatcher.dispatch(post('/omnimux/products/import-from-link', {
      url: PAGE_URL,
      kind: 'digital',
    }))).body.data

    const created = await dispatcher.dispatch(post('/omnimux/products', {
      name: imported.name,
      kind: 'digital',
      link: imported.link,
      media: imported.media,
      cover_media_id: imported.cover_media_id,
    }))
    assert.equal(created.status, 200)
    assert.equal(created.body.product.media.length, 2)
    assert.equal(created.body.product.cover_media_id, imported.media[0].id)

    const read = await dispatcher.dispatch({ method: 'GET', url: `/omnimux/products/${created.body.product.id}` })
    assert.equal(read.status, 200)
    assert.equal(read.body.product.cover_media_id, imported.media[0].id)
    assert.equal(read.body.product.cover.original_name.includes('-desktop-'), true)
  })
})

describe('e2e · website screenshots · degraded paths', () => {
  it('case 7: one viewport lost → one media row, still the cover, reason in band', async () => {
    const { capture } = stubCapture({ mobile: false })
    const { dispatcher } = vertical({ capture })

    const { body } = await dispatcher.dispatch(post('/omnimux/products/import-from-link', { url: PAGE_URL, kind: 'digital' }))
    assert.equal(body.data.media.length, 1)
    assert.equal(body.data.media[0].original_name.includes('-desktop-'), true)
    assert.equal(body.data.cover_media_id, body.data.media[0].id)
    assert.equal(body.data.screenshots.status, SCREENSHOT_STATUS.CAPTURED)
    assert.equal(body.data.screenshots.reason, SCREENSHOT_REASON.NAV_TIMEOUT)
  })

  it('case 8: both viewports lost → HTTP 200, empty media, text and strategy intact', async () => {
    const { capture } = stubCapture({ desktop: false, mobile: false })
    const { dispatcher } = vertical({ capture })

    const response = await dispatcher.dispatch(post('/omnimux/products/import-from-link', { url: PAGE_URL, kind: 'digital' }))
    assert.equal(response.status, 200)
    assert.deepEqual(response.body.data.media, [])
    assert.equal(response.body.data.cover_media_id, null)
    assert.equal(response.body.data.screenshots.status, SCREENSHOT_STATUS.FAILED)
    assert.equal(response.body.data.name, PRODUCT_NAME)
    assert.equal(response.body.data.link, PAGE_URL)
  })

  it('case 9: no browser at all → skipped/no-browser, no rows, still 200', async () => {
    const capture = async () => ({ outcomes: [], report: reportOf([], SCREENSHOT_REASON.NO_BROWSER) })
    const { dispatcher } = vertical({ capture })

    const response = await dispatcher.dispatch(post('/omnimux/products/import-from-link', { url: PAGE_URL, kind: 'digital' }))
    assert.equal(response.status, 200)
    assert.deepEqual(response.body.data.media, [])
    assert.equal(response.body.data.cover_media_id, null)
    assert.equal(response.body.data.screenshots.status, SCREENSHOT_STATUS.SKIPPED)
    assert.equal(response.body.data.screenshots.reason, SCREENSHOT_REASON.NO_BROWSER)
  })

  it('case 11: an exhausted budget degrades without an unhandled rejection', async () => {
    const capture = async () => ({ outcomes: [], report: reportOf([], SCREENSHOT_REASON.BUDGET_EXCEEDED) })
    const { dispatcher } = vertical({ capture })

    const response = await dispatcher.dispatch(post('/omnimux/products/import-from-link', { url: PAGE_URL, kind: 'digital' }))
    assert.equal(response.status, 200)
    assert.equal(response.body.data.screenshots.status, SCREENSHOT_STATUS.FAILED)
    assert.equal(response.body.data.screenshots.reason, SCREENSHOT_REASON.BUDGET_EXCEEDED)
  })

  it('case 10: a physical listing never starts a capture, and carries its images as media instead', async () => {
    const { capture, calls } = stubCapture()
    const physical = `<!doctype html><html><head><title>Aurora Mug 350ml</title>
      <meta property="product:price:amount" content="29.90">
      <meta property="og:image" content="https://cdn.example.com/aurora-1.jpg"></head>
      <body><h1>Aurora Mug 350ml</h1><p>6 小时长效保温，防滑硅胶底座。</p></body></html>`
    const { dispatcher } = vertical({ capture, html: physical })

    const { body } = await dispatcher.dispatch(post('/omnimux/products/import-from-link', {
      url: 'https://shop.example.com/p/aurora-mug',
      kind: 'physical',
    }))
    assert.equal(body.data.kind, 'physical')
    // 形态由请求参数定死：整屏截图是数字产品的产物，实物这条腿一次都不碰浏览器。
    assert.equal('screenshots' in body.data, false)
    assert.deepEqual(calls, [])
    // 商品图以 media 的形式回来（此处没有落盘 seam，所以是空画廊而不是缺键）。
    assert.deepEqual(body.data.media, [])
    assert.equal(body.data.cover_media_id, null)
    assert.deepEqual(body.data.images, ['https://cdn.example.com/aurora-1.jpg'])
  })

  it('case 13: a private network link is refused by the guard, not by the browser', async () => {
    const seen = []
    const capture = async (request) => {
      seen.push(request.url)
      return { outcomes: [], report: reportOf([], SCREENSHOT_REASON.UNSAFE_URL) }
    }
    const { dispatcher } = vertical({ capture })

    for (const url of ['http://127.0.0.1:8080/', 'https://10.1.2.3/', 'https://169.254.1.1/']) {
      const response = await dispatcher.dispatch(post('/omnimux/products/import-from-link', { url }))
      assert.equal(response.status, 400, url)
      assert.equal(response.body.error, 'invalid-url', url)
    }
    assert.deepEqual(seen, [], 'an unsafe link must never reach the screenshot chain')
  })
})

describe('e2e · website screenshots · form backfill', () => {
  /** The form the user is looking at when the import lands. */
  function form(seed = {}) {
    const base = {
      fields: { name: '', kind: 'digital', selling: '', audience: '', brand: '', features: '', price: '', sku: '', promotion: '', link: '' },
      setters: {},
    }
    for (const key of Object.keys(base.fields)) {
      base.setters[`set${key.charAt(0).toUpperCase()}${key.slice(1)}`] = (value) => { base.fields[key] = value }
    }
    const mediaState = {
      categories: [],
      media: seed.media ?? [],
      coverId: seed.coverId ?? null,
      setCategories: (next) => { mediaState.categories = typeof next === 'function' ? next(mediaState.categories) : next },
      setMedia: (next) => { mediaState.media = typeof next === 'function' ? next(mediaState.media) : next },
      setCoverId: (next) => { mediaState.coverId = next },
    }
    const strategyState = {
      strategyOpen: false,
      strategyTouched: false,
      strategy: {},
      setStrategyOpen: (v) => { strategyState.strategyOpen = v },
      setStrategyTouched: (v) => { strategyState.strategyTouched = v },
      setStrategy: (v) => { strategyState.strategy = v },
      openStrategy: () => {},
      patchStrategy: () => {},
      handleSelectPhysical: () => {},
      handleSelectDigital: () => {},
    }
    return { mediaState, bundle: bundleFormReturn(base, mediaState, strategyState, false) }
  }

  const USER_FILE = { real_path: '/Users/me/Desktop/my-cover.png', original_name: 'my-cover.png' }

  it('cases 14 + 15 + 18: the import lands in the open form and the cover is visible', async () => {
    const { capture } = stubCapture()
    const { dispatcher } = vertical({ capture })
    const imported = (await dispatcher.dispatch(post('/omnimux/products/import-from-link', {
      url: PAGE_URL,
      kind: 'digital',
    }))).body.data

    const { mediaState, bundle } = form({ media: [USER_FILE], coverId: null })
    bundle.actions.applyImportedData(imported)

    assert.equal(mediaState.media.length, 3)
    assert.equal(mediaState.media[0].real_path, USER_FILE.real_path)
    assert.deepEqual(mediaState.media.slice(1).map((row) => row.id), imported.media.map((row) => row.id))
    assert.equal(mediaState.coverId, imported.cover_media_id)
    assert.equal(mediaState.media.some((row) => row.id === mediaState.coverId), true)
    // Case 18 is a rendering contract: the row has a state the user can see.
    assert.match(readFileSync(join(import.meta.dirname, '../../src/client/ProductMediaSection.jsx'), 'utf8'), /is-cover/)
  })

  it('case 16: a cover the user picked by hand survives the import', async () => {
    const { capture } = stubCapture()
    const { dispatcher } = vertical({ capture })
    const imported = (await dispatcher.dispatch(post('/omnimux/products/import-from-link', {
      url: PAGE_URL,
      kind: 'digital',
    }))).body.data

    const { mediaState, bundle } = form({ media: [USER_FILE], coverId: null })
    mediaState.coverId = 'med_chosen1'
    bundle.actions.applyImportedData(imported)
    assert.equal(mediaState.coverId, 'med_chosen1')
  })

  it('case 17: a payload without media changes neither the list nor the cover', () => {
    const { mediaState, bundle } = form({ media: [USER_FILE], coverId: null })
    mediaState.coverId = 'med_chosen1'
    bundle.actions.applyImportedData({ name: '只改名字' })
    assert.deepEqual(mediaState.media, [USER_FILE])
    assert.equal(mediaState.coverId, 'med_chosen1')
  })
})

describe('e2e · website screenshots · storage hygiene', () => {
  it('case 12: nothing is left behind once the import is rejected', async () => {
    const { capture, calls } = stubCapture()
    const { paths, dispatcher } = vertical({ capture, html: '<html><head><title>MiniMax</title></head><body></body></html>' })

    const response = await dispatcher.dispatch(post('/omnimux/products/import-from-link', { url: PAGE_URL, kind: 'digital' }))
    assert.equal(response.status, 422)
    assert.equal(calls.length, 1, 'the capture still runs in parallel — it just never reaches the disk')
    assert.equal(existsSync(paths.mediaDir), false)
  })

  it('case 20: bare hostname input normalizes and produces valid first-screen captures', async () => {
    const { capture, calls } = stubCapture()
    const { dispatcher } = vertical({ capture })

    const response = await dispatcher.dispatch(post('/omnimux/products/import-from-link', {
      url: 'platform.example.com/product/open-platform',
      kind: 'digital',
    }))
    assert.equal(response.status, 200)
    assert.equal(response.body.success, true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, PAGE_URL)
    assert.equal(response.body.data.media.length, 2)
    assert.equal(response.body.data.screenshots.status, SCREENSHOT_STATUS.CAPTURED)
  })
})
