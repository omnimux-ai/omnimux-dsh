import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createGuideStore, emptyGuideState, isBlankConversation, parseVideoUrls, selectStarter, syncVideoUrls } from './state.js'
import { STARTERS, STARTER_GROUPS, guideEn, guideZh } from './catalog.js'

const card = { id: 'deconstruct', prompt: 'Break down this video.' }
const other = { id: 'rewrite', prompt: 'Rewrite for my product.' }
const options = { multiple: false, label: 'Reference video' }
const url = 'https://example.com/reference'
function selected() { return selectStarter(emptyGuideState(), '', card) }
function withUrl() {
  const start = selected()
  return syncVideoUrls({ ...start.state, urlValue: url }, start.draft, options)
}

describe('session starters', () => {
  it('defines six localized business intents without executable commands', () => {
    assert.equal(STARTERS.length, 6)
    assert.equal(new Set(STARTERS.map(card => card.id)).size, 6)
    assert.equal(STARTER_GROUPS.length, 3)
    assert.deepEqual(Object.keys(guideEn).sort(), Object.keys(guideZh).sort())
    for (const item of STARTERS) {
      assert.ok(STARTER_GROUPS.includes(item.group))
      for (const locale of [guideZh, guideEn]) {
        assert.ok(locale[`guide.${item.id}.title`])
        assert.ok(locale[`guide.${item.id}.description`])
        assert.ok(locale[`guide.${item.id}.prompt`])
        assert.ok(!locale[`guide.${item.id}.prompt`].startsWith('/'))
      }
    }
  })
  it('protects an existing draft until explicit replacement', () => {
    assert.equal(selectStarter(emptyGuideState(), 'My own instructions', card).status, 'confirm')
    assert.equal(selectStarter(emptyGuideState(), 'My own instructions', card, true).draft, card.prompt)
  })
  it('switches untouched templates but preserves edits and repeated selections', () => {
    const first = selected()
    assert.equal(selectStarter(first.state, first.draft, other).draft, other.prompt)
    assert.equal(selectStarter(first.state, first.draft + ' edit', other).status, 'confirm')
    assert.equal(selectStarter(first.state, first.draft + ' edit', card).draft, first.draft + ' edit')
  })
  it('retains references when changing an unedited template', () => {
    const first = withUrl()
    const next = selectStarter(first.state, first.draft, other)
    assert.equal(next.status, 'applied')
    assert.equal(next.draft, `${other.prompt}\n\nReference video:\n${url}`)
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

describe('visible reference synchronization', () => {
  it('validates complete HTTP URLs and deduplicates candidate lines', () => {
    for (const bad of ['javascript:alert(1)', 'https://', 'example.com', 'https://example.com/a b', 'file:///tmp/a', 'https://user:pass@example.com']) {
      assert.equal(parseVideoUrls(bad, true).error, 'invalidUrl', bad)
    }
    assert.deepEqual(parseVideoUrls(`${url}\n${url}\nhttps://example.com/2`, true).urls, [url, 'https://example.com/2'])
    assert.equal(parseVideoUrls(`${url}\nhttps://example.com/2`, false).error, 'singleUrl')
    assert.deepEqual(parseVideoUrls('', false).urls, [])
  })
  it('adds visible references once without requiring references for ordinary prompts', () => {
    const first = withUrl()
    assert.equal(first.status, 'synced')
    assert.equal(first.draft, `${card.prompt}\n\nReference video:\n${url}`)
    assert.equal(syncVideoUrls(first.state, first.draft, options).status, 'ready')
    const start = selected()
    assert.equal(syncVideoUrls(start.state, start.draft, options).status, 'ready')
  })
  it('updates and clears only the owned paragraph, retaining body edits', () => {
    const first = withUrl()
    const draft = 'My changed brief\n\n' + first.state.urlBlock
    const changed = syncVideoUrls({ ...first.state, urlValue: 'https://example.com/new' }, draft, options)
    assert.equal(changed.draft, 'My changed brief\n\nReference video:\nhttps://example.com/new')
    const clear = syncVideoUrls({ ...changed.state, urlValue: '' }, changed.draft, options)
    assert.equal(clear.draft, 'My changed brief')
    assert.equal(selectStarter(clear.state, clear.draft, other).status, 'confirm')
  })
  it('does not overwrite or restore a reference edited or deleted in the body', () => {
    const first = withUrl()
    for (const edited of [first.draft + '?campaign=manual', first.draft.replace(url, 'https://example.com/manual'), card.prompt, first.draft + '\n\n' + first.state.urlBlock]) {
      const result = syncVideoUrls({ ...first.state, urlValue: 'https://example.com/new' }, edited, options)
      assert.equal(result.status, 'manualUrl')
      assert.equal(result.draft, edited)
      assert.equal(syncVideoUrls(result.state, edited, options).status, 'manualUrl')
    }
  })
  it('keeps an explicitly edited reference when replacement is confirmed', () => {
    const first = withUrl()
    const edited = first.draft.replace(url, 'https://example.com/manual')
    const detached = syncVideoUrls(first.state, edited, options)
    const next = selectStarter(detached.state, edited, other, true)
    assert.ok(next.draft.includes('https://example.com/manual'))
    assert.ok(!next.draft.includes(url))
    assert.equal(next.state.urlValue, '')
  })
  it('preserves unrelated whitespace when removing an owned reference', () => {
    const first = withUrl()
    const draft = `My brief\n\n\nwith spacing\n\n${first.state.urlBlock}\n\nMore text  `
    const result = syncVideoUrls({ ...first.state, urlValue: '' }, draft, options)
    assert.equal(result.draft, 'My brief\n\n\nwith spacing\n\nMore text  ')
  })
  it('does not duplicate an already visible URL or mutate draft on invalid input', () => {
    const first = selected()
    const draft = `${first.draft} ${url}`
    const next = syncVideoUrls({ ...first.state, urlValue: url }, draft, options)
    assert.equal(next.draft, draft)
    assert.equal(syncVideoUrls({ ...next.state, urlValue: 'http://' }, draft, options).draft, draft)
  })
})
