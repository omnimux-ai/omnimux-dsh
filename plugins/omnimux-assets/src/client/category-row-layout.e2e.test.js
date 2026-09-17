import assert from 'node:assert/strict'
import test from 'node:test'
import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'
import { ASSETS_CSS } from './styles.js'

test('公共资产库分类单行流布局端到端几何与样式契约', () => {
  const result = runStyleDomProbe({
    name: 'assets-category-row-layout',
    styles: ASSETS_CSS,
    html: `
      <div class="omnimux-assets-cloud" style="width:1280px">
        <div class="omnimux-assets-cloud-rows-scroll">
          <section class="omnimux-assets-cloud-row-section" data-category="character">
            <div class="omnimux-assets-cloud-row-header">
              <div class="omnimux-assets-cloud-row-info">
                <h2 class="omnimux-assets-cloud-row-title">角色</h2>
                <p class="omnimux-assets-cloud-row-desc">超写实数字人形象</p>
              </div>
              <button class="omnimux-assets-cloud-row-view-all">查看全部</button>
            </div>
            <div class="omnimux-assets-cloud-row-wrapper">
              <button class="omnimux-assets-cloud-row-arrow omnimux-assets-cloud-row-arrow--left"></button>
              <div class="omnimux-assets-cloud-row-cards">
                <div class="omnimux-assets-card omnimux-assets-cloud-card"></div>
                <div class="omnimux-assets-card omnimux-assets-cloud-card"></div>
                <div class="omnimux-assets-card omnimux-assets-cloud-card"></div>
              </div>
              <button class="omnimux-assets-cloud-row-arrow omnimux-assets-cloud-row-arrow--right"></button>
            </div>
          </section>
        </div>
      </div>`,
    measure: () => {
      const rowsScroll = document.querySelector('.omnimux-assets-cloud-rows-scroll')
      const rowSection = document.querySelector('.omnimux-assets-cloud-row-section')
      const viewAllBtn = document.querySelector('.omnimux-assets-cloud-row-view-all')
      const cardsContainer = document.querySelector('.omnimux-assets-cloud-row-cards')
      const card = document.querySelector('.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card')
      const rightArrow = document.querySelector('.omnimux-assets-cloud-row-arrow--right')

      return {
        rowsScrollDisplay: getComputedStyle(rowsScroll).display,
        cardsDisplay: getComputedStyle(cardsContainer).display,
        cardsOverflowX: getComputedStyle(cardsContainer).overflowX,
        cardWidth: getComputedStyle(card).width,
        cardFlexShrink: getComputedStyle(card).flexShrink,
        arrowWidth: getComputedStyle(rightArrow).width,
        arrowHeight: getComputedStyle(rightArrow).height,
        arrowRadius: getComputedStyle(rightArrow).borderRadius,
        viewAllRadius: getComputedStyle(viewAllBtn).borderRadius,
        viewAllHeight: getComputedStyle(viewAllBtn).height,
      }
    },
  })

  // 1. 验证外层多行容器流式排列
  assert.equal(result.rowsScrollDisplay, 'flex')
  // 2. 验证卡片单行横向水平排列与滚动属性
  assert.equal(result.cardsDisplay, 'flex')
  assert.equal(result.cardsOverflowX, 'auto')
  // 3. 验证卡片在横向流中的固定尺寸与防压缩
  assert.equal(result.cardWidth, '200px')
  assert.equal(result.cardFlexShrink, '0')
  // 4. 验证悬浮翻页按钮的标准正圆形几何规格
  assert.equal(result.arrowWidth, '36px')
  assert.equal(result.arrowHeight, '36px')
  assert.equal(result.arrowRadius, '50%')
  // 5. 验证「查看全部」胶囊按钮规格
  assert.equal(result.viewAllRadius, '9999px')
  assert.equal(result.viewAllHeight, '30px')
})
