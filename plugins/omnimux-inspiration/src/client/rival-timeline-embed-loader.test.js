import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  createTimelineEmbed,
  embedTheme,
  embedWidgetLang,
  instagramCardHeight,
  loadTwitterWidgets,
  probeEmbedReachable,
  resetTwitterWidgetsLoader,
  TWITTER_WIDGETS_SRC,
} from './rival-timeline-embed-loader.js'

/**
 * Official-embed loader contract (#3542).
 *
 * The timeline's row only decides *when* to mount an embed; the loader owns
 * *how*. These cases pin the platform matrix, the X widget options, the
 * single-load/cached-failure rule and the Instagram height estimate without
 * touching the network (`deny-network` still applies to the suite).
 */

const X_TARGET = {
  platform: 'x',
  kind: 'card',
  id: '2112335003086643577',
  url: 'https://platform.twitter.com/embed/Tweet.html?id=2112335003086643577',
}

let dom = null
let host = null

beforeEach(() => {
  dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', { url: 'http://localhost:3000' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  host = dom.window.document.getElementById('host')
})

afterEach(() => {
  resetTwitterWidgetsLoader()
  delete globalThis.window
  delete globalThis.document
  dom.window.close()
  dom = null
  host = null
})

function installTwttr(createTweet) {
  const calls = []
  const twttr = {
    widgets: {
      createTweet: async (id, target, options) => {
        calls.push({ id, target, options })
        return createTweet(id, target, options)
      },
    },
  }
  window.twttr = twttr
  return calls
}

describe('loadTwitterWidgets — 单例加载与失败缓存（#3542）', () => {
  it('injects the official script once and resolves after the widget is ready', async () => {
    const first = loadTwitterWidgets()
    const second = loadTwitterWidgets()
    assert.equal(first, second, 'a second row must reuse the in-flight script')
    const scripts = document.querySelectorAll('script[data-omnimux-twitter-widgets]')
    assert.equal(scripts.length, 1, 'only one widgets.js tag may exist')
    assert.equal(scripts[0].getAttribute('src'), TWITTER_WIDGETS_SRC)

    window.twttr = { ready: (callback) => callback(window.twttr), widgets: { createTweet: async () => null } }
    scripts[0].onload()
    const api = await first
    assert.equal(api, window.twttr)
  })

  it('caches a failed load so every visible row does not retry it', async () => {
    const pending = loadTwitterWidgets()
    const script = document.querySelector('script[data-omnimux-twitter-widgets]')
    script.onerror()
    await assert.rejects(pending, /twitter-widgets-failed/)
    await assert.rejects(loadTwitterWidgets(), /twitter-widgets-failed/, 'a failed load stays failed until reset')
  })

  it('resolves immediately when the page already loaded widgets.js', async () => {
    const existing = { widgets: { createTweet: async () => null } }
    window.twttr = existing
    assert.equal(await loadTwitterWidgets(), existing)
    assert.equal(document.querySelectorAll('script[data-omnimux-twitter-widgets]').length, 0)
  })
})

describe('createTimelineEmbed — 各平台官方嵌入（#3542）', () => {
  it('creates the X tweet card with dark theme, dnt and no conversation', async () => {
    const calls = installTwttr((id, target) => {
      const frame = document.createElement('iframe')
      target.appendChild(frame)
      return frame
    })
    const ok = await createTimelineEmbed(X_TARGET, host, { theme: 'dark', lang: 'zh-cn', title: '作者 · 推特 (X)' })
    assert.equal(ok, true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].id, X_TARGET.id)
    assert.equal(calls[0].options.theme, 'dark')
    assert.equal(calls[0].options.dnt, true)
    assert.equal(calls[0].options.conversation, 'none')
    assert.equal(calls[0].options.lang, 'zh-cn')
    assert.ok(host.querySelector('iframe'), 'the widget must be mounted inside the row host')
  })

  it('keeps the light theme option when the app is light', async () => {
    const calls = installTwttr((id, target) => {
      const frame = document.createElement('iframe')
      target.appendChild(frame)
      return frame
    })
    await createTimelineEmbed(X_TARGET, host, { theme: 'light' })
    assert.equal(calls[0].options.theme, 'light')
  })

  it('reports failure when the tweet cannot be rendered', async () => {
    installTwttr(() => null)
    const ok = await createTimelineEmbed(X_TARGET, host, { theme: 'dark' })
    assert.equal(ok, false, 'an unavailable tweet must fall back to the row card')
    assert.equal(host.querySelector('iframe'), null)
  })

  it('creates a TikTok player iframe with the official URL and allowances', async () => {
    const pending = createTimelineEmbed({
      platform: 'tiktok',
      kind: 'player',
      id: '7698442056158465',
      url: 'https://www.tiktok.com/player/v1/7698442056158465',
    }, host, { title: '作者 · TikTok' })
    const player = host.querySelector('iframe')
    assert.ok(player, 'the iframe must be mounted before it loads')
    player.dispatchEvent(new window.Event('load'))
    const ok = await pending
    assert.equal(ok, true)
    const frame = host.querySelector('iframe')
    assert.equal(frame.getAttribute('src'), 'https://www.tiktok.com/player/v1/7698442056158465')
    assert.equal(frame.getAttribute('title'), '作者 · TikTok')
    assert.equal(frame.getAttribute('allow'), 'encrypted-media; picture-in-picture; fullscreen')
    assert.equal(frame.getAttribute('allowfullscreen'), 'true')
    assert.equal(frame.getAttribute('loading'), 'lazy')
    assert.equal(frame.getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin')
    assert.equal(frame.getAttribute('scrolling'), null)
    assert.ok(String(frame.className).includes('is-tiktok'))
  })

  it('creates a YouTube player iframe that does not scroll', async () => {
    const pending = createTimelineEmbed({
      platform: 'youtube',
      kind: 'player',
      id: 'abc123',
      url: 'https://www.youtube.com/embed/abc123?rel=0',
    }, host, {})
    host.querySelector('iframe').dispatchEvent(new window.Event('load'))
    const ok = await pending
    assert.equal(ok, true)
    const frame = host.querySelector('iframe')
    assert.equal(frame.getAttribute('scrolling'), 'no')
    assert.ok(String(frame.className).includes('is-youtube'))
  })

  it('creates an Instagram card iframe once it loads', async () => {
    const pending = createTimelineEmbed({
      platform: 'instagram',
      kind: 'card',
      id: 'CqX0YyYvZzZ',
      url: 'https://www.instagram.com/p/CqX0YyYvZzZ/embed/',
    }, host, {})
    const frame = host.querySelector('iframe')
    assert.ok(frame, 'the Instagram embed is an iframe card')
    frame.dispatchEvent(new window.Event('load'))
    assert.equal(await pending, true)
  })

  it('reports failure when an iframe embed cannot load', async () => {
    const pending = createTimelineEmbed({
      platform: 'youtube',
      kind: 'player',
      id: 'abc123',
      url: 'https://www.youtube.com/embed/abc123?rel=0',
    }, host, {})
    host.querySelector('iframe').dispatchEvent(new window.Event('error'))
    assert.equal(await pending, false, 'a blocked/failed iframe must release the row fallback')
  })

  it('skips the reachability probe where fetch is unavailable (jsdom)', async () => {
    assert.equal(await probeEmbedReachable('https://www.youtube.com/embed/abc123'), true)
  })

  it('drops the iframe path when the embed domain is unreachable', async () => {
    window.fetch = async () => { throw new TypeError('Failed to fetch') }
    const ok = await createTimelineEmbed({
      platform: 'tiktok',
      kind: 'player',
      id: '7698442056158465',
      url: 'https://www.tiktok.com/player/v1/7698442056158465',
    }, host, {})
    assert.equal(ok, false, 'a blocked domain must keep the hand-written card')
    assert.equal(host.querySelector('iframe'), null, 'a blocked domain must not leave an error-page frame')
    delete window.fetch
  })

  it('probes the exact embed URL with no referrer or credentials', async () => {
    const seen = []
    window.fetch = async (url, options) => { seen.push({ url, options }); return {} }
    assert.equal(await probeEmbedReachable('https://www.instagram.com/p/CqX0YyYvZzZ/embed/'), true)
    assert.equal(seen.length, 1)
    assert.equal(seen[0].url, 'https://www.instagram.com/p/CqX0YyYvZzZ/embed/')
    assert.equal(seen[0].options.mode, 'no-cors')
    assert.equal(seen[0].options.method, 'HEAD')
    assert.equal(seen[0].options.credentials, 'omit')
    assert.equal(seen[0].options.referrerPolicy, 'no-referrer')
    delete window.fetch
  })

  it('refuses platforms without an official embed', async () => {
    const ok = await createTimelineEmbed({
      platform: 'douyin',
      kind: 'card',
      id: '1',
      url: 'https://www.douyin.com/video/1',
    }, host, {})
    assert.equal(ok, false)
    assert.equal(host.querySelector('iframe'), null)
  })
})

describe('embedTheme / embedWidgetLang / instagramCardHeight（#3542）', () => {
  it('reads the app data-theme attribute and defaults to dark', () => {
    assert.equal(embedTheme(), 'dark')
    document.documentElement.setAttribute('data-theme', 'light')
    assert.equal(embedTheme(), 'light')
    document.documentElement.removeAttribute('data-theme')
    assert.equal(embedTheme(), 'dark')
  })

  it('maps the plugin locale to the X widget language', () => {
    assert.equal(embedWidgetLang('en'), 'en')
    assert.equal(embedWidgetLang('zh'), 'zh-cn')
    assert.equal(embedWidgetLang(undefined), 'zh-cn')
  })

  it('sizes an Instagram card from the media ratio and clamps it', () => {
    assert.equal(instagramCardHeight(500, 1), 690)
    assert.equal(instagramCardHeight(500, 0.5), 780, 'very tall media is capped')
    assert.equal(instagramCardHeight(0, 1), 690, 'unmeasured hosts fall back to 500px')
    assert.equal(instagramCardHeight(300, Number.NaN), 490, 'an unknown ratio uses a square card')
    assert.ok(instagramCardHeight(300, 0.4) <= 780)
  })
})
