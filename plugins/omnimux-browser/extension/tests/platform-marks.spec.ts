// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { PLATFORM_GLYPHS, platformGlyph } from '../src/panel/platform-marks.ts'

describe('平台标识图形 — 按平台取图', () => {
  it('TikTok 与 X 用的是两个不同的图形', () => {
    expect(platformGlyph('tiktok').path).not.toBe(platformGlyph('twitter').path)
  })

  it('TikTok 图形有实际路径数据，不是空壳', () => {
    const tiktok = platformGlyph('tiktok')
    expect(tiktok.path.length).toBeGreaterThan(20)
    expect(tiktok.viewBox).toMatch(/^0 0 \d+ \d+$/)
  })

  it('表里每个平台的图形互不重复', () => {
    const paths = Object.values(PLATFORM_GLYPHS).map((glyph) => glyph.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe('平台标识图形 — 回落', () => {
  it('未知平台回落到通用网页图形，绝不再回落成 X', () => {
    const generic = platformGlyph('a-platform-nobody-has-heard-of')
    expect(generic).toEqual(PLATFORM_GLYPHS.generic)
    expect(generic.path).not.toBe(PLATFORM_GLYPHS.twitter.path)
  })

  it('尚未配图的已知平台（知乎、微信）同样回落成通用图形而不是 X', () => {
    for (const platform of ['zhihu', 'wechat', 'generic']) {
      expect(platformGlyph(platform).path).not.toBe(PLATFORM_GLYPHS.twitter.path)
    }
  })

  it('空串与缺省值都走通用图形，不会抛错', () => {
    expect(platformGlyph('')).toEqual(PLATFORM_GLYPHS.generic)
    expect(platformGlyph(undefined)).toEqual(PLATFORM_GLYPHS.generic)
  })

  it('大小写与首尾空格不影响取图', () => {
    expect(platformGlyph(' TikTok ')).toEqual(PLATFORM_GLYPHS.tiktok)
    expect(platformGlyph('TWITTER')).toEqual(PLATFORM_GLYPHS.twitter)
  })
})
