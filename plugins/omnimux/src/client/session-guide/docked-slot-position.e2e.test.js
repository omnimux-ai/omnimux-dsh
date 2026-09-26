import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const here = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(join(here, 'styles.js'), 'utf8')

function mountInsideCard() {
  const start = styles.indexOf('[data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-card]')
  const end = styles.indexOf('/* 工作区行留在 Hero')
  assert.ok(start > 0 && end > start)
  const rules = styles.slice(start, end)
  return new JSDOM(`<!doctype html><head><style>${rules}</style></head><body>
    <div data-omnimux-starter-host data-omnimux-dock-open>
      <div data-composer-card>
        <div class="omx-attachment-dock"><div class="thumb"></div></div>
      </div>
    </div>
  </body>`)
}

test('e2e: 吸底时缩略图留在输入框卡片里面，不再被单独固定到框外', () => {
  const dom = mountInsideCard()
  const card = dom.window.document.querySelector('[data-composer-card]')
  const dock = card.querySelector('.omx-attachment-dock')
  const view = dom.window.getComputedStyle(dock)
  assert.equal(view.position, 'static')
  assert.equal(card.contains(dock), true)
  dom.window.close()
})

test('e2e: 未吸底时，素材条贴合卡片内壁靠左对齐，消除居中外边距', () => {
  const start = styles.indexOf('[data-omnimux-starter-host] .omx-attachment-dock')
  const end = styles.indexOf('[data-omnimux-starter-host] [class*="heroWorkspaceRow"]')
  assert.ok(start > 0 && end > start)
  const dom = new JSDOM('<!doctype html><head><style>'+styles.slice(start, end)+'</style></head><body><div data-omnimux-starter-host><div class="omx-attachment-dock"></div></div></body>')
  const view = dom.window.getComputedStyle(dom.window.document.querySelector('.omx-attachment-dock'))
  assert.equal(view.maxWidth, '100%')
  assert.ok(view.margin === '0px' || view.margin === '0' || view.marginInline === '0px' || view.marginInline === '0')
  assert.notEqual(view.marginInline, 'auto')
  assert.notEqual(view.marginLeft, 'auto')
  assert.notEqual(view.marginRight, 'auto')
  dom.window.close()
})

test('e2e: 输入框吸底态长列表安全避让垫高样式验证', () => {
  const defStart = styles.indexOf('[data-omnimux-starter-host] [data-composer-seat] {')
  const defEnd = styles.indexOf('/* 宿主内容总栈', defStart)
  assert.ok(defStart > 0 && defEnd > defStart)
  const defRule = styles.slice(defStart, defEnd)

  const dockStart = styles.indexOf('[data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-seat],')
  const dockEnd = styles.indexOf('/* 归还原生输入框', dockStart)
  assert.ok(dockStart > 0 && dockEnd > dockStart)
  const dockRule = styles.slice(dockStart, dockEnd)

  // 1. 静态规则断言：验证声明中严格包含 !important 与预期避让公式
  assert.ok(dockRule.includes('padding-bottom: calc(var(--omnimux-dock-bottom, 20px) + var(--omnimux-dock-card-height, 168px) + 56px) !important;'))
  assert.ok(dockRule.includes('[data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-seat]'))
  assert.ok(dockRule.includes('html[data-omnimux-split-compact] [data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-seat]'))
  assert.ok(dockRule.includes("html:is([data-omnimux-composer-density='short'], [data-omnimux-composer-density='icon']) [data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-seat]"))

  // 2. 运行时未吸底时：保持默认边距 (32px)
  const domNoDock = new JSDOM(`<!doctype html><head><style>${defRule}\n${dockRule}</style></head><body>
    <div data-omnimux-starter-host>
      <div data-composer-seat></div>
    </div>
  </body>`)
  const seatNoDock = domNoDock.window.document.querySelector('[data-composer-seat]')
  assert.equal(domNoDock.window.getComputedStyle(seatNoDock).paddingBottom, '32px')
  domNoDock.window.close()

  // 3. 运行时吸底时：计算出的 padding-bottom 包含动态安全垫高公式
  const domDocked = new JSDOM(`<!doctype html><head><style>${dockRule}</style></head><body>
    <div data-omnimux-starter-host data-omnimux-dock-open>
      <div data-composer-seat></div>
    </div>
  </body>`)
  const seatDocked = domDocked.window.document.querySelector('[data-composer-seat]')
  assert.equal(domDocked.window.getComputedStyle(seatDocked).paddingBottom, 'calc(var(--omnimux-dock-bottom, 20px) + var(--omnimux-dock-card-height, 168px) + 56px)')
  domDocked.window.close()

  // 4. 运行时分栏紧凑选择器下：吸底垫高规则同样生效并匹配
  const domCompact = new JSDOM(`<!doctype html><html data-omnimux-split-compact><head><style>${dockRule}</style></head><body>
    <div data-omnimux-starter-host data-omnimux-dock-open>
      <div data-composer-seat></div>
    </div>
  </body></html>`)
  const seatCompact = domCompact.window.document.querySelector('[data-composer-seat]')
  assert.equal(domCompact.window.getComputedStyle(seatCompact).paddingBottom, 'calc(var(--omnimux-dock-bottom, 20px) + var(--omnimux-dock-card-height, 168px) + 56px)')
  domCompact.window.close()
})

test('e2e: 吸底输入框最大宽度严格对齐顶部原生上限 952px (方案 A 样式红线白名单)', () => {
  const start = styles.indexOf('[data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-card]')
  const end = styles.indexOf('/* 工作区行留在 Hero', start)
  assert.ok(start > 0 && end > start)
  const cardRule = styles.slice(start, end)

  // 1. 红线检查：绝对严禁出现 max-width: none
  assert.equal(cardRule.includes('max-width:none'), false, '红线：严禁 max-width:none')
  assert.equal(cardRule.includes('max-width: none'), false, '红线：严禁 max-width: none')

  // 2. 白名单检查：必须对齐原生变量且兜底 952px
  assert.ok(cardRule.includes('max-width:var(--dsh-composer-card-max-width, 952px)!important;') ||
    cardRule.includes('max-width: var(--dsh-composer-card-max-width, 952px)!important;'))
  assert.ok(cardRule.includes('position:fixed!important;') || cardRule.includes('position: fixed!important;'))
  assert.ok(cardRule.includes('width:var(--omnimux-dock-width, 100%)!important;') || cardRule.includes('width: var(--omnimux-dock-width, 100%)!important;'))
  assert.ok(cardRule.includes('margin:0!important;') || cardRule.includes('margin: 0!important;'))

  // 3. 运行时 DOM 测试
  const dom = new JSDOM(`<!doctype html><head><style>${cardRule}</style></head><body>
    <div data-omnimux-starter-host data-omnimux-dock-open>
      <div data-composer-card></div>
    </div>
  </body>`)
  const card = dom.window.document.querySelector('[data-composer-card]')
  const computed = dom.window.getComputedStyle(card)
  assert.equal(computed.maxWidth, 'var(--dsh-composer-card-max-width, 952px)')
  assert.equal(computed.position, 'fixed')
  assert.equal(computed.margin, '0px')
  dom.window.close()
})

test('e2e: 吸底输入框声明平滑位移过渡 transition，杜绝侧边栏折叠/展开突兀跳动', () => {
  const start = styles.indexOf('[data-omnimux-starter-host][data-omnimux-dock-open] [data-composer-card]')
  const end = styles.indexOf('/* 工作区行留在 Hero', start)
  assert.ok(start > 0 && end > start)
  const cardRule = styles.slice(start, end)

  // 1. 白名单检查：必须声明 left 与 width 平滑过渡
  assert.ok(
    cardRule.includes('transition:left 200ms cubic-bezier(0.16, 1, 0.3, 1), width 200ms cubic-bezier(0.16, 1, 0.3, 1);') ||
    cardRule.includes('transition: left 200ms cubic-bezier(0.16, 1, 0.3, 1), width 200ms cubic-bezier(0.16, 1, 0.3, 1);')
  )

  // 2. 收起按钮同步平滑过渡检查
  const undockStart = styles.indexOf('.omnimux-trending-undock {')
  const undockEnd = styles.indexOf('.omnimux-trending-undock:hover', undockStart)
  assert.ok(undockStart > 0 && undockEnd > undockStart)
  const undockRule = styles.slice(undockStart, undockEnd)
  assert.ok(undockRule.includes('transition:left 200ms cubic-bezier(0.16, 1, 0.3, 1)') || undockRule.includes('transition: left 200ms cubic-bezier(0.16, 1, 0.3, 1)'))
})
