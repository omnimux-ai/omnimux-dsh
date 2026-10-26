import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
  MORE_MENU_SELECTOR,
  PANEL_CHROME_CSS,
  PANEL_CHROME_STYLE_ID,
  PANEL_MENU_GAP,
  PANEL_MENU_MIN_WIDTH,
  PANEL_MENU_VIEWPORT_MARGIN,
  PANEL_ROW_METRICS,
  computePanelMenuOffset,
  computePanelMenuPlacement,
  ensurePanelChromeStyles,
  installSidebarPanelChrome,
  positionPanelMenu,
} from './sidebar-panel-chrome.js'

const PRODUCT_ROW = {
  height: 32,
  radius: 8,
  paddingX: 8,
  marginX: 4,
  gap: 6,
  iconSize: 14,
  fontSize: 14,
  lineHeight: 20,
}

test('行度量真源与产品自定义行逐项一致', () => {
  assert.deepEqual({ ...PANEL_ROW_METRICS }, PRODUCT_ROW)
})

test('样式把官方 panel 行压到产品行度量', () => {
  assert.match(PANEL_CHROME_CSS, new RegExp(`min-height: ${PRODUCT_ROW.height}px`))
  assert.match(PANEL_CHROME_CSS, new RegExp(`padding: 0 ${PRODUCT_ROW.paddingX}px`))
  assert.match(PANEL_CHROME_CSS, new RegExp(`margin: 0 ${PRODUCT_ROW.marginX}px`))
  assert.match(PANEL_CHROME_CSS, new RegExp(`gap: ${PRODUCT_ROW.gap}px`))
  assert.match(PANEL_CHROME_CSS, new RegExp(`border-radius: ${PRODUCT_ROW.radius}px`))
  assert.match(PANEL_CHROME_CSS, new RegExp(`font-size: ${PRODUCT_ROW.fontSize}px`))
  assert.match(PANEL_CHROME_CSS, new RegExp(`line-height: ${PRODUCT_ROW.lineHeight}px`))
  assert.match(PANEL_CHROME_CSS, new RegExp(`width: ${PRODUCT_ROW.iconSize}px`))

  const rowRules = PANEL_CHROME_CSS.split('\n').filter((line) => /panelRow|panelGlyph/.test(line))
  assert.ok(rowRules.length > 0)
  for (const line of rowRules) {
    assert.match(line, /data-pane="sidebar"|sidebarCol/, `panel 行规则必须在侧栏作用域内: ${line}`)
  }
})

test('收起态排除：度量规则只在没有 data-sidebar-collapsed 时命中', () => {
  const rowRules = PANEL_CHROME_CSS.split('\n').filter((line) => /panelRow|panelGlyph/.test(line))
  for (const line of rowRules) {
    assert.match(
      line,
      /^html:not\(:has\(\[data-sidebar-collapsed\]\)\)/,
      `轨道态不得被文字行度量撑开: ${line}`,
    )
  }
})

test('「更多」菜单去透明：覆盖该实例的材质变量并禁用毛玻璃', () => {
  assert.match(PANEL_CHROME_CSS, /--dsw-menu-surface-fill: var\(--dsw-alias-bg-layer-2, var\(--dsw-alias-bg-base\)\)/)
  assert.match(PANEL_CHROME_CSS, /--dsw-menu-backdrop-filter: none/)
  assert.match(PANEL_CHROME_CSS, /translate: var\(--omnimux-more-menu-shift, 0\) 0/)
  assert.ok(PANEL_CHROME_CSS.includes(`${MORE_MENU_SELECTOR} {`))
  assert.match(MORE_MENU_SELECTOR, /data-menu-material="translucent"/)
  assert.match(MORE_MENU_SELECTOR, /class\*="moreMenu"/)
})

test('反例：其它官方浮层不命中「更多」菜单材质选择器', () => {
  const dom = new JSDOM('<!doctype html><body></body>')
  const doc = dom.window.document

  const plainMenu = doc.createElement('div')
  plainMenu.setAttribute('data-menu-material', 'translucent')
  plainMenu.className = 'SomeMenu_list__abc'
  doc.body.append(plainMenu)
  assert.equal(doc.querySelector(MORE_MENU_SELECTOR), null)

  const sameName = doc.createElement('div')
  sameName.className = 'SidebarRoot_moreMenu__xyz'
  doc.body.append(sameName)
  assert.equal(doc.querySelector(MORE_MENU_SELECTOR), null)

  const moreMenu = doc.createElement('div')
  moreMenu.setAttribute('data-menu-material', 'translucent')
  moreMenu.className = 'SidebarRoot_moreMenu__xyz'
  doc.body.append(moreMenu)
  assert.equal(doc.querySelector(MORE_MENU_SELECTOR), moreMenu)
})

test('placement：常规把菜单左边界摆到侧栏右侧 + 间隙，宽度不变', () => {
  const placement = computePanelMenuPlacement({
    sidebarRight: 280,
    menuLeft: 8,
    menuWidth: 288,
    viewportWidth: 1440,
  })
  assert.equal(placement.offset, 280 + PANEL_MENU_GAP - 8)
  assert.equal(placement.maxWidth, null)
  assert.equal(8 + placement.offset, 288)
})

test('placement：右侧空间不足时收窄菜单，而不是压回侧栏', () => {
  const placement = computePanelMenuPlacement({
    sidebarRight: 280,
    menuLeft: 8,
    menuWidth: 288,
    viewportWidth: 560,
  })
  assert.equal(placement.offset, 280 + PANEL_MENU_GAP - 8, '菜单仍然摆在侧栏右侧')
  assert.equal(placement.maxWidth, 560 - PANEL_MENU_VIEWPORT_MARGIN - (280 + PANEL_MENU_GAP))
  assert.ok(288 + placement.maxWidth <= 560 - PANEL_MENU_VIEWPORT_MARGIN, '收窄后不越出视口留白')
})

test('placement：连最小可用宽度都放不下时保持官方位置', () => {
  const viewportWidth = 280 + PANEL_MENU_GAP + PANEL_MENU_VIEWPORT_MARGIN + PANEL_MENU_MIN_WIDTH - 1
  const placement = computePanelMenuPlacement({
    sidebarRight: 280,
    menuLeft: 8,
    menuWidth: 288,
    viewportWidth,
  })
  assert.deepEqual(placement, { offset: 0, maxWidth: null })
})

test('placement：菜单已在目标右侧时位移为 0', () => {
  const placement = computePanelMenuPlacement({
    sidebarRight: 280,
    menuLeft: 400,
    menuWidth: 288,
    viewportWidth: 1440,
  })
  assert.deepEqual(placement, { offset: 0, maxWidth: null })
})

test('placement：非法几何一律保持官方位置', () => {
  for (const bad of [
    { sidebarRight: Number.NaN, menuLeft: 8, menuWidth: 288, viewportWidth: 1440 },
    { sidebarRight: 280, menuLeft: Number.POSITIVE_INFINITY, menuWidth: 288, viewportWidth: 1440 },
    { sidebarRight: 280, menuLeft: 8, menuWidth: 0, viewportWidth: 1440 },
  ]) {
    assert.deepEqual(computePanelMenuPlacement(bad), { offset: 0, maxWidth: null })
  }
})

test('computePanelMenuOffset 与 placement 的位移一致', () => {
  const input = { sidebarRight: 280, menuLeft: 8, menuWidth: 288, viewportWidth: 1440 }
  assert.equal(computePanelMenuOffset(input), computePanelMenuPlacement(input).offset)
})

function buildGeometryDom({ menuLeft = 8, menuWidth = 288, sidebarRight = 280 } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
  const doc = dom.window.document

  const column = doc.createElement('div')
  column.className = 'AppFrame_sidebarCol__abc'
  column.setAttribute('data-pane', 'sidebar')
  column.getBoundingClientRect = () => ({
    left: 0, right: sidebarRight, width: sidebarRight, top: 0, bottom: 800, height: 800, x: 0, y: 0,
    toJSON() {},
  })
  doc.body.append(column)

  const menu = doc.createElement('div')
  menu.setAttribute('data-menu-material', 'translucent')
  menu.className = 'SidebarRoot_moreMenu__abc'
  menu.getBoundingClientRect = () => {
    const applied = Number.parseFloat(menu.style.getPropertyValue('--omnimux-more-menu-shift')) || 0
    const left = menuLeft + applied
    return {
      left, right: left + menuWidth, width: menuWidth,
      top: 100, bottom: 400, height: 300, x: left, y: 100, toJSON() {},
    }
  }
  doc.body.append(menu)
  return { dom, doc, menu, column }
}

test('positionPanelMenu：把位移写进自定义属性，且逐帧调用不叠加', () => {
  const { doc, menu } = buildGeometryDom()
  const first = positionPanelMenu(menu, doc)
  assert.equal(first, 280 + PANEL_MENU_GAP - 8)
  assert.equal(menu.style.getPropertyValue('--omnimux-more-menu-shift'), `${first}px`)

  const second = positionPanelMenu(menu, doc)
  assert.equal(second, first)
})

test('positionPanelMenu：菜单或侧栏缺失时返回 0 且不抛错', () => {
  const dom = new JSDOM('<!doctype html><body></body>')
  assert.equal(positionPanelMenu(null, dom.window.document), 0)
  assert.equal(positionPanelMenu(dom.window.document.createElement('div'), dom.window.document), 0)
})

test('ensurePanelChromeStyles：幂等注入，不产生第二个样式节点', () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
  const doc = dom.window.document
  const first = ensurePanelChromeStyles(doc)
  const second = ensurePanelChromeStyles(doc)
  assert.equal(first, second)
  assert.equal(doc.querySelectorAll(`#${PANEL_CHROME_STYLE_ID}`).length, 1)
  assert.equal(first.textContent, PANEL_CHROME_CSS)
})

test('installSidebarPanelChrome：菜单出现即接管，卸载后不再写属性', async () => {
  const { doc, menu } = buildGeometryDom()
  menu.remove()

  const uninstall = installSidebarPanelChrome(doc)
  assert.ok(doc.getElementById(PANEL_CHROME_STYLE_ID))

  doc.body.append(menu)
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(
    menu.style.getPropertyValue('--omnimux-more-menu-shift'),
    `${280 + PANEL_MENU_GAP - 8}px`,
  )

  uninstall()
  menu.style.removeProperty('--omnimux-more-menu-shift')
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(menu.style.getPropertyValue('--omnimux-more-menu-shift'), '')
})

test('installSidebarPanelChrome：二次安装不重复注入样式节点', () => {
  const { doc } = buildGeometryDom()
  const offA = installSidebarPanelChrome(doc)
  const offB = installSidebarPanelChrome(doc)
  assert.equal(doc.querySelectorAll(`#${PANEL_CHROME_STYLE_ID}`).length, 1)
  offA()
  offB()
})
