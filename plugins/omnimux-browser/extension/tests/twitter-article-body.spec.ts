// @vitest-environment jsdom
// @ts-nocheck
//
// 断言使用 node:assert/strict，且不使用 TS 专有语法：仓库 guard-anti-cheat 的
// 静态检查只对既有风险的 expect 调用放行，新测试文件必须能被 acorn 解析。
/**
 * Long-form post (#3630): X Articles draw no `[data-testid="tweetText"]`, so the
 * copilot used to reject an article page with「没有读到原推内容」and capture stored
 * an empty body.
 *
 * The fixtures mirror the live page measured on 2026-10-23
 * (https://x.com/Khazix0918/status/2113466426216583632):
 * `article[data-testid="twitterArticleReadView"]` → title in
 * `[data-testid="twitter-article-title"]`, body blocks in
 * `[data-testid="twitterArticleRichTextView"]` → `div.longform-unstyled`, and the
 * interaction counters (`45101591万`) sitting beside them in the read view.
 */
import { describe, it, beforeEach } from 'vitest'
import assert from 'node:assert/strict'
import { ARTICLE_TEXT_MAX_CHARS, readArticleText, readTweetBody } from '../src/content/tweet-body.ts'
import { detectTwitterScene, extractTwitterContext } from '../src/content/twitter-copilot/extractor.ts'
import { checkContextReady } from '../src/content/twitter-copilot/menu.ts'
import { collectFeedCandidates } from '../src/content/twitter-copilot/candidates.ts'
import { extractTweetCapture } from '../src/content/twitter-capture/extractor.ts'

const TITLE = '我好像陷入了某种，AI时代的虚无主义。'
const P1 = '最近一段时间，我好像得了某种怪病。'
const P2 = '我开始变得容易暴躁，开始更加没有耐心。'

/** The article shape X ships: title, counters, Draft.js body blocks. */
function articleReadView(title, paragraphs) {
  const blocks = paragraphs
    .map((p) => `<div class="longform-unstyled"><div class="public-DraftStyleDefault-block"><span>${p}</span></div></div>`)
    .join('')
  return `
    <article data-testid="twitterArticleReadView" role="article">
      <div>
        <div><div data-testid="twitter-article-title" dir="auto"><span>${title}</span></div></div>
        <div><div role="group">45101591万</div></div>
        <div data-testid="twitterArticleRichTextView">
          <div><div><div data-testid="longformRichTextComponent" class="public-DraftEditor-content">
            <div>${blocks}</div>
          </div></div></div>
        </div>
      </div>
    </article>`
}

/** Header carrying the author handle the extractors read. */
function userName(handle) {
  const name = handle || 'Khazix0918'
  return `
    <div data-testid="User-Name">
      <a role="link" href="/${name}"><span>数字生命卡兹克</span><span>@${name}</span></a>
      <a href="/${name}/status/2113466426216583632"><time datetime="2026-10-23T03:03:00.000Z"></time></a>
    </div>`
}

function mountFocal(inner) {
  document.body.innerHTML = `<main><article data-testid="tweet" tabindex="-1">${inner}</article></main>`
  return document.querySelector('main article[data-testid="tweet"]')
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('tweet-body · X Article 读取', () => {
  it('标题与正文块按段读取，互动计数不进入正文', () => {
    const focal = mountFocal(`${userName()}${articleReadView(TITLE, [P1, P2])}`)
    const text = readArticleText(focal)
    assert.equal(text, `${TITLE}\n\n${P1}\n\n${P2}`)
    assert.equal(text.includes('45101591万'), false)
  })

  it('没有推文正文节点时回退到文章正文；普通推文保持原文', () => {
    const articlePost = mountFocal(`${userName()}${articleReadView(TITLE, [P1])}`)
    assert.equal(readTweetBody(articlePost).startsWith(TITLE), true)

    document.body.innerHTML = '<article data-testid="tweet"><div data-testid="tweetText">普通推文正文</div></article>'
    const normalPost = document.querySelector('article[data-testid="tweet"]')
    assert.equal(readTweetBody(normalPost), '普通推文正文')
  })

  it('正文内嵌的推文文本不会被当成文章正文', () => {
    const focal = mountFocal(
      `${userName()}<article data-testid="twitterArticleReadView">
        <div data-testid="twitterArticleRichTextView">
          <div><div data-testid="longformRichTextComponent"><div class="longform-unstyled"><span>${P1}</span></div></div></div>
          <div data-testid="tweetText">文章里嵌的推文正文</div>
        </div>
      </article>`,
    )
    const text = readTweetBody(focal)
    assert.equal(text.includes(P1), true)
    assert.equal(text.includes('文章里嵌的推文正文'), false)
  })

  it('超长文章截断到上限以内并保留省略号', () => {
    const long = '长'.repeat(ARTICLE_TEXT_MAX_CHARS + 500)
    const focal = mountFocal(`${userName()}${articleReadView(TITLE, [long])}`)
    const text = readArticleText(focal)
    assert.equal(text.length <= ARTICLE_TEXT_MAX_CHARS, true)
    assert.equal(text.endsWith('…'), true)
  })

  it('普通推文被整卡 role=link 包裹时仍能读到正文', () => {
    document.body.innerHTML =
      '<div role="link"><article data-testid="tweet"><div data-testid="tweetText">普通推文正文</div></article></div>'
    const article = document.querySelector('article[data-testid="tweet"]')
    assert.equal(readTweetBody(article), '普通推文正文')
  })

  it('文章没有 Draft.js 块时，fallback 不把内嵌推文当成正文', () => {
    const focal = mountFocal(
      `${userName()}<article data-testid="twitterArticleReadView">
        <div data-testid="twitterArticleRichTextView">
          <div><span>${P1}</span></div>
          <div data-testid="tweetText">内嵌推文文本</div>
        </div>
      </article>`,
    )
    const text = readArticleText(focal)
    assert.equal(text.includes(P1), true)
    assert.equal(text.includes('内嵌推文文本'), false)
  })

  it('标题-only 文章返回标题', () => {
    const focal = mountFocal(`${userName()}<article data-testid="twitterArticleReadView">
      <div data-testid="twitter-article-title"><span>只有标题</span></div>
    </article>`)
    assert.equal(readArticleText(focal), '只有标题')
  })

  it('article 内部 role=link 包裹自身 header 时仍按自身正文读取', () => {
    document.body.innerHTML = `<article data-testid="tweet"><div role="link">${userName()}
      <div data-testid="tweetText">普通推文正文</div>
    </div></article>`
    const post = document.querySelector('article[data-testid="tweet"]')
    assert.equal(readTweetBody(post), '普通推文正文')
  })
})

describe('twitter-copilot · 长文章帖上下文', () => {
  it('详情页回帖：读到标题与正文，上下文闸门放行', () => {
    mountFocal(`${userName()}${articleReadView(TITLE, [P1, P2])}`)
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)

    const ctx = extractTwitterContext(anchor, 'REPLY_DETAIL')

    assert.equal(ctx.targetTweetText, `${TITLE}\n\n${P1}\n\n${P2}`)
    assert.equal(ctx.targetAuthor, 'Khazix0918')
    assert.equal(checkContextReady('REPLY_DETAIL', ctx, 'zh'), null)
  })

  it('引用转发弹窗：被引卡片是长文章时仍判为 POST_QUOTE 并读到正文', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.innerHTML = `
      <div data-testid="attachments">${userName()}${articleReadView(TITLE, [P1])}</div>
      <button type="button" data-testid="tweetButton"></button>`
    document.body.appendChild(dialog)
    const anchor = dialog.querySelector('button')

    assert.equal(detectTwitterScene(anchor), 'POST_QUOTE')
    const ctx = extractTwitterContext(anchor, 'POST_QUOTE')
    assert.equal(ctx.quotedTweetText.includes(TITLE), true)
    assert.equal(ctx.quotedTweetText.includes(P1), true)
    assert.equal(ctx.quotedAuthor, 'Khazix0918')
  })

  it('无评论的引用转发不会把被引长文章当成原帖正文', () => {
    document.body.innerHTML = `<main><article data-testid="tweet" tabindex="-1">${userName()}
      <div role="link">
        <div data-testid="User-Name"><a role="link" href="/other"><span>@other</span></a></div>
        ${articleReadView(TITLE, [P1])}
      </div>
    </article></main>`
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)

    const ctx = extractTwitterContext(anchor, 'REPLY_DETAIL')

    assert.equal(ctx.targetTweetText, '')
    assert.notEqual(checkContextReady('REPLY_DETAIL', ctx, 'zh'), null)
  })

  it('quoteTweet 形状的无评论引用同样不会把被引长文章当成原帖正文', () => {
    document.body.innerHTML = `<main><article data-testid="tweet" tabindex="-1">${userName()}
      <div data-testid="quoteTweet">
        <div data-testid="User-Name"><a role="link" href="/other"><span>@other</span></a></div>
        ${articleReadView(TITLE, [P1])}
      </div>
    </article></main>`
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)

    const ctx = extractTwitterContext(anchor, 'REPLY_DETAIL')

    assert.equal(ctx.targetTweetText, '')
    assert.notEqual(checkContextReady('REPLY_DETAIL', ctx, 'zh'), null)
  })

  it('评论与引用同处一个 role=link 时仍取评论而不是被引文章', () => {
    document.body.innerHTML = `<main><article data-testid="tweet" tabindex="-1">
      <div role="link">
        ${userName('commenter')}
        <div data-testid="tweetText">这是引用者的评论，足够长可以进候选池。</div>
        <div data-testid="User-Name"><a role="link" href="/other"><span>@other</span></a></div>
        ${articleReadView(TITLE, [P1])}
      </div>
    </article></main>`
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)

    const ctx = extractTwitterContext(anchor, 'REPLY_DETAIL')

    assert.equal(ctx.targetTweetText, '这是引用者的评论，足够长可以进候选池。')
  })
})

describe('twitter-capture · 长文章采集', () => {
  it('采集正文回退到文章标题与正文块', () => {
    document.body.innerHTML = `<article data-testid="tweet">${userName()}${articleReadView(TITLE, [P1, P2])}</article>`
    const article = document.querySelector('article[data-testid="tweet"]')
    const capture = extractTweetCapture(article)
    assert.notEqual(capture, null)
    assert.equal(capture.text.includes(TITLE), true)
    assert.equal(capture.text.includes(P2), true)
  })

  it('引用长文章：自身正文与 quoted 分开读取', () => {
    document.body.innerHTML = `<article data-testid="tweet">${userName()}
      <div data-testid="tweetText">这是引用者的评论，足够长可以进候选池。</div>
      <div data-testid="attachments">${articleReadView(TITLE, [P1])}</div>
    </article>`
    const article = document.querySelector('article[data-testid="tweet"]')
    const capture = extractTweetCapture(article)

    assert.equal(capture.text, '这是引用者的评论，足够长可以进候选池。')
    assert.equal(capture.quoted.text.includes(TITLE), true)
    assert.equal(capture.quoted.text.includes(P1), true)
  })
})

describe('twitter-copilot · 候选池中的长文章卡片', () => {
  it('信息流里的长文章卡片进入候选池', () => {
    const root = document.createElement('div')
    root.innerHTML = `<article data-testid="tweet">${userName()}${articleReadView(TITLE, [P1])}</article>`
    const candidates = collectFeedCandidates(root, null, Date.now())
    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].text.includes(TITLE), true)
    assert.equal(candidates[0].author, 'Khazix0918')
  })

  it('整张卡片被 role=link 包裹时不会把自己当成引用卡片', () => {
    const root = document.createElement('div')
    root.innerHTML = `<div role="link"><article data-testid="tweet">${userName()}${articleReadView(TITLE, [P1])}</article></div>`
    const candidates = collectFeedCandidates(root, null, Date.now())
    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].text.includes(TITLE), true)
    assert.equal(candidates[0].isQuote, undefined)
  })

  it('引用转发：评论与长文章被引卡片分开读取', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <article data-testid="tweet">
        ${userName('commenter')}
        <div data-testid="tweetText">这条评论写得足够长，可以进入候选池评分。</div>
        <div role="link">
          <div data-testid="User-Name"><a role="link" href="/Khazix0918"><span>@Khazix0918</span></a></div>
          ${articleReadView(TITLE, [P1])}
        </div>
      </article>`
    const candidates = collectFeedCandidates(root, null, Date.now())
    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].text, '这条评论写得足够长，可以进入候选池评分。')
    assert.equal(candidates[0].quotedText.includes(TITLE), true)
  })

  it('包裹层位于 article 内部的整卡链接仍按自身卡片处理', () => {
    const root = document.createElement('div')
    root.innerHTML = `<article data-testid="tweet"><div role="link">${userName()}${articleReadView(TITLE, [P1])}</div></article>`
    const candidates = collectFeedCandidates(root, null, Date.now())
    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].text.includes(TITLE), true)
    assert.equal(candidates[0].isQuote, undefined)
  })

  it('被引长文章读到 280 字之后的段落，且不含互动计数', () => {
    const tail = `${'长'.repeat(300)}结尾标记`
    const root = document.createElement('div')
    root.innerHTML = `
      <article data-testid="tweet">
        ${userName('commenter')}
        <div data-testid="tweetText">这条评论写得足够长，可以进入候选池评分。</div>
        <div role="link">
          <div data-testid="User-Name"><a role="link" href="/Khazix0918"><span>@Khazix0918</span></a></div>
          ${articleReadView(TITLE, [P1, tail])}
        </div>
      </article>`
    const candidates = collectFeedCandidates(root, null, Date.now())
    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].quotedText.includes('结尾标记'), true)
    assert.equal(candidates[0].quotedText.includes('45101591万'), false)
  })

  it('quoteTweet 形状的引用卡也能拆出评论与被引长文章', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <article data-testid="tweet">
        ${userName('commenter')}
        <div data-testid="tweetText">这条评论写得足够长，可以进入候选池评分。</div>
        <div data-testid="quoteTweet">
          <div data-testid="User-Name"><a role="link" href="/Khazix0918"><span>@Khazix0918</span></a></div>
          ${articleReadView(TITLE, [P1])}
        </div>
      </article>`
    const candidates = collectFeedCandidates(root, null, Date.now())
    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].text, '这条评论写得足够长，可以进入候选池评分。')
    assert.equal(candidates[0].quotedText.includes(TITLE), true)
    assert.equal(candidates[0].isQuote, true)
  })

  it('无评论且只有被引长文章的 quoteTweet 卡不进入候选池', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <article data-testid="tweet">
        ${userName()}
        <div data-testid="quoteTweet">
          <div data-testid="User-Name"><a role="link" href="/other"><span>@other</span></a></div>
          ${articleReadView(TITLE, [P1])}
        </div>
      </article>`
    const candidates = collectFeedCandidates(root, null, Date.now())
    assert.equal(candidates.length, 0)
  })
})

describe('twitter-copilot · seed prompt 预算', () => {
  const engagement = (n) => `
    <div role="group">
      <button data-testid="reply" aria-label="${n} 回复"></button>
      <button data-testid="retweet" aria-label="${n} 次转帖"></button>
      <button data-testid="like" aria-label="${n} 喜欢"></button>
    </div>`

  it('长文章 seed 正文与引用正文各截断到 1200 字', () => {
    const longBody = '长'.repeat(3000)
    document.body.innerHTML = `<main>
      <article data-testid="tweet">
        ${userName('commenter')}
        <div data-testid="tweetText">${'评'.repeat(2000)}</div>
        ${engagement(900)}
        <div data-testid="quoteTweet">
          <div data-testid="User-Name"><a role="link" href="/Khazix0918"><span>@Khazix0918</span></a></div>
          ${articleReadView(TITLE, [longBody])}
        </div>
      </article>
    </main>`
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)

    const ctx = extractTwitterContext(anchor, 'POST_NEW')

    assert.equal(ctx.feedHotTweets.length > 0, true)
    assert.equal(ctx.feedHotTweets[0].text.length <= 1200, true)
    assert.equal(ctx.feedHotTweets[0].text.endsWith('…'), true)
    assert.equal(ctx.feedHotTweets[0].quotedText.length <= 1200, true)
    assert.equal(ctx.feedHotTweets[0].quotedText.endsWith('…'), true)
  })
})
