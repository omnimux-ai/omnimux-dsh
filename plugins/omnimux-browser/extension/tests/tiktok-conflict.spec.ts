// @vitest-environment jsdom
/**
 * Verification for TikTok action bar icon conflict resolution and active post targeting.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveIconConflicts, restoreDisplacedIcons, SAFE_GAP } from '../src/content/tiktok-scene/conflict.ts'
import { resolveTargetPost } from '../src/content/tiktok-scene/target.ts'

function place(el: Element, box: { top: number; left: number; width: number; height: number }): void {
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
  } as DOMRect
  el.getBoundingClientRect = () => rect
}

describe('TikTok 场景图标避让算法 (resolveIconConflicts)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    restoreDisplacedIcons(document)
  })

  it('AC-1: 当第三方竞品图标侵占头像上方空间时，被算法向上推移且保持至少 24px 充裕大留白', () => {
    document.body.innerHTML = `
      <section class="SectionActionBarContainer">
        <button id="rival-orange" class="extension-icon">CK</button>
        <div id="avatar" class="AvatarActionItem"><img src="dog.png" /></div>
      </section>
    `
    const avatar = document.getElementById('avatar')!
    const rival = document.getElementById('rival-orange')!

    place(avatar, { top: 200, left: 500, width: 48, height: 48 })
    place(rival, { top: 150, left: 500, width: 44, height: 44 })

    const ourPlacement = { left: 500, top: 144, width: 48, height: 48 }
    const displaced = resolveIconConflicts(document, ourPlacement, avatar)

    expect(displaced.length).toBe(1)
    expect(displaced[0]).toBe(rival)

    // 目标天花板：ourPlacement.top - 24 = 144 - 24 = 120
    // rival 原 bottom 为 194，需平移：194 - 120 = 74px
    const shift = rival.getAttribute('data-omx-shift')
    expect(shift).toBe('74')
    expect(rival.style.transform).toBe('translateY(-74px)')
  })

  it('AC-1b: 针对 CreatOK 带有文字标签的复合组件，整个外部容器被整体推升，文字与幽灵图标完全不重叠', () => {
    document.body.innerHTML = `
      <section class="SectionActionBarContainer">
        <div id="creatok-wrapper" class="creatok-item">
          <div class="creatok-icon">OK</div>
          <span class="creatok-label">CreatOK</span>
        </div>
        <div id="avatar" class="AvatarActionItem"><img src="cat.png" /></div>
      </section>
    `
    const avatar = document.getElementById('avatar')!
    const wrapper = document.getElementById('creatok-wrapper')!

    place(avatar, { top: 200, left: 500, width: 48, height: 48 })
    // CreatOK 包含图标和下方文字，总高 60px (top: 130, bottom: 190)
    place(wrapper, { top: 130, left: 500, width: 48, height: 60 })

    const ourPlacement = { left: 500, top: 144, width: 48, height: 48 }
    const displaced = resolveIconConflicts(document, ourPlacement, avatar)

    expect(displaced.length).toBe(1)
    expect(displaced[0]).toBe(wrapper)

    // 目标天花板：144 - 24 = 120
    // wrapper 原 bottom 190，平移：190 - 120 = 70px
    expect(wrapper.getAttribute('data-omx-shift')).toBe('70')
    expect(wrapper.style.transform).toBe('translateY(-70px)')
  })

  it('AC-2: 当存在多个第三方图标时，级联顺延向上推升，互不挤压', () => {
    document.body.innerHTML = `
      <section class="SectionActionBarContainer">
        <div id="rival-white" class="extension-dot"></div>
        <button id="rival-orange" class="extension-icon">CK</button>
        <div id="avatar" class="AvatarActionItem"><img src="dog.png" /></div>
      </section>
    `
    const avatar = document.getElementById('avatar')!
    const orange = document.getElementById('rival-orange')!
    const white = document.getElementById('rival-white')!

    place(avatar, { top: 200, left: 500, width: 48, height: 48 })
    place(orange, { top: 150, left: 500, width: 44, height: 44 })
    place(white, { top: 80, left: 500, width: 32, height: 32 })

    const ourPlacement = { left: 500, top: 144, width: 48, height: 48 }
    const displaced = resolveIconConflicts(document, ourPlacement, avatar)

    expect(displaced.length).toBe(2)
    expect(displaced).toContain(orange)
    expect(displaced).toContain(white)
  })

  it('AC-2b: 入口下方的点赞、评论等原生按钮不在走廊内，绝不被推动', () => {
    document.body.innerHTML = `
      <section class="SectionActionBarContainer">
        <button id="rival-orange" class="extension-icon">CK</button>
        <div id="avatar" class="AvatarActionItem"><img src="dog.png" /></div>
        <button id="like" class="action-button">like</button>
      </section>
    `
    const avatar = document.getElementById('avatar')!
    const rival = document.getElementById('rival-orange')!
    const like = document.getElementById('like')!

    place(avatar, { top: 200, left: 500, width: 48, height: 48 })
    place(rival, { top: 150, left: 500, width: 44, height: 44 })
    // The mark sits at top 144..192; the like control starts below it.
    place(like, { top: 300, left: 500, width: 44, height: 44 })

    const ourPlacement = { left: 500, top: 144, width: 48, height: 48 }
    const displaced = resolveIconConflicts(document, ourPlacement, avatar)

    expect(displaced).toEqual([rival])
    expect(like.hasAttribute('data-omx-shift')).toBe(false)
  })

  it('AC-3: restoreDisplacedIcons 可完整还原所有样式', () => {
    document.body.innerHTML = `
      <button id="rival" style="transform: scale(1.1);" data-omx-shift="50" data-omx-orig-transform="scale(1.1)">Rival</button>
    `
    restoreDisplacedIcons(document)
    const rival = document.getElementById('rival')!
    expect(rival.hasAttribute('data-omx-shift')).toBe(false)
    expect(rival.style.transform).toBe('scale(1.1)')
  })
})

describe('TikTok 全场景活跃视频抓取 (resolveTargetPost)', () => {
  it('AC-4: 当页面处于主页或博主个人主页时，只要存在活跃视频链接即可精准抓取，杜绝 noTarget', () => {
    const post = resolveTargetPost({
      pageUrl: 'https://www.tiktok.com/@purrnest',
      hoveredHref: null,
      activeHref: 'https://www.tiktok.com/@purrnest/video/7418999999999999999?is_from_webapp=1',
    })

    expect(post).not.toBeNull()
    expect(post?.postId).toBe('7418999999999999999')
    expect(post?.url).toBe('https://www.tiktok.com/@purrnest/video/7418999999999999999')
  })

  it('AC-5: 当页面包含 xgwrapper 西瓜播放器时，成功解析真实视频 ID 并合成标准链接', () => {
    const post = resolveTargetPost({
      pageUrl: 'https://www.tiktok.com/',
      hoveredHref: null,
      activeHref: 'https://www.tiktok.com/@i/video/7681127662965886228',
    })

    expect(post).not.toBeNull()
    expect(post?.postId).toBe('7681127662965886228')
    expect(post?.url).toBe('https://www.tiktok.com/@i/video/7681127662965886228')
  })
})
