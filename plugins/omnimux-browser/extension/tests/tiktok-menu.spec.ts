// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  TIKTOK_SCENE_HOST_ID,
  mountTiktokScene,
} from '../src/content/tiktok-scene/menu.ts'
import { tiktokCopy } from '../src/content/tiktok-scene/copy.ts'
import type { ExportOutcome } from '../src/background/media-export.ts'

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

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('TikTok 场景菜单 — 结构', () => {
  it('挂到独立的影子根里，不污染宿主页面', () => {
    mount()
    expect(document.getElementById(TIKTOK_SCENE_HOST_ID)).not.toBeNull()
    expect(shadow().querySelector('.omx-trigger')).not.toBeNull()
  })

  it('三项就是约定的三项，文案取自当前语区', () => {
    mount()
    const labels = Array.from(shadow().querySelectorAll('.omx-item-label')).map((el) => el.textContent)
    expect(labels).toEqual([COPY.menu.video, COPY.menu.audio, COPY.menu.save])
  })

  it('初始是收起的', () => {
    mount()
    expect(menu().classList.contains('is-open')).toBe(false)
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  })

  it('图标位置来自锚点判定，落在视口左下区域', () => {
    mount()
    const anchor = shadow().querySelector('.omx-anchor') as HTMLElement
    expect(anchor.style.position).toBe('fixed')
    expect(Number.parseInt(anchor.style.left, 10)).toBeGreaterThanOrEqual(0)
    expect(Number.parseInt(anchor.style.bottom, 10)).toBeGreaterThanOrEqual(0)
  })
})

describe('TikTok 场景菜单 — 开关', () => {
  it('点图标展开', () => {
    mount()
    trigger().click()
    expect(menu().classList.contains('is-open')).toBe(true)
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
  })

  it('再点图标收起', () => {
    mount()
    trigger().click()
    trigger().click()
    expect(menu().classList.contains('is-open')).toBe(false)
  })

  it('按 ESC 收起', () => {
    mount()
    trigger().click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(menu().classList.contains('is-open')).toBe(false)
  })

  it('点菜单外的页面区域收起', () => {
    mount()
    trigger().click()
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(menu().classList.contains('is-open')).toBe(false)
  })
})

describe('TikTok 场景菜单 — 执行与反馈', () => {
  it('点下载无水印视频时把 video 这个动作交给宿主', async () => {
    const { calls } = mount()
    trigger().click()
    row('video').click()
    expect(calls).toEqual(['video'])
    await settle()
  })

  it('点保存到灵感库时把 save 这个动作交给宿主', async () => {
    const { calls } = mount()
    trigger().click()
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
    trigger().click()
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
    trigger().click()
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
    trigger().click()
    row('save').click()
    await settle()

    expect(row('save').classList.contains('is-done')).toBe(true)
    expect(row('save').textContent).toContain(COPY.done('save', { ok: true, code: 'duplicate' }))
  })

  it('失败时把宿主给的原因显示出来', async () => {
    mount(async () => ({ ok: false, code: 'rejected', detail: '未从该作品解析到可下载的视频直链' }))
    trigger().click()
    row('video').click()
    await settle()

    expect(row('video').classList.contains('is-error')).toBe(true)
    const detail = shadow().querySelector('.omx-item-detail')
    expect(detail?.textContent).toContain('视频直链')
  })

  it('主程序没在跑时给出的也是可执行的原因', async () => {
    mount(async () => ({ ok: false, code: 'unreachable' }))
    trigger().click()
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
})
