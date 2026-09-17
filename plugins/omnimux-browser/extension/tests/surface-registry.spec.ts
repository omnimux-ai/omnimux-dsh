// @vitest-environment jsdom
/**
 * The surface registry: which entry belongs on which page, and where it sits.
 *
 * The consumed matrix is the product decision recorded in
 * `specs/browser-surfaces.spec.md` §4.4; these cases are that table written
 * twice so a change to either one fails.
 */
import { describe, expect, it } from 'vitest'
import {
  mediaTriggerFor,
  sceneTriggerFor,
  surfaceAllowanceFor,
  surfaceAllowed,
} from '../src/content/surfaces/registry.ts'
import { workCardSelectorFor } from '../src/content/surfaces/media-trigger.ts'
import {
  MEDIA_TRIGGER_SIZE_PX,
  SURFACE_SIZE_CEILING_PX,
  SURFACE_SIZE_FLOOR_PX,
  resolveContainerCornerOffset,
  resolveSurfaceSizePx,
  resolveToolbarSide,
} from '../src/content/surfaces/types.ts'
import type { SurfacePageFacts } from '../src/content/surfaces/registry.ts'

function tiktok(pathname: string): SurfacePageFacts {
  return { platform: 'tiktok', pageType: 'unknown', pathname }
}

describe('TikTok 消费矩阵', () => {
  it('信息流拿悬浮球与场景钮，不拿卡片钮', () => {
    for (const path of ['/', '/foryou', '/following']) {
      const facts = tiktok(path)
      expect(surfaceAllowanceFor(facts).kinds, path).toEqual(['brand-fab', 'scene-fixed'])
      expect(mediaTriggerFor(facts), path).toBeNull()
      expect(sceneTriggerFor(facts), path).not.toBeNull()
    }
  })

  it('单个作品拿悬浮球与场景钮', () => {
    for (const path of ['/@cleanlife/video/7412345678901234567', '/@cleanlife/photo/7412345678901234567']) {
      const facts = tiktok(path)
      expect(surfaceAllowed(facts, 'scene-fixed'), path).toBe(true)
      expect(surfaceAllowed(facts, 'media-trigger'), path).toBe(false)
    }
  })

  it('网格页拿悬浮球与卡片钮，不拿场景钮', () => {
    for (const path of ['/@cleanlife', '/search', '/search?q=skincare', '/explore']) {
      const facts = tiktok(path)
      expect(surfaceAllowanceFor(facts).kinds, path).toEqual(['brand-fab', 'media-trigger'])
      expect(sceneTriggerFor(facts), path).toBeNull()
      expect(mediaTriggerFor(facts), path).not.toBeNull()
    }
  })

  it('卡片钮默认落在右上角，且靠悬停出现、靠悬停展开', () => {
    const descriptor = mediaTriggerFor(tiktok('/@cleanlife'))
    expect(descriptor?.placement).toEqual({ strategy: 'container-corner', corner: 'top-right' })
    expect(descriptor?.reveal).toBe('hover-container')
    expect(descriptor?.expand).toBe('hover-self')
  })

  it('没有规则认领的路径只拿悬浮球', () => {
    expect(surfaceAllowanceFor(tiktok('/messages')).kinds).toEqual(['brand-fab'])
  })

  it('其他平台只有悬浮球', () => {
    for (const platform of ['twitter', 'zhihu', 'wechat', 'generic']) {
      const facts: SurfacePageFacts = { platform, pageType: 'home', pathname: '/' }
      expect(surfaceAllowanceFor(facts).kinds, platform).toEqual(['brand-fab'])
      expect(mediaTriggerFor(facts), platform).toBeNull()
      expect(sceneTriggerFor(facts), platform).toBeNull()
    }
  })

  it('卡片选择器只认 TikTok', () => {
    expect(workCardSelectorFor('www.tiktok.com')).toContain('user-post-item')
    expect(workCardSelectorFor('tiktok.com')).toContain('search-card-container')
    expect(workCardSelectorFor('nottiktok.com')).toBeNull()
    expect(workCardSelectorFor('www.x.com')).toBeNull()
  })
})

describe('尺寸与位置解析', () => {
  it('预设取表里的像素，覆盖值优先', () => {
    expect(resolveSurfaceSizePx({ preset: 'md' }, MEDIA_TRIGGER_SIZE_PX)).toBe(MEDIA_TRIGGER_SIZE_PX.md)
    expect(resolveSurfaceSizePx({ preset: 'sm' }, MEDIA_TRIGGER_SIZE_PX)).toBe(MEDIA_TRIGGER_SIZE_PX.sm)
    expect(resolveSurfaceSizePx({ preset: 'sm', px: 33 }, MEDIA_TRIGGER_SIZE_PX)).toBe(33)
  })

  it('覆盖值被钳制在可点可用的范围里', () => {
    expect(resolveSurfaceSizePx({ preset: 'md', px: 2 }, MEDIA_TRIGGER_SIZE_PX)).toBe(SURFACE_SIZE_FLOOR_PX)
    expect(resolveSurfaceSizePx({ preset: 'md', px: 900 }, MEDIA_TRIGGER_SIZE_PX)).toBe(SURFACE_SIZE_CEILING_PX)
  })

  it('四角偏移都留出同样的内边距', () => {
    const box = { width: 200, height: 120 }
    expect(resolveContainerCornerOffset('top-left', box, 32)).toEqual({ left: 8, top: 8 })
    expect(resolveContainerCornerOffset('top-right', box, 32)).toEqual({ left: 160, top: 8 })
    expect(resolveContainerCornerOffset('bottom-left', box, 32)).toEqual({ left: 8, top: 80 })
    expect(resolveContainerCornerOffset('bottom-right', box, 32)).toEqual({ left: 160, top: 80 })
  })

  it('容器比标记还小时夹到左上角，不出现负偏移', () => {
    expect(resolveContainerCornerOffset('bottom-right', { width: 20, height: 20 }, 32)).toEqual({ left: 0, top: 0 })
  })

  it('工具栏朝页面内侧展开', () => {
    // 横向背离所在边；纵向让工具栏留在容器里（贴顶时底边对齐标记）。
    expect(resolveToolbarSide('top-right')).toEqual({ horizontal: 'left', vertical: 'bottom' })
    expect(resolveToolbarSide('top-left')).toEqual({ horizontal: 'right', vertical: 'bottom' })
    expect(resolveToolbarSide('bottom-right')).toEqual({ horizontal: 'left', vertical: 'top' })
    expect(resolveToolbarSide('bottom-left')).toEqual({ horizontal: 'right', vertical: 'top' })
  })
})
