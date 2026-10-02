import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const require = createRequire(import.meta.url)

/**
 * 首屏取数失败后的「重试」语义。
 *
 * 单独一个文件（独立进程、独立模块实例）是为了拿到**干净的内存缓存**：
 * 首屏结果会写进真源的内存缓存，同一进程里先跑过的用例会把第 1 页填进去，
 * 重试就变成「命中缓存」，测不出它到底重取了哪一页。
 *
 * 期望行为：首屏失败后的重试必须重取**第 1 页**——第 1 页是排名最靠前的窗口，
 * 从第 2 页续上等于把最该看的 48 条静默跳过。
 */
async function loadComponent(entry) {
  const output = await build({
    entryPoints: [new URL(entry, import.meta.url).pathname],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react'],
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(require, module, module.exports)
  return module.exports
}

function withDom(html) {
  const dom = new JSDOM(html, { url: 'http://localhost/' })
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
    fetch: globalThis.fetch,
    io: globalThis.IntersectionObserver,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  return {
    restore() {
      globalThis.window = previous.window
      globalThis.document = previous.document
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
      globalThis.fetch = previous.fetch
      globalThis.IntersectionObserver = previous.io
      dom.window.close()
    },
  }
}

/** 观察器替身：只在测试显式调用 `enter` 时才通知，首屏重试的用例里一次都不触发。 */
function installControllableObserver() {
  const observers = new Set()
  class FakeObserver {
    constructor(callback) {
      this.callback = callback
      this.disconnected = false
      observers.add(this)
    }

    observe() {}

    disconnect() {
      this.disconnected = true
      observers.delete(this)
    }
  }
  globalThis.IntersectionObserver = FakeObserver
  globalThis.window.IntersectionObserver = FakeObserver
  return {
    restore() {
      observers.clear()
    },
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

function makeRow(index) {
  return {
    id: `insp_${index}`,
    title: `Reference video ${index}`,
    country_code: 'US',
    category: 'beauty',
    cover_url: `/omnimux/inspiration/local/media/covers/cover_${index}.jpg`,
    source_url: `https://www.tiktok.com/@a/video/${500000000000000 + index}`,
    stats: { likes: 100, comments: 20, shares: 5, views: 100000 + index },
    deconstruction: { hook_highlight: `钩子 ${index}` },
  }
}

const SECTION_FIXTURE = [
  '<div id="root" data-omnimux-starter-host data-phase="hero">',
  '<div data-composer-seat><div class="band"><div data-composer-card>',
  '<button data-send-button>Send</button>',
  '</div></div></div>',
  '<div id="seat"></div>',
  '</div>',
].join('')

test('无限滚动：首屏失败后的重试重取第 1 页，不从第 2 页续上', async () => {
  const rows = Array.from({ length: 60 }, (_, index) => makeRow(index))
  const state = { failing: true }
  const previousFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url) => {
    const href = String(url)
    calls.push(href)
    if (state.failing) throw new Error('测试注入：首屏网络中断')
    const params = new URL(href, 'http://localhost').searchParams
    const page = Math.max(1, Number(params.get('page') || 1))
    const size = Number(params.get('page_size') || 48)
    const start = (page - 1) * size
    const items = rows.slice(start, start + size)
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { items, total: rows.length, page, page_size: size } }),
    }
  }

  const { TrendingReplicateSection } = await loadComponent('./TrendingReplicateSection.jsx')
  const env = withDom(SECTION_FIXTURE)
  const observer = installControllableObserver()
  const host = document.querySelector('#root')
  const root = createRoot(host.querySelector('#seat'))

  try {
    await act(async () => {
      root.render(React.createElement(TrendingReplicateSection, {
        t: (key) => key,
        onApplyPrompt: () => {},
      }))
    })
    await flush()
    await flush()

    assert.equal(host.querySelectorAll('[data-trending-id]').length, 0, '首屏失败时屏上不该有卡片')
    assert.equal(
      host.querySelector('[data-omnimux-trending]').getAttribute('data-omnimux-trending-source'),
      'unavailable',
      '首屏拿不到数据要如实说清',
    )

    const retry = host.querySelector('[data-omnimux-trending-retry]')
    assert.ok(retry, '首屏失败必须给得出重试入口')

    state.failing = false
    const before = calls.length
    await act(async () => {
      retry.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    await flush()
    await flush()

    assert.ok(
      calls.length > before,
      `点重试必须至少再取一次数（点击前 ${before} 次请求，点击后 ${calls.length} 次）`,
    )

    const newlyIssued = calls.slice(before)
    assert.ok(
      newlyIssued.every((href) => href.includes('page=1')),
      `重试必须重取第 1 页（实际：${newlyIssued.map((href) => href.replace(/^.*\/\//, '').slice(0, 60)).join(' | ')}）`,
    )

    const cards = Array.from(host.querySelectorAll('[data-trending-id]')).map((el) => el.getAttribute('data-trending-id'))
    assert.equal(cards.length, 48, '重试成功后必须回到首屏那一窗 48 条')
    assert.ok(cards.includes('insp_0'), '第 1 页最靠后的一条也在：重试没有静默跳过任何一窗')
    assert.equal(
      host.querySelector('[data-omnimux-trending]').getAttribute('data-omnimux-trending-source'),
      'ready',
      '重试成功后板块恢复可用',
    )
  } finally {
    await act(async () => root.unmount())
    globalThis.fetch = previousFetch
    observer.restore()
    env.restore()
  }
})
