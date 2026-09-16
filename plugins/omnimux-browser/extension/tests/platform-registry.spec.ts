// @vitest-environment jsdom
/**
 * The platform table: who owns a host, and which anchor chain a layout gets.
 *
 * These are the two questions every consumer asks, and both used to be answered
 * by a different `if` in each consumer. A wrong answer here is not a wrong
 * pixel — it is a mark placed by another platform's rules, or a platform that
 * silently never matches because its suffix was spelled with a wildcard.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  PLATFORM_REGISTRY,
  anchorChainFor,
  detectPageType,
  normalizePlatformHost,
  platformById,
  platformForHost,
} from '../src/platform/registry.ts'
import { PLATFORM_GLYPHS } from '../src/panel/platform-marks.ts'
import type { AnchorLayout } from '../src/platform/anchor.ts'

/** Every layout a chain can be asked for, so no case forgets one. */
const LAYOUTS: readonly AnchorLayout[] = ['side-rail', 'unknown']

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('平台表 — 身份', () => {
  it('五个平台各一条，generic 用于兜底因此排在最后', () => {
    expect(PLATFORM_REGISTRY.map((entry) => entry.id))
      .toEqual(['twitter', 'tiktok', 'zhihu', 'wechat', 'generic'])
  })

  it('每条都带齐契约要求的字段', () => {
    for (const entry of PLATFORM_REGISTRY) {
      expect(typeof entry.id).toBe('string')
      expect(entry.label.full.length).toBeGreaterThan(0)
      expect(entry.label.short.length).toBeGreaterThan(0)
      expect(Array.isArray(entry.hosts)).toBe(true)
      expect(entry.pageTypes.length).toBeGreaterThan(0)
      expect(entry.glyph.viewBox.length).toBeGreaterThan(0)
      expect(entry.glyph.path.length).toBeGreaterThan(0)
      expect(entry.inputSelectors.length).toBeGreaterThan(0)
      expect(entry.anchor.brand.default.length).toBeGreaterThan(0)
    }
  })

  it('主机名归一化去掉一层 www 并统一小写', () => {
    expect(normalizePlatformHost('WWW.TikTok.com')).toBe('tiktok.com')
    expect(normalizePlatformHost('  www.x.com  ')).toBe('x.com')
    // 只去一层：`www.www.x.com` 是真的子域，不是同一种写法。
    expect(normalizePlatformHost('www.www.x.com')).toBe('www.x.com')
  })

  it('子域名归到同一个平台', () => {
    expect(platformForHost('www.tiktok.com').id).toBe('tiktok')
    expect(platformForHost('m.tiktok.com').id).toBe('tiktok')
    expect(platformForHost('tiktok.com').id).toBe('tiktok')
    expect(platformForHost('mobile.twitter.com').id).toBe('twitter')
    expect(platformForHost('www.zhihu.com').id).toBe('zhihu')
    expect(platformForHost('mp.weixin.qq.com').id).toBe('wechat')
    expect(platformForHost('weixin.qq.com').id).toBe('wechat')
  })

  it('后缀判定带点边界：邻居域名不是这个平台', () => {
    expect(platformForHost('nottiktok.com').id).toBe('generic')
    expect(platformForHost('x.com.evil.example').id).toBe('generic')
    expect(platformForHost('zhihu.com.cn').id).toBe('generic')
  })

  it('平台查得到，未知 id 抛错而不是悄悄给一条别的', () => {
    expect(platformById('tiktok').id).toBe('tiktok')
    expect(() => platformById('myspace' as 'tiktok')).toThrow()
  })

  it('未知平台画网页图形，不画成 X', () => {
    // 两条品牌路径直接取自 platform-marks，同一份数据两处引用而非两次抄写。
    expect(platformById('twitter').glyph).toBe(PLATFORM_GLYPHS.twitter)
    expect(platformById('tiktok').glyph).toBe(PLATFORM_GLYPHS.tiktok)
    // 知乎与微信还没有校对过的品牌图形，显式等于网页图形。
    expect(platformById('zhihu').glyph).toBe(PLATFORM_GLYPHS.generic)
    expect(platformById('wechat').glyph).toBe(PLATFORM_GLYPHS.generic)
    expect(platformById('generic').glyph).toBe(PLATFORM_GLYPHS.generic)
  })
})

describe('平台表 — 锚点链', () => {
  it('X 的品牌链三种布局同一个答案（抽屉成列，兜底右下角）', () => {
    const spec = platformById('twitter').anchor
    const expected = spec.brand.default
    expect(expected).toHaveLength(3)
    expect(expected[2]).toBe('viewport-corner-right')
    for (const layout of LAYOUTS) {
      expect(anchorChainFor(spec, 'brand', layout)).toEqual(expected)
    }
  })

  it('X 没有场景触发器，问它要就是 null', () => {
    expect(anchorChainFor(platformById('twitter').anchor, 'scene', 'side-rail')).toBeNull()
  })

  it('TikTok 的场景触发器两种布局都以头像为先，只有兜底按布局分派', () => {
    const spec = platformById('tiktok').anchor
    expect(anchorChainFor(spec, 'scene', 'side-rail')).toEqual(['avatar-above', 'side-rail-parking'])
    expect(anchorChainFor(spec, 'scene', 'unknown')).toEqual(['avatar-above', 'viewport-corner-left'])
  })

  it('TikTok 的品牌标记每种布局都保持右下角（本次不改 FAB 在 TikTok 上的位置）', () => {
    const spec = platformById('tiktok').anchor
    for (const layout of LAYOUTS) {
      expect(anchorChainFor(spec, 'brand', layout)).toEqual(['viewport-corner-right'])
    }
  })
})

describe('平台表 — 页面类型', () => {
  it('TikTok 作品页 / 主页 / 推荐流', () => {
    const entry = platformById('tiktok')
    expect(detectPageType(entry, '/@me/video/741', document)).toBe('detail')
    expect(detectPageType(entry, '/@me/photo/741', document)).toBe('detail')
    expect(detectPageType(entry, '/@me', document)).toBe('profile')
    expect(detectPageType(entry, '/', document)).toBe('home')
    expect(detectPageType(entry, '/foryou', document)).toBe('home')
  })

  it('X 的状态页与保留段之外的单个路径段是主页', () => {
    const entry = platformById('twitter')
    expect(detectPageType(entry, '/me/status/1', document)).toBe('status')
    expect(detectPageType(entry, '/me', document)).toBe('profile')
    expect(detectPageType(entry, '/settings', document)).toBe('unknown')
  })

  it('知乎什么都认不出时是文章，不是未知', () => {
    expect(detectPageType(platformById('zhihu'), '/question/1', document)).toBe('status')
    expect(detectPageType(platformById('zhihu'), '/anything/else', document)).toBe('article')
  })

  it('微信公众号的文章页由路径或页面里的标题节点认出来', () => {
    const entry = platformById('wechat')
    expect(detectPageType(entry, '/s?__biz=1', document)).toBe('article')
    document.body.innerHTML = '<h1 id="activity-name">标题</h1>'
    expect(detectPageType(entry, '/short/abc', document)).toBe('article')

    // 分享链改写后地址里没有 `/s`，页面也不再渲染标题节点时，这条什么也不认。
    document.body.innerHTML = ''
    expect(detectPageType(entry, '/other', document)).toBe('unknown')
  })
})
