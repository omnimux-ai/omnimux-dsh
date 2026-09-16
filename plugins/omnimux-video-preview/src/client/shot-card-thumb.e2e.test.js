import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'
import { VIDEO_BREAKDOWN_CSS } from './styles.js'

const here = dirname(fileURLToPath(import.meta.url))

test('分镜卡片有截图时为左图右文，方图 72px', () => {
  const result = runStyleDomProbe({
    name: 'shot-card-left-thumb',
    styles: VIDEO_BREAKDOWN_CSS,
    html: `
      <div class="omnimux-video-breakdown-shot-card has-thumb" id="omnimux-shot-card-0">
        <div class="omnimux-video-breakdown-shot-thumb">
          <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="黄金前置视觉切入" />
        </div>
        <div class="omnimux-video-breakdown-shot-body">
          <div class="omnimux-video-breakdown-shot-header">
            <div class="omnimux-video-breakdown-shot-title-box">
              <span class="omnimux-video-breakdown-shot-time">0:00 - 0:03</span>
              <span class="omnimux-video-breakdown-shot-title">黄金前置视觉切入</span>
            </div>
          </div>
          <div class="omnimux-video-breakdown-shot-desc">开场通过高反差视觉与痛点切入抓取眼球。</div>
        </div>
      </div>`,
    measure: () => {
      const card = document.querySelector('.omnimux-video-breakdown-shot-card.has-thumb')
      const thumb = document.querySelector('.omnimux-video-breakdown-shot-thumb')
      const body = document.querySelector('.omnimux-video-breakdown-shot-body')
      const title = document.querySelector('.omnimux-video-breakdown-shot-title')
      const cardBox = card.getBoundingClientRect()
      const thumbBox = thumb.getBoundingClientRect()
      const bodyBox = body.getBoundingClientRect()
      return {
        display: getComputedStyle(card).display,
        thumbWidth: Math.round(thumbBox.width),
        thumbHeight: Math.round(thumbBox.height),
        thumbLeftOfBody: thumbBox.right <= bodyBox.left + 1,
        titleVisible: title.getBoundingClientRect().width > 0,
        positiveGeometry: cardBox.width > 0 && cardBox.height > 0 && thumbBox.width > 0 && thumbBox.height > 0,
      }
    },
  })

  assert.equal(result.display, 'flex')
  assert.equal(result.thumbWidth, 72)
  assert.equal(result.thumbHeight, 72)
  assert.equal(result.thumbLeftOfBody, true)
  assert.equal(result.titleVisible, true)
  assert.equal(result.positiveGeometry, true)
})

test('分镜卡片源码把缩略图放在文字左侧', () => {
  const source = readFileSync(join(here, 'viewer/ShotCard.jsx'), 'utf8')
  assert.match(source, /ShotFrameThumb/)
  assert.match(source, /omnimux-video-breakdown-shot-body/)
  const thumbAt = source.indexOf('<ShotFrameThumb')
  const bodyAt = source.indexOf('omnimux-video-breakdown-shot-body')
  assert.ok(thumbAt > 0 && bodyAt > thumbAt, '缩略图必须写在文字区之前')
})
