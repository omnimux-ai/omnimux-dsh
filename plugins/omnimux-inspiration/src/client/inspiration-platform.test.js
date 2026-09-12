import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { buildPlatformFilterOptions, formatPlatformName, shouldShowPlatformFilter } from './feed-helpers.js'
import { useInspirationFeed } from './use-inspiration-feed.js'
import { zh, en } from './locales.js'
import { invalidateInspirationCache } from './api.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const sectionSrc = readFileSync(join(__dirname, 'InspirationSection.jsx'), 'utf8')

describe('Inspiration Platform Formatting & Dynamic Registration', () => {
  it('formats known and self-registered platforms accurately with i18n support', () => {
    const tZh = (k) => zh[k] || k
    const tEn = (k) => en[k] || k

    // Known platforms
    assert.equal(formatPlatformName('tiktok', tZh), 'TikTok')
    assert.equal(formatPlatformName('tiktok', tEn), 'TikTok')
    assert.equal(formatPlatformName('x', tZh), '推特 (X)')
    assert.equal(formatPlatformName('twitter', tZh), '推特 (X)')
    assert.equal(formatPlatformName('x', tEn), 'Twitter (X)')
    assert.equal(formatPlatformName('twitter', tEn), 'Twitter (X)')
    assert.equal(formatPlatformName('instagram', tZh), 'Instagram')
    assert.equal(formatPlatformName('instagram', tEn), 'Instagram')
    assert.equal(formatPlatformName('youtube', tZh), 'YouTube')
    assert.equal(formatPlatformName('youtube', tEn), 'YouTube')

    // Self-registered platforms capitalize first letter
    assert.equal(formatPlatformName('douyin', tZh), 'Douyin')
    assert.equal(formatPlatformName('bilibili', tZh), 'Bilibili')
    assert.equal(formatPlatformName('threads', tZh), 'Threads')
    assert.equal(formatPlatformName('kuaishou', tZh), 'Kuaishou')

    // Fallback for empty/null
    assert.equal(formatPlatformName('', tZh), '')
    assert.equal(formatPlatformName(null, tZh), '')
  })

  it('gates the platform filter through the predicate the section renders from', () => {
    const tZh = (k) => zh[k] || k
    const tEn = (k) => en[k] || k

    // 0 or 1 platform: no dropdown at all. 2+: dropdown.
    assert.equal(shouldShowPlatformFilter([]), false)
    assert.equal(shouldShowPlatformFilter(['tiktok']), false)
    assert.equal(shouldShowPlatformFilter(['tiktok', 'x']), true)
    assert.equal(shouldShowPlatformFilter(undefined), false)
    assert.equal(shouldShowPlatformFilter('tiktok'), false)
    assert.equal(buildPlatformFilterOptions(['tiktok'], tZh), null)
    assert.equal(buildPlatformFilterOptions([], tZh), null)
    assert.equal(buildPlatformFilterOptions(undefined, tZh), null)

    // The exact option list the dropdown renders, in both locales.
    assert.deepEqual(buildPlatformFilterOptions(['tiktok', 'x'], tZh), [
      { value: '', label: '全部平台' },
      { value: 'tiktok', label: 'TikTok' },
      { value: 'x', label: '推特 (X)' },
    ])
    assert.deepEqual(buildPlatformFilterOptions(['tiktok', 'x'], tEn), [
      { value: '', label: 'All Platforms' },
      { value: 'tiktok', label: 'TikTok' },
      { value: 'x', label: 'Twitter (X)' },
    ])
    // Self-registered platforms stay selectable under the first-letter rule.
    assert.deepEqual(buildPlatformFilterOptions(['tiktok', 'douyin'], tZh)[2], { value: 'douyin', label: 'Douyin' })
  })

  it('renders the dropdown from that gate and does not hand-roll the condition', () => {
    assert.match(
      sectionSrc,
      /buildPlatformFilterOptions\(availablePlatforms,\s*t\)/,
      'InspirationSection must derive the platform dropdown from buildPlatformFilterOptions',
    )
    assert.match(
      sectionSrc,
      /aria-label=\{t\('filter\.platform'\)\}/,
      'Platform DropdownSelect must carry t("filter.platform") aria-label',
    )
    assert.doesNotMatch(
      sectionSrc,
      /availablePlatforms\.length\s*>\s*1/,
      'the gating condition must live in buildPlatformFilterOptions, not inline in the JSX',
    )
  })

  it('dynamically discovers platforms from items and handleImportSuccess', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
      url: 'http://localhost:3000',
    })
    const originalWindow = globalThis.window
    const originalDocument = globalThis.document
    const originalFetch = globalThis.fetch
    const originalIntersectionObserver = globalThis.IntersectionObserver
    const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT

    globalThis.window = dom.window
    globalThis.document = dom.window.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = true

    class DummyIntersectionObserver {
      observe() {}
      disconnect() {}
    }
    globalThis.IntersectionObserver = DummyIntersectionObserver

    // Feed starts with ONLY TikTok items (length of unique platforms = 1)
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          items: [
            { id: '1', title: 'TikTok video 1', source_platform: 'tiktok' },
            { id: '2', title: 'TikTok video 2', source_platform: 'tiktok' },
          ],
          total: 2,
          platforms: [{ name: 'tiktok', count: 2 }],
        },
      }),
    })

    let feed
    function TestHarness() {
      feed = useInspirationFeed({ active: true })
      return React.createElement('div', null, feed.items.length)
    }

    const root = createRoot(dom.window.document.getElementById('root'))
    try {
      await act(async () => {
        root.render(React.createElement(TestHarness))
      })

      // Wait for feed to load
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (feed?.items?.length === 2) break
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
        })
      }

      // Initial state: only 1 platform (tiktok) -> gate condition is false!
      assert.deepEqual(feed.availablePlatforms, ['tiktok'])
      assert.equal(feed.availablePlatforms.length > 1, false, 'Gating condition must be false when only 1 platform exists')

      // Now import a Twitter/X item dynamically via handleImportSuccess
      await act(async () => {
        feed.handleImportSuccess({
          id: '3',
          title: 'Twitter post 1',
          source_platform: 'twitter',
        })
      })

      // After import: availablePlatforms now contains ['tiktok', 'x'] -> length = 2 -> gate condition is true!
      assert.ok(feed.availablePlatforms.includes('tiktok'))
      assert.ok(feed.availablePlatforms.includes('x'))
      assert.equal(feed.availablePlatforms.length > 1, true, 'Gating condition must become true when imported new platform')

      // Import another self-registered platform (e.g. douyin)
      await act(async () => {
        feed.handleImportSuccess({
          id: '4',
          title: 'Douyin video 1',
          source_platform: 'douyin',
        })
      })
      assert.ok(feed.availablePlatforms.includes('douyin'))
      assert.equal(feed.availablePlatforms.length, 3)

      // Test platform state setter
      await act(async () => {
        feed.setPlatform('x')
      })
      assert.equal(feed.platform, 'x')
    } finally {
      await act(async () => root.unmount())
      invalidateInspirationCache()
      dom.window.close()
      globalThis.window = originalWindow
      globalThis.document = originalDocument
      globalThis.fetch = originalFetch
      globalThis.IntersectionObserver = originalIntersectionObserver
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
    }
  })
})
