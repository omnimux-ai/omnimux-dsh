import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const require = createRequire(import.meta.url)

/**
 * 与 trending-interaction.test.js 同一套织法：esbuild + JSDOM 加载真实组件，
 * 断言的是「渲染后的行为」，而不是源文件里的字符串。
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
    dom,
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

/**
 * 可控的观察器替身。
 *
 * JSDOM 没有布局引擎，真观察器永远不触发，因此这里把「哨兵进入视口」变成
 * 测试可以显式驱动的动作：`enter()` 只通知当前活着的观察器，
 * 切筛选/追加后旧观察器已 disconnect，`enter()` 就不会再打到它们身上。
 */
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
    enter() {
      for (const observer of [...observers]) {
        if (!observer.disconnected) {
          observer.callback([{ isIntersecting: true, target: null }], observer)
        }
      }
    },
    liveCount() {
      return observers.size
    },
    restore() {
      observers.clear()
    },
  }
}

/** 刷新微任务队列，让真源拉取的 promise 落地。 */
async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

/** 打开某个筛选下拉并选中一项。 */
async function chooseOption(host, ariaLabel, optionText) {
  const trigger = host.querySelector(`.omnimux-trending-select-trigger[aria-label="${ariaLabel}"]`)
  assert.ok(trigger, `找不到筛选下拉：${ariaLabel}`)
  await act(async () => {
    trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  })
  const option = Array.from(document.querySelectorAll('.omnimux-trending-select-option'))
    .find((el) => el.textContent.trim() === optionText)
  assert.ok(option, `下拉「${ariaLabel}」里没有选项「${optionText}」`)
  await act(async () => {
    option.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  })
  await flush()
}

/**
 * 造一行灵感库数据。三处身份（id / source_url / cover_url）都必须唯一：
 * 真源会按内容指纹剔除镜像条目，测试行撞车就会把数据自己吃掉。
 */
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

/** 一个按 page / page_size 真分页的 fetch 替身，并记录每次请求；`failAppend` 可让追加页报网络错。 */
function stubPagedFetch(rows, { pageSize = 48, maxRequests = 6, failAppend = () => false } = {}) {
  const previous = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url) => {
    const href = String(url)
    calls.push(href)
    if (calls.length > maxRequests) {
      throw new Error(`取数没有收口：已发出 ${calls.length} 次请求，超过上限 ${maxRequests}`)
    }
    const params = new URL(href, 'http://localhost').searchParams
    const page = Math.max(1, Number(params.get('page') || 1))
    const size = Number(params.get('page_size') || pageSize)
    if (page > 1 && failAppend()) throw new Error('测试注入：追加页网络中断')
    const start = (page - 1) * size
    const items = rows.slice(start, start + size)
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { items, total: rows.length, page, page_size: size } }),
    }
  }
  return {
    calls,
    restore: () => { globalThis.fetch = previous },
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

async function renderSection({ rows, stubOptions } = {}) {
  const { TrendingReplicateSection } = await loadComponent('./TrendingReplicateSection.jsx')
  const env = withDom(SECTION_FIXTURE)
  const host = document.querySelector('#root')
  const observer = installControllableObserver()
  const stub = stubPagedFetch(rows, stubOptions)
  const root = createRoot(host.querySelector('#seat'))

  await act(async () => {
    root.render(React.createElement(TrendingReplicateSection, {
      t: (key) => key,
      onApplyPrompt: () => {},
    }))
  })
  await flush()
  await flush()
  // 排序默认「智能推荐」会按实时打分重排，追加断言需要稳定的卡片顺序 → 切到按播放量
  await chooseOption(host, 'trending.filter.sort', 'trending.sort.views')

  return {
    env,
    host,
    root,
    stub,
    observer,
    cards: () => Array.from(host.querySelectorAll('[data-trending-id]')).map((el) => el.getAttribute('data-trending-id')),
    source: () => host.querySelector('[data-omnimux-trending]')?.getAttribute('data-omnimux-trending-source'),
    sentinel: () => host.querySelector('[data-omnimux-trending-sentinel]'),
    feedState: () => host.querySelector('[data-omnimux-trending-sentinel]')?.getAttribute('data-omnimux-trending-feed'),
    /** 一次「加载一批」= 每个真源各一次请求（本地库 + 云端库），按页号统计才稳。 */
    callsForPage: (page) => stub.calls.filter((href) => href.includes(`page=${page}`)),
    async settle() {
      await flush()
      await flush()
    },
    async teardown() {
      await act(async () => root.unmount())
      stub.restore()
      observer.restore()
      env.restore()
    },
  }
}

// ─────────────────────────────────────────────────────────────
// 1. 首屏：只取第 1 页，哨兵在位
// ─────────────────────────────────────────────────────────────

test('无限滚动：首屏只拉第 1 页，哨兵报告「还能加载」', async () => {
  const rows = Array.from({ length: 52 }, (_, index) => makeRow(index))
  const view = await renderSection({ rows })

  try {
    const cards = view.cards()
    assert.equal(cards.length, 48, '首屏只渲染第 1 页窗口')
    assert.equal(cards[0], 'insp_47', '按播放量降序：窗口内播放量最高的一条排最前')
    assert.equal(cards[47], 'insp_0')
    assert.equal(view.stub.calls.length, 2, '首屏只加载第 1 批（本地库 + 云端库各一次）')
    assert.equal(view.callsForPage(2).length, 0, '未滚动前不得预取第 2 页')
    assert.ok(view.sentinel(), '哨兵必须留在 DOM 里，否则观察器再也看不到它')
    assert.equal(view.feedState(), 'idle')
  } finally {
    await view.teardown()
  }
})

// ─────────────────────────────────────────────────────────────
// 2. 追加：哨兵进入视口 → 取下一页 → 平滑追加且不重复
// ─────────────────────────────────────────────────────────────

test('无限滚动：哨兵进入视口即追加下一批，卡片只增不重', async () => {
  const rows = Array.from({ length: 52 }, (_, index) => makeRow(index))
  const view = await renderSection({ rows })

  try {
    await act(async () => {
      view.observer.enter()
    })
    await view.settle()

    const cards = view.cards()
    assert.equal(cards.length, 52, '第 2 页的 4 条已追加到网格尾部')
    assert.equal(new Set(cards).size, 52, '同一支片不得出现两次')
    assert.ok(new Set(cards).has('insp_48'), '第 2 页的新卡片必须上屏')
    assert.ok(new Set(cards).has('insp_51'))
    assert.equal(view.callsForPage(2).length, 2, '第 2 批只取一次（本地库 + 云端库各一次）')
    assert.equal(view.callsForPage(3).length, 0, '取满一批后不得继续连着取下一页')
  } finally {
    await view.teardown()
  }
})

test('无限滚动：全部取完后哨兵给出温和的末尾提示，且不再观察', async () => {
  // 总共 50 条：第 1 页 48 条（拉满），第 2 页 2 条（回不满）
  const rows = Array.from({ length: 50 }, (_, index) => makeRow(index))
  const view = await renderSection({ rows })

  try {
    await act(async () => {
      view.observer.enter()
    })
    await view.settle()

    assert.equal(view.cards().length, 50)
    assert.equal(view.feedState(), 'exhausted')
    assert.equal(view.callsForPage(2).length, 2, '第 2 批只取一次')

    // 已经到底：观察器必须注销，滑到底不再空转
    assert.equal(view.observer.liveCount(), 0)

    const before = view.stub.calls.length
    await act(async () => {
      view.observer.enter()
    })
    await view.settle()
    assert.equal(view.stub.calls.length, before, '末尾之后不得再取数')
    assert.equal(view.callsForPage(3).length, 0, '到底之后不得再要第 3 页')
  } finally {
    await view.teardown()
  }
})

test('无限滚动：上游忽略翻页、每页都回同一批时在第二批收口，不由用户无限下拉', async () => {
  const rows = Array.from({ length: 48 }, (_, index) => makeRow(index))
  const view = await renderSection({ rows })

  try {
    await act(async () => {
      view.observer.enter()
    })
    await view.settle()

    assert.equal(view.cards().length, 48, '重复页不产生任何新卡片')
    assert.equal(view.feedState(), 'exhausted', '整页都是旧的 → 就地收口')
    assert.equal(view.observer.liveCount(), 0)
    assert.equal(view.callsForPage(3).length, 0, '收口后不得再要第 3 页')
  } finally {
    await view.teardown()
  }
})

// ─────────────────────────────────────────────────────────────
// 3. 追加失败：已加载的卡片不得清空，重试必须真的能再取一次
// ─────────────────────────────────────────────────────────────

test('无限滚动：追加页网络失败不得清空已加载卡片，板块状态仍是 ready', async () => {
  const rows = Array.from({ length: 60 }, (_, index) => makeRow(index))
  const view = await renderSection({ rows, stubOptions: { failAppend: () => true } })

  try {
    assert.equal(view.cards().length, 48, '首屏必须正常拿到第 1 页')

    await act(async () => {
      view.observer.enter()
    })
    await view.settle()

    // 用户什么都没做错：网络抖一下不该让正在看的 48 张卡片凭空消失
    assert.equal(view.cards().length, 48, '追加失败不得卸载已加载的卡片')
    assert.equal(view.source(), 'ready', '一次追加失败不得把整个板块打成 unavailable')
    assert.equal(view.feedState(), 'error', '哨兵要如实报出失败，而不是假装还在加载或已经到底')
    assert.ok(view.host.querySelector('[data-omnimux-trending-retry]'), '追加失败后必须给得出重试入口')
    assert.doesNotMatch(
      view.host.textContent,
      /trending\.library\.unavailable/,
      '不得拿「灵感库不可用」整屏提示替换掉已经上屏的列表',
    )
  } finally {
    await view.teardown()
  }
})

test('无限滚动：追加失败后点重试真的再取一次，把第 2 页补齐', async () => {
  const rows = Array.from({ length: 60 }, (_, index) => makeRow(index))
  let failing = true
  const view = await renderSection({ rows, stubOptions: { failAppend: () => failing } })

  try {
    await act(async () => {
      view.observer.enter()
    })
    await view.settle()
    assert.equal(view.cards().length, 48)

    const retry = view.host.querySelector('[data-omnimux-trending-retry]')
    assert.ok(retry, '追加失败后必须给得出重试入口')

    const before = view.stub.calls.length
    failing = false
    await act(async () => {
      retry.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    await view.settle()

    assert.ok(
      view.stub.calls.length > before,
      `点重试必须真的再取一次数（点击前 ${before} 次请求，点击后 ${view.stub.calls.length} 次）`,
    )
    assert.equal(view.callsForPage(2).length, 4, '重试取的是失败的那一页：失败两次 + 重试两次')
    assert.equal(view.cards().length, 60, '重试成功后第 2 页补上，前面 48 张一张不少')
  } finally {
    await view.teardown()
  }
})

// ─────────────────────────────────────────────────────────────
// 4. 筛选变更：回到第 1 页重新累积
// ─────────────────────────────────────────────────────────────

test('无限滚动：换筛选条件整体回到第 1 页，旧页不残留', async () => {
  const rows = Array.from({ length: 60 }, (_, index) => makeRow(index))
  const view = await renderSection({ rows })

  try {
    // 先追加一批，让列表处于「已累积两页」的状态
    await act(async () => {
      view.observer.enter()
    })
    await view.settle()
    assert.equal(view.cards().length, 60, '两页数据都已上屏')
    const callsBefore = view.stub.calls.length

    await chooseOption(view.host, 'trending.filter.region', 'US')
    await view.settle()

    assert.ok(view.stub.calls.length > callsBefore, '换筛选必须重新取第 1 页')
    const lastCall = view.stub.calls[view.stub.calls.length - 1]
    assert.ok(lastCall.includes('page=1'), '换筛选后必须回到第 1 页')
    assert.ok(lastCall.includes('country=US'))
    assert.equal(view.cards().length, 48, '换筛选后列表回到单页窗口，旧页不得残留')
    assert.notEqual(view.feedState(), 'exhausted', '新条件下仍可继续加载')
  } finally {
    await view.teardown()
  }
})

// ─────────────────────────────────────────────────────────────
// 5. 吸顶栏与既有功能
// ─────────────────────────────────────────────────────────────

test('吸顶：双 Tab 与筛选工具栏同处一条 sticky 容器，工具栏不因切 Tab 丢失', async () => {
  const rows = Array.from({ length: 6 }, (_, index) => makeRow(index))
  const view = await renderSection({ rows })

  try {
    const sticky = view.host.querySelector('[data-omnimux-trending-sticky]')
    assert.ok(sticky, '吸顶容器必须存在')
    assert.ok(sticky.querySelector('.omnimux-guide-tabs'), '双 Tab 导航在吸顶容器内')
    const toolbar = sticky.querySelector('[data-omnimux-trending-sticky-toolbar="trending"]')
    assert.ok(toolbar, '筛选工具栏在吸顶容器内')
    assert.ok(toolbar.querySelector('.omnimux-trending-toolbar'))
    // 工具栏只有一份：留在流内的那份会让吸顶栏看起来是空壳
    assert.equal(view.host.querySelectorAll('.omnimux-trending-toolbar').length, 1)
  } finally {
    await view.teardown()
  }
})

test('吸顶：切到 Skill Tab 后分类胶囊栏顶到吸顶位，网格里不再重复一份', async () => {
  const rows = Array.from({ length: 6 }, (_, index) => makeRow(index))
  const view = await renderSection({ rows })

  try {
    const skillTab = view.host.querySelector('#tab-skills')
    await act(async () => {
      skillTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    await view.settle()

    assert.ok(
      view.host.querySelector('[data-omnimux-trending-sticky-toolbar="skills"]'),
      'Skill 分类胶囊栏也在吸顶容器内',
    )
    assert.equal(view.host.querySelectorAll('.omnimux-skills-chips-bar').length, 1, '胶囊栏只渲染一处')
    assert.equal(view.host.querySelectorAll('.omnimux-trending-toolbar').length, 0, '对标工具栏随 Tab 一起收起')
    assert.ok(view.host.querySelectorAll('.omnimux-skill-card').length > 0, 'Skill 卡片网格仍在流内')
  } finally {
    await view.teardown()
  }
})
