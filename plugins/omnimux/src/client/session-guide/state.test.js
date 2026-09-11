import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createGuideStore, emptyGuideState, isBlankConversation, selectStarter } from './state.js'
import { STARTERS, STARTER_GROUPS, guideEn, guideZh } from './catalog.js'
import { extractPromptSlots } from '../attachments/promptSlotDetector.ts'

const card = { id: 'deconstruct', prompt: 'Break down this video.' }
const other = { id: 'rewrite', prompt: 'Rewrite for my product.' }
function selected() { return selectStarter(emptyGuideState(), '', card) }

describe('session starters', () => {
  it('matches all ten reference actions with localized prompts and adapted protocol slots', () => {
    assert.equal(STARTERS.length, 10)
    assert.equal(new Set(STARTERS.map(card => card.id)).size, 10)
    assert.equal(STARTER_GROUPS.length, 4)
    assert.deepEqual(Object.keys(guideEn).sort(), Object.keys(guideZh).sort())
    const reference = JSON.parse(readFileSync(new URL('../../../../../docs/research/topview-ai-marketer-2026-09-09/quick-actions.json', import.meta.url)))
    assert.deepEqual(STARTERS.map(item => guideEn[`guide.${item.id}.title`]), reference.map(item => item.name))
    assert.deepEqual(STARTER_GROUPS.map(group => STARTERS.filter(item => item.group === group).length), [3, 2, 3, 2])
    for (const [index, item] of STARTERS.entries()) {
      assert.ok(STARTER_GROUPS.includes(item.group))
      const key = `guide.${item.id}.prompt`
      assert.match(guideZh[key], /[\u4e00-\u9fff]/)
      assert.equal((guideZh[key].match(/\[/g) || []).length, (guideEn[key].match(/\[/g) || []).length)
      for (const locale of [guideZh, guideEn]) {
        assert.ok(locale[`guide.${item.id}.title`])
        assert.ok(locale[`guide.${item.id}.prompt`])
        assert.ok(!locale[`guide.${item.id}.prompt`].startsWith('/'))
      }

      // 验证插槽提取与协议适配（中英文槽位集合与协议类型严格等价）
      const zhSlots = extractPromptSlots(guideZh[key])
      const enSlots = extractPromptSlots(guideEn[key])
      assert.equal(zhSlots.length, enSlots.length)
      assert.deepEqual(
        zhSlots.map(s => s.protocol).sort(),
        enSlots.map(s => s.protocol).sort(),
      )
    }

    // 重点抽测：选择文件、资产库、产品库协议在关键卡片上的适配生效
    const roasSlots = extractPromptSlots(guideZh['guide.roas-analysis.prompt'])
    assert.ok(roasSlots.some(s => s.protocol === 'file' && s.placeholder === '广告投放报告'))
    assert.ok(roasSlots.some(s => s.protocol === 'product'))

    const reviewSlots = extractPromptSlots(guideZh['guide.review-insights.prompt'])
    assert.ok(reviewSlots.some(s => s.protocol === 'file' && s.placeholder === '导出的评论数据'))
    assert.ok(reviewSlots.some(s => s.protocol === 'product'))

    const searchSlots = extractPromptSlots(guideZh['guide.search-terms.prompt'])
    assert.ok(searchSlots.some(s => s.protocol === 'file' && s.placeholder === '搜索词报告'))

    const ugcSlots = extractPromptSlots(guideZh['guide.ugc-brief.prompt'])
    assert.ok(ugcSlots.some(s => s.protocol === 'product'))
    assert.ok(ugcSlots.some(s => s.protocol === 'assets'))
  })
  it('replaces an existing draft immediately when choosing a task', () => {
    assert.equal(selectStarter(emptyGuideState(), 'My own instructions', card).draft, card.prompt)
  })
  it('switches edited templates directly and keeps repeated selections stable', () => {
    const first = selected()
    assert.equal(selectStarter(first.state, first.draft, other).draft, other.prompt)
    assert.equal(selectStarter(first.state, first.draft + ' edit', other).draft, other.prompt)
    assert.equal(selectStarter(first.state, first.draft + ' edit', card).draft, first.draft + ' edit')
  })
  it('applies the current language when reselecting a starter without touching edits before selection', () => {
    const id = 'recreate-viral-ads'
    const english = { id, prompt: guideEn[`guide.${id}.prompt`] }
    const chinese = { id, prompt: guideZh[`guide.${id}.prompt`] }
    const first = selectStarter(emptyGuideState(), '', english)
    assert.equal(selectStarter(first.state, first.draft + ' user edit', english).draft, first.draft + ' user edit')
    const next = selectStarter(first.state, first.draft, chinese)
    assert.equal(next.draft, chinese.prompt)
    assert.equal(selectStarter(next.state, next.draft, english).draft, english.prompt)
  })
  it('uses official lifecycle, not an empty input, to decide visibility', () => {
    assert.equal(isBlankConversation({ blank: true, running: false }, false), true)
    assert.equal(isBlankConversation({ blank: false }, false), false)
    assert.equal(isBlankConversation({ blank: true, running: true }, false), false)
    assert.equal(isBlankConversation({ blank: true }, true), false)
    assert.equal(isBlankConversation(undefined, false), false)
  })
  it('keeps independent state per session and releases listeners', () => {
    const store = createGuideStore()
    const start = selected()
    let changes = 0
    const stop = store.subscribe(() => changes++)
    store.set('a', start.state)
    assert.equal(store.get('b').selectedId, null)
    assert.equal(store.get('a').selectedId, card.id)
    stop(); store.set('b', start.state)
    assert.equal(changes, 1)
    store.dispose()
    assert.equal(store.get('a').selectedId, null)
  })
})
