import test from 'node:test'
import assert from 'node:assert/strict'
import { CLIP_CSS } from './styles.js'
import {
  MIN_SIDEBAR_INSET,
  computeHeaderPadLeft,
  computeStandaloneBox,
  readHostSidebarInset,
} from './stage-box.js'

test('viewport-adapt: CLIP_CSS contains the stage in the conversation box', () => {
  assert.ok(CLIP_CSS.includes('var(--stage-left, 56px)'), 'CLIP_CSS must have 56px default left offset for sidebar avoidance')
  assert.ok(CLIP_CSS.includes('var(--stage-top, 0px)'), 'CLIP_CSS must have top offset variable')
  assert.ok(CLIP_CSS.includes('contain: layout paint'), 'standalone stage must contain paint so OpenReel fixed layers stay in-box')
  assert.ok(CLIP_CSS.includes('.omnimux-clip-stage[data-clip-mode="canvas"]'), 'canvas mode must have a dedicated layout rule')
  assert.ok(CLIP_CSS.includes('position: absolute'), 'canvas mode must fill the canvas host, not guess overlay coords')
  assert.ok(CLIP_CSS.includes('inset: 0'), 'canvas mode must use inset:0 inside the canvas tab')
  assert.ok(
    CLIP_CSS.includes('.omnimux-clip-stage[data-clip-mode="standalone"] .omnimux-clip-stage-header'),
    'standalone must retain its host action row',
  )
  assert.ok(!CLIP_CSS.includes('padding-right: 64px'), 'separate return row must not reserve an overlapping slot in OpenReel')
})

test('viewport-adapt: standalone box follows the live sidebar, not a 56px guess', () => {
  const clamped = computeStandaloneBox({ top: 0, left: 0, width: 1920, height: 1080 }, { width: 1920, height: 1080 }, 56)
  assert.equal(clamped.left, 56)
  assert.equal(clamped.width, 1920 - 56)

  const expanded = computeStandaloneBox({ top: 0, left: 0, width: 1920, height: 1080 }, { width: 1920, height: 1080 }, 264)
  assert.equal(expanded.left, 264, 'expanded sidebar must push the editor right of the real column')
  assert.equal(expanded.width, 1920 - 264)

  const conversation = computeStandaloneBox({ top: 0, left: 280, width: 1640, height: 1080 }, { width: 1920, height: 1080 }, 56)
  assert.equal(conversation.left, 280, 'legitimate conversation left wins when it is already past the sidebar')
  assert.equal(conversation.width, 1920 - 280)

  const fallback = computeStandaloneBox(null, { width: 1440, height: 900 }, 56)
  assert.equal(fallback.left, 56)
  assert.equal(fallback.width, 1440 - 56)
  assert.equal(fallback.height, 900)
})

test('viewport-adapt: readHostSidebarInset uses the real sidebar column', () => {
  assert.equal(readHostSidebarInset(null), MIN_SIDEBAR_INSET)

  const fakeDoc = {
    querySelector(selector) {
      if (!String(selector).includes('sidebar')) return null
      return {
        getBoundingClientRect() {
          return { left: 0, right: 248, width: 248, height: 900 }
        },
      }
    },
  }
  assert.equal(readHostSidebarInset(fakeDoc), 248)

  const collapsedDoc = {
    querySelector() {
      return {
        getBoundingClientRect() {
          return { left: 0, right: 56, width: 56, height: 900 }
        },
      }
    },
  }
  assert.equal(readHostSidebarInset(collapsedDoc), 56)
})

test('viewport-adapt: macOS safe-area header padding computation', () => {
  assert.equal(computeHeaderPadLeft({ isCanvasMode: false, boxLeft: 0, isMac: true }), 80)
  assert.equal(computeHeaderPadLeft({ isCanvasMode: false, boxLeft: 56, isMac: true }), 20)
  assert.equal(computeHeaderPadLeft({ isCanvasMode: true, boxLeft: 0, isMac: true }), 20)
  assert.equal(computeHeaderPadLeft({ isCanvasMode: false, boxLeft: 0, isMac: false }), 20)
})

test('viewport-adapt: timeline ratio container calculation clamps properly', () => {
  const MIN_TIMELINE_RATIO = 20
  const MAX_TIMELINE_RATIO = 70

  function clampTimelineRatio(mouseY, containerRectTop, containerHeight, toolbarHeight = 40) {
    const availableHeight = Math.max(100, containerHeight - toolbarHeight)
    const containerBottom = containerRectTop + containerHeight
    const ratio = ((containerBottom - mouseY) / availableHeight) * 100
    return Math.min(Math.max(ratio, MIN_TIMELINE_RATIO), MAX_TIMELINE_RATIO)
  }

  const ratio1 = clampTimelineRatio(596, 100, 800)
  assert.equal(Math.round(ratio1), 40)
  assert.equal(clampTimelineRatio(150, 100, 800), MAX_TIMELINE_RATIO)
  assert.equal(clampTimelineRatio(890, 100, 800), MIN_TIMELINE_RATIO)
})
