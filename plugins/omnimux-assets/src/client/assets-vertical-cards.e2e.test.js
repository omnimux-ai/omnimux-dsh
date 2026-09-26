import assert from 'node:assert/strict'
import test from 'node:test'
import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'
import { ASSETS_CSS } from './styles.js'

test('本地资产统一 3:4 展台模式：外框统一 3:4，角色 cover，非角色 contain', () => {
  const result = runStyleDomProbe({
    name: 'assets-vertical-cards-geometry',
    styles: ASSETS_CSS,
    html: `
      <div class="omnimux-assets-main" style="width: 1200px;">
        <div class="omnimux-assets-grid" data-columns="3">
          <div class="omnimux-assets-masonry-col">
            <div class="omnimux-assets-focusable omnimux-assets-card omnimux-assets-card--character" style="width: 320px;">
              <div class="dshUk-MediaCard-coverWrapper" style="width: 100%;">
                <div class="omnimux-assets-card-thumb">
                  <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3C/svg%3E" class="omnimux-assets-card-media" alt="" />
                  <div class="omnimux-assets-card-overlay">
                    <div class="omnimux-assets-card-overlay-actions">
                      <button class="omnimux-assets-overlay-btn omnimux-assets-overlay-btn--secondary">查看详情</button>
                      <button class="omnimux-assets-overlay-btn omnimux-assets-overlay-btn--primary">添加到会话</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="omnimux-assets-card-body">
                <div class="omnimux-assets-card-title">科技 Vlogger-粉衣女郎 Yuna</div>
                <div class="omnimux-assets-card-desc">1小时前</div>
              </div>
            </div>
          </div>
          <div class="omnimux-assets-masonry-col">
            <div class="omnimux-assets-card omnimux-assets-card--scene" style="width: 320px;">
              <div class="dshUk-MediaCard-coverWrapper scene-cover"><div class="omnimux-assets-card-thumb"></div></div>
            </div>
            <div class="omnimux-assets-card omnimux-assets-card--prop" style="width: 320px;">
              <div class="dshUk-MediaCard-coverWrapper prop-cover">
                <div class="omnimux-assets-card-thumb"><img class="omnimux-assets-card-media prop-media" alt="" /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
    measure: () => {
      const card = document.querySelector('.omnimux-assets-card')
      const coverWrapper = document.querySelector('.dshUk-MediaCard-coverWrapper')
      const thumb = document.querySelector('.omnimux-assets-card-thumb')
      const img = document.querySelector('.omnimux-assets-card-media')
      const overlay = document.querySelector('.omnimux-assets-card-overlay')
      const title = document.querySelector('.omnimux-assets-card-title')
      const desc = document.querySelector('.omnimux-assets-card-desc')

      const coverRect = coverWrapper.getBoundingClientRect()

      return {
        cardWidth: card.offsetWidth,
        coverWidth: coverRect.width,
        coverHeight: coverRect.height,
        coverAspectRatio: getComputedStyle(coverWrapper).aspectRatio,
        thumbAspectRatio: getComputedStyle(thumb).aspectRatio,
        imgObjectFit: getComputedStyle(img).objectFit,
        imgObjectPosition: getComputedStyle(img).objectPosition,
        imgWidth: getComputedStyle(img).width,
        imgHeight: getComputedStyle(img).height,
        overlayPosition: getComputedStyle(overlay).position,
        titleFontWeight: getComputedStyle(title).fontWeight,
        descFontSize: getComputedStyle(desc).fontSize,
        descText: desc.textContent.trim(),
        sceneCoverAspectRatio: getComputedStyle(document.querySelector('.scene-cover')).aspectRatio,
        propCoverAspectRatio: getComputedStyle(document.querySelector('.prop-cover')).aspectRatio,
        propObjectFit: getComputedStyle(document.querySelector('.prop-media')).objectFit,
      }
    },
  })

  // 1. 验证所有卡片外框均严格符合 3:4 黄金竖版几何展台
  assert.equal(result.cardWidth, 320)
  assert.equal(result.coverAspectRatio, '3 / 4')
  assert.equal(result.sceneCoverAspectRatio, '3 / 4')
  assert.equal(result.propCoverAspectRatio, '3 / 4')
  assert.equal(result.thumbAspectRatio, '3 / 4')
  assert.ok(Math.abs(result.coverHeight - (result.coverWidth * 4) / 3) < 1.0, `高度期望为 4/3 宽，实际高度 ${result.coverHeight}`)

  // 2. 验证角色立绘 cover 撑满居上，非角色素材 contain 居中不裁切
  assert.equal(result.imgObjectFit, 'cover')
  assert.equal(result.imgObjectPosition, '50% 0%')
  assert.equal(result.propObjectFit, 'contain')
  assert.ok(Math.abs(parseFloat(result.imgHeight) - result.coverHeight) < 1.0, `图片高度期望填满封面容器高度，实际 ${result.imgHeight}`)

  // 3. 验证悬停浮层绝对定位充满
  assert.equal(result.overlayPosition, 'absolute')

  // 4. 验证副标题显示相对时间而非冗长描述
  assert.equal(result.descText, '1小时前')
  assert.equal(result.descFontSize, '12px')
})
