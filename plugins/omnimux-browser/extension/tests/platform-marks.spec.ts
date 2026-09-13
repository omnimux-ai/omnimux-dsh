// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { PLATFORM_GLYPHS, platformGlyph } from '../src/panel/platform-marks.ts'

/**
 * Frozen opening of each brand path.
 *
 * Deliberately literals rather than `PLATFORM_GLYPHS.twitter.path`: an assertion
 * whose expected value comes from the table under test cannot tell "the fallback
 * is wrong" apart from "the table changed", so it would pass while X pages
 * rendered the web mark.
 */
const X_PREFIX = 'M18.244 2.25'
const TIKTOK_PREFIX = 'M8 3v7.2'

describe('平台标识图形 — 按平台取图', () => {
  it('X 页面拿到 X 的图形', () => {
    expect(platformGlyph('twitter').path.startsWith(X_PREFIX)).toBe(true)
  })

  it('TikTok 页面拿到 TikTok 的图形，不是 X 的', () => {
    const tiktok = platformGlyph('tiktok')
    expect(tiktok.path.startsWith(TIKTOK_PREFIX)).toBe(true)
    expect(tiktok.path.startsWith(X_PREFIX)).toBe(false)
  })

  it('大小写与首尾空格不影响取图', () => {
    expect(platformGlyph(' TikTok ').path.startsWith(TIKTOK_PREFIX)).toBe(true)
    expect(platformGlyph('TWITTER').path.startsWith(X_PREFIX)).toBe(true)
  })
})

describe('平台标识图形 — 表自身的完整性', () => {
  it('表里每个平台都给出非空路径与合法 viewBox', () => {
    for (const [name, glyph] of Object.entries(PLATFORM_GLYPHS)) {
      expect(glyph.path.length, name).toBeGreaterThan(20)
      expect(glyph.viewBox, name).toMatch(/^0 0 \d+ \d+$/)
    }
  })

  it('没有任何两个平台共用同一段路径', () => {
    const paths = Object.values(PLATFORM_GLYPHS).map((glyph) => glyph.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe('平台标识图形 — 回落', () => {
  it('未知平台回落到通用网页图形，绝不回落成 X', () => {
    const generic = platformGlyph('a-platform-nobody-has-heard-of')
    expect(generic).toEqual(PLATFORM_GLYPHS.generic)
    expect(generic.path.startsWith(X_PREFIX)).toBe(false)
  })

  it('尚未配图的已知平台（知乎、微信）同样走通用图形而不是 X', () => {
    for (const platform of ['zhihu', 'wechat']) {
      const glyph = platformGlyph(platform)
      expect(glyph).toEqual(PLATFORM_GLYPHS.generic)
      expect(glyph.path.startsWith(X_PREFIX)).toBe(false)
    }
  })

  it('空串与缺省值都走通用图形，不会抛错', () => {
    expect(platformGlyph('')).toEqual(PLATFORM_GLYPHS.generic)
    expect(platformGlyph(undefined)).toEqual(PLATFORM_GLYPHS.generic)
  })

  it('原型链上的名字也必须回落通用图形，否则会渲染出没有路径的空图标', () => {
    for (const platform of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const glyph = platformGlyph(platform)
      expect(glyph, platform).toEqual(PLATFORM_GLYPHS.generic)
      expect(glyph.path, platform).toBeTypeOf('string')
      expect(glyph.viewBox, platform).toMatch(/^0 0 \d+ \d+$/)
    }
  })
})
