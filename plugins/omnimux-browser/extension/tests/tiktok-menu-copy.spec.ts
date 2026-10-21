// @vitest-environment jsdom
// @ts-nocheck
//
// 断言使用 node:assert/strict，且本文件不使用 TS 专有语法：仓库 guard-anti-cheat
// 的静态检查只对既有风险的 expect 调用放行，新测试文件必须能被 acorn 解析。
import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { tiktokCopy } from '../src/content/tiktok-scene/copy.ts'

describe('TikTok 快捷菜单文案 (Issue #3590)', () => {
  it('中文三项：下载视频 / 下载音频 / 收藏到灵感库', () => {
    const copy = tiktokCopy('zh')
    assert.deepEqual(Object.values(copy.menu), ['下载视频', '下载音频', '收藏到灵感库'])
    assert.equal(copy.menu.audio, '下载音频')
  })

  it('英文三项：Download video / Download audio / Save to library', () => {
    const copy = tiktokCopy('en')
    assert.deepEqual(Object.values(copy.menu), ['Download video', 'Download audio', 'Save to library'])
    assert.equal(copy.menu.audio, 'Download audio')
  })

  it('动作 id 不变：菜单顺序仍是 video / audio / save', () => {
    assert.deepEqual(Object.keys(tiktokCopy('zh').menu), ['video', 'audio', 'save'])
  })
})
