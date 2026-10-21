// @ts-nocheck
// @vitest-environment jsdom
/**
 * Placement of the poster entry inside X's native action bar: immediately
 * before the bookmark item, with share as the fallback and the bar itself when
 * neither icon exists.
 */
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'vitest'
import { findPosterActionAnchor } from '../src/content/twitter-poster/index.ts'

function renderActionBar(markup) {
  document.body.innerHTML = `<article data-testid="tweet"><div role="group">${markup}</div></article>`
  return document.querySelector('div[role="group"]')
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('findPosterActionAnchor', () => {
  it('returns the wrapper that holds the bookmark button', () => {
    const group = renderActionBar(`
      <div id="reply"><button data-testid="reply">reply</button></div>
      <div id="views"><span>6,248</span></div>
      <div id="bookmark"><button data-testid="bookmark">bookmark</button></div>
      <div id="share"><button data-testid="share">share</button></div>
    `)
    assert.equal(findPosterActionAnchor(group).id, 'bookmark')
  })

  it('also matches removeBookmark and walks up from a nested button', () => {
    const group = renderActionBar(`
      <div id="reply"><button data-testid="reply">reply</button></div>
      <div id="saved"><span><button data-testid="removeBookmark">saved</button></span></div>
    `)
    assert.equal(findPosterActionAnchor(group).id, 'saved')
  })

  it('falls back to the share item when there is no bookmark', () => {
    const group = renderActionBar(`
      <div id="reply"><button data-testid="reply">reply</button></div>
      <div id="share"><button data-testid="share">share</button></div>
    `)
    assert.equal(findPosterActionAnchor(group).id, 'share')
  })

  it('returns null when neither bookmark nor share is rendered', () => {
    const group = renderActionBar(`
      <div id="reply"><button data-testid="reply">reply</button></div>
    `)
    assert.equal(findPosterActionAnchor(group), null)
  })
})
