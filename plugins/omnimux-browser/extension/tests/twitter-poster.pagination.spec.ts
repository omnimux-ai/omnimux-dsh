// @ts-nocheck
// @vitest-environment jsdom
/**
 * Long-form pagination contract for the X poster.
 *
 * The single-page poster keeps its existing 1280×3974 behavior. Any body that
 * crosses the 53-line single-page cap must become an ordered set of 3:4 pages
 * instead of a truncated image.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  POSTER_PAGE_HEIGHT,
  POSTER_PAGE_MAX_PAGES,
  POSTER_PAGE_WIDTH,
  PosterTooLongError,
  measurePosterHeight,
  paginatePosterParagraphs,
  renderPosterPages,
} from '../src/content/twitter-poster/render.ts'

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
  name: 'Frank Wang 玉伯',
  handle: 'lifesinger',
  avatar: '',
  verified: false,
  text: 'short post',
  url: 'https://x.com/lifesinger/status/1',
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

describe('paginatePosterParagraphs', () => {
  it('keeps paragraphs together when they fit one page', () => {
    const pages = paginatePosterParagraphs(
      [['a1', 'a2'], ['b1'], ['c1', 'c2']],
      100,
      10,
      4,
    )
    assert.deepEqual(pages, [[['a1', 'a2'], ['b1'], ['c1', 'c2']]])
  })

  it('starts a new page at a paragraph boundary', () => {
    const pages = paginatePosterParagraphs(
      [['a1', 'a2', 'a3'], ['b1', 'b2']],
      30,
      10,
      0,
    )
    assert.deepEqual(pages, [[['a1', 'a2', 'a3']], [['b1', 'b2']]])
  })

  it('splits one overlong paragraph by line without dropping text', () => {
    const pages = paginatePosterParagraphs([['a1', 'a2', 'a3']], 20, 10, 0)
    assert.deepEqual(pages, [[['a1', 'a2']], [['a3']]])
  })
})

describe('renderPosterPages', () => {
  it('leaves short content as one legacy page', async () => {
    const context = new FakeContext()
    const pages = await renderPosterPages(SOURCE, 'light', fakeDeps(context))
    assert.equal(pages.length, 1)
    assert.equal(pages[0].width, 1280)
    assert.equal(pages[0].height, measurePosterHeight(1))
    assert.equal(pages[0].page, 1)
    assert.equal(pages[0].pageCount, 1)
  })

  it('moves just-over-limit content to a long page without splitting it', async () => {
    const exact = await renderPosterPages({ ...SOURCE, text: '长'.repeat(53 * 54) }, 'light', fakeDeps(new FakeContext()))
    assert.equal(exact.length, 1)
    assert.equal(exact[0].width, 1280)

    const over = await renderPosterPages({ ...SOURCE, text: '长'.repeat(53 * 54 + 1) }, 'light', fakeDeps(new FakeContext()))
    assert.equal(over.length, 1)
    assert.equal(over[0].width, POSTER_PAGE_WIDTH)
  })

  it('turns long content into ordered 1920×2560 pages with page numbers', async () => {
    const context = new FakeContext()
    const source = { ...SOURCE, text: '长'.repeat(6000) }
    const pages = await renderPosterPages(source, 'dark', fakeDeps(context))
    assert.equal(pages.length > 1, true)
    assert.equal(pages.length <= POSTER_PAGE_MAX_PAGES, true)
    for (const page of pages) {
      assert.equal(page.width, POSTER_PAGE_WIDTH)
      assert.equal(page.height, POSTER_PAGE_HEIGHT)
    }
    assert.deepEqual(
      pages.map((page) => page.page),
      pages.map((_page, index) => index + 1),
    )
    const text = context.texts.map((entry) => entry.text)
    assert.equal(text.includes(`1 / ${pages.length}`), true)
    assert.equal(text.includes('OmniMux'), true)
  })

  it('refuses content that cannot fit four pages', async () => {
    const context = new FakeContext()
    const source = { ...SOURCE, text: '长'.repeat(50_000) }
    let caught = null
    try {
      await renderPosterPages(source, 'light', fakeDeps(context))
    } catch (error) {
      caught = error
    }
    assert.equal(caught instanceof PosterTooLongError, true)
    assert.equal(caught?.name, 'PosterTooLongError')
  })
})
