// @ts-nocheck
// @vitest-environment jsdom
/**
 * Poster layout and rendering: wrapping, height, truncation, theme colours and
 * the canvas drawing contract. The canvas is a fake, so these assertions
 * describe geometry and text placement, not browser pixels.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  POSTER_HEADER_HEIGHT,
  POSTER_PADDING,
  POSTER_WATERMARK_HEIGHT,
  POSTER_WIDTH,
  fitPosterLines,
  measurePosterHeight,
  renderPoster,
  wrapPosterText,
} from '../src/content/twitter-poster/render.ts'
import { POSTER_THEMES } from '../src/content/twitter-poster/themes.ts'

class FakeContext {
  font = ''
  fillStyle = ''
  strokeStyle = ''
  lineWidth = 0
  textBaseline = 'top'
  textAlign = 'left'
  globalAlpha = 1
  texts = []
  rects = []
  fillCalls = 0
  charWidth = 20

  measureText(text) {
    return { width: Array.from(text).length * this.charWidth }
  }

  fillText(text) {
    this.texts.push({ text, fillStyle: this.fillStyle, font: this.font })
  }

  fillRect(_x, _y, _width, height) {
    this.rects.push({ fillStyle: this.fillStyle, height })
  }

  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  arcTo() {}
  arc() {}
  clip() {}
  save() {}
  restore() {}
  translate() {}
  scale() {}
  fill() { this.fillCalls += 1 }
  stroke() {}
  drawImage() {}
}

const SOURCE = {
  name: 'a',
  handle: 'b',
  avatar: 'https://pbs.twimg.com/x',
  verified: true,
  text: 'hello poster',
  url: 'https://x.com/b/status/1',
}

function fakeDeps(context) {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toDataURL: () => 'data:image/png;base64,AAAA',
  }
  return { createCanvas: () => canvas, loadImage: async () => null }
}

describe('wrapPosterText', () => {
  it('wraps by code point and preserves one blank line between paragraphs', () => {
    const measure = (value) => Array.from(value).length * 10
    assert.deepEqual(wrapPosterText('一二三四五六\n\n\n七八九', measure, 30), ['一二三', '四五六', '', '七八九'])
    assert.deepEqual(wrapPosterText('甲\n\n\n乙\n\n', measure, 100), ['甲', '', '乙'])
    assert.deepEqual(wrapPosterText('\n正文', measure, 100), ['正文'])
  })
})

describe('height and themes', () => {
  it('computes height from the fixed paddings and line count', () => {
    assert.equal(measurePosterHeight(0), POSTER_PADDING + POSTER_HEADER_HEIGHT + POSTER_WATERMARK_HEIGHT)
    assert.equal(POSTER_THEMES.light.background, '#ffffff')
    assert.equal(POSTER_THEMES.dark.background, '#0b0b0c')
  })

  it('truncates to the upload-friendly height and marks the cut', () => {
    const lines = Array.from({ length: 500 }, (_value, index) => `line-${index}`)
    const kept = fitPosterLines(lines)
    assert.ok(kept.length < lines.length)
    assert.ok(kept.at(-1).endsWith('…'))
  })
})

describe('renderPoster', () => {
  it('draws a light poster at the fixed width with the watermark', async () => {
    const context = new FakeContext()
    const result = await renderPoster(SOURCE, 'light', fakeDeps(context))
    assert.equal(result.width, POSTER_WIDTH)
    assert.equal(context.rects[0].fillStyle, '#ffffff')
    const text = context.texts.map((entry) => entry.text)
    assert.ok(text.includes('@b'))
    assert.ok(text.includes('hello poster'))
    assert.ok(text.includes('OmniMux'))
  })

  it('uses the dark token set for the dark theme', async () => {
    const context = new FakeContext()
    await renderPoster(SOURCE, 'dark', fakeDeps(context))
    assert.equal(context.rects[0].fillStyle, '#0b0b0c')
  })
})
