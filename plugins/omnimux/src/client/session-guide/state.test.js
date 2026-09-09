import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createGuideStore, emptyGuideState, isBlankConversation, selectStarter } from './state.js'
import { STARTERS, STARTER_GROUPS, guideEn, guideZh } from './catalog.js'

const card = { id: 'deconstruct', prompt: 'Break down this video.' }
const other = { id: 'rewrite', prompt: 'Rewrite for my product.' }
function selected() { return selectStarter(emptyGuideState(), '', card) }

describe('session starters', () => {
  it('matches all ten reference actions and their exact prompts', () => {
    assert.equal(STARTERS.length, 10)
    assert.equal(new Set(STARTERS.map(card => card.id)).size, 10)
    assert.equal(STARTER_GROUPS.length, 4)
    assert.deepEqual(Object.keys(guideEn).sort(), Object.keys(guideZh).sort())
    const reference = JSON.parse(readFileSync(new URL('../../../../../docs/research/topview-ai-marketer-2026-09-09/quick-actions.json', import.meta.url)))
    assert.deepEqual(STARTERS.map(item => guideEn[`guide.${item.id}.title`]), reference.map(item => item.name))
    assert.deepEqual(STARTER_GROUPS.map(group => STARTERS.filter(item => item.group === group).length), [3, 2, 3, 2])
    for (const [index, item] of STARTERS.entries()) {
      assert.ok(STARTER_GROUPS.includes(item.group))
      for (const locale of [guideZh, guideEn]) {
        assert.ok(locale[`guide.${item.id}.title`])
        assert.equal(locale[`guide.${item.id}.prompt`], reference[index].state.fields.find(field => field.tag === 'TEXTAREA').value)
        assert.ok(!locale[`guide.${item.id}.prompt`].startsWith('/'))
      }
    }
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
