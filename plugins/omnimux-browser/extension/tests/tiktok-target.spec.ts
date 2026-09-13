// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  canonicalPostUrl,
  postIdFromUrl,
  resolveTargetPost,
} from '../src/content/tiktok-scene/target.ts'

const WATCH = 'https://www.tiktok.com/@cleanlife/video/7412345678901234567'
const PROFILE = 'https://www.tiktok.com/@cleanlife'
const GRID_POST = 'https://www.tiktok.com/@cleanlife/video/7419999999999999999'

describe('TikTok 目标作品判定 — 地址解析', () => {
  it('从作品地址里取出作品号', () => {
    expect(postIdFromUrl(WATCH)).toBe('7412345678901234567')
    expect(postIdFromUrl(GRID_POST)).toBe('7419999999999999999')
  })

  it('博主主页地址里没有作品号', () => {
    expect(postIdFromUrl(PROFILE)).toBeNull()
  })

  it('把带查询串或分享参数的地址收敛成规范作品地址', () => {
    expect(canonicalPostUrl(`${WATCH}?is_from_webapp=1&sender_device=pc`)).toBe(WATCH)
    expect(canonicalPostUrl(`https://www.tiktok.com/@cleanlife/photo/7412345678901234567`))
      .toBe('https://www.tiktok.com/@cleanlife/photo/7412345678901234567')
  })

  it('拒绝站外地址与无法还原作品号的短链', () => {
    expect(canonicalPostUrl('https://example.com/@a/video/7412345678901234567')).toBeNull()
    expect(canonicalPostUrl('https://vm.tiktok.com/ZMabcdefg/')).toBeNull()
  })
})

describe('TikTok 目标作品判定 — 优先级', () => {
  it('作品页直接取当前这条，不受页面其他链接干扰', () => {
    const target = resolveTargetPost({
      pageUrl: `${WATCH}?is_from_webapp=1`,
      hoveredHref: GRID_POST,
    })
    expect(target).toEqual({ url: WATCH, postId: '7412345678901234567' })
  })

  it('推荐页滚动后地址本身就是作品页，同样直接取用', () => {
    const target = resolveTargetPost({ pageUrl: WATCH })
    expect(target?.postId).toBe('7412345678901234567')
  })

  it('博主主页取鼠标指向的那条', () => {
    const target = resolveTargetPost({ pageUrl: PROFILE, hoveredHref: `${GRID_POST}?lang=zh` })
    expect(target).toEqual({ url: GRID_POST, postId: '7419999999999999999' })
  })

  it('博主主页没有指向时不给目标，绝不拿页面里第一条作品顶替', () => {
    expect(resolveTargetPost({ pageUrl: PROFILE })).toBeNull()
    expect(resolveTargetPost({ pageUrl: PROFILE, hoveredHref: PROFILE })).toBeNull()
  })

  it('搜索页、探索页这类没有当前作品的页面不给目标，避免下错作品', () => {
    expect(resolveTargetPost({ pageUrl: 'https://www.tiktok.com/search?q=clean' })).toBeNull()
    expect(resolveTargetPost({ pageUrl: 'https://www.tiktok.com/' })).toBeNull()
  })

  it('非 TikTok 页面一律不产生目标', () => {
    expect(resolveTargetPost({ pageUrl: 'https://x.com/home', hoveredHref: WATCH })).toBeNull()
  })
})
