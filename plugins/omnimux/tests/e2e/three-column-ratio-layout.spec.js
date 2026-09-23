/**
 * E2E 契约测试：三分栏中间会话栏「比例制」（Issue #2608）。
 *
 * 本文件取代 `three-column-380-layout.spec.js`（Issue #2316）。旧规格断言
 * 「1280/1440/1920/2560 下中栏均为 380px」，与比例制直接矛盾；文件名里的 380
 * 会让后人误信旧行为仍然生效，故一并改名。
 *
 * 覆盖：
 *  1. 常数真源：比例区间、默认比例、中栏下限、首帧兜底；
 *  2. 五档视口刻度：中栏 = clamp(round(舞台 × 30%), 360, min(舞台 × 72%, 舞台 − 320))，
 *     且左栏 + 中栏 + 右栏恒等于视口；
 *  3. 网格样式契约：CSS 零改动 —— 第三轨仍是 `minmax(0px, 1fr)`，
 *     `var(--omnimux-conversation-width, 380px)` 里的 380px 只是首帧兜底字面量，不是算法值；
 *  4. 权威链：稳态比例权威 / 拖拽期 authored 权威；
 *  5. 输入框容器查询在 360px 下限宽度下自适应紧凑无重叠。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

import {
  CONVERSATION_MIN_CHAT_PX,
  CONVERSATION_RATIO_DEFAULT,
  CONVERSATION_RATIO_MAX,
  CONVERSATION_RATIO_MIN,
  conversationStageWidthPx,
  conversationWidthFromRatio,
  ratioFromConversationWidth,
} from '../../src/client/conversation-ratio.js'
import {
  WORKBENCH_CONVERSATION_MIN_PX,
  workbenchDefaultWidthPx,
  workbenchSplitMaxPanelPx,
} from '../../src/client/workbench/geometry.js'
import {
  CONVERSATION_WIDTH_FALLBACK_PX,
  deriveConversationWidthPx,
} from '../../src/client/sidebar-toggle-topbar.js'
import {
  WORKSPACE_LAYOUT_KEY,
  migrateChatRatioFromAuthoredGeometry,
  readChatRatio,
  writeChatRatio,
} from '../../src/client/workbench/workspace-layout-store.js'
import { PRODUCT_STAGE_CHROME } from '../../src/client/conversation-box.js'
import { COMPOSER_COMPACT_CSS } from '../../src/client/composer-compact.js'

const chromeSource = readFileSync(new URL('../../src/client/chrome.js', import.meta.url), 'utf8')

/** 左栏展开态宽度（外壳 SIDEBAR_DEFAULT）。 */
const RAIL_PX = 280

/** 验收刻度：视口 → 中栏 / 右栏（左栏固定 280，默认比例 30%）。 */
const VIEWPORT_LADDER = [
  { viewport: 1280, chat: 360, panel: 640, note: '被 360px 下限夹住' },
  { viewport: 1440, chat: 360, panel: 800, note: '被 360px 下限夹住' },
  { viewport: 1728, chat: 434, panel: 1014, note: '30% 生效' },
  { viewport: 1920, chat: 492, panel: 1148, note: '30% 生效' },
  { viewport: 2560, chat: 684, panel: 1596, note: '30% 生效' },
]

const makeState = (width = 500) => ({
  panelOpen: true,
  width,
  tabs: [{ id: 'omnimux-workflow:canvas', type: 'omnimux-workflow:canvas' }],
})

/** 最小外壳夹具：frame 内联栅格 + 视口宽；`dragging` 打开时补外壳拖拽标记。 */
function shellDoc(viewportPx, { dragging = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div class="dshDesktopFrame" style="grid-template-columns:280px minmax(0px, 1fr) 0px"></div></body></html>')
  Object.defineProperty(dom.window, 'innerWidth', { value: viewportPx, configurable: true })
  if (dragging) dom.window.document.body.setAttribute('data-dsh-sidebar-dragging', '')
  return dom.window.document
}

describe('E2E: 三分栏中栏比例制（Issue #2608）', () => {
  it('比例常数与下限已收敛到单一真源', () => {
    assert.equal(CONVERSATION_RATIO_MIN, 0)
    assert.equal(CONVERSATION_RATIO_MAX, 0.72)
    assert.equal(CONVERSATION_RATIO_DEFAULT, 0.3, '默认比例必须为 30%')
    assert.equal(CONVERSATION_MIN_CHAT_PX, 360, '中栏下限 360px（竞品 220px 不采纳）')
    assert.equal(WORKBENCH_CONVERSATION_MIN_PX, CONVERSATION_MIN_CHAT_PX, '几何模块的地板必须与比例真源同源')
    assert.equal(CONVERSATION_WIDTH_FALLBACK_PX, 380, '首帧兜底宽度仍为 380px（CSS 兜底字面量同源）')
  })

  for (const { viewport, chat, panel, note } of VIEWPORT_LADDER) {
    it(`${viewport}px 视口：中栏 ${chat}px + 右栏 ${panel}px（${note}）`, () => {
      const env = { viewportWidth: viewport, officialSidebarWidth: RAIL_PX }
      const measuredChat = deriveConversationWidthPx(shellDoc(viewport), false, RAIL_PX, RAIL_PX)
      const measuredPanel = workbenchDefaultWidthPx(makeState(), env)

      assert.equal(measuredChat, chat, `中栏应为 ${chat}px`)
      assert.equal(measuredPanel, panel, `右栏应为 ${panel}px`)
      assert.equal(
        RAIL_PX + measuredChat + measuredPanel,
        viewport,
        '三栏之和必须恒等于视口内容宽（无黑边死区）',
      )
      assert.ok(measuredChat >= CONVERSATION_MIN_CHAT_PX, '中栏不得低于下限')
    })
  }

  it('大屏多出的宽度按比例分账，不再全部落进中栏', () => {
    // 1920 → 2560：中栏 492 → 684（+192，即 30% × 640），右栏 1148 → 1596（+448）。
    const chat1920 = deriveConversationWidthPx(shellDoc(1920), false, RAIL_PX, RAIL_PX)
    const chat2560 = deriveConversationWidthPx(shellDoc(2560), false, RAIL_PX, RAIL_PX)
    const panel1920 = workbenchDefaultWidthPx(makeState(), { viewportWidth: 1920, officialSidebarWidth: RAIL_PX })
    const panel2560 = workbenchDefaultWidthPx(makeState(), { viewportWidth: 2560, officialSidebarWidth: RAIL_PX })

    assert.equal(chat2560 - chat1920, 192, '新增 640px 视口宽里中栏只应拿 30%')
    assert.equal(panel2560 - panel1920, 448, '其余 70% 全部归右栏（#2316 要消灭的荒原）')
    assert.ok(chat2560 / 2280 >= 0.295 && chat2560 / 2280 <= 0.305, '中栏 ÷ 舞台必须落在 [0.295, 0.305]')
  })

  it('收起左栏时中栏保宽，释放宽度全部进右栏（INV-1 / AC-9）', () => {
    const expandedChat = deriveConversationWidthPx(shellDoc(1920), false, RAIL_PX, RAIL_PX)
    const collapsedChat = deriveConversationWidthPx(shellDoc(1920), true, 0, RAIL_PX)
    assert.equal(collapsedChat, expandedChat, '收起左栏不得改变中栏像素宽度')

    // 面板宽按「可见舞台」算物理余量：左栏收起时第一轨被钉成 0，释放宽度物理上归右栏。
    // `workbenchConversationGeometryPx` 的收起判据读宿主 DOM 标记，夹具必须如实提供，
    // 否则夹具描述的是「左栏宽 0 但仍算展开」这个现实中不存在的状态。
    const dom = new JSDOM('<!doctype html><html><body><div class="dshDesktopFrame" data-sidebar-collapsed></div></body></html>')
    const previous = globalThis.document
    globalThis.document = dom.window.document
    try {
      const collapsedPanel = workbenchDefaultWidthPx(makeState(), {
        viewportWidth: 1920,
        officialSidebarWidth: 0,
        railBaselinePx: RAIL_PX,
      })
      assert.equal(collapsedPanel, 1920 - collapsedChat, '释放的左栏宽度必须全部进右栏')
    } finally {
      if (previous === undefined) delete globalThis.document
      else globalThis.document = previous
    }
  })

  it('拖拽期以 authored 几何为权威，比例不参与写入（防 #2097 复发）', () => {
    // 同一视口、同一比例：稳态发布比例值，拖拽期发布「视口 − 左栏 − 外壳第三轨」。
    const steady = deriveConversationWidthPx(shellDoc(1920), false, RAIL_PX, RAIL_PX)
    const dragging = deriveConversationWidthPx(shellDoc(1920, { dragging: true }), false, RAIL_PX, RAIL_PX)
    assert.equal(steady, 492)
    assert.equal(dragging, CONVERSATION_WIDTH_FALLBACK_PX, '拖拽期右栏第三轨为 0px（右栏收起）→ 不派生宽度')

    // 拖拽期即使存储比例被改成 0.9，宽度仍必须跟随外壳 authored 几何。
    const doc = shellDoc(1920, { dragging: true })
    doc.querySelector = () => ({ style: { gridTemplateColumns: '280px minmax(0px, 1fr) 864px' } })
    assert.equal(
      deriveConversationWidthPx(doc, false, RAIL_PX, RAIL_PX, { chatRatio: 0.9 }),
      776,
      '拖拽期比例只记录、不干预',
    )
  })

  it('右栏上限始终给中栏留出下限（画布与中栏互不侵占）', () => {
    for (const { viewport } of VIEWPORT_LADDER) {
      const env = { viewportWidth: viewport, officialSidebarWidth: RAIL_PX }
      const max = workbenchSplitMaxPanelPx(makeState(), env)
      assert.ok(
        max <= viewport - RAIL_PX - CONVERSATION_MIN_CHAT_PX + 0.5,
        `${viewport}px 视口下右栏上限 ${max}px 不得吃掉中栏下限`,
      )
    }
  })

  it('分栏网格样式仍以弹性第三轨吃余量，且 380px 只是首帧兜底字面量', () => {
    // CSS 零改动（方案 §4.6）：第三轨仍是 minmax(0px, 1fr)，中栏仍由变量驱动。
    assert.match(
      PRODUCT_STAGE_CHROME,
      /grid-template-columns:\s*var\(--omnimux-sidebar-width,\s*280px\)\s+var\(--omnimux-conversation-width,\s*380px\)\s+minmax\(0px,\s*1fr\)\s*!important/,
      '三分栏展开且右栏打开时必须由变量钉中栏、第三轨弹性铺满',
    )
    assert.match(
      PRODUCT_STAGE_CHROME,
      /grid-template-columns:\s*0px\s+var\(--omnimux-conversation-width,\s*380px\)\s+minmax\(0px,\s*1fr\)\s*!important/,
      '左栏收起态下中栏保宽并把释放空间反哺右栏',
    )
    // 380px 只允许作为 var() 的兜底字面量出现，不得成为任何网格轨道的直接取值。
    const declarations = PRODUCT_STAGE_CHROME.match(/grid-template-columns:[^!;]*/g) || []
    assert.ok(declarations.length > 0, '生产样式必须至少声明一条网格规则')
    for (const declaration of declarations) {
      if (!declaration.includes('380px')) continue
      assert.ok(
        declaration.includes('var(--omnimux-conversation-width, 380px)'),
        `380px 只能作为中栏变量的兜底值出现，不得作为轨道字面量：${declaration}`,
      )
    }
  })

  it('输入框组件在 360px 下限宽度下具备容器查询纯图标收敛与防溢出兜底', () => {
    assert.match(COMPOSER_COMPACT_CSS, /container-type:\s*inline-size;/, '输入卡片根部必须声明容器查询')
    assert.match(
      COMPOSER_COMPACT_CSS,
      /@container composer-card \(max-width:\s*459px\)\{/,
      '必须声明 459px 容器查询，确保 360–459px 下按钮即时折叠为纯图标',
    )
    assert.match(
      COMPOSER_COMPACT_CSS,
      /\[data-composer-card\] \[class\*="tools"\]\{[^}]*overflow:\s*hidden;/,
      '工具栏必须声明 overflow: hidden 防溢出',
    )
  })

  it('拖拽结算把终态像素变成比例真源，稳态重算是恒等变换（AC-7 / E-4）', () => {
    // 用户把分界线拖到中栏 776px（外壳第三轨 864）：结算落盘的比例必须能反算出同一个像素。
    const stage = conversationStageWidthPx({ viewportWidth: 1920, railVisiblePx: RAIL_PX, railBaselinePx: RAIL_PX, collapsed: false })
    const ratio = ratioFromConversationWidth(stage, 776)

    assert.ok(Math.abs(ratio - 776 / stage) < 1e-9)
    assert.equal(conversationWidthFromRatio(stage, ratio), 776, '稳态重算必须回到松手时的像素（无跳变）')
  })

  it('比例持久化只存比例不存像素，且缺失与损坏分流（AC-7 / INV-17）', () => {
    assert.equal(WORKSPACE_LAYOUT_KEY, 'omnimux.conversationRatio', '键名是契约的一部分，不得按会话 / 页签分片')

    const map = new Map()
    const storage = {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => { map.set(key, String(value)) },
    }

    assert.equal(readChatRatio({ storage }), null, '键缺失必须返回 null，交给迁移路径')
    assert.equal(writeChatRatio(0.42, { storage }), true)
    const payload = JSON.parse(map.get(WORKSPACE_LAYOUT_KEY))
    assert.deepEqual(Object.keys(payload).sort(), ['chatRatio', 'version'])
    assert.equal(payload.chatRatio, 0.42, '载荷里只能有比例，不得出现任何像素宽度字段')

    map.set(WORKSPACE_LAYOUT_KEY, 'not-json')
    assert.equal(readChatRatio({ storage }), CONVERSATION_RATIO_DEFAULT, '损坏值必须回落产品默认 0.3')
  })

  it('老用户迁移按当前几何反推一次，升级前后宽度不变（AC-11）', () => {
    const map = new Map()
    const storage = {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => { map.set(key, String(value)) },
    }
    // 升级前：1920 视口、左栏 280、外壳 authored 第三轨 864 → 中栏 776。
    const ratio = migrateChatRatioFromAuthoredGeometry({
      viewportWidth: 1920,
      railVisiblePx: RAIL_PX,
      railBaselinePx: RAIL_PX,
      collapsed: false,
      rightTrackPx: 864,
    }, { storage })

    assert.ok(typeof ratio === 'number', '几何足够时必须完成迁移')
    const migratedChat = conversationWidthFromRatio(1920 - RAIL_PX, ratio)
    assert.ok(Math.abs(migratedChat - 776) <= 4, `迁移后中栏 ${migratedChat}px 与升级前 776px 偏差超限`)
  })

  it('面板宽协调写把右栏钉在真实列边界，缩放后立即拖拽无首帧跳变（E-5）', () => {
    for (const { viewport, chat, panel } of VIEWPORT_LADDER) {
      const env = { viewportWidth: viewport, officialSidebarWidth: RAIL_PX }
      const target = workbenchDefaultWidthPx(makeState(), env)

      assert.equal(target, panel, `${viewport}px 视口下面板目标宽必须是「可见舞台 − 中栏」`)
      assert.equal(
        RAIL_PX + chat + target,
        viewport,
        `${viewport}px 视口下「左栏 + 中栏 + 面板」必须等于视口，否则外壳拖拽起点与真实列边界错位`,
      )
    }
  })

  it('缩放钩子与协调写已接线到装配层（E-5 的落地证据）', () => {
    assert.match(chromeSource, /setTopbarGeometryHook\(\s*\(doc\)\s*=>\s*\{\s*reconcileRightbarFromRatio\(undefined,\s*\{\s*doc\s*\}\)\s*\}\)/, 'resize 后必须同一次协调面板宽与把手（透传 doc）')
    assert.match(chromeSource, /setTopbarGeometryHook\(null\)/, '卸载时必须回收钩子，绝不留野引用')
  })
})
