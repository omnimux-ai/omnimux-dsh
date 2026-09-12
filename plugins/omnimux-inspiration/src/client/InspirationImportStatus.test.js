import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { zh } from './locales.js'

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

  const container = dom.window.document.getElementById('host')
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(Component, props))
  })

  return {
    container,
    document: dom.window.document,
    window: dom.window,
    async unmount() {
      await act(async () => root.unmount())
      globalThis.window = previous.window
      globalThis.document = previous.document
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
    },
    close() {
      dom.window.close()
    },
  }
}

const t = (key) => zh[key] || key

// Cleaned up at process exit rather than in an `after` hook: `node --test` may
// still be running sibling suites from the same directory.
process.on('exit', () => {
  rmSync(cacheDir, { recursive: true, force: true })
})

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

      await act(async () => {
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

      await act(async () => {
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

      await act(async () => {
        primary.dispatchEvent(new mounted.window.MouseEvent('click', { bubbles: true }))
      })
      assert.equal(replicated, 0)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})
