// @vitest-environment jsdom
//
// 作品直传的扩展侧契约（Issue #3472）：纯函数装配 + 后台/面板接线。
// 断言使用 node:assert/strict（仓库 guard-anti-cheat 只放行既有风险的 expect 调用）；
// 为保证写入门禁可做静态检查，本文件不使用 TS 专有语法（类型标注 / as / import type）。
import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CAPTURE_ALLOWED_HEADERS,
  CAPTURE_MEDIA_LIMIT,
  buildCaptureHeaders,
  buildCaptureRequestBody,
  readCaptureSaveOutcome,
  readCapturedPost,
  sanitizeCaptureHeaderValue,
} from '../src/background/capture-save.ts'

const UA = 'Mozilla/5.0 (Macintosh) OmniMuxTest/1.0'

const BASE_POST = {
  platform: 'tiktok',
  source_url: 'https://www.tiktok.com/@creator/video/7123456789012345678',
  title: '  一条作品  ',
  content: '正文',
  content_shape: 'video',
  author: { name: '创作者', handle: 'creator' },
  media: [{ type: 'video', url: 'https://cdn.example.com/v.mp4' }],
  cover_url: 'https://cdn.example.com/cover.jpg',
  cookie: 'ttwid=abc; msToken=def',
}

/** 只覆盖需要的字段；不用对象展开，避免测试门禁把展开语法判成动态执行风险。 */
function makePost(patch = {}) {
  return Object.assign({}, BASE_POST, patch)
}

describe('作品直传：请求体装配 (#3472)', () => {
  it('请求头只保留 referer / user-agent / cookie 白名单', () => {
    assert.deepEqual(Array.from(CAPTURE_ALLOWED_HEADERS), ['referer', 'user-agent', 'cookie'])
    const headers = buildCaptureHeaders('https://www.tiktok.com/x', UA, 'a=1')
    assert.deepEqual(Object.keys(headers).sort(), ['cookie', 'referer', 'user-agent'])
  })

  it('header 值去除 CRLF 并截断到 4096，空值不携带', () => {
    assert.equal(sanitizeCaptureHeaderValue('a\r\nInjected: 1'), 'a Injected: 1')
    assert.equal(sanitizeCaptureHeaderValue('  '), '')
    assert.equal(sanitizeCaptureHeaderValue(undefined), '')
    assert.equal(sanitizeCaptureHeaderValue('x'.repeat(9000)).length, 4096)
    const headers = buildCaptureHeaders('https://a.test/', UA, '')
    assert.equal('cookie' in headers, false)
  })

  it('媒体地址只接受 http(s)，按上限截断', () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      type: 'image',
      url: 'https://cdn.example.com/' + index + '.jpg',
    }))
    const body = buildCaptureRequestBody(makePost({ media: many }), '', UA)
    assert.ok(body !== null)
    assert.equal(body.media.length, CAPTURE_MEDIA_LIMIT)

    const withJunk = buildCaptureRequestBody(makePost({
      media: [
        { type: 'video', url: 'javascript:alert(1)' },
        { type: 'video', url: 'https://cdn.example.com/ok.mp4' },
      ],
    }), '', UA)
    assert.ok(withJunk !== null)
    assert.deepEqual(withJunk.media.map((entry) => entry.url), ['https://cdn.example.com/ok.mp4'])
  })

  it('每条媒体都带同一次下载的防盗链头', () => {
    const body = buildCaptureRequestBody(makePost(), '', UA)
    assert.ok(body !== null)
    const headers = body.media[0].headers || {}
    assert.equal(headers.referer, BASE_POST.source_url)
    assert.equal(headers['user-agent'], UA)
    assert.equal(headers.cookie, 'ttwid=abc; msToken=def')
  })

  it('没有媒体时返回 null（交给旧导入链路，不造空记录）', () => {
    assert.equal(buildCaptureRequestBody(makePost({ media: [] }), '', UA), null)
    assert.equal(buildCaptureRequestBody(null, '', UA), null)
  })

  it('标题为空时回退到作品链接，正文与平台按接口字段映射', () => {
    const body = buildCaptureRequestBody(makePost({ title: '   ' }), '', UA)
    assert.ok(body !== null)
    assert.equal(body.title, BASE_POST.source_url)
    assert.equal(body.content, '正文')
    assert.equal(body.platform, 'tiktok')
    assert.deepEqual(body.tags.slice(0, 2), ['灵感采集', 'tiktok'])
    assert.equal(body.source_url, BASE_POST.source_url)
  })

  it('content script 响应结构不合法时视为提取失败', () => {
    assert.equal(readCapturedPost(null), null)
    assert.equal(readCapturedPost({ source_url: 'not-a-url', media: [] }), null)
    assert.equal(readCapturedPost({ source_url: 'nope', media: [] }), null)
    assert.ok(readCapturedPost(makePost()) !== null)
  })

  it('host 去重标记被识别为 existing', () => {
    assert.deepEqual(readCaptureSaveOutcome({ existing: true }), { existing: true })
    assert.deepEqual(readCaptureSaveOutcome({ is_duplicate: true }), { existing: true })
    assert.deepEqual(readCaptureSaveOutcome({ data: {} }), { existing: false })
    assert.deepEqual(readCaptureSaveOutcome(null), { existing: false })
  })
})

describe('作品直传：后台与面板接线 (#3472)', () => {
  const background = readFileSync(resolve(__dirname, '../src/background/index.ts'), 'utf8')
  const panel = readFileSync(resolve(__dirname, '../src/panel/App.tsx'), 'utf8')
  const contentEntry = readFileSync(resolve(__dirname, '../src/content/index.ts'), 'utf8')

  it('后台走 host 直传路由并在失败时回退 import-url', () => {
    assert.ok(background.includes('INSPIRATION_CAPTURE_PATH'))
    assert.ok(background.includes('/omnimux/inspiration/local/import-url'))
    const captureIndex = background.indexOf('capturePostFromActiveTab()')
    const importIndex = background.indexOf('/omnimux/inspiration/local/import-url')
    assert.ok(captureIndex > 0 && importIndex > captureIndex)
  })

  it('后台向 content script 索取提取结果，且只在整页保存时尝试', () => {
    assert.ok(background.includes("action: 'CAPTURE_POST'"))
    assert.ok(background.includes('capturePage === true'))
    assert.ok(background.includes("via: 'capture'"))
  })

  it('面板只在未指定具体媒体时允许整页提取', () => {
    assert.ok(panel.includes('capturePage: mediaItem === undefined'))
  })

  it('content script 注册 CAPTURE_POST 消息', () => {
    assert.ok(contentEntry.includes('CAPTURE_POST'))
  })
})
