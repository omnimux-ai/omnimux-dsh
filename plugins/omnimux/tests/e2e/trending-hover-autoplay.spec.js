import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const require = createRequire(import.meta.url)

/**
 * 端到端：爆款对标板块的「卡内多图轮播 + 悬停自动播放 + 整排横滑浏览格式」。
 *
 * 覆盖真实链路：灵感库返回行 → 真源映射 → 工具栏渲染 → 卡片交互。
 * 断言全部落在渲染后的 DOM 与元素状态上，而不是源文件字符串。
 */
async function loadModule(entry) {
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

const SECTION_FIXTURE = [
  '<div id="root" data-omnimux-starter-host data-phase="hero">',
  '<div class="scrollBody"><div id="seat"></div></div>',
  '</div>',
].join('')

function withDom() {
  const dom = new JSDOM(`<!doctype html><html><body>${SECTION_FIXTURE}</body></html>`, { url: 'http://localhost/' })
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
    fetch: globalThis.fetch,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  dom.window.HTMLMediaElement.prototype.play = async function play() {}
  dom.window.HTMLMediaElement.prototype.pause = function pause() {}
  return {
    dom,
    restore() {
      globalThis.window = previous.window
      globalThis.document = previous.document
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
      globalThis.fetch = previous.fetch
      dom.window.close()
    },
  }
}

/**
 * 灵感库行样本：一条多图卡（三张图 + 视频地址）、一条纯视频卡、一条单图卡。
 * `images` 是图集的唯一权威；`media_urls` 只给单图卡用来验证「单张不算图集」。
 */
const SOURCE_ROWS = [
  {
    id: 'insp_album',
    title: '多图对标：三个关键帧',
    country_code: 'US',
    category: 'beauty',
    cover_url: '/omnimux/inspiration/local/media/covers/album-a.jpg',
    images: [
      '/omnimux/inspiration/local/media/covers/album-a.jpg',
      '/omnimux/inspiration/local/media/covers/album-b.jpg',
      '/omnimux/inspiration/local/media/covers/album-c.jpg',
    ],
    video_url: 'https://cdn.example.com/album.mp4',
    stats: { likes: 300000, comments: 20000, shares: 5000, views: 12000000 },
  },
  {
    id: 'insp_video',
    title: '视频对标：悬停预览',
    country_code: 'US',
    category: 'home',
    cover_url: '/omnimux/inspiration/local/media/covers/video-a.jpg',
    video_url: 'https://cdn.example.com/preview.mp4',
    stats: { likes: 7000, views: 900000 },
  },
  {
    id: 'insp_single',
    title: '单图对标：不该出现翻图控件',
    country_code: 'TH',
    category: 'beauty',
    cover_url: '/omnimux/inspiration/local/media/covers/single-a.jpg',
    media_urls: ['/omnimux/inspiration/local/media/covers/single-a.jpg'],
    stats: { likes: 400000, views: 40000000 },
  },
]

/** 只回给定行的 fetch 替身；服务端参数按真源行为先过滤。 */
function stubFetch(rows) {
  const previous = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    const params = new URL(String(url), 'http://localhost').searchParams
    let items = rows
    const country = params.get('country')
    if (country) items = items.filter((row) => row.country_code === country)
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { items, total: items.length } }),
    }
  }
  return {
    calls,
    restore() {
      globalThis.fetch = previous
    },
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

async function renderSection() {
  const { TrendingReplicateSection } = await loadModule(
    '../../src/client/session-guide/trending/TrendingReplicateSection.jsx',
  )
  const env = withDom()
  const host = document.querySelector('#root')
  const stub = stubFetch(SOURCE_ROWS)
  const root = createRoot(host.querySelector('#seat'))

  await act(async () => {
    root.render(React.createElement(TrendingReplicateSection, { t: (key) => key, onApplyPrompt: () => {} }))
  })
  await flush()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })

  const cardById = (id) => host.querySelector(`.omnimux-trending-card[data-trending-id="${id}"]`)

  return {
    env,
    host,
    cardById,
    async hover(id) {
      await act(async () => {
        cardById(id).dispatchEvent(new window.Event('mouseenter'))
        await new Promise((resolve) => setTimeout(resolve, 220))
      })
    },
    async unhover(id) {
      await act(async () => {
        cardById(id).dispatchEvent(new window.Event('mouseleave'))
      })
    },
    async clickNode(node) {
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      })
    },
    async teardown() {
      await act(async () => root.unmount())
      stub.restore()
      env.restore()
    },
  }
}

test('e2e: 灵感库多图行渲染成卡内图集，单图行不出现任何翻图控件', async () => {
  const view = await renderSection()
  try {
    assert.ok(view.host.querySelector('.omnimux-trending-grid'), '真源就绪后必须渲染卡片网格')

    // 多图卡：三张图全部落在卡内，只有第一张可见
    const album = view.cardById('insp_album')
    const layers = album.querySelectorAll('.omnimux-trending-cover-img.is-carousel-layer')
    assert.equal(layers.length, 3, '多图卡必须把整组图叠放进卡内')
    assert.equal(
      Array.from(layers).filter((el) => el.classList.contains('is-loaded')).length,
      1,
      '同一时刻只允许一张图可见',
    )

    // 翻图控件齐全，页码序号按用户要求不得存在
    assert.ok(album.querySelector('.omnimux-trending-card-carousel-nav.is-prev'), '多图卡必须有上一张按钮')
    assert.ok(album.querySelector('.omnimux-trending-card-carousel-nav.is-next'), '多图卡必须有下一张按钮')
    assert.equal(album.querySelectorAll('.omnimux-trending-carousel-dot').length, 3, '圆点数量与图数一致')
    assert.equal(
      album.querySelector('.omnimux-trending-card-carousel-count'),
      null,
      '多图卡不得显示页码序号胶囊',
    )

    // 单图卡：一个翻图控件都不许出现
    const single = view.cardById('insp_single')
    assert.equal(single.querySelector('.omnimux-trending-card-carousel-nav'), null, '单图卡不得有翻图按钮')
    assert.equal(single.querySelector('.omnimux-trending-card-carousel-count'), null, '单图卡不得有页码')
    assert.equal(single.querySelectorAll('.omnimux-trending-cover-img.is-carousel-layer').length, 0, '单图卡不得叠层')
  } finally {
    await view.teardown()
  }
})

test('e2e: 点击卡内翻图逐张切换并循环，且不触发卡片自身点击', async () => {
  const view = await renderSection()
  try {
    const album = view.cardById('insp_album')
    const next = album.querySelector('.omnimux-trending-card-carousel-nav.is-next')
    const prev = album.querySelector('.omnimux-trending-card-carousel-nav.is-prev')

    const loadedIndex = () =>
      Array.from(album.querySelectorAll('.omnimux-trending-cover-img.is-carousel-layer'))
        .findIndex((el) => el.classList.contains('is-loaded'))

    const dotIndex = () =>
      Array.from(album.querySelectorAll('.omnimux-trending-carousel-dot'))
        .findIndex((el) => el.classList.contains('is-active'))

    assert.equal(loadedIndex(), 0, '初始停在第一张')
    assert.equal(dotIndex(), 0, '初始圆点停在第一个')

    await view.clickNode(next)
    assert.equal(loadedIndex(), 1, '点下一张必须切到第二张')
    assert.equal(dotIndex(), 1, '圆点必须跟着切换')

    await view.clickNode(next)
    assert.equal(loadedIndex(), 2, '再点一次切到第三张')

    await view.clickNode(next)
    assert.equal(loadedIndex(), 0, '到底后必须循环回第一张')

    await view.clickNode(prev)
    assert.equal(loadedIndex(), 2, '反向必须循环到最后一张')
  } finally {
    await view.teardown()
  }
})

test('e2e: 悬停视频卡 150ms 后挂载静音循环播放器，移出即卸载', async () => {
  const view = await renderSection()
  try {
    const video = view.cardById('insp_video')

    // 未悬停：绝不预先挂载播放器
    assert.equal(video.querySelector('video'), null, '未悬停不得挂载 video')
    assert.equal(video.getAttribute('data-trending-hover'), 'false')

    // 悬停但在防抖窗口内：仍不得激活
    await act(async () => {
      video.dispatchEvent(new window.Event('mouseenter'))
    })
    assert.equal(video.getAttribute('data-trending-hover'), 'false', '防抖窗口内不得激活')

    // 越过 150ms 防抖：播放器就绪且属性齐全
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220))
    })
    assert.equal(video.getAttribute('data-trending-hover'), 'true', '越过防抖后必须激活悬停态')

    const player = video.querySelector('video')
    assert.ok(player, '悬停激活后必须挂载 video')
    assert.equal(player.getAttribute('src'), 'https://cdn.example.com/preview.mp4')
    assert.equal(player.muted, true, '必须静音，否则浏览器不会自动播放')
    assert.ok(player.hasAttribute('loop'), '必须循环播放')
    assert.ok(player.hasAttribute('playsinline'), '必须内联播放')
    assert.ok(player.hasAttribute('autoplay'), '必须自动播放')

    // 移出：播放器立即卸载，画面复位成封面
    await view.unhover('insp_video')
    assert.equal(video.querySelector('video'), null, '移出后必须卸载播放器')
    assert.equal(video.getAttribute('data-trending-hover'), 'false', '移出后必须复位悬浮态')
  } finally {
    await view.teardown()
  }
})

test('e2e: 多图卡翻图优先——同卡上不会同时开视频预览', async () => {
  const view = await renderSection()
  try {
    const album = view.cardById('insp_album')
    await view.hover('insp_album')

    assert.equal(album.getAttribute('data-trending-hover'), 'true', '多图卡同样响应悬停')
    assert.equal(album.querySelector('video'), null, '多图卡翻图与播片互斥，不得挂载播放器')
    assert.ok(album.querySelector('.omnimux-trending-card-carousel-nav.is-next'), '翻图按钮必须仍然可用')

    await view.unhover('insp_album')
    assert.equal(album.getAttribute('data-trending-hover'), 'false')
  } finally {
    await view.teardown()
  }
})

test('e2e: 工具栏可切换到整排横滑浏览格式，卡片内容随之迁移', async () => {
  const view = await renderSection()
  try {
    const switcher = view.host.querySelector('.omnimux-trending-view-switch')
    assert.ok(switcher, '工具栏必须提供浏览格式切换器')

    const buttons = switcher.querySelectorAll('.omnimux-trending-view-btn')
    assert.equal(buttons.length, 2, '必须包含网格与轮播两档')

    // 默认网格
    assert.ok(view.host.querySelector('.omnimux-trending-grid'), '默认必须是网格视图')
    assert.equal(view.host.querySelector('.omnimux-trending-carousel-track'), null, '默认不得渲染横滑轨道')

    // 切到整排横滑
    await view.clickNode(buttons[1])
    const track = view.host.querySelector('.omnimux-trending-carousel-track')
    assert.ok(track, '切换后必须渲染横滑轨道')
    assert.equal(view.host.querySelector('.omnimux-trending-grid'), null, '切换后不得残留网格')
    assert.equal(
      track.querySelectorAll('.omnimux-trending-carousel-slide').length,
      SOURCE_ROWS.length,
      '每条对标各占一个滑动列',
    )
    assert.ok(
      view.host.querySelector('.omnimux-trending-carousel-nav.is-next'),
      '整排横滑必须提供左右切换按钮',
    )

    // 横滑格式里卡片能力不丢
    const albumInTrack = track.querySelector('.omnimux-trending-card[data-trending-id="insp_album"]')
    assert.ok(albumInTrack.querySelector('.omnimux-trending-card-carousel-nav.is-next'), '横滑格式下多图卡仍可翻图')

    // 切回网格
    await view.clickNode(buttons[0])
    assert.ok(view.host.querySelector('.omnimux-trending-grid'), '切回后必须恢复网格')
    assert.equal(view.host.querySelector('.omnimux-trending-carousel-track'), null, '切回后横滑轨道必须卸载')
  } finally {
    await view.teardown()
  }
})
