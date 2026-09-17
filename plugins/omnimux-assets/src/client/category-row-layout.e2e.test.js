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
          <!-- 常规 9:16 竖版分类行 -->
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
                <div class="omnimux-assets-card omnimux-assets-cloud-card">
                  <div class="omnimux-assets-cloud-thumb">
                    <img class="omnimux-assets-card-media" src="" alt="" />
                  </div>
                  <div class="omnimux-assets-cloud-card-mask"></div>
                  <div class="omnimux-assets-card-body">
                    <p class="omnimux-assets-card-title">角色名称</p>
                  </div>
                </div>
              </div>
              <button class="omnimux-assets-cloud-row-arrow omnimux-assets-cloud-row-arrow--right"></button>
            </div>
          </section>

          <!-- 风格专用 16:9 横版分类行 -->
          <section class="omnimux-assets-cloud-row-section" data-category="style">
            <div class="omnimux-assets-cloud-row-cards">
              <div class="omnimux-assets-card omnimux-assets-cloud-card" data-aspect="horizontal">
                <div class="omnimux-assets-cloud-thumb">
                  <img class="omnimux-assets-card-media" src="" alt="" />
                </div>
                <div class="omnimux-assets-cloud-card-mask"></div>
                <div class="omnimux-assets-card-body">
                  <p class="omnimux-assets-card-title">赛博朋克风格</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>`,
    measure: () => {
      const rowsScroll = document.querySelector('.omnimux-assets-cloud-rows-scroll')
      const viewAllBtn = document.querySelector('.omnimux-assets-cloud-row-view-all')
      const cardsContainer = document.querySelector('.omnimux-assets-cloud-row-cards')
      const verticalCard = document.querySelector('[data-category="character"] .omnimux-assets-cloud-card')
      const horizontalCard = document.querySelector('[data-category="style"] .omnimux-assets-cloud-card')
      const cardBody = document.querySelector('[data-category="character"] .omnimux-assets-card-body')
      const cardMask = document.querySelector('[data-category="character"] .omnimux-assets-cloud-card-mask')
      const cardMedia = document.querySelector('[data-category="character"] .omnimux-assets-card-media')
      const rightArrow = document.querySelector('.omnimux-assets-cloud-row-arrow--right')

      return {
        rowsScrollDisplay: getComputedStyle(rowsScroll).display,
        cardsDisplay: getComputedStyle(cardsContainer).display,
        cardsOverflowX: getComputedStyle(cardsContainer).overflowX,
        verticalCardWidth: getComputedStyle(verticalCard).width,
        verticalCardHeight: getComputedStyle(verticalCard).height,
        verticalCardAspect: getComputedStyle(verticalCard).aspectRatio,
        horizontalCardWidth: getComputedStyle(horizontalCard).width,
        horizontalCardHeight: getComputedStyle(horizontalCard).height,
        horizontalCardAspect: getComputedStyle(horizontalCard).aspectRatio,
        cardBodyPosition: getComputedStyle(cardBody).position,
        cardBodyOpacity: getComputedStyle(cardBody).opacity,
        cardMaskPosition: getComputedStyle(cardMask).position,
        cardMaskOpacity: getComputedStyle(cardMask).opacity,
        cardMediaObjectFit: getComputedStyle(cardMedia).objectFit,
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
  assert.equal(result.cardsDisplay, 'flex')
  assert.equal(result.cardsOverflowX, 'auto')

  // 2. 验证常规分类固定为 9:16 竖版卡片
  assert.equal(result.verticalCardWidth, '190px')
  assert.equal(result.verticalCardHeight, '338px')
  assert.equal(result.verticalCardAspect, '9 / 16')

  // 3. 验证风格分类固定为 16:9 横版卡片
  assert.equal(result.horizontalCardWidth, '300px')
  assert.equal(result.horizontalCardHeight, '169px')
  assert.equal(result.horizontalCardAspect, '16 / 9')

  // 4. 验证默认不显示标题（对标图 2 纯净画面）
  assert.equal(result.cardBodyPosition, 'absolute')
  assert.equal(result.cardBodyOpacity, '0')

  // 5. 验证遮罩蒙层（对标图 3 悬停暗化预置）
  assert.equal(result.cardMaskPosition, 'absolute')
  assert.equal(result.cardMaskOpacity, '0')

  // 6. 验证图片/视频满画幅自适应缩放无黑边
  assert.equal(result.cardMediaObjectFit, 'cover')

  // 7. 验证悬浮翻页圆钮与「查看全部」胶囊按钮几何规范
  assert.equal(result.arrowWidth, '36px')
  assert.equal(result.arrowHeight, '36px')
  assert.equal(result.arrowRadius, '50%')
  assert.equal(result.viewAllRadius, '9999px')
  assert.equal(result.viewAllHeight, '30px')
})
