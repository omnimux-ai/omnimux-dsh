import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  QUICK_SHORTCUTS,
  QUICK_SHORTCUT_ARROW_ICON,
  applyQuickShortcut,
  clearQuickShortcutSkill,
  quickShortcutDefaultLinks,
  quickShortcutLinks,
  resolveQuickShortcuts,
} from './catalog.js'

/** 技能库全量可用时的解析器：按 slug 原样回一份技能身份。 */
const fullLibrary = (slug) => ({ slug, name: slug, title: slug })

describe('四条快捷方式的映射真源', () => {
  it('id / 显示名 key / 提示语 / 技能 slug / 链接 / 模型与参数 / 图标 与规格逐条一致', () => {
    const rows = QUICK_SHORTCUTS.map((entry) => ({
      id: entry.id,
      labelKey: entry.labelKey,
      prompt: entry.prompt,
      skillSlug: entry.skillSlug,
      links: quickShortcutLinks(entry),
      showModelControls: entry.showModelControls,
      icon: entry.icon,
    }))
    assert.deepEqual(rows, [
      {
        id: 'clone',
        labelKey: 'quickShortcuts.clone',
        prompt: '请用我的产品复刻这个爆款视频',
        skillSlug: 'replicate-viral-video',
        links: ['video', 'product'],
        showModelControls: true,
        icon: 'film',
      },
      {
        id: 'breakdown',
        labelKey: 'quickShortcuts.breakdown',
        prompt: '请帮我分析拆解这个视频。',
        skillSlug: 'video-hook-analysis',
        links: ['video'],
        showModelControls: false,
        icon: 'text-search',
      },
      {
        id: 'selling',
        labelKey: 'quickShortcuts.selling',
        prompt: '请帮我一键生成一条带货视频。',
        skillSlug: 'create-selling-video',
        links: ['product', 'video'],
        showModelControls: true,
        icon: 'workflow',
      },
      {
        id: 'reverse',
        labelKey: 'quickShortcuts.reverse',
        prompt: '请把这个视频反推成 Seedance 可用的 AI 提示词。',
        skillSlug: 'reverse-video-prompt',
        links: ['video'],
        showModelControls: false,
        icon: 'sparkles',
      },
    ])
  })

  it('四条各有一枚不同的图标，行尾箭头另有其名', () => {
    const icons = QUICK_SHORTCUTS.map((entry) => entry.icon)
    assert.equal(new Set(icons).size, 4, '四条快捷方式不得复用同一枚图标')
    assert.equal(QUICK_SHORTCUT_ARROW_ICON, 'move-up-right')
    assert.ok(!icons.includes(QUICK_SHORTCUT_ARROW_ICON), '行尾箭头不得与条目图标重名')
  })

  it('只有 clone 与 selling 显示模型与参数按钮', () => {
    const withControls = QUICK_SHORTCUTS.filter((entry) => entry.showModelControls).map((entry) => entry.id)
    assert.deepEqual(withControls, ['clone', 'selling'])
  })
})

describe('技能缺失即不渲染', () => {
  it('技能库全量可用时四条全部产出，且每条挂上解析出的技能身份', () => {
    const resolved = resolveQuickShortcuts(fullLibrary)
    assert.deepEqual(resolved.map((entry) => entry.id), ['clone', 'breakdown', 'selling', 'reverse'])
    assert.equal(resolved[0].skill.slug, 'replicate-viral-video')
    assert.equal(resolved[3].skill.slug, 'reverse-video-prompt')
  })

  it('缺失的那条不进入结果，其余照常产出', () => {
    const resolved = resolveQuickShortcuts((slug) => (slug === 'create-selling-video' ? null : { slug }))
    assert.deepEqual(resolved.map((entry) => entry.id), ['clone', 'breakdown', 'reverse'])
  })

  it('技能库整体不可用时返回空列表且不抛错', () => {
    assert.deepEqual(resolveQuickShortcuts(() => null), [])
    assert.deepEqual(resolveQuickShortcuts(() => undefined), [])
    assert.deepEqual(resolveQuickShortcuts(() => {
      throw new Error('skill library unavailable')
    }), [])
    assert.deepEqual(resolveQuickShortcuts(undefined), [])
  })
})

describe('切换互斥与取消技能', () => {
  it('从一条切到另一条：链接整组替换', () => {
    const first = applyQuickShortcut(null, 'clone')
    assert.deepEqual(first, { activeId: 'clone', links: ['video', 'product'] })
    const second = applyQuickShortcut(first.activeId, 'breakdown')
    assert.deepEqual(second, { activeId: 'breakdown', links: ['video'] })
  })

  it('再点同一条即取消，链接清空', () => {
    assert.deepEqual(applyQuickShortcut('selling', 'selling'), { activeId: null, links: [] })
  })

  it('点不存在的 id 保持现状，不清空当前链接', () => {
    const state = applyQuickShortcut('selling', 'not-a-shortcut')
    assert.equal(state.activeId, 'selling')
    assert.deepEqual(state.links, ['product', 'video'])
  })

  it('取消技能只清技能，提示语与链接卡槽保留', () => {
    const cleared = clearQuickShortcutSkill({ activeId: 'clone', links: ['video', 'product'], skill: { slug: 'x' } })
    assert.equal(cleared.skill, null)
    assert.equal(cleared.activeId, 'clone')
    assert.deepEqual(cleared.links, ['video', 'product'])
  })
})

// 链接卡槽的两态判据（`hasLinkToken`）曾是本文件的副本，已删除：唯一实现在
// `links.js` 的 `isQuickLinkSlotFilled` / `splitQuickLinkSlots`，语义用例归 `links.test.js`。

describe('点快捷方式只插默认链接，可追加链接留给上方卡槽', () => {
  const entryOf = (id) => QUICK_SHORTCUTS.find((entry) => entry.id === id)

  it('每条快捷方式「点击即插入」的胶囊集只有 defaultLink 一枚', () => {
    assert.deepEqual(
      QUICK_SHORTCUTS.map((entry) => [entry.id, quickShortcutDefaultLinks(entry)]),
      [
        ['clone', ['video']],
        ['breakdown', ['video']],
        ['selling', ['product']],
        ['reverse', ['video']],
      ],
    )
  })

  it('点 clone 只有 video 一枚：extraLinks 的 product 不在插入集里', () => {
    const clone = entryOf('clone')
    assert.deepEqual(quickShortcutDefaultLinks(clone), ['video'], '点复刻只预填视频胶囊')
    assert.ok(!quickShortcutDefaultLinks(clone).includes('product'), '商品胶囊不得随点击自动插入')
    // 卡槽集仍带商品：它是上方那一行里「可点、点了才插」的那一枚
    assert.deepEqual(quickShortcutLinks(clone), ['video', 'product'], '商品卡槽照样摆在上方')
    assert.deepEqual(
      applyQuickShortcut(null, 'clone'),
      { activeId: 'clone', links: ['video', 'product'] },
      '会话态里存的是卡槽集，不是插入集',
    )
  })

  it('带货反向对称：默认只插商品，视频由上方卡槽点了才插', () => {
    const selling = entryOf('selling')
    assert.deepEqual(quickShortcutDefaultLinks(selling), ['product'])
    assert.deepEqual(quickShortcutLinks(selling), ['product', 'video'])
  })

  it('非法输入与没带默认链接的条目回空数组，不猜', () => {
    assert.deepEqual(quickShortcutDefaultLinks(null), [])
    assert.deepEqual(quickShortcutDefaultLinks(undefined), [])
    assert.deepEqual(quickShortcutDefaultLinks({}), [])
    assert.deepEqual(quickShortcutDefaultLinks({ defaultLink: 'not-a-kind' }), [])
    assert.deepEqual(quickShortcutDefaultLinks({ defaultLink: 42 }), [])
  })
})
