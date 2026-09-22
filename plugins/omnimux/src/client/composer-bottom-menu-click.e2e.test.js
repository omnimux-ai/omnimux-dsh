import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import { ensurePlacementStyles, syncMenuPlacement } from './composer-commands-i18n.js'

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
