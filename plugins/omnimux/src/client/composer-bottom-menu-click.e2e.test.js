import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  ensurePlacementStyles,
  syncMenuPlacement,
  dismissPlusMenu,
  installMenuAutoSync,
  COMPOSER_OVERLAY_OPEN_EVENT,
  COMPOSER_OVERLAY_DISMISS_EVENT,
} from './composer-commands-i18n.js'

describe('e2e: 首页沉底指令菜单可点', () => {
  it('沉底且菜单盖在灵感卡片上时，菜单项仍可接收点击', () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
      <div class="omnimux-trending-card-body"></div>
      <div data-composer-card>
        <div class="overlayAnchor" data-overlay-placement="bottom" style="pointer-events:none">
          <div data-trigger-menu class="iRJKyq_menu" style="pointer-events:none">
            <button role="option"><span class="iRJKyq_itemName">从资产库选择</span></button>
          </div>
        </div>
      </div>
    </body></html>`)
    const doc = dom.window.document
    dom.window.innerHeight = 1000
    const card = doc.querySelector('[data-composer-card]')
    const menu = doc.querySelector('[data-trigger-menu]')
    const option = doc.querySelector('button[role="option"]')
    card.getBoundingClientRect = () => ({ top: 850, bottom: 950, height: 100 })
    let clicked = false
    option.addEventListener('click', () => { clicked = true })

    ensurePlacementStyles(doc)
    assert.equal(syncMenuPlacement(menu, doc), false)
    assert.equal(menu.style.pointerEvents, 'auto')
    assert.equal(doc.querySelector('.overlayAnchor').dataset.overlayPlacement, undefined)
    option.click()
    assert.equal(clicked, true)
    assert.match(doc.getElementById('dsh-omnimux-menu-placement').textContent, /z-index: 1000/)
  })
})

describe('e2e: 加号菜单跟随输入框位置', () => {
  function page(top, bottom, expanded) {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
      <div data-composer-card>
        <button aria-haspopup="listbox" aria-expanded="${expanded}" aria-label="指令"></button>
        <div class="overlayAnchor">
          <div data-trigger-menu class="iRJKyq_menu">
            <button role="option">上传媒体或文件</button>
          </div>
        </div>
      </div>
    </body></html>`)
    dom.window.innerHeight = 1000
    const doc = dom.window.document
    const card = doc.querySelector('[data-composer-card]')
    card.getBoundingClientRect = () => ({ top, bottom, height: bottom - top })
    return { doc, card, menu: doc.querySelector('[data-trigger-menu]') }
  }

  it('输入框在页面顶部时，加号菜单改到输入框下方', () => {
    const { doc, card, menu } = page(80, 200, 'true')
    ensurePlacementStyles(doc)
    assert.equal(syncMenuPlacement(menu, doc), true)
    assert.equal(card.dataset.menuPlacement, 'bottom')
    assert.equal(menu.style.top, 'calc(100% + 4px)')
    assert.equal(menu.style.bottom, 'auto')
  })

  it('输入框在页面底部时，加号菜单仍在输入框上方', () => {
    const { doc, card, menu } = page(850, 970, 'true')
    ensurePlacementStyles(doc)
    assert.equal(syncMenuPlacement(menu, doc), false)
    assert.equal(card.dataset.menuPlacement, undefined)
    assert.equal(menu.dataset.placement, undefined)
  })

  it('斜杠联想不跟随加号，顶部输入框仍在上方', () => {
    const { doc, menu } = page(80, 200, 'false')
    ensurePlacementStyles(doc)
    assert.equal(syncMenuPlacement(menu, doc), false)
    assert.equal(menu.dataset.placement, undefined)
  })

  it('从顶部回到底部后，点击层恢复，不再挡住页面', () => {
    const { doc, card, menu } = page(80, 200, 'true')
    const anchor = doc.querySelector('.overlayAnchor')
    anchor.style.position = 'absolute'
    anchor.style.inset = '0'
    anchor.style.height = '100%'
    anchor.style.pointerEvents = 'none'
    anchor.dataset.overlayPlacement = 'bottom'
    card.dataset.menuPlacement = 'bottom'
    card.getBoundingClientRect = () => ({ top: 850, bottom: 970, height: 120 })
    ensurePlacementStyles(doc)
    assert.equal(syncMenuPlacement(menu, doc), false)
    assert.equal(anchor.dataset.overlayPlacement, undefined)
    assert.equal(anchor.style.pointerEvents, '')
    assert.equal(anchor.style.position, '')
  })
})

describe('e2e: 输入框底栏浮层单例互斥 (Overlay Mutual Exclusion)', () => {
  it('加号菜单展开时，点击技能按钮会自动触发加号菜单收起', () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
      <div data-composer-card>
        <button class="Q7WfXG_add" aria-haspopup="listbox" aria-expanded="true" aria-label="指令"></button>
        <button data-omnimux-skill-picker class="sh-picker-trigger">技能</button>
        <div class="overlayAnchor">
          <div data-trigger-menu class="iRJKyq_menu">
            <button role="option">上传媒体或文件</button>
          </div>
        </div>
      </div>
    </body></html>`)
    const doc = dom.window.document
    let dismissed = false
    const plusBtn = doc.querySelector('button[aria-haspopup="listbox"]')
    plusBtn.addEventListener('click', () => {
      dismissed = true
      plusBtn.setAttribute('aria-expanded', 'false')
    })

    const cleanup = installMenuAutoSync(doc)
    const skillBtn = doc.querySelector('button[data-omnimux-skill-picker]')

    // 模拟用户在技能按钮上触发 pointerdown（捕获阶段先于 click 运行）
    const event = new dom.window.PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    skillBtn.dispatchEvent(event)

    assert.equal(dismissed, true, '加号按钮的收起 click 必须被自动调用')
    assert.equal(plusBtn.getAttribute('aria-expanded'), 'false', '加号按钮必须恢复未展开态')
    cleanup()
  })

  it('收到其他浮层打开的广播事件时，展开态加号菜单自动收起', () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
      <div data-composer-card>
        <button class="Q7WfXG_add" aria-haspopup="listbox" aria-expanded="true" aria-label="指令"></button>
      </div>
    </body></html>`)
    const doc = dom.window.document
    let dismissed = false
    const plusBtn = doc.querySelector('button[aria-haspopup="listbox"]')
    plusBtn.addEventListener('click', () => {
      dismissed = true
      plusBtn.setAttribute('aria-expanded', 'false')
    })

    const cleanup = installMenuAutoSync(doc)

    // 广播技能面板打开
    dom.window.dispatchEvent(new dom.window.CustomEvent(COMPOSER_OVERLAY_OPEN_EVENT, {
      detail: { id: 'skill-picker' }
    }))

    assert.equal(dismissed, true, '加号菜单必须响应广播并收起')
    cleanup()
  })

  it('点击加号按钮时，会广播 plus-menu 打开事件以收起其它活跃浮层', () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
      <div data-composer-card>
        <button class="Q7WfXG_add" aria-haspopup="listbox" aria-expanded="false" aria-label="指令"></button>
      </div>
    </body></html>`)
    const doc = dom.window.document
    let receivedOverlayId = null
    dom.window.addEventListener(COMPOSER_OVERLAY_OPEN_EVENT, (e) => {
      receivedOverlayId = e.detail?.id
    })

    const cleanup = installMenuAutoSync(doc)
    const plusBtn = doc.querySelector('button[aria-haspopup="listbox"]')

    const event = new dom.window.PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    plusBtn.dispatchEvent(event)

    assert.equal(receivedOverlayId, 'plus-menu', '点击加号必须广播 plus-menu 打开意图')
    cleanup()
  })
})
