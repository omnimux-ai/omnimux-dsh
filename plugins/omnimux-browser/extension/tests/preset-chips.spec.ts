// @vitest-environment jsdom
/**
 * The preset chips a page scene gets.
 *
 * The panel groups shortcuts by `platform:pageType` and falls back through the
 * platform's home group to the generic web presets. TikTok only ever had a
 * detail-page group, so a creator profile silently served the generic web
 * buttons — the fallback working exactly as designed, on a scene nobody had
 * configured.
 */

import { describe, it, expect } from 'vitest'
import { PRESET_LIBRARY, presetChipsFor } from '../src/panel/components/PresetChips.tsx'
import type { PageSceneInfo } from '../src/panel/components/SceneBadge.tsx'

function scene(over: Partial<PageSceneInfo> = {}): PageSceneInfo {
  return {
    url: 'https://www.tiktok.com/@gethullo',
    title: 'Hullo (@gethullo) | TikTok',
    platform: 'tiktok',
    pageType: 'profile',
    author: 'gethullo',
    ...over,
  }
}

describe('账号主页快捷预设 — 分组', () => {
  it('TikTok 账号主页有自己的分组，不再落到通用预设', () => {
    const chips = presetChipsFor(scene())
    expect(chips).toBe(PRESET_LIBRARY['tiktok:profile'])
    expect(chips).not.toBe(PRESET_LIBRARY.generic)
  })

  it('给出三个面向账号的入口，id 互不重复', () => {
    const ids = presetChipsFor(scene()).map((chip) => chip.id)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
  })

  it('与作品页预设不共用 id，避免两套意图混在一起', () => {
    const profileIds = presetChipsFor(scene()).map((chip) => chip.id)
    const detailIds = presetChipsFor(scene({ pageType: 'detail' })).map((chip) => chip.id)
    for (const id of profileIds) expect(detailIds).not.toContain(id)
  })

  it('认不出的场景仍回落到通用预设，面板不会空', () => {
    expect(presetChipsFor(scene({ platform: 'generic', pageType: 'unknown' })).length).toBeGreaterThan(0)
    expect(presetChipsFor(scene({ pageType: 'unknown' })).length).toBeGreaterThan(0)
  })
})

describe('账号主页快捷预设 — 条目质量', () => {
  it('每条都有中英标签与图标', () => {
    for (const chip of presetChipsFor(scene())) {
      expect(chip.labelZh, chip.id).not.toBe('')
      expect(chip.labelEn, chip.id).not.toBe('')
      expect(chip.icon, chip.id).toBeTypeOf('function')
    }
  })

  it('中英两版模板都能插值成可发送的指令，并带上当前账号', () => {
    for (const chip of presetChipsFor(scene())) {
      const zh = chip.promptTemplateZh(scene())
      const en = chip.promptTemplateEn(scene())
      expect(zh.length, chip.id).toBeGreaterThan(30)
      expect(en.length, chip.id).toBeGreaterThan(30)
      expect(zh, chip.id).toContain('gethullo')
      expect(en, chip.id).toContain('gethullo')
    }
  })

  it('模板里不残留占位符或没替换掉的插值', () => {
    for (const chip of presetChipsFor(scene())) {
      for (const text of [chip.promptTemplateZh(scene()), chip.promptTemplateEn(scene())]) {
        expect(text, chip.id).not.toMatch(/\$\{|\{\{|TODO|占位/)
        expect(text, chip.id).not.toContain('undefined')
      }
    }
  })

  it('账号信息缺失时不产出 undefined 或空的 @ 号', () => {
    const anonymous = scene({ author: undefined, title: '', postText: undefined })
    for (const chip of presetChipsFor(anonymous)) {
      for (const text of [chip.promptTemplateZh(anonymous), chip.promptTemplateEn(anonymous)]) {
        expect(text, chip.id).not.toContain('undefined')
        expect(text, chip.id).not.toMatch(/@\s/)
      }
    }
  })

  it('账号主页给的是账号向指令，措辞与通用网页预设明确不同', () => {
    const texts = presetChipsFor(scene()).map((chip) => chip.promptTemplateZh(scene())).join('\n')
    // Content-level on purpose: if the profile group is ever deleted, the panel
    // falls back to the generic presets and this fails, whereas assertions that
    // compare against the table itself would keep passing.
    expect(texts).toMatch(/内容支柱|KOL 层级|对标/)
    expect(texts).not.toContain('提炼其核心论点')
  })

  it('报价指令要求标注口径并给区间，不允许甩一个确定数字', () => {
    const collab = presetChipsFor(scene()).find((chip) => chip.id === 'tt_profile_collab')
    expect(collab, 'collab preset missing').toBeDefined()
    for (const text of [collab!.promptTemplateZh(scene()), collab!.promptTemplateEn(scene())]) {
      expect(text).toMatch(/口径|basis/)
      expect(text).toMatch(/区间|range/)
    }
  })

  it('对标指令说明数据拿不到时如实标注，而不是估算成精确值', () => {
    const bench = presetChipsFor(scene()).find((chip) => chip.id === 'tt_profile_benchmark')
    expect(bench, 'benchmark preset missing').toBeDefined()
    expect(bench!.promptTemplateZh(scene())).toMatch(/无公开数据/)
    expect(bench!.promptTemplateEn(scene())).toMatch(/not public|unavailable/)
    // The host exposes web_search but not web_fetch, so the instruction must not
    // lead with a tool that is not there.
    expect(bench!.promptTemplateZh(scene())).toMatch(/搜索/)
    expect(bench!.promptTemplateEn(scene())).toMatch(/search/)
  })
})
