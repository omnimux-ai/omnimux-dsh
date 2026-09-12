import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { JSDOM } from 'jsdom'
import { zh } from './locales.js'

/**
 * A document has to exist before react-dom is evaluated.
 *
 * `react-dom` snapshots its "is there a DOM" answer in module scope and, when it
 * says no, replaces its `onChange` support with the branch meant for browsers
 * without an `input` event (IE9). In that branch a dispatched `input` event never
 * reaches a handler at all, which is exactly what happened while this file
 * imported react-dom before jsdom existed: clicks worked, typing silently did
 * nothing. Bootstrapping a document first keeps react-dom on its normal path.
 */
const bootstrap = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost:3000' })
globalThis.window = bootstrap.window
globalThis.document = bootstrap.window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')

/**
 * Render gates for the inspiration card and preview player.
 *
 * Both are bundled from the real `.jsx` with esbuild and mounted in jsdom, so the
 * assertions are made on rendered DOM rather than on source text. A source regex
 * cannot tell a rendered `<video>` from a commented-out one, and the bug these
 * gates cover was exactly that kind of invisible failure: a `<video>` whose `src`
 * pointed at a route that does not exist, which renders as an empty black box
 * with no error anywhere.
 */
const here = fileURLToPath(new URL('.', import.meta.url))
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')
// Per-suite cache directory: `node --test` runs test files in parallel, so two
// suites sharing one directory would delete each other's bundles.
const cacheDir = join(here, '.esbuild-cache', 'import-status')

let bundleCounter = 0

/**
 * @param {string} entryFile
 * @returns {Promise<string>} path of the bundled ESM file
 */
async function bundle(entryFile) {
  mkdirSync(cacheDir, { recursive: true })
  const outFile = join(cacheDir, `render-${bundleCounter}.mjs`)
  bundleCounter += 1
  const result = await esbuild.build({
    absWorkingDir: join(here, '..', '..'),
    entryPoints: [join(here, entryFile)],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    plugins: [{
      name: 'ui-kit-shim',
      setup(build) {
        build.onResolve({ filter: /^dsh-ui-kit$/ }, () => ({ path: shimEntry }))
      },
    }],
  })
  const code = result.outputFiles?.[0]?.text
  if (!code) throw new Error(`esbuild produced no bundle for ${entryFile}`)
  writeFileSync(outFile, code)
  return outFile
}

/**
 * Mounted environments this suite has not released yet.
 *
 * An assertion that throws skips the rest of its test, including the `finally`
 * that unmounts. A jsdom window left mounted with a live React root is a handle
 * the process then has to wait on, which turns a clear failure into a hang — the
 * worst possible outcome for a gate whose whole job is to fail loudly. Every mount
 * registers here (before its first render, so a component that throws on mount is
 * covered too) and `after` releases whatever the failure left behind.
 * @type {Array<() => Promise<void>>}
 */
const pendingTeardowns = []

/**
 * @param {string} entryFile
 * @param {object} props
 * @returns {Promise<{ container: HTMLElement, document: Document, window: any, unmount: () => Promise<void>, close: () => void }>}
 */
async function mount(entryFile, props, exportName) {
  const modulePath = await bundle(entryFile)
  const mod = await import(`${modulePath}?mount=${bundleCounter}`)
  const Component = mod[exportName]
  assert.ok(Component, `${entryFile} must export ${exportName}`)

  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost:3000',
  })
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  let root = null
  const teardown = async () => {
    if (root) {
      const mounted = root
      root = null
      await React.act(async () => mounted.unmount())
    }
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
    dom.window.close()
  }
  pendingTeardowns.push(teardown)

  const container = dom.window.document.getElementById('host')
  try {
    root = createRoot(container)
    await React.act(async () => {
      root.render(React.createElement(Component, props))
    })
  } catch (error) {
    await teardown()
    throw error
  }

  return {
    container,
    document: dom.window.document,
    window: dom.window,
    async unmount() {
      const index = pendingTeardowns.indexOf(teardown)
      if (index !== -1) pendingTeardowns.splice(index, 1)
      await teardown()
    },
    close() {
      // The window is closed by `teardown`, which both this test and the
      // after-failure release run.
    },
  }
}

const t = (key) => zh[key] || key

// Cleaned up at process exit rather than in an `after` hook: `node --test` may
// still be running sibling suites from the same directory.
process.on('exit', () => {
  rmSync(cacheDir, { recursive: true, force: true })
})

/** Release whatever the suite mounted, whether its tests passed or not. */
after(async () => {
  while (pendingTeardowns.length > 0) {
    await pendingTeardowns.pop()()
  }
  // Bundling runs in a child process. Stopping it here keeps a failing gate from
  // leaving that child behind for the process exit to wait on.
  await esbuild.stop()
})

// A recorded failure must never become a hang: the runner already knows the exit
// code, so a 10s ceiling only bounds how long the process may take to reach it.
// `unref()` keeps the timer from holding the loop open in a healthy run.
const exitGuard = setTimeout(() => {
  process.exit(process.exitCode ?? 0)
}, 10_000)
exitGuard.unref()

describe('InspirationPreviewModal render gate — media source chain', () => {
  const LOCAL_VIDEO_URL = '/omnimux/inspiration/local/media/videos/video_ab12.mp4'

  it('mounts a <video> whose src is the record media_urls[0]', async () => {
    const mounted = await mount('InspirationPreviewModal.jsx', {
      row: {
        id: 'insp_1',
        title: '本地视频',
        type: 'video',
        source_platform: 'youtube',
        source_url: 'https://www.youtube.com/watch?v=abc12345678',
        media_urls: [LOCAL_VIDEO_URL],
        local_paths: { video: '/Users/x/.omnimux/media/videos/video_ab12.mp4' },
      },
      t,
      onClose() {},
    }, 'InspirationPreviewModal')
    try {
      const video = mounted.container.querySelector('video')
      assert.ok(video, 'a record with a media url must render a <video>')
      assert.equal(video.getAttribute('src'), LOCAL_VIDEO_URL)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('falls back to the cover when the video element reports an error', async () => {
    const mounted = await mount('InspirationPreviewModal.jsx', {
      row: {
        id: 'insp_2',
        title: '坏视频',
        type: 'video',
        source_platform: 'youtube',
        source_url: 'https://www.youtube.com/watch?v=abc12345678',
        media_urls: [LOCAL_VIDEO_URL],
        cover_url: '/omnimux/inspiration/local/media/covers/cover_ab12.jpg',
      },
      t,
      onClose() {},
    }, 'InspirationPreviewModal')
    try {
      const video = mounted.container.querySelector('video')
      assert.ok(video, 'the player starts as a <video>')

      await React.act(async () => {
        video.dispatchEvent(new mounted.window.Event('error', { bubbles: false }))
      })

      assert.equal(mounted.container.querySelector('video'), null, 'an unplayable source must stop rendering the player')
      const img = mounted.container.querySelector('img')
      assert.ok(img, 'the cover must take over')
      assert.equal(img.getAttribute('src'), '/omnimux/inspiration/local/media/covers/cover_ab12.jpg')
      const notice = [...mounted.container.querySelectorAll('p')]
        .find((node) => node.textContent === zh['modal.video.unplayable'])
      assert.ok(notice, 'the unplayable notice must be shown')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('uses the official embed for a TikTok link that has no local file', async () => {
    const mounted = await mount('InspirationPreviewModal.jsx', {
      row: {
        id: 'insp_3',
        title: 'TikTok 视频',
        type: 'video',
        source_platform: 'tiktok',
        source_url: 'https://www.tiktok.com/@creator/video/7123456789012345678',
        media_urls: [],
      },
      t,
      onClose() {},
    }, 'InspirationPreviewModal')
    try {
      const frame = mounted.container.querySelector('iframe')
      assert.ok(frame, 'a TikTok record must keep using the official embed')
      assert.match(frame.getAttribute('src'), /tiktok\.com\/player\/v1\/7123456789012345678/)
      assert.equal(mounted.container.querySelector('video'), null)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('prefers a downloaded local file over the platform embed', async () => {
    // The recorded file is the highest-quality source and the only one that works
    // offline, so it wins whenever the record actually holds one.
    const mounted = await mount('InspirationPreviewModal.jsx', {
      row: {
        id: 'insp_3b',
        title: 'TikTok 视频（已落盘）',
        type: 'video',
        source_platform: 'tiktok',
        source_url: 'https://www.tiktok.com/@creator/video/7123456789012345678',
        media_urls: [LOCAL_VIDEO_URL],
      },
      t,
      onClose() {},
    }, 'InspirationPreviewModal')
    try {
      const video = mounted.container.querySelector('video')
      assert.ok(video, 'a downloaded file must be played rather than embedded')
      assert.equal(video.getAttribute('src'), LOCAL_VIDEO_URL)
      assert.equal(mounted.container.querySelector('iframe'), null)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('renders the cover for a record with no playable source at all', async () => {
    const mounted = await mount('InspirationPreviewModal.jsx', {
      row: {
        id: 'insp_4',
        title: '降级链接',
        type: 'link',
        source_platform: 'youtube',
        source_url: 'https://www.youtube.com/watch?v=abc12345678',
        media_urls: [],
        local_paths: { video: '/Users/x/.omnimux/media/videos/orphan.mp4' },
        cover_url: '/omnimux/inspiration/local/media/covers/cover_ab34.jpg',
      },
      t,
      onClose() {},
    }, 'InspirationPreviewModal')
    try {
      // The absolute local path must never be turned into a URL, so the player
      // falls through to the cover.
      assert.equal(mounted.container.querySelector('video'), null)
      assert.equal(mounted.container.querySelector('iframe'), null)
      const img = mounted.container.querySelector('img')
      assert.ok(img, 'a record without a playable source must show its cover')
      assert.equal(img.getAttribute('src'), '/omnimux/inspiration/local/media/covers/cover_ab34.jpg')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('renders the title glyph when there is no source and no cover', async () => {
    const mounted = await mount('InspirationPreviewModal.jsx', {
      row: {
        id: 'insp_5',
        title: '仅有标题',
        type: 'link',
        source_platform: 'youtube',
        source_url: 'https://www.youtube.com/watch?v=abc12345678',
        media_urls: [],
        cover_url: '',
      },
      t,
      onClose() {},
    }, 'InspirationPreviewModal')
    try {
      assert.equal(mounted.container.querySelector('video'), null)
      assert.equal(mounted.container.querySelector('iframe'), null)
      assert.equal(mounted.container.querySelector('img'), null)
      const glyph = mounted.container.querySelector('.omnimux-inspiration-cover-fallback')
      assert.ok(glyph, 'the first-character fallback must render')
      assert.equal(glyph.textContent, '仅')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('shows the stage while importing and the failure detail after', async () => {
    const mounted = await mount('InspirationPreviewModal.jsx', {
      row: {
        id: 'insp_6',
        title: 'https://x.com/a/status/1',
        type: 'video',
        source_platform: 'x',
        source_url: 'https://x.com/a/status/1',
        media_urls: [],
        import_status: 'importing',
        import_stage: 'downloading',
      },
      t,
      onClose() {},
    }, 'InspirationPreviewModal')
    try {
      const status = mounted.container.querySelector('.omnimux-inspiration-player-status')
      assert.ok(status, 'an importing row must say what the job is doing')
      assert.equal(status.textContent, zh['add.status.downloading'])
      // No video is available yet, so the panel must not mount one.
      assert.equal(mounted.container.querySelector('video'), null)
    } finally {
      await mounted.unmount()
      mounted.close()
    }

    const failed = await mount('InspirationPreviewModal.jsx', {
      row: {
        id: 'insp_7',
        title: 'https://x.com/a/status/2',
        type: 'video',
        source_platform: 'x',
        source_url: 'https://x.com/a/status/2',
        media_urls: [],
        import_status: 'failed',
        import_error: '导入中断或超时，请重试',
      },
      t,
      onClose() {},
    }, 'InspirationPreviewModal')
    try {
      const alert = failed.container.querySelector('[role="alert"]')
      assert.ok(alert, 'a failed row must show why it failed')
      assert.match(alert.textContent, /导入中断或超时，请重试/)
    } finally {
      await failed.unmount()
      failed.close()
    }
  })

  it('names the missing AI breakdown on a row that did store its video', async () => {
    const detail = 'AI 视频拆解失败，请确保大模型视觉分析服务可用'
    const mounted = await mount('InspirationPreviewModal.jsx', {
      row: {
        id: 'insp_8',
        title: '已入库但未拆解',
        type: 'video',
        source_platform: 'x',
        source_url: 'https://x.com/a/status/3',
        media_urls: ['/omnimux/inspiration/local/media/videos/v_ab12.mp4'],
        import_status: 'ready',
        import_error: detail,
      },
      t,
      onClose() {},
    }, 'InspirationPreviewModal')
    try {
      // The player still renders: the item is playable, and the notice explains
      // the one part of it that is missing.
      assert.ok(mounted.container.querySelector('video'), 'the stored video must still play')
      const notice = [...mounted.container.querySelectorAll('p')]
        .find((node) => node.textContent === zh['add.analysisFailed'].replace('{error}', detail))
      assert.ok(notice, 'the preview must say which part is missing and how to get it')
      // It must not be dressed up as an import failure.
      assert.equal(mounted.container.querySelector('[role="alert"]'), null)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('says nothing extra about a clean completion', async () => {
    const mounted = await mount('InspirationPreviewModal.jsx', {
      row: {
        id: 'insp_9',
        title: '正常行',
        type: 'video',
        source_platform: 'x',
        source_url: 'https://x.com/a/status/4',
        media_urls: ['/omnimux/inspiration/local/media/videos/v_ab12.mp4'],
        import_status: 'ready',
      },
      t,
      onClose() {},
    }, 'InspirationPreviewModal')
    try {
      assert.equal(mounted.container.querySelector('[role="alert"]'), null)
      assert.equal(mounted.container.querySelector('.omnimux-inspiration-player-status'), null)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})

describe('InspirationCoverCard render gate — running status', () => {
  function cardProps(row, extra = {}) {
    return {
      card: {
        row,
        t,
        selected: false,
        selecting: false,
        replicateBusy: null,
        onSelect() {},
        onReplicate() {},
        revealed: false,
        ...extra,
      },
    }
  }

  it('renders the stage pill while importing', async () => {
    const mounted = await mount('InspirationCoverCard.jsx', cardProps({
      id: 'insp_1',
      title: 'https://x.com/a/status/1',
      is_local: true,
      source_platform: 'x',
      import_status: 'importing',
      import_stage: 'resolving',
    }), 'InspirationCoverCard')
    try {
      const pill = mounted.container.querySelector('.omnimux-inspiration-badge-status')
      assert.ok(pill, 'an importing card must show a status pill')
      assert.equal(pill.textContent, zh['add.status.resolving'])
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('renders a failed pill and keeps the card clickable', async () => {
    let clicked = 0
    const mounted = await mount('InspirationCoverCard.jsx', cardProps({
      id: 'insp_2',
      title: '失败的行',
      is_local: true,
      source_platform: 'x',
      import_status: 'failed',
      import_error: '导入中断或超时，请重试',
    }, { onSelect() { clicked += 1 } }), 'InspirationCoverCard')
    try {
      const pill = mounted.container.querySelector('.omnimux-inspiration-badge-status')
      assert.ok(pill, 'a failed card must show a failure pill')
      assert.equal(pill.textContent, zh['add.status.failed'])
      assert.equal(pill.getAttribute('data-variant'), 'danger')

      await React.act(async () => {
        mounted.container.querySelector('.omnimux-inspiration-card-pure')?.dispatchEvent(
          new mounted.window.MouseEvent('click', { bubbles: true }),
        )
      })
      assert.equal(clicked, 1, 'a failed card must still open its preview')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('puts the failure reason on the failed card, not just the word "failed"', async () => {
    // A card that only says "导入失败" is not actionable: the reason is the one
    // thing the user needs in order to decide whether retrying is worth it.
    const detail = 'OmniMux 社媒解析调用失败: request-failed'
    const mounted = await mount('InspirationCoverCard.jsx', cardProps({
      id: 'insp_2b',
      title: '失败的行',
      is_local: true,
      source_platform: 'x',
      import_status: 'failed',
      import_error: detail,
    }), 'InspirationCoverCard')
    try {
      const detailNode = mounted.container.querySelector('.omnimux-inspiration-card-error')
      assert.ok(detailNode, 'a failed card must render its reason')
      assert.equal(
        detailNode.textContent,
        zh['add.failedDetail'].replace('{error}', detail),
        'the reason must reach the card as rendered text',
      )
      // The card text as a whole carries both the state and the reason.
      assert.ok(mounted.container.textContent.includes(detail))
      assert.ok(mounted.container.textContent.includes(zh['add.status.failed']))
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('reports a completed import whose AI breakdown failed', async () => {
    // `ready` with an `import_error` is the row the background fix produces: the
    // video is stored, only the breakdown is missing. The card must say so rather
    // than render nothing (a silent row) or claim the import failed (a false one).
    const detail = 'AI 视频拆解失败，请确保大模型视觉分析服务可用'
    const mounted = await mount('InspirationCoverCard.jsx', cardProps({
      id: 'insp_2c',
      title: '已入库但未拆解',
      is_local: true,
      source_platform: 'x',
      type: 'video',
      media_urls: ['/omnimux/inspiration/local/media/videos/v_ab12.mp4'],
      import_status: 'ready',
      import_error: detail,
    }), 'InspirationCoverCard')
    try {
      const detailNode = mounted.container.querySelector('.omnimux-inspiration-card-error')
      assert.ok(detailNode, 'a settled row with a missing breakdown must say so')
      assert.equal(detailNode.textContent, zh['add.analysisFailed'].replace('{error}', detail))
      assert.equal(detailNode.className.includes('is-failed'), false, 'this row did not fail')
      // No failure pill: the import itself succeeded.
      assert.equal(mounted.container.querySelector('.omnimux-inspiration-badge-status'), null)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('renders nothing extra for a clean completion', async () => {
    const mounted = await mount('InspirationCoverCard.jsx', cardProps({
      id: 'insp_2d',
      title: '正常行',
      is_local: true,
      source_platform: 'x',
      type: 'video',
      media_urls: ['/omnimux/inspiration/local/media/videos/v_ab12.mp4'],
      import_status: 'ready',
    }), 'InspirationCoverCard')
    try {
      assert.equal(mounted.container.querySelector('.omnimux-inspiration-card-error'), null)
      assert.equal(mounted.container.querySelector('.omnimux-inspiration-badge-status'), null)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('renders no status pill for a settled row', async () => {
    for (const status of ['ready', 'degraded', undefined]) {
      const row = {
        id: `insp_${status || 'legacy'}`,
        title: '完成的行',
        is_local: true,
        source_platform: 'x',
        ...(status ? { import_status: status } : {}),
      }
      const mounted = await mount('InspirationCoverCard.jsx', cardProps(row), 'InspirationCoverCard')
      try {
        assert.equal(
          mounted.container.querySelector('.omnimux-inspiration-badge-status'),
          null,
          `a ${status ?? 'legacy'} row must render no status pill`,
        )
      } finally {
        await mounted.unmount()
        mounted.close()
      }
    }
  })

  it('disables the replicate action while the import runs', async () => {
    let replicated = 0
    const mounted = await mount('InspirationCoverCard.jsx', cardProps({
      id: 'insp_3',
      title: '导入中',
      is_local: true,
      source_platform: 'x',
      import_status: 'importing',
      import_stage: 'analyzing',
    }, { onReplicate() { replicated += 1 } }), 'InspirationCoverCard')
    try {
      const buttons = [...mounted.container.querySelectorAll('button')]
      const primary = buttons.find((node) => node.textContent === zh['card.cta.try'])
      assert.ok(primary, 'the replicate button must be present')
      assert.equal(primary.disabled, true, 'replicating an unfinished import must be refused')
      assert.equal(primary.getAttribute('aria-disabled'), 'true')

      await React.act(async () => {
        primary.dispatchEvent(new mounted.window.MouseEvent('click', { bubbles: true }))
      })
      assert.equal(replicated, 0)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})

describe('InspirationInlineImportDialog render gate — background import hand-off', () => {
  /**
   * The verdict the dialog asks for before importing anything (E3). These cases
   * are about what happens *after* the verdict, so the stub answers "content".
   */
  function contentVerdict() {
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { kind: 'content', platform: 'x' } }),
    }
  }

  /** The exact request the dialog makes once the user submits a URL. */
  function stubFetch(handler) {
    const previous = globalThis.fetch
    const calls = []
    globalThis.fetch = async (path, init) => {
      const call = { path: String(path), body: JSON.parse(init?.body ?? '{}') }
      calls.push(call)
      return handler(call, calls.length)
    }
    return {
      calls,
      restore() {
        globalThis.fetch = previous
      },
    }
  }

  /**
   * Type a URL into the real dialog and submit it, then let every resulting
   * promise settle.
   *
   * The value goes in through the prototype's setter because React tracks the
   * node's value and ignores an event that appears to change nothing, and the
   * submit is dispatched on the form because the dialog's submit handler lives
   * there — a bare click on the submit button would not reach it.
   * @param {any} mounted
   */
  async function submit(mounted) {
    const input = mounted.container.querySelector('input')
    assert.ok(input, 'the dialog must render its URL field')
    const form = mounted.container.querySelector('form')
    assert.ok(form, 'the dialog must render its form')
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(mounted.window.HTMLInputElement.prototype, 'value').set
        .call(input, 'https://x.com/a/status/1')
      input.dispatchEvent(new mounted.window.Event('input', { bubbles: true }))
    })
    assert.ok(
      [...mounted.container.querySelectorAll('button')].some((node) => node.textContent === zh['add.submit']),
      'the dialog must render its submit button',
    )
    await React.act(async () => {
      form.dispatchEvent(new mounted.window.Event('submit', { bubbles: true, cancelable: true }))
    })
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it('closes the dialog and hands the placeholder over as soon as the job answers 202', async () => {
    const placeholder = {
      id: 'insp_bg_1',
      title: 'https://x.com/a/status/1',
      source_url: 'https://x.com/a/status/1',
      import_status: 'importing',
      import_stage: 'resolving',
    }
    const fetchStub = stubFetch((call) => (call.path.includes('/classify')
      ? contentVerdict()
      : {
        ok: true,
        status: 202,
        json: async () => ({ data: placeholder }),
      }))
    /** @type {any[]} */
    const imported = []
    let closed = 0
    let mounted
    try {
      mounted = await mount('InspirationInlineImportDialog.jsx', {
        open: true,
        t,
        onClose() { closed += 1 },
        onImported(item) { imported.push(item) },
      }, 'InspirationInlineImportDialog')
      await submit(mounted)

      // "Click import → the dialog closes → a new card with a running status".
      // Both halves have to happen on the 202 itself: the published row is the
      // progress report, so a second press to dismiss the dialog would only add
      // back the wait the background job removes.
      assert.equal(closed, 1, 'a 202 must close the dialog in the same turn')
      assert.deepEqual(imported.map((item) => item.id), ['insp_bg_1'])
      const importCalls = fetchStub.calls.filter((call) => call.path.includes('/import-url'))
      assert.equal(importCalls.length, 1, 'exactly one content import')
      assert.equal(importCalls[0].body.background, true)
      // The verdict is asked once, before the import: a URL the Host reads as an
      // account must never reach this importer at all.
      assert.equal(fetchStub.calls.filter((call) => call.path.includes('/classify')).length, 1)
      // The dialog is gone, so the acknowledgement copy has nothing left to say.
      assert.equal(mounted.container.textContent.includes(zh['add.importing']), false)
    } finally {
      await mounted?.unmount()
      mounted?.close()
      fetchStub.restore()
    }
  })

  it('keeps the dialog open and shows the reason when the import is rejected', async () => {
    const fetchStub = stubFetch((call) => (call.path.includes('/classify')
      ? contentVerdict()
      : {
        ok: false,
        status: 422,
        json: async () => ({ error: '未从该链接解析到可入库的内容' }),
      }))
    /** @type {any[]} */
    const imported = []
    let closed = 0
    let mounted
    try {
      mounted = await mount('InspirationInlineImportDialog.jsx', {
        open: true,
        t,
        onClose() { closed += 1 },
        onImported(item) { imported.push(item) },
      }, 'InspirationInlineImportDialog')
      await submit(mounted)

      // The synchronous failure path is untouched by the background hand-off: the
      // user is told why, in the dialog they are still looking at.
      assert.equal(closed, 0)
      assert.deepEqual(imported, [])
      const alert = mounted.container.querySelector('[role="alert"]')
      assert.ok(alert, 'the failure must be rendered in the dialog')
      assert.match(alert.textContent, /未从该链接解析到可入库的内容/)
    } finally {
      await mounted?.unmount()
      mounted?.close()
      fetchStub.restore()
    }
  })
})
