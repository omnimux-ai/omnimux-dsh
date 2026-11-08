// @ts-nocheck
// @vitest-environment jsdom
/**
 * Poster article input: the visual export must read the full article body,
 * while the model prompt keeps its 8,000-character budget.
 */
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'vitest'
import { readTweetBody } from '../src/content/tweet-body.ts'

const TITLE = '长文章标题'
const LONG_PARAGRAPH = '长'.repeat(8500)

function mountArticle() {
  document.body.innerHTML = `
    <main><article data-testid="tweet" tabindex="-1">
      <div data-testid="User-Name"><a role="link" href="/lifesinger"><span>Frank Wang 玉伯</span><span>@lifesinger</span></a></div>
      <article data-testid="twitterArticleReadView">
        <div data-testid="twitter-article-title"><span>${TITLE}</span></div>
        <div data-testid="twitterArticleRichTextView">
          <div><div data-testid="longformRichTextComponent" class="public-DraftEditor-content">
            <div class="longform-unstyled"><div class="public-DraftStyleDefault-block"><span>${LONG_PARAGRAPH}</span></div></div>
          </div></div>
        </div>
      </article>
    </article></main>`
  return document.querySelector('main article[data-testid="tweet"]')
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('poster article input', () => {
  it('keeps the prompt budget on the default read', () => {
    const article = mountArticle()
    const text = readTweetBody(article)
    assert.equal(text.length, 8000)
    assert.equal(text.endsWith('…'), true)
  })

  it('reads the full article body when the visual export asks for it', () => {
    const article = mountArticle()
    const text = readTweetBody(article, undefined, Number.MAX_SAFE_INTEGER)
    assert.equal(text.length, TITLE.length + 2 + LONG_PARAGRAPH.length)
    assert.equal(text.startsWith(TITLE), true)
    assert.equal(text.endsWith(LONG_PARAGRAPH.slice(-20)), true)
  })
})
