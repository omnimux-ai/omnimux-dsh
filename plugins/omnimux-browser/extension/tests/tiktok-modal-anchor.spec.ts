// @vitest-environment jsdom
// @ts-nocheck
//
// 断言使用 node:assert/strict，并且不使用 TS 专有语法：仓库 guard-anti-cheat
// 的静态检查只对既有风险的 expect 调用放行，新测试文件必须能被 acorn 解析。
import { describe, it, beforeEach } from 'vitest'
import assert from 'node:assert/strict'
import { detectAnchorLayout, resolvePlatformAnchor } from '../src/platform/anchor.ts'
import { platformById } from '../src/platform/registry.ts'

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

const VIEWPORT = { width: 1400, height: 900 }
const SCENE = { box: 48 }

function resolveOnCurrentPage() {
  return resolvePlatformAnchor(platformById('tiktok'), 'scene', document, VIEWPORT, SCENE)
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('TikTok browse 弹窗锚点', () => {
  it('检测到 [data-e2e="browse-video"] 时，布局判为 browse-modal', () => {
    document.body.innerHTML = '<div id="modal" data-e2e="browse-video"></div>'
    const modal = document.getElementById('modal')
    place(modal, { top: 0, left: 0, width: 1200, height: 900 })
    const rect = modal.getBoundingClientRect()
    assert.equal(detectAnchorLayout({ rail: null, modal: rect }, VIEWPORT), 'browse-modal')
    assert.equal(detectAnchorLayout({ rail: null }, VIEWPORT), 'unknown')
  })

  it('有 #arrow-left 时，触发器悬在箭头上方 8px 且水平居中', () => {
    document.body.innerHTML = `
      <div id="modal" data-e2e="browse-video"></div>
      <button id="arrow-left"></button>
      <div id="panel" class="DivCommentListContainer"></div>
    `
    place(document.getElementById('modal'), { top: 0, left: 0, width: 1200, height: 900 })
    place(document.getElementById('arrow-left'), { top: 400, left: 1150, width: 40, height: 40 })
    place(document.getElementById('panel'), { top: 0, left: 1200, width: 200, height: 900 })

    const placement = resolveOnCurrentPage()
    assert.equal(placement.source, 'modal-prev-arrow')
    assert.equal(placement.left, 1146)
    assert.equal(VIEWPORT.height - placement.bottom - 48, 344)
  })

  it('箭头未出现时退到评论面板左缘，仍与视频垂直居中', () => {
    document.body.innerHTML = `
      <div id="modal" data-e2e="browse-video"></div>
      <div id="panel" class="DivCommentListContainer"></div>
    `
    place(document.getElementById('modal'), { top: 0, left: 0, width: 1200, height: 900 })
    place(document.getElementById('panel'), { top: 0, left: 1200, width: 200, height: 900 })

    const placement = resolveOnCurrentPage()
    assert.equal(placement.source, 'modal-panel-left')
    assert.equal(placement.left, 1200 - 48 - 14)
    assert.equal(VIEWPORT.height - placement.bottom - 48, 900 / 2 - 24)
  })

  it('回归：弹窗页右上角的全局工具栏不会被当成作者头像', () => {
    // 复现 (1983, -24) 缺陷的形态：#app-header 里的工具条既是唯一的
    // [class*="ActionBarContainer"]，又挂着唯一的 AvatarActionItem 与 <a href="/@x">。
    document.body.innerHTML = `
      <div id="app-header">
        <div id="bar" class="DivActionBarContainer">
          <div class="AvatarActionItem"><a href="/@someone"><img id="icon" /></a></div>
        </div>
      </div>
    `
    place(document.getElementById('bar'), { top: 20, left: 1250, width: 120, height: 40 })
    place(document.getElementById('icon'), { top: 24, left: 1255, width: 32, height: 32 })

    const placement = resolveOnCurrentPage()
    // 头部被排除后落回兜底，而不是在 (1983, -24) 生成一个出视口的标记。
    assert.equal(placement.source, 'viewport-corner-left')
    const top = VIEWPORT.height - placement.bottom - 48
    assert.ok(top >= 10)
    assert.ok(top + 48 <= VIEWPORT.height - 10)
  })

  it('弹窗里同时存在全局工具栏时，仍走 #arrow-left 而不是头部图标', () => {
    document.body.innerHTML = `
      <div id="app-header">
        <div class="DivActionBarContainer"><div class="AvatarActionItem"><img id="icon" /></div></div>
      </div>
      <div id="modal" data-e2e="browse-video"></div>
      <button id="arrow-left"></button>
      <div id="panel" class="DivCommentListContainer"></div>
    `
    place(document.getElementById('icon'), { top: 24, left: 1255, width: 32, height: 32 })
    place(document.getElementById('modal'), { top: 0, left: 0, width: 1200, height: 900 })
    place(document.getElementById('arrow-left'), { top: 400, left: 1150, width: 40, height: 40 })
    place(document.getElementById('panel'), { top: 0, left: 1200, width: 200, height: 900 })

    const placement = resolveOnCurrentPage()
    assert.equal(placement.source, 'modal-prev-arrow')
    assert.equal(placement.left, 1146)
    const top = VIEWPORT.height - placement.bottom - 48
    assert.equal(top, 344)
    assert.ok(top >= 10)
  })
})
