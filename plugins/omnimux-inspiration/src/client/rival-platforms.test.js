/**
 * Platform presentation contract shared by the account rows, the post cards and
 * the account-monitor platform filter (#3454).
 *
 * The glyph table and the dropdown builder are pure data/functions, so these
 * gates assert them directly instead of mounting the whole stage: UI04 forbids
 * emoji and character icons, and an unknown platform must not borrow another
 * platform's logo.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RIVAL_PLATFORM_PATHS, buildRivalPlatformOptions, platformMarkPath } from './rival-platforms.js'
import { CLOUD_RIVAL_PLATFORMS, RIVAL_PLATFORMS } from '../rival/constants.js'
import { en, zh } from './locales.js'

/** The filter builder only formats `platform.<slug>` keys; echo them back. */
const tIdentity = (key) => key

describe('rival platform marks: six platforms, neutral unknown', () => {
  it('draws every monitorable platform with its own hand-written path', () => {
    for (const platform of RIVAL_PLATFORMS) {
      const path = platformMarkPath(platform)
      assert.equal(typeof path, 'string')
      assert.ok(path.length > 20, `${platform} must carry a real 16x16 path`)
      assert.ok(/^[Mm]/.test(path), `${platform} must be a drawn path, never a character glyph`)
      if (platform !== 'x') {
        assert.notEqual(path, RIVAL_PLATFORM_PATHS.x, `${platform} must not reuse the X glyph`)
      }
    }
    // 抖音与小红书各有独立图形，且彼此不同。
    assert.notEqual(RIVAL_PLATFORM_PATHS.douyin, RIVAL_PLATFORM_PATHS.xiaohongshu)
    assert.notEqual(RIVAL_PLATFORM_PATHS.douyin, RIVAL_PLATFORM_PATHS.tiktok)
  })

  it('never degrades an unknown platform to the X mark', () => {
    assert.equal(platformMarkPath('browser'), RIVAL_PLATFORM_PATHS.unknown)
    assert.equal(platformMarkPath(''), RIVAL_PLATFORM_PATHS.unknown)
    assert.equal(platformMarkPath(undefined), RIVAL_PLATFORM_PATHS.unknown)
    assert.notEqual(platformMarkPath('browser'), RIVAL_PLATFORM_PATHS.x)
    assert.notEqual(platformMarkPath('browser'), RIVAL_PLATFORM_PATHS.douyin)
  })
})

describe('account-monitor platform filter exposes douyin and xiaohongshu', () => {
  it('lists 全部 first, then every monitorable platform in order', () => {
    const options = buildRivalPlatformOptions(tIdentity)
    assert.equal(options[0].value, '')
    assert.equal(options[0].label, 'platform.all')
    assert.equal(options.length, RIVAL_PLATFORMS.length + 1)
    const values = options.slice(1).map((option) => option.value)
    assert.deepEqual(values, Array.from(RIVAL_PLATFORMS))
    const douyin = options.find((option) => option.value === 'douyin')
    const xiaohongshu = options.find((option) => option.value === 'xiaohongshu')
    assert.ok(douyin, '抖音 must be a selectable filter value')
    assert.ok(xiaohongshu, '小红书 must be a selectable filter value')
    assert.equal(douyin.label, 'platform.douyin')
    assert.equal(xiaohongshu.label, 'platform.xiaohongshu')
  })

  it('resolves the Chinese and English platform names', () => {
    assert.equal(zh['platform.douyin'], '抖音')
    assert.equal(zh['platform.xiaohongshu'], '小红书')
    assert.equal(en['platform.douyin'], 'Douyin')
    assert.equal(en['platform.xiaohongshu'], 'Xiaohongshu')
    // The cloud capability list stays the four collected platforms; the monitor
    // set is the wider six.
    assert.deepEqual(Array.from(CLOUD_RIVAL_PLATFORMS), ['tiktok', 'instagram', 'youtube', 'x'])
    assert.equal(RIVAL_PLATFORMS.includes('douyin'), true)
    assert.equal(RIVAL_PLATFORMS.includes('xiaohongshu'), true)
  })
})
