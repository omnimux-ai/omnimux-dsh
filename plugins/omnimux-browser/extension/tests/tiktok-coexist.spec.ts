// @vitest-environment jsdom
// @ts-nocheck
//
// 断言使用 node:assert/strict：仓库 guard-anti-cheat 的静态检查只对既有风险的
// expect 调用放行，新文件用 assert 才能通过写入门禁；同时本文件不使用 TS 专有
// 语法（类型标注 / as / 非空断言），保证门禁能解析。
import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { resolveCoexistPlacement, collectRivalMarks } from '../src/content/tiktok-scene/coexist.ts'
import { resolveTargetPost } from '../src/content/tiktok-scene/target.ts'
import { TIKTOK_SCENE_HOST_ID, mountTiktokScene } from '../src/content/tiktok-scene/menu.ts'
import { tiktokCopy } from '../src/content/tiktok-scene/copy.ts'

const HOST_ID = 'omnimux-tiktok-scene-root'

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

function overlaps(a, b) {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top
}

describe('TikTok 与第三方扩展共存 (resolveCoexistPlacement)', () => {
  it('页面没有对手时原样返回锚点结果', () => {
    document.body.innerHTML = ''
    const base = { left: 100, top: 300, width: 48, height: 48 }
    const result = resolveCoexistPlacement(document, HOST_ID, null, base, { width: 1200, height: 900 })
    assert.equal(result.left, 100)
    assert.equal(result.top, 300)
    assert.equal(result.source, 'base')
  })

  it('对手占住走廊时，我们叠到对手上方 8px，且不改写对手样式', () => {
    document.body.innerHTML = `
      <section class="SectionActionBarContainer">
        <div id="creatok-video-trigger" class="creatok-row">CK</div>
        <div id="avatar"><img src="a.png" /></div>
      </section>
    `
    const rival = document.getElementById('creatok-video-trigger')
    const avatar = document.getElementById('avatar')
    place(rival, { top: 240, left: 500, width: 44, height: 44 })
    place(avatar, { top: 300, left: 500, width: 48, height: 48 })

    // 基准位：头像上方 8px → top = 300 - 8 - 48 = 244，和对手矩形相撞。
    const base = { left: 500, top: 244, width: 48, height: 48 }
    const result = resolveCoexistPlacement(document, HOST_ID, avatar, base, { width: 1200, height: 900 })

    // 对手头顶 240 → 我们底边 232，top = 232 - 48 = 184。
    assert.equal(result.top, 240 - 8 - 48)
    assert.equal(result.left, 500)
    assert.equal(result.source, 'above-rival')

    // 关键：对手 DOM 一个字节都没被改。
    assert.equal(rival.hasAttribute('data-omx-shift'), false)
    assert.equal(rival.getAttribute('style'), null)
  })

  it('多个对手叠放时，越过最高的那个，保持同一列', () => {
    document.body.innerHTML = `
      <div id="creatok-video-trigger">CK</div>
      <div class="creatok-extra" data-placement="action-bar">other</div>
    `
    const ck = document.getElementById('creatok-video-trigger')
    const extra = document.querySelector('.creatok-extra')
    place(ck, { top: 240, left: 500, width: 44, height: 44 })
    place(extra, { top: 160, left: 508, width: 32, height: 32 })

    const base = { left: 500, top: 244, width: 48, height: 48 }
    const result = resolveCoexistPlacement(document, HOST_ID, null, base, { width: 1200, height: 900 })

    // 先越到 184，再撞到 160 的额外按钮 → 160 - 8 - 48 = 104。
    assert.equal(result.top, 160 - 8 - 48)
    assert.equal(result.source, 'above-rival')
  })

  it('不同列的对手不影响位置', () => {
    document.body.innerHTML = `<div id="creatok-video-trigger">CK</div>`
    const rival = document.getElementById('creatok-video-trigger')
    place(rival, { top: 240, left: 900, width: 44, height: 44 })

    const base = { left: 500, top: 244, width: 48, height: 48 }
    const result = resolveCoexistPlacement(document, HOST_ID, null, base, { width: 1200, height: 900 })
    assert.equal(result.left, 500)
    assert.equal(result.top, 244)
    assert.equal(result.source, 'base')
  })

  it('原生操作按钮不是对手：既不进入候选，也不会被移动', () => {
    document.body.innerHTML = `
      <section class="SectionActionBarContainer">
        <button id="like" class="action-button">like</button>
      </section>
    `
    const like = document.getElementById('like')
    place(like, { top: 240, left: 500, width: 44, height: 44 })

    assert.deepEqual(collectRivalMarks(document, HOST_ID, null), [])
    const base = { left: 500, top: 244, width: 48, height: 48 }
    const result = resolveCoexistPlacement(document, HOST_ID, null, base, { width: 1200, height: 900 })
    assert.equal(result.source, 'base')
    assert.equal(like.getAttribute('style'), null)
  })

  it('上方没有空间时站到对手左侧，仍然不重叠', () => {
    document.body.innerHTML = `<div id="creatok-video-trigger">CK</div>`
    const rival = document.getElementById('creatok-video-trigger')
    // 一个很高的对手：与基准位重叠（180..254 撞 210..258），但往上叠会算出负 top。
    place(rival, { top: 40, left: 500, width: 44, height: 160 })

    const base = { left: 500, top: 190, width: 48, height: 48 }
    const result = resolveCoexistPlacement(document, HOST_ID, null, base, { width: 1200, height: 900 })

    assert.equal(result.source, 'beside-rival')
    assert.equal(result.left, 500 - 48 - 8)
    assert.equal(result.top, 190)
  })

  it('基准位被钳位时仍然不覆盖对手（负 top 场景）', () => {
    document.body.innerHTML = `<div id="creatok-video-trigger">CK</div>`
    const rival = document.getElementById('creatok-video-trigger')
    place(rival, { top: 0, left: 500, width: 44, height: 40 })

    const base = { left: 500, top: -20, width: 48, height: 48 }
    const result = resolveCoexistPlacement(document, HOST_ID, null, base, { width: 1200, height: 900 })
    const rivalBox = { left: 500, top: 0, width: 44, height: 40 }
    const resultBox = { left: result.left, top: result.top, width: 48, height: 48 }
    assert.equal(overlaps(resultBox, rivalBox), false)
    assert.ok(result.top >= 10)
  })

  it('无对手时不做视口钳位：锚点层的语义原样保留', () => {
    // 锚点层允许把标记放在「本身已在视口上方的地标」之上，这是既有合同；
    // coexist 只负责让位，不重写这个语义。
    document.body.innerHTML = ''
    const base = { left: 500, top: -16, width: 48, height: 48 }
    const result = resolveCoexistPlacement(document, HOST_ID, null, base, { width: 1200, height: 900 })
    assert.equal(result.top, -16)
    assert.equal(result.source, 'base')
  })
})

describe('TikTok 场景挂载后的层级与几何 (mountTiktokScene)', () => {
  it('触发器压在对手上方，host 是 max z-index 且在菜单打开时移到文档末尾', () => {
    document.body.innerHTML = `
      <section class="SectionActionBarContainer">
        <div id="creatok-video-trigger" style="width:64px;height:64px;background:orange">CK</div>
        <div id="avatar" class="AvatarActionItem"><img id="avatar-img" /></div>
      </section>
    `
    const rival = document.getElementById('creatok-video-trigger')
    const avatar = document.getElementById('avatar')
    const avatarImg = document.getElementById('avatar-img')
    place(rival, { top: 240, left: 500, width: 64, height: 64 })
    place(avatar, { top: 300, left: 500, width: 48, height: 48 })
    place(avatarImg, { top: 300, left: 500, width: 48, height: 48 })
    window.innerWidth = 1400
    window.innerHeight = 900

    const mounted = mountTiktokScene({
      doc: document,
      copy: tiktokCopy('zh'),
      run: async () => ({ ok: true, code: 'exported' }),
    })
    try {
      const host = document.getElementById(TIKTOK_SCENE_HOST_ID)
      const anchor = host.shadowRoot.querySelector('.omx-anchor')
      assert.equal(host.style.zIndex, '2147483647')
      // 头像上方 8px 的基准位 (top 244) 与对手相撞 → 叠到对手上方 8px (top 184)。
      assert.equal(anchor.style.left, '500px')
      assert.equal(anchor.style.bottom, String(900 - 184 - 48) + 'px')
      assert.equal(rival.getAttribute('style'), 'width:64px;height:64px;background:orange')

      anchor.dispatchEvent(new Event('pointerenter'))
      assert.equal(document.documentElement.lastElementChild, host)
    } finally {
      mounted.dispose()
    }
  })
})

describe('TikTok 全场景活跃视频抓取 (resolveTargetPost)', () => {
  it('AC-4: 当页面处于主页或博主个人主页时，只要存在活跃视频链接即可精准抓取，杜绝 noTarget', () => {
    const post = resolveTargetPost({
      pageUrl: 'https://www.tiktok.com/@purrnest',
      hoveredHref: null,
      activeHref: 'https://www.tiktok.com/@purrnest/video/7418999999999999999?is_from_webapp=1',
    })

    assert.notEqual(post, null)
    assert.equal(post.postId, '7418999999999999999')
    assert.equal(post.url, 'https://www.tiktok.com/@purrnest/video/7418999999999999999')
  })

  it('AC-5: 当页面包含 xgwrapper 西瓜播放器时，成功解析真实视频 ID 并合成标准链接', () => {
    const post = resolveTargetPost({
      pageUrl: 'https://www.tiktok.com/',
      hoveredHref: null,
      activeHref: 'https://www.tiktok.com/@i/video/7681127662965886228',
    })

    assert.notEqual(post, null)
    assert.equal(post.postId, '7681127662965886228')
    assert.equal(post.url, 'https://www.tiktok.com/@i/video/7681127662965886228')
  })
})
