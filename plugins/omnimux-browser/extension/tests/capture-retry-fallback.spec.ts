// @vitest-environment jsdom
// @ts-nocheck
//
// #3505：捕获等待重试、回退原因可见、通用提取收敛。
// 断言用 node:assert/strict；不使用 TS 专有语法/对象展开，保证写入门禁可静态检查。
import { beforeEach, describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { capturePost } from '../src/content/capture/index.ts'
import { saveFallbackToast } from '../src/panel/save-target-copy.ts'

function mountPage(options) {
  document.head.innerHTML = options.head || ''
  document.body.innerHTML = options.body || ''
  document.title = options.title || ''
}
function capture(href) {
  return capturePost(document, { href })
}
function requirePost(post) {
  assert.ok(post !== null, 'capturePost 不应返回 null')
  return post
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  document.title = ''
})

describe('回退原因 toast（#3505）', () => {
  it('四种回退原因都说清「已转云端解析」', () => {
    const reasons = ['capture-unavailable', 'capture-empty', 'capture-rejected', 'no-tab']
    for (const reason of reasons) {
      const zh = saveFallbackToast(reason, 'zh')
      const en = saveFallbackToast(reason, 'en')
      assert.match(zh, /^已保存到灵感库（.+已转云端解析）$/)
      assert.match(en, /^Saved to Inspiration Library \(.+parsed in the cloud\)$/)
    }
    assert.match(saveFallbackToast('capture-unavailable', 'zh'), /内容脚本未就绪/)
    assert.match(saveFallbackToast('capture-empty', 'zh'), /未提取到作品/)
    assert.match(saveFallbackToast('capture-rejected', 'zh'), /未入库/)
    assert.match(saveFallbackToast('no-tab', 'zh'), /没有可采集的标签页/)
  })

  it('未知原因有默认文案，且不等于成功文案', () => {
    const unknown = saveFallbackToast('something-else', 'zh')
    assert.equal(unknown, '已保存到灵感库（内页采集失败，已转云端解析）')
    assert.notEqual(unknown, '已保存到 OmniMux 灵感素材库！')
  })
})

describe('通用提取收敛到 og/主图/视频（#3505）', () => {
  it('有 og:image 时只取 og 图，不收正文 20 张图', () => {
    const images = Array.from({ length: 20 }, (_, index) =>
      `<img src="https://cdn.example.com/body-${index + 1}.jpg" width="800" height="600">`).join('')
    mountPage({
      head: '<meta property="og:title" content="文章标题"><meta property="og:image" content="https://cdn.example.com/og.jpg">',
      body: `<article>${images}</article>`,
    })
    const post = requirePost(capture('https://example.com/article/1'))
    assert.deepEqual(post.media, [{ type: 'image', url: 'https://cdn.example.com/og.jpg' }])
    assert.equal(post.cover_url, 'https://cdn.example.com/og.jpg')
    assert.equal(post.content_shape, 'photo')
  })

  it('og 图 + <video><source> 主视频同时保留', () => {
    mountPage({
      head: '<meta property="og:title" content="带视频的文章"><meta property="og:image" content="https://cdn.example.com/og.jpg">',
      body: '<article><video poster="https://cdn.example.com/poster.jpg"><source src="https://cdn.example.com/main.mp4"></video><img src="https://cdn.example.com/body.jpg" width="800" height="600"></article>',
    })
    const post = requirePost(capture('https://example.com/article/2'))
    assert.deepEqual(post.media, [
      { type: 'video', url: 'https://cdn.example.com/main.mp4' },
      { type: 'image', url: 'https://cdn.example.com/og.jpg' },
    ])
    assert.equal(post.content_shape, 'video')
  })

  it('没有 og 时只回退到第一张正文主图', () => {
    mountPage({
      head: '<meta property="og:title" content="无 og 图页面">',
      body: '<article><img src="https://cdn.example.com/one.jpg" width="800" height="600"><img src="https://cdn.example.com/two.jpg" width="800" height="600"></article>',
    })
    const post = requirePost(capture('https://example.com/article/3'))
    assert.deepEqual(post.media, [{ type: 'image', url: 'https://cdn.example.com/one.jpg' }])
  })
})

describe('后台捕获重试与回退接线（#3505）', () => {
  const background = readFileSync(resolve(__dirname, '../src/background/index.ts'), 'utf8')
  const panel = readFileSync(resolve(__dirname, '../src/panel/App.tsx'), 'utf8')

  it('后台定义了 3 次 × 400ms 的重试预算并区分失败类型', () => {
    assert.match(background, /CAPTURE_ATTEMPT_COUNT = 3/)
    assert.match(background, /CAPTURE_RETRY_DELAY_MS = 400/)
    assert.ok(background.includes('capture-unavailable'))
    assert.ok(background.includes('capture-empty'))
    assert.ok(background.includes('capture-rejected'))
    assert.match(background, /for \(let attempt = 0; attempt < CAPTURE_ATTEMPT_COUNT/)
    // iframe 竞速修复：只问顶层 frame，否则 iframe 内容脚本会抢先答 ok:false。
    assert.ok(background.includes('{ frameId: 0 }'))
  })

  it('回退成功后响应携带 fallback，面板据此选择文案', () => {
    assert.match(background, /captureFallback \? \{ fallback: captureFallback \}/)
    assert.ok(panel.includes('saveFallbackToast,'))
    assert.ok(panel.includes('saveFallbackToast(savedFallback, locale)'))
  })
})
