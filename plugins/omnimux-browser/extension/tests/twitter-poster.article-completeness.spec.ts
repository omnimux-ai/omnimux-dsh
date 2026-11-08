// @ts-nocheck
// @vitest-environment jsdom
/**
 * Completeness proof for the actual X Article body used in issue #4001:
 * the renderer must draw every wrapped body line across the pages, not merely
 * return the right page count and dimensions.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'
import {
  POSTER_PAGE_PADDING,
  POSTER_PAGE_WIDTH,
  renderPosterPages,
  wrapPosterParagraphs,
} from '../src/content/twitter-poster/render.ts'

const FIXTURE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'x-article-poster-pagination.json')
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
const SOURCE_TEXT = [fixture.title, ...fixture.blocks].join('\n\n')
const SOURCE = {
  name: 'Frank Wang 玉伯',
  handle: 'lifesinger',
  avatar: '',
  verified: false,
  text: SOURCE_TEXT,
  url: 'https://x.com/lifesinger/status/2118936739654046143',
}

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
    this.texts.push(text)
  }

  fillRect() {}
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
  fill() {}
  stroke() {}
  drawImage() {}
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

describe('actual X Article body completeness', () => {
  it('draws every wrapped body line across the pages', async () => {
    const context = new FakeContext()
    const pages = await renderPosterPages(SOURCE, 'light', fakeDeps(context))
    const expectedParagraphs = wrapPosterParagraphs(
      SOURCE_TEXT,
      (value) => Array.from(value).length * 20,
      POSTER_PAGE_WIDTH - POSTER_PAGE_PADDING * 2,
    )
    const expected = expectedParagraphs.flat().join('')
    const headerLines = new Set([SOURCE.name, '@lifesinger', 'OmniMux', Array.from(SOURCE.name)[0]])
    const bodyLines = context.texts.filter(
      (line) => !headerLines.has(line) && !/^\d+ \/ \d+$/.test(line),
    )

    assert.equal(SOURCE_TEXT.length, 9469)
    assert.equal(pages.length, 4)
    assert.equal(bodyLines.join(''), expected)
    assert.equal(bodyLines.join('').endsWith(fixture.blocks.at(-1).slice(-30)), true)
  })
})
