// @vitest-environment jsdom
// @ts-nocheck
//
// 断言使用 node:assert/strict，且不使用 TS 专有语法：仓库 guard-anti-cheat
// 的静态检查只对既有风险的 expect 调用放行，新测试文件必须能被 acorn 解析。
import { describe, it, beforeEach } from 'vitest'
import assert from 'node:assert/strict'
import { resolveActivePostUrl } from '../src/content/tiktok-scene/active-post.ts'

const VIEWPORT = { width: 1400, height: 900 }

/** jsdom has no layout; give one element the box the browser would report. */
function place(el, box) {
  const rect = {
    x: box.left,
    y: box.top,
    top: box.top,
    left: box.left,
    right: box.left + box.width,
    bottom: box.top + box.height,
    width: box.width,
    height: box.height,
    toJSON: () => ({}),
  }
  el.getBoundingClientRect = () => rect
}

function layoutCard(card) {
  place(card, { top: 0, left: 240, width: 900, height: 900 })
  const control = card.querySelector('[data-more-menu-item-id]')
  if (control) place(control, { top: 40, left: 1080, width: 32, height: 32 })
  return card
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('For You 当前作品解析 (Issue #3599)', () => {
  it('图文/轮播卡：没有 video、没有 xgwrapper，只有更多按钮上的作品 id', () => {
    document.body.innerHTML = `
      <div id="card" data-e2e="recommend-list-item-container">
        <img src="a.jpg" /><img src="b.jpg" />
        <button data-more-menu-item-id="7693330722479688973">...</button>
      </div>
    `
    const card = layoutCard(document.getElementById('card'))
    assert.equal(card.querySelector('video'), null)

    const url = resolveActivePostUrl(document, VIEWPORT)
    assert.equal(url, 'https://www.tiktok.com/@i/photo/7693330722479688973')
  })

  it('视频卡：仍然解析为 /video/<id>，作者从卡内账号元素取', () => {
    document.body.innerHTML = `
      <section id="card" data-e2e="feed-video">
        <video></video>
        <span data-e2e="video-author-uniqueid">cleanlife</span>
        <div id="xgwrapper-0-7412345678901234567"></div>
        <button data-more-menu-item-id="7412345678901234567">...</button>
      </section>
    `
    layoutCard(document.getElementById('card'))
    const url = resolveActivePostUrl(document, VIEWPORT)
    assert.equal(url, 'https://www.tiktok.com/@cleanlife/video/7412345678901234567')
  })

  it('卡片选择器没命中的布局：仍可用视口内最近的更多按钮兜底', () => {
    document.body.innerHTML = `
      <div id="odd" class="some-new-layout">
        <button data-more-menu-item-id="7693330722479688973">...</button>
      </div>
    `
    const control = document.querySelector('[data-more-menu-item-id]')
    place(document.getElementById('odd'), { top: 0, left: 240, width: 900, height: 900 })
    place(control, { top: 300, left: 600, width: 32, height: 32 })

    // 没有任何 type 线索的容器按图文处理：视频卡一定会带 xgwrapper 或 <video>。
    assert.equal(resolveActivePostUrl(document, VIEWPORT), 'https://www.tiktok.com/@i/photo/7693330722479688973')
  })

  it('多张卡时取视口中心那一张，而不是 DOM 第一张', () => {
    document.body.innerHTML = `
      <div id="first" data-e2e="recommend-list-item-container">
        <video></video>
        <button data-more-menu-item-id="7111111111111111111">...</button>
      </div>
      <div id="second" data-e2e="recommend-list-item-container">
        <video></video>
        <button data-more-menu-item-id="7222222222222222222">...</button>
      </div>
    `
    const first = document.getElementById('first')
    const second = document.getElementById('second')
    const firstControl = first.querySelector('button')
    const secondControl = second.querySelector('button')
    place(first, { top: -900, left: 240, width: 900, height: 900 })
    place(firstControl, { top: -860, left: 1080, width: 32, height: 32 })
    place(second, { top: 0, left: 240, width: 900, height: 900 })
    place(secondControl, { top: 40, left: 1080, width: 32, height: 32 })

    assert.equal(resolveActivePostUrl(document, VIEWPORT), 'https://www.tiktok.com/@i/video/7222222222222222222')
  })

  it('中心卡片没有 id 时，不拿邻卡的更多按钮顶替', () => {
    document.body.innerHTML = `
      <div id="centre" data-e2e="recommend-list-item-container">
        <img src="a.jpg" />
      </div>
      <div id="neighbour" data-e2e="recommend-list-item-container">
        <button data-more-menu-item-id="7333333333333333333">...</button>
      </div>
    `
    place(document.getElementById('centre'), { top: 0, left: 240, width: 900, height: 900 })
    place(document.getElementById('neighbour'), { top: 900, left: 240, width: 900, height: 900 })
    place(document.querySelector('[data-more-menu-item-id]'), { top: 940, left: 1080, width: 32, height: 32 })
    assert.equal(resolveActivePostUrl(document, VIEWPORT), null)
  })

  it('视频卡还没挂载播放器时，仍按 feed-video 判为 video', () => {
    document.body.innerHTML = `
      <section id="card" data-e2e="feed-video">
        <button data-more-menu-item-id="7444444444444444444">...</button>
      </section>
    `
    place(document.getElementById('card'), { top: 0, left: 240, width: 900, height: 900 })
    place(document.querySelector('[data-more-menu-item-id]'), { top: 40, left: 1080, width: 32, height: 32 })
    assert.equal(resolveActivePostUrl(document, VIEWPORT), 'https://www.tiktok.com/@i/video/7444444444444444444')
  })

  it('旧属性名 data-item-id 同样能用', () => {
    document.body.innerHTML = `
      <div id="card" data-e2e="recommend-list-item-container">
        <button data-item-id="7555555555555555555">...</button>
      </div>
    `
    place(document.getElementById('card'), { top: 0, left: 240, width: 900, height: 900 })
    place(document.querySelector('[data-item-id]'), { top: 40, left: 1080, width: 32, height: 32 })
    assert.equal(resolveActivePostUrl(document, VIEWPORT), 'https://www.tiktok.com/@i/photo/7555555555555555555')
  })

  it('没有任何线索时返回 null，不猜第一条', () => {
    document.body.innerHTML = `
      <div id="card" data-e2e="recommend-list-item-container"><img src="a.jpg" /></div>
    `
    place(document.getElementById('card'), { top: 0, left: 240, width: 900, height: 900 })
    assert.equal(resolveActivePostUrl(document, VIEWPORT), null)
  })

  it('作品 id 形状不合法（不足 18 位）时不采用', () => {
    document.body.innerHTML = `
      <div id="card" data-e2e="recommend-list-item-container">
        <button data-more-menu-item-id="12345">...</button>
      </div>
    `
    place(document.getElementById('card'), { top: 0, left: 240, width: 900, height: 900 })
    place(document.querySelector('[data-more-menu-item-id]'), { top: 40, left: 600, width: 32, height: 32 })
    assert.equal(resolveActivePostUrl(document, VIEWPORT), null)
  })

  it('卡内带作品链接时以链接为准（搜索/弹窗形态）', () => {
    document.body.innerHTML = `
      <div id="card" data-e2e="browse-photo">
        <a href="https://www.tiktok.com/@someone/photo/7693330722479688973?is_from_webapp=1">post</a>
      </div>
    `
    place(document.getElementById('card'), { top: 0, left: 240, width: 900, height: 900 })
    assert.equal(resolveActivePostUrl(document, VIEWPORT), 'https://www.tiktok.com/@someone/photo/7693330722479688973')
  })
})
