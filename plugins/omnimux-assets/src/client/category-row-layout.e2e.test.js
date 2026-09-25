import assert from 'node:assert/strict'
import test from 'node:test'
import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'
import { ASSETS_CSS } from './styles.js'

test('公共资产库分类单行流布局端到端几何与样式契约', () => {
  const result = runStyleDomProbe({
    name: 'assets-category-row-layout',
    styles: ASSETS_CSS,
    html: `
      <style>
        :root {
          --dsw-alias-bg-layer-1: #f7f7f8;
          --dsw-alias-bg-base: #ffffff;
          --dsw-alias-label-primary: #111827;
          --dsw-alias-label-secondary: #4b5563;
        }
      </style>
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

          <!-- 声音：横版卡片，加载占位也是横的 -->
          <section class="omnimux-assets-cloud-row-section" data-category="audio">
            <div class="omnimux-assets-cloud-row-cards">
              <div class="omnimux-assets-card omnimux-assets-cloud-card" data-aspect="horizontal">
                <div class="omnimux-assets-cloud-thumb"></div>
              </div>
              <!-- 文本类卡片：没有封面也没有可播媒体，正文就是卡片唯一的内容 -->
              <div class="omnimux-assets-card omnimux-assets-cloud-card omnimux-assets-cloud-card--text" data-kind="text" data-aspect="horizontal">
                <div class="omnimux-assets-cloud-card-mask"></div>
                <div class="omnimux-assets-cloud-actions"></div>
                <div class="omnimux-assets-card-body">
                  <p class="omnimux-assets-card-title">双节棍小哥</p>
                  <p class="omnimux-assets-cloud-desc">普通话男声，成熟稳重，适合口播与旁白</p>
                </div>
              </div>
              <div class="omnimux-assets-card omnimux-assets-cloud-card omnimux-assets-cloud-skeleton omnimux-assets-cloud-row-skeleton">
                <div class="omnimux-assets-cloud-skeleton-thumb"></div>
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
      const audioCard = document.querySelector('[data-category="audio"] .omnimux-assets-cloud-card:not(.omnimux-assets-cloud-row-skeleton)')
      const audioSkeleton = document.querySelector('[data-category="audio"] .omnimux-assets-cloud-row-skeleton')
      const cardBody = document.querySelector('[data-category="character"] .omnimux-assets-card-body')
      const cardMask = document.querySelector('[data-category="character"] .omnimux-assets-cloud-card-mask')
      const cardMedia = document.querySelector('[data-category="character"] .omnimux-assets-card-media')
      const rightArrow = document.querySelector('.omnimux-assets-cloud-row-arrow--right')
      const textCard = document.querySelector('[data-category="audio"] .omnimux-assets-cloud-card--text')
      const textBody = textCard.querySelector('.omnimux-assets-card-body')
      const textTitle = textCard.querySelector('.omnimux-assets-card-title')
      const textDesc = textCard.querySelector('.omnimux-assets-cloud-desc')
      const textMask = textCard.querySelector('.omnimux-assets-cloud-card-mask')

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
        audioCardWidth: getComputedStyle(audioCard).width,
        audioCardHeight: getComputedStyle(audioCard).height,
        audioCardAspect: getComputedStyle(audioCard).aspectRatio,
        audioSkeletonWidth: getComputedStyle(audioSkeleton).width,
        audioSkeletonHeight: getComputedStyle(audioSkeleton).height,
        audioSkeletonAspect: getComputedStyle(audioSkeleton).aspectRatio,
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
        textCardWidth: getComputedStyle(textCard).width,
        textCardHeight: getComputedStyle(textCard).height,
        textCardBackground: getComputedStyle(textCard).backgroundColor,
        textCardBackgroundImage: getComputedStyle(textCard).backgroundImage,
        textCardThemeAttr: textCard.getAttribute('data-theme'),
        textBodyPosition: getComputedStyle(textBody).position,
        textBodyInset: getComputedStyle(textBody).top,
        textBodyOpacity: getComputedStyle(textBody).opacity,
        textBodyTransform: getComputedStyle(textBody).transform,
        textBodyPadding: getComputedStyle(textBody).padding,
        textBodyGap: getComputedStyle(textBody).gap,
        textBodyBackgroundImage: getComputedStyle(textBody).backgroundImage,
        textBodyPointerEvents: getComputedStyle(textBody).pointerEvents,
        textTitleFontSize: getComputedStyle(textTitle).fontSize,
        textTitleWeight: getComputedStyle(textTitle).fontWeight,
        textTitleLineHeight: getComputedStyle(textTitle).lineHeight,
        textTitleColor: getComputedStyle(textTitle).color,
        textTitlePaddingRight: getComputedStyle(textTitle).paddingRight,
        textTitleTextShadow: getComputedStyle(textTitle).textShadow,
        textTitleClamp: getComputedStyle(textTitle).webkitLineClamp,
        textDescFontSize: getComputedStyle(textDesc).fontSize,
        textDescLineHeight: getComputedStyle(textDesc).lineHeight,
        textDescColor: getComputedStyle(textDesc).color,
        textDescClamp: getComputedStyle(textDesc).webkitLineClamp,
        textDescWhiteSpace: getComputedStyle(textDesc).whiteSpace,
        textMaskDisplay: getComputedStyle(textMask).display,
        textTitleText: textTitle.textContent.trim(),
        textDescText: textDesc.textContent.trim(),
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

  // 3b. 声音行与风格同尺寸，加载占位也是横的
  assert.equal(result.audioCardWidth, '300px')
  assert.equal(result.audioCardHeight, '169px')
  assert.equal(result.audioCardAspect, '16 / 9')
  assert.equal(result.audioSkeletonWidth, '300px')
  assert.equal(result.audioSkeletonHeight, '169px')
  assert.equal(result.audioSkeletonAspect, '16 / 9')

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

  // 8. 单行流里的文本卡：正文就是卡片唯一的内容，因此常驻可见（#2664）
  assert.equal(result.textCardWidth, '300px')
  assert.equal(result.textCardHeight, '169px')
  assert.equal(result.textTitleText, '双节棍小哥')
  assert.equal(result.textDescText, '普通话男声，成熟稳重，适合口播与旁白')
  assert.equal(result.textBodyPosition, 'absolute')
  assert.equal(result.textBodyInset, '0px')
  assert.equal(result.textBodyOpacity, '1')
  assert.equal(result.textBodyTransform, 'none')
  assert.equal(result.textBodyPadding, '14px')
  assert.equal(result.textBodyGap, '6px')
  assert.equal(result.textBodyBackgroundImage, 'none')
  // 正文盖在整卡之上，但点击穿透保留给整卡 onClick，避免重复触发预览。
  assert.equal(result.textBodyPointerEvents, 'none')

  // 9. 文本卡取单一中性底板，不取声音行的五色微彩、也不写 data-theme
  assert.equal(result.textCardBackground, 'rgb(247, 247, 248)')
  assert.equal(result.textCardBackgroundImage, 'none')
  assert.equal(result.textCardThemeAttr, null)

  // 10. 文本卡没有画面可暗化，蒙层整块关闭
  assert.equal(result.textMaskDisplay, 'none')

  // 11. 标题与描述沿用网格版式：既有单行流规则用 !important 锁死 700 字重与主色，
  //     这里的覆盖必须同样带 !important 才生效，所以字重断言即覆盖生效的证明。
  assert.equal(result.textTitleFontSize, '14px')
  assert.equal(result.textTitleWeight, '600')
  assert.equal(result.textTitleLineHeight, '20px')
  assert.equal(result.textTitleColor, 'rgb(17, 24, 39)')
  assert.equal(result.textTitlePaddingRight, '32px')
  assert.equal(result.textTitleTextShadow, 'none')
  assert.equal(result.textTitleClamp, '2')
  assert.equal(result.textDescFontSize, '12px')
  assert.equal(result.textDescLineHeight, '18px')
  assert.equal(result.textDescColor, 'rgb(75, 85, 99)')
  assert.equal(result.textDescClamp, '4')
  assert.equal(result.textDescWhiteSpace, 'normal')
})
