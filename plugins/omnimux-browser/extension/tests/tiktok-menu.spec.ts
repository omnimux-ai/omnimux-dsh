// @vitest-environment jsdom
/**
 * The trigger's shape, the toolbar's shape and direction, and open/close.
 *
 * The trigger changed from a labelled pill that opened on click to a circle that
 * opens on hover, and the toolbar from a vertical panel above the circle to a
 * horizontal row beside it, so the cases below drive pointer and focus events
 * rather than clicks. The execution cases are unchanged: what a column *does* did
 * not change, and rewriting them would have hidden a regression in the part of
 * this feature that actually moves files.
 *
 * Shape is asserted against the stylesheet the shadow root receives, not against
 * computed style: jsdom does not run the cascade inside a shadow root, so a
 * `getComputedStyle` assertion here would read the initial value and pass no
 * matter what the file says. Direction is asserted against the inline offset the
 * mounted script writes, because it is a measurement and not a style.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  TIKTOK_SCENE_HOST_ID,
  mountTiktokScene,
} from '../src/content/tiktok-scene/menu.ts'
import { tiktokCopy } from '../src/content/tiktok-scene/copy.ts'
import type { ExportOutcome } from '../src/background/media-export.ts'

/**
 * The stylesheet the shadow root is handed.
 *
 * Read from disk rather than through `?inline`: the bundler option that inlines a
 * stylesheet into the content script is stubbed to an empty string under the test
 * runner, so assertions written against it would assert on nothing. `rule()`
 * below throws on a missing selector, so a silently empty file cannot pass.
 */
const inlineStyles = readFileSync(resolve(__dirname, '../src/content/tiktok-scene/styles.css'), 'utf8')

const COPY = tiktokCopy('zh')

function exported(filename = 'cleanlife-钩子-741.mp4'): ExportOutcome {
  return { ok: true, code: 'exported', filename }
}

function mount(run?: (action: 'video' | 'audio' | 'save') => Promise<ExportOutcome>) {
  const calls: string[] = []
  const runner = run ?? (async (action: string) => { calls.push(action); return exported() })
  const handle = mountTiktokScene({
    doc: document,
    copy: COPY,
    run: runner as (action: 'video' | 'audio' | 'save') => Promise<ExportOutcome>,
  })
  return { handle, calls }
}

function shadow(): ShadowRoot {
  const host = document.getElementById(TIKTOK_SCENE_HOST_ID)
  if (host?.shadowRoot === null || host?.shadowRoot === undefined) throw new Error('scene not mounted')
  return host.shadowRoot
}

function anchor(): HTMLElement {
  return shadow().querySelector('.omx-anchor') as HTMLElement
}

function trigger(): HTMLElement {
  return shadow().querySelector('.omx-trigger') as HTMLElement
}

function row(action: string): HTMLElement {
  return shadow().querySelector(`.omx-item[data-action="${action}"]`) as HTMLElement
}

function menu(): HTMLElement {
  return shadow().querySelector('.omx-menu') as HTMLElement
}

/** Let the mounted handler's promise chain settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * Send one pointer event.
 *
 * jsdom has no `PointerEvent`, so the type is defined onto a plain event — which
 * is also the only field the mounted handler reads off it.
 */
function pointer(el: Element, type: string, pointerType: string): void {
  const event = new Event(type)
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  el.dispatchEvent(event)
}

/** One declaration block from the stylesheet the shadow root is given. */
function rule(selector: string): string {
  const start = inlineStyles.indexOf(selector)
  if (start < 0) throw new Error(`no rule for ${selector}`)
  const open = inlineStyles.indexOf('{', start)
  const close = inlineStyles.indexOf('}', open)
  return inlineStyles.slice(open + 1, close)
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('TikTok 场景触发器 — 圆形形态', () => {
  it('是 48px 圆形 (AC-110)', () => {
    const body = rule('.omx-trigger {')
    expect(body).toMatch(/width:\s*48px/)
    expect(body).toMatch(/height:\s*48px/)
    expect(body).toMatch(/border-radius:\s*50%/)
  })

  it('品牌淡紫底 + 深色幽灵，眼睛胶囊用底色镂空', () => {
    const body = rule('.omx-trigger {')
    expect(body).toMatch(/background:\s*var\(--omx-brand\)/)
    expect(body).toMatch(/color:\s*var\(--omx-brand-ink\)/)
    expect(inlineStyles).toMatch(/--omx-brand:\s*#b8b7ff/)
    expect(inlineStyles).toMatch(/--omx-brand-ink:\s*#121213/)
    expect(rule('.omx-eye {')).toMatch(/fill:\s*var\(--omx-brand\)/)
  })

  it('不再渲染文字标签 (AC-111)', () => {
    mount()
    expect(trigger().textContent).toBe('')
    expect(shadow().querySelector('.omx-trigger-label')).toBeNull()
    // 标记本身还在，只是只剩图形。
    expect(trigger().querySelector('svg')).not.toBeNull()
  })
})

describe('TikTok 场景工具栏 — 形态', () => {
  it('横向一排、与按钮垂直居中、默认落在按钮右侧 (AC-304 / AC-305 / AC-401)', () => {
    const body = rule('.omx-menu {')
    expect(body).toMatch(/top:\s*50%/)
    expect(body).toMatch(/transform:\s*translateY\(-50%\)/)
    expect(body).toMatch(/display:\s*flex/)
    expect(body).toMatch(/flex-wrap:\s*wrap/)
    expect(body).toMatch(/left:\s*100%/)
    expect(body).toMatch(/padding:\s*6px/)
    expect(body).toMatch(/border-radius:\s*14px/)
    expect(body).toMatch(/backdrop-filter:\s*blur/)
    // 展开态仍然保留 -50%：垂直居中是位置，不是入场动画的一部分。
    const open = rule('.omx-anchor:hover .omx-menu')
    expect(open).toMatch(/transform:\s*translateY\(-50%\)\s*scale\(1\)/)
  })

  it('翻左只是一侧的几何：从右缘生长、从右侧滑入', () => {
    const flipped = rule('.omx-menu.is-left')
    expect(flipped).toMatch(/transform-origin:\s*right center/)
    expect(flipped).toMatch(/translateX\(6px\)/)
    expect(rule('.omx-menu {')).toMatch(/transform-origin:\s*left center/)
  })

  it('每项图标在上、文字在下，三项并排 (AC-304)', () => {
    const body = rule('.omx-item {')
    expect(body).toMatch(/flex-direction:\s*column/)
    expect(body).toMatch(/align-items:\s*center/)
    expect(body).toMatch(/width:\s*68px/)
    expect(body).toMatch(/text-align:\s*center/)
    expect(rule('.omx-item svg {')).toMatch(/width:\s*18px/)
    expect(rule('.omx-item-state {')).toMatch(/font-size:\s*10px/)
  })

  it('默认不可见且不可点击命中 (AC-112)', () => {
    mount()
    expect(menu().classList.contains('is-open')).toBe(false)
    const body = rule('.omx-menu {')
    expect(body).toMatch(/opacity:\s*0/)
    expect(body).toMatch(/visibility:\s*hidden/)
  })

  it('悬停态在 200ms 内可见，过渡时长写在样式里 (AC-113)', () => {
    const body = rule('.omx-menu {')
    expect(body).toMatch(/transition:\s*opacity 150ms/)
    expect(body).toMatch(/transform 190ms cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/)
    // 悬停与键盘聚焦都能把它显出来，且都是同一种可见态。
    const hover = rule('.omx-anchor:hover .omx-menu')
    expect(hover).toMatch(/opacity:\s*1/)
    expect(hover).toMatch(/visibility:\s*visible/)
    expect(rule('.omx-anchor:focus-within .omx-menu')).toMatch(/visibility:\s*visible/)
  })

  it('prefers-reduced-motion 下关闭过渡 (AC-117)', () => {
    const reduced = inlineStyles.slice(inlineStyles.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toMatch(/transition:\s*none/)
  })

  it('三项就是约定的三项，顺序与文案取自当前语区 (AC-116)', () => {
    mount()
    const labels = Array.from(shadow().querySelectorAll('.omx-item-label')).map((el) => el.textContent)
    expect(labels).toEqual([COPY.menu.video, COPY.menu.audio, COPY.menu.save])
  })
})

describe('TikTok 场景工具栏 — 结构', () => {
  it('挂到独立的影子根里，不污染宿主页面', () => {
    mount()
    expect(document.getElementById(TIKTOK_SCENE_HOST_ID)).not.toBeNull()
    expect(shadow().querySelector('.omx-trigger')).not.toBeNull()
  })

  it('初始是收起的', () => {
    mount()
    expect(menu().classList.contains('is-open')).toBe(false)
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  })

  it('图标位置来自锚点判定，落在视口内', () => {
    mount()
    expect(anchor().style.position).toBe('fixed')
    expect(Number.parseInt(anchor().style.left, 10)).toBeGreaterThanOrEqual(0)
    expect(Number.parseInt(anchor().style.bottom, 10)).toBeGreaterThanOrEqual(0)
  })
})

describe('TikTok 场景工具栏 — 方向自适应', () => {
  /** The width a browser would report for the toolbar, which is what the decision measures. */
  const MENU_W = 204

  /** Lay out a page from markup, giving each selector the box the browser would report. */
  function page(markup: string, boxes: Record<string, { top: number; left: number; width: number; height: number }>): void {
    document.body.innerHTML = markup
    for (const [selector, box] of Object.entries(boxes)) {
      const el = document.querySelector(selector)
      if (el === null) throw new Error(`fixture has no ${selector}`)
      const rect = {
        x: box.left, y: box.top, top: box.top, left: box.left,
        right: box.left + box.width, bottom: box.top + box.height,
        width: box.width, height: box.height, toJSON: () => ({}),
      } as DOMRect
      el.getBoundingClientRect = () => rect
    }
  }

  /** Mount against a viewport, with the toolbar reporting the width a browser would give it. */
  function mountSized(width: number, height: number) {
    window.innerWidth = width
    window.innerHeight = height
    const mounted = mount()
    const el = menu()
    el.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, right: MENU_W, bottom: 70,
      width: MENU_W, height: 70, toJSON: () => ({}),
    } as DOMRect)
    mounted.handle.reposition()
    return { ...mounted, menu: el }
  }

  /** The toolbar's left edge in viewport coordinates. */
  function menuLeft(): number {
    return Number.parseFloat(anchor().style.left) + Number.parseFloat(menu().style.left)
  }

  it('⑥ 桌面布局默认靠右：菜单左缘 = 按钮右缘 (AC-401)', () => {
    // 实测 A：头像在左栏 @left=20，按钮落在视口左侧，右侧空间充裕。
    page('<div data-e2e="nav-profile"><img id="me" /></div>', {
      '#me': { top: 472, left: 20, width: 32, height: 32 },
    })
    const { menu: el } = mountSized(1920, 929)

    expect(el.classList.contains('is-left')).toBe(false)
    expect(menuLeft()).toBe(20 + 48)
    expect(menuLeft() + MENU_W).toBeLessThanOrEqual(1920)
  })

  it('⑦ 按钮贴右缘、右侧放不下时翻左，且整块菜单不出屏 (AC-402 / AC-405)', () => {
    // 实测 C 的形态：头像只在右侧操作栏里，按钮因此贴着视口右缘。
    page('<div id="bar"><img id="author" /></div>', {
      '#bar': { top: 60, left: 375, width: 55, height: 700 },
      '#author': { top: 820, left: 379, width: 48, height: 48 },
    })
    const { menu: el } = mountSized(430, 932)

    expect(el.classList.contains('is-left')).toBe(true)
    // 翻左：菜单左缘 = 按钮左缘 − 菜单宽度。
    expect(menuLeft()).toBe(379 - MENU_W)
    expect(menuLeft()).toBeGreaterThanOrEqual(0)
    expect(menuLeft() + MENU_W).toBeLessThanOrEqual(430)
  })

  it('每次重新测量：翻左时的偏移跟着菜单实际宽度走 (AC-403)', () => {
    // 实测 C 的形态：头像在贴右缘的操作栏里，按钮因此贴着视口右缘。
    page('<div id="bar"><img id="author" /></div>', {
      '#bar': { top: 60, left: 375, width: 55, height: 700 },
      '#author': { top: 820, left: 379, width: 48, height: 48 },
    })
    const { handle } = mountSized(430, 932)
    expect(menuLeft()).toBe(379 - MENU_W)

    // 同一个按钮，换一个实际渲染宽度：菜单右缘始终对齐按钮左缘。
    const narrow = 120
    menu().getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, right: narrow, bottom: 70,
      width: narrow, height: 70, toJSON: () => ({}),
    } as DOMRect)
    handle.reposition()

    expect(menu().classList.contains('is-left')).toBe(true)
    expect(menuLeft()).toBe(379 - narrow)
    expect(menuLeft() + narrow).toBeLessThanOrEqual(430)
  })
})

describe('TikTok 场景工具栏 — 悬停展开', () => {
  it('鼠标进入图标或它的容器时展开 (AC-113)', () => {
    mount()
    pointer(anchor(), 'pointerenter', 'mouse')

    expect(menu().classList.contains('is-open')).toBe(true)
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
  })

  it('鼠标移开后收起 (AC-114)', () => {
    mount()
    pointer(anchor(), 'pointerenter', 'mouse')
    pointer(anchor(), 'pointerleave', 'mouse')

    expect(menu().classList.contains('is-open')).toBe(false)
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  })

  it('悬停已经展开时，点一下不会把它收起来', () => {
    mount()
    pointer(anchor(), 'pointerenter', 'mouse')
    trigger().click()

    expect(menu().classList.contains('is-open')).toBe(true)
  })

  it('触屏没有悬停，点一下仍然可以切换（兜底路径）', () => {
    mount()
    // 触屏在 click 之前也会发 pointerenter，不能被当成悬停。
    pointer(anchor(), 'pointerenter', 'touch')
    expect(menu().classList.contains('is-open')).toBe(false)

    trigger().click()
    expect(menu().classList.contains('is-open')).toBe(true)

    trigger().click()
    expect(menu().classList.contains('is-open')).toBe(false)
  })

  it('键盘聚焦同样展开，移走焦点收起（焦点可达性）', () => {
    mount()
    anchor().dispatchEvent(new Event('focusin'))
    expect(menu().classList.contains('is-open')).toBe(true)

    anchor().dispatchEvent(new FocusEvent('focusout', { relatedTarget: document.body }))
    expect(menu().classList.contains('is-open')).toBe(false)
  })

  it('焦点在工具栏内部的控件之间移动时不收起', () => {
    mount()
    anchor().dispatchEvent(new Event('focusin'))
    anchor().dispatchEvent(new FocusEvent('focusout', { relatedTarget: trigger() }))

    expect(menu().classList.contains('is-open')).toBe(true)
  })

  it('按 ESC 收起', () => {
    mount()
    pointer(anchor(), 'pointerenter', 'mouse')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(menu().classList.contains('is-open')).toBe(false)
  })

  it('点页面上的其它区域收起', () => {
    mount()
    pointer(anchor(), 'pointerenter', 'mouse')
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(menu().classList.contains('is-open')).toBe(false)
  })
})

describe('TikTok 场景菜单 — 执行与反馈', () => {
  it('点下载无水印视频时把 video 这个动作交给宿主', async () => {
    const { calls } = mount()
    pointer(anchor(), 'pointerenter', 'mouse')
    row('video').click()
    expect(calls).toEqual(['video'])
    await settle()
  })

  it('点保存到灵感库时把 save 这个动作交给宿主', async () => {
    const { calls } = mount()
    pointer(anchor(), 'pointerenter', 'mouse')
    row('save').click()
    expect(calls).toEqual(['save'])
    await settle()
  })

  it('执行期间这一行进入等待态并显示进度文案', async () => {
    // Held on an object rather than a `let`: the resolver is assigned inside the
    // promise executor, which the compiler cannot see into, so a narrowed binding
    // would read as `never` at the call site.
    const gate: { release?: () => void } = {}
    const { handle } = mount(() => new Promise<ExportOutcome>((resolve) => {
      gate.release = () => resolve(exported())
    }))
    pointer(anchor(), 'pointerenter', 'mouse')
    row('video').click()

    expect(row('video').classList.contains('is-busy')).toBe(true)
    expect(row('video').textContent).toContain(COPY.busy.video)

    gate.release?.()
    await settle()
    expect(row('video').classList.contains('is-done')).toBe(true)
    handle.dispose()
  })

  it('成功后这一行给出完成文案', async () => {
    mount(async () => exported('a.mp4'))
    pointer(anchor(), 'pointerenter', 'mouse')
    row('video').click()
    await settle()

    expect(row('video').classList.contains('is-done')).toBe(true)
    expect(row('video').textContent).toContain(COPY.done('video', exported('a.mp4')))
    // Naming the written file is the only thing that tells the user which post
    // they actually got; without it a wrong download is invisible.
    expect(shadow().querySelector('.omx-item-detail')?.textContent).toContain('a.mp4')
  })

  it('已在库里也按完成处理，不当成失败', async () => {
    mount(async () => ({ ok: true, code: 'duplicate' }))
    pointer(anchor(), 'pointerenter', 'mouse')
    row('save').click()
    await settle()

    expect(row('save').classList.contains('is-done')).toBe(true)
    expect(row('save').textContent).toContain(COPY.done('save', { ok: true, code: 'duplicate' }))
  })

  it('失败时把宿主给的原因显示出来', async () => {
    mount(async () => ({ ok: false, code: 'rejected', detail: '未从该作品解析到可下载的视频直链' }))
    pointer(anchor(), 'pointerenter', 'mouse')
    row('video').click()
    await settle()

    expect(row('video').classList.contains('is-error')).toBe(true)
    const detail = shadow().querySelector('.omx-item-detail')
    expect(detail?.textContent).toContain('视频直链')
  })

  it('响应超时与“主程序没在跑”给出的是两条不同的提示', async () => {
    mount(async () => ({ ok: false, code: 'timeout' }))
    pointer(anchor(), 'pointerenter', 'mouse')
    row('video').click()
    await settle()

    const shown = shadow().querySelector('.omx-item-detail')?.textContent ?? ''
    expect(shown).toContain(COPY.failed({ ok: false, code: 'timeout' }))
    expect(shown).not.toContain(COPY.failed({ ok: false, code: 'unreachable' }))
  })

  it('主程序没在跑时给出的也是可执行的原因', async () => {
    mount(async () => ({ ok: false, code: 'unreachable' }))
    pointer(anchor(), 'pointerenter', 'mouse')
    row('audio').click()
    await settle()

    expect(shadow().querySelector('.omx-item-detail')?.textContent)
      .toContain(COPY.failed({ ok: false, code: 'unreachable' }))
  })
})

describe('TikTok 场景菜单 — 生命周期', () => {
  it('卸载后影子宿主一并移除，页面上不留残留', () => {
    const { handle } = mount()
    handle.dispose()
    expect(document.getElementById(TIKTOK_SCENE_HOST_ID)).toBeNull()
  })

  it('重复挂载不会叠加两个图标', () => {
    const first = mount()
    first.handle.dispose()
    mount()
    expect(document.querySelectorAll(`#${TIKTOK_SCENE_HOST_ID}`).length).toBe(1)
  })

  it('重新挂载会带走上一份的页面监听，ESC 只影响当前这一份', () => {
    const first = mount()
    first.handle.dispose()
    const second = mount()
    second.handle.dispose()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(document.getElementById(TIKTOK_SCENE_HOST_ID)).toBeNull()
  })

  it('卸载后指针事件不再作用到已移除的宿主上', () => {
    const { handle } = mount()
    const el = anchor()
    handle.dispose()
    expect(() => pointer(el, 'pointerenter', 'mouse')).not.toThrow()
    expect(document.getElementById(TIKTOK_SCENE_HOST_ID)).toBeNull()
  })
})
