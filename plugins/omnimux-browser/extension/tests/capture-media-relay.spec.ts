// @vitest-environment jsdom
// @ts-nocheck
//
// #3526：媒体字节回传（TikTok 页面取字节 → 分块 → host）。
// 断言用 node:assert/strict；仅 JS 语法，保证写入门禁可静态检查。
import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RELAY_CHUNK_BYTES, planRelayChunks } from '../src/shared/media-relay.ts'
import { saveFallbackToast } from '../src/panel/save-target-copy.ts'

describe('分块计划（#3526）', () => {
  it('1MB 边界：整块、恰好一块、一块多 1 字节', () => {
    assert.equal(RELAY_CHUNK_BYTES, 1024 * 1024)
    const one = planRelayChunks(RELAY_CHUNK_BYTES)
    assert.equal(one.length, 1)
    assert.deepEqual(one[0], { seq: 0, start: 0, end: RELAY_CHUNK_BYTES, final: true })
    const over = planRelayChunks(RELAY_CHUNK_BYTES + 1)
    assert.equal(over.length, 2)
    assert.deepEqual(over[0], { seq: 0, start: 0, end: RELAY_CHUNK_BYTES, final: false })
    assert.deepEqual(over[1], { seq: 1, start: RELAY_CHUNK_BYTES, end: RELAY_CHUNK_BYTES + 1, final: true })
  })

  it('多块顺序与 final 只在最后一块', () => {
    const ranges = planRelayChunks(3 * RELAY_CHUNK_BYTES + 42)
    assert.equal(ranges.length, 4)
    for (let index = 0; index < ranges.length; index += 1) {
      assert.equal(ranges.at(index).seq, index)
      assert.equal(ranges.at(index).final, index === ranges.length - 1)
      if (index > 0) assert.equal(ranges.at(index).start, ranges.at(index - 1).end)
    }
    assert.equal(ranges.at(-1).end, 3 * RELAY_CHUNK_BYTES + 42)
  })

  it('空文件仍给一个 final 块，让 host 显式拒绝而不是挂起', () => {
    assert.deepEqual(planRelayChunks(0), [{ seq: 0, start: 0, end: 0, final: true }])
  })

  it('自定义块大小被尊重，非法值回退默认', () => {
    const ranges = planRelayChunks(2500, 1000)
    assert.deepEqual(ranges.map((range) => range.start), [0, 1000, 2000])
    assert.deepEqual(planRelayChunks(1500, 0).map((range) => range.end), [1500])
  })
})

describe('媒体回退文案（#3526）', () => {
  it('页面字节读取失败时 toast 说明原因', () => {
    const zh = saveFallbackToast('capture-media-unavailable', 'zh')
    const en = saveFallbackToast('capture-media-unavailable', 'en')
    assert.match(zh, /^已保存到灵感库（页面媒体字节读取失败，已转云端解析）$/)
    assert.match(en, /^Saved to Inspiration Library \(page media bytes were unavailable; parsed in the cloud\)$/)
  })
})

describe('回传接线文本契约（#3526）', () => {
  const background = readFileSync(resolve(__dirname, '../src/background/index.ts'), 'utf8')
  const content = readFileSync(resolve(__dirname, '../src/content/index.ts'), 'utf8')
  const relay = readFileSync(resolve(__dirname, '../src/background/media-relay.ts'), 'utf8')

  it('background 在 capture 分支先尝试 relay，失败才回退', () => {
    assert.equal(background.includes('shouldRelayPost(attempt.post)'), true)
    assert.equal(background.includes('relayCapturedMedia(attempt.post, tabId, candidatePorts)'), true)
    assert.equal(background.includes("via: 'relay'"), true)
    assert.equal(background.includes("'CAPTURE_MEDIA_CHUNK'"), true)
  })

  it('content script 有按块读取与转发', () => {
    assert.equal(content.includes("action === 'RELAY_CAPTURE_MEDIA'"), true)
    assert.equal(content.includes('planRelayChunks(bytes.length)'), true)
    assert.equal(content.includes("type: 'CAPTURE_MEDIA_CHUNK'"), true)
    assert.equal(content.includes('withCredentials = true'), true)
  })

  it('host 路径与平台判定在 relay 模块', () => {
    assert.equal(relay.includes("'/omnimux/inspiration/local/capture-media-session'"), true)
    assert.equal(relay.includes("'/omnimux/inspiration/local/capture-media-chunk'"), true)
    assert.equal(relay.includes("'/omnimux/inspiration/local/capture-commit'"), true)
    assert.equal(relay.includes("new Set(['tiktok'])"), true)
    assert.equal(relay.includes("reason: 'capture-media-unavailable'"), true)
  })
})
