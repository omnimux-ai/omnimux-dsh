// @vitest-environment jsdom
/**
 * Verification for TikTok action bar icon conflict resolution and active post targeting.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveIconConflicts, restoreDisplacedIcons } from '../src/content/tiktok-scene/conflict.ts'
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

  it('AC-1: 当第三方竞品图标侵占头像上方空间时，被算法向上推移到幽灵图标头顶上方 8px', () => {
    // 头像位置：top: 200, left: 500, 48x48
    // 我们的幽灵图标位置：top: 200 - 8 - 48 = 144, left: 500, 48x48
    // 第三方橙色竞品图标原本在头像正上方：top: 150, left: 500, width: 44, height: 44 (bottom: 194)
    // 此时它侵占了幽灵图标区域 [144, 192]
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

    // 目标天花板：ourPlacement.top - 8 = 144 - 8 = 136
    // rival 原 bottom 为 194，需平移：194 - 136 = 58px
    const shift = rival.getAttribute('data-omx-shift')
    expect(shift).toBe('58')
    expect(rival.style.transform).toBe('translateY(-58px)')
  })

  it('AC-2: 当存在多个第三方图标时，级联顺延向上推升，互不挤压', () => {
    // 幽灵图标：top: 144 (bottom: 192)
    // 橙色图标：top: 150, bottom: 194
    // 白色圆点：top: 100, bottom: 132 (距离 136 不足 8px 间距，需顺延)
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
    place(white, { top: 100, left: 500, width: 32, height: 32 })

    const ourPlacement = { left: 500, top: 144, width: 48, height: 48 }
    const displaced = resolveIconConflicts(document, ourPlacement, avatar)

    expect(displaced.length).toBe(2)
    expect(displaced).toContain(orange)
    expect(displaced).toContain(white)

    // orange 新 top: 150 - 58 = 92
    // white 目标 bottom: 92 - 8 = 84
    // white 原 bottom: 132，需平移：132 - 84 = 48px
    const whiteShift = white.getAttribute('data-omx-shift')
    expect(whiteShift).toBe('48')
    expect(white.style.transform).toBe('translateY(-48px)')
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

describe('TikTok 首页推荐流活跃视频抓取 (resolveTargetPost)', () => {
  it('AC-4: 当首页地址栏未带作品编号时，通过 activeHref 成功捕获目标视频', () => {
    const post = resolveTargetPost({
      pageUrl: 'https://www.tiktok.com/',
      hoveredHref: null,
      activeHref: 'https://www.tiktok.com/@golden_frenchie/video/7345678901234567890?is_from_webapp=1',
    })

    expect(post).not.toBeNull()
    expect(post?.postId).toBe('7345678901234567890')
    expect(post?.url).toBe('https://www.tiktok.com/@golden_frenchie/video/7345678901234567890')
  })
})
