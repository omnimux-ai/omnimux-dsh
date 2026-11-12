/**
 * tests/e2e/apps-stage-scroll.harness.js
 *
 * Browser harness for the OmniMux desktop 「开始 (Apps)」 page scroll bug.
 * It injects the REAL hub stylesheet (`HUB_CSS` from plugins/omnimux/src/client/
 * styles.js) and mounts a faithful `.omnimux-apps-stage` replica whose measured
 * `--stage-height` is intentionally TALLER than the visible viewport remainder
 * (the geometry `readConversationBox()` can produce). It then asserts that the
 * stage is clamped inside the viewport, the list body scrolls, and the first and
 * last cards are both reachable.
 *
 * Emits a `<pre id="qa-report">` JSON blob the driver reads via --dump-dom.
 */
import { HUB_CSS } from '../../plugins/omnimux/src/client/styles.js'

const CARD_NAMES = [
  '视频剪辑', '文件', '项目', '资产库', '视觉工坊', '手机管理', '账号',
  '灵感社区', '任务表单', '社媒采集', '发布', 'AI网红工作室', '数据分析',
]

function run() {
  const style = document.createElement('style')
  style.textContent = HUB_CSS
  document.head.appendChild(style)

  const top = 40
  const left = 60
  const width = 460
  const winH = window.innerHeight
  // Simulate the failing geometry: measured conversation box taller than the
  // visible remainder (readConversationBox() can return found.height > winH - top).
  const measuredHeight = winH - top + 360

  const stage = document.createElement('div')
  stage.id = 'qa-stage'
  stage.className = 'omnimux-apps-stage'
  stage.setAttribute('role', 'region')
  stage.setAttribute('data-visible', 'true')
  stage.style.setProperty('--stage-top', `${top}px`)
  stage.style.setProperty('--stage-left', `${left}px`)
  stage.style.setProperty('--stage-width', `${width}px`)
  stage.style.setProperty('--stage-height', `${measuredHeight}px`)

  const header = document.createElement('div')
  header.className = 'qa-header'
  header.style.cssText = 'flex:0 0 auto;height:56px;display:flex;align-items:center;padding:0 20px;font-weight:600;border-bottom:1px solid rgba(255,255,255,.08);'
  header.textContent = '插件'

  const body = document.createElement('div')
  body.className = 'omnimux-apps-stage-body'
  for (const name of CARD_NAMES) {
    const card = document.createElement('div')
    card.className = 'qa-card'
    card.textContent = name
    card.style.cssText = 'flex:0 0 auto;height:64px;margin:6px 16px;border-radius:12px;display:flex;align-items:center;padding:0 16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);'
    body.appendChild(card)
  }
  stage.appendChild(header)
  stage.appendChild(body)
  document.body.appendChild(stage)

  // Force layout, then measure.
  void stage.offsetHeight

  const cards = body.querySelectorAll('.qa-card')
  const stageRect = stage.getBoundingClientRect()
  const bodyRect = body.getBoundingClientRect()
  const stageCS = getComputedStyle(stage)
  const bodyCS = getComputedStyle(body)

  // Scroll the body to the bottom and check the last card; then back to the top.
  body.scrollTop = body.scrollHeight
  const lastRect = cards[cards.length - 1].getBoundingClientRect()
  const scrolledTo = body.scrollTop
  body.scrollTop = 0
  const firstRect = cards[0].getBoundingClientRect()

  const visibleBottom = Math.min(stageRect.bottom, window.innerHeight)

  const assertions = []
  const check = (name, pass, detail) => assertions.push({ name, pass: Boolean(pass), detail })

  check('stage-clamped-to-viewport',
    stageRect.bottom <= window.innerHeight + 0.5,
    `stage.bottom=${Math.round(stageRect.bottom)} innerHeight=${window.innerHeight}`)
  check('stage-does-not-self-scroll',
    stageCS.overflow === 'hidden',
    `stage overflow=${stageCS.overflow}`)
  check('body-is-scroll-container',
    bodyCS.overflowY === 'auto',
    `body overflow-y=${bodyCS.overflowY}`)
  check('list-overflows-body',
    body.scrollHeight > body.clientHeight + 1,
    `scrollH=${body.scrollHeight} clientH=${body.clientHeight}`)
  check('list-can-scroll',
    scrolledTo > 0,
    `scrollTop after scroll=${scrolledTo}`)
  check('first-card-reachable',
    firstRect.top >= stageRect.top - 0.5 && firstRect.top < window.innerHeight,
    `first.top=${Math.round(firstRect.top)} stage.top=${Math.round(stageRect.top)}`)
  check('last-card-reachable',
    lastRect.bottom <= visibleBottom + 0.5,
    `last.bottom=${Math.round(lastRect.bottom)} visibleBottom=${Math.round(visibleBottom)}`)
  // The body must sit fully inside the stage box (header above, list below).
  check('body-inside-stage',
    bodyRect.bottom <= stageRect.bottom + 0.5,
    `body.bottom=${Math.round(bodyRect.bottom)} stage.bottom=${Math.round(stageRect.bottom)}`)

  const failed = assertions.filter((a) => !a.pass).length
  const report = {
    task: 'apps-stage-scroll',
    pass: failed === 0,
    total: assertions.length,
    failed,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    measuredHeight,
    stage: { top: Math.round(stageRect.top), bottom: Math.round(stageRect.bottom), height: Math.round(stageRect.height) },
    body: { scrollH: body.scrollHeight, clientH: body.clientHeight },
    assertions,
  }
  const pre = document.createElement('pre')
  pre.id = 'qa-report'
  pre.style.display = 'none'
  pre.textContent = JSON.stringify(report)
  document.body.appendChild(pre)
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(run, 30)
} else {
  window.addEventListener('load', () => setTimeout(run, 30))
}
