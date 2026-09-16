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
            <button role="option"><span class="iRJKyq_itemName">从资产库添加</span></button>
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
    assert.match(doc.getElementById('dsh-omnimux-menu-placement').textContent, /z-index: 80/)
  })
})
