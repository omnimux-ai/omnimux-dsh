import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  accountUsable,
  coverDecision,
  formCapabilities,
  groupAccountsByPlatform,
  imageLimit,
  parseTopics,
  platformRow,
  supportsType,
} from './capabilities.js'

const PLATFORMS = {
  xiaohongshu: { media_types: ['image', 'video'], supports_cover: false, max_images: 18 },
  douyin: { media_types: ['video', 'image'], supports_cover: true, max_images: 35 },
  bilibili: { media_types: ['video'], supports_cover: true },
}

describe('platformRow / supportsType', () => {
  it('looks up matrix rows case-insensitively and tolerates unknown platforms', () => {
    assert.equal(platformRow(PLATFORMS, 'XiaoHongShu').max_images, 18)
    assert.deepEqual(platformRow(PLATFORMS, 'nope'), {})
    assert.deepEqual(platformRow(undefined, 'douyin'), {})
    // 未知平台不拦截；bilibili 不支持 image
    assert.equal(supportsType(PLATFORMS, 'nope', 'image'), true)
    assert.equal(supportsType(PLATFORMS, 'bilibili', 'image'), false)
    assert.equal(supportsType(PLATFORMS, 'bilibili', 'video'), true)
    assert.equal(supportsType(PLATFORMS, 'xiaohongshu', 'video'), true)
  })
})

describe('coverDecision（封面置灰判定）', () => {
  it('cover enabled only when every selected platform supports it', () => {
    assert.deepEqual(coverDecision(PLATFORMS, ['douyin']), { enabled: true, blockedPlatforms: [] })
    assert.deepEqual(coverDecision(PLATFORMS, ['xiaohongshu']), { enabled: false, blockedPlatforms: ['xiaohongshu'] })
    assert.deepEqual(coverDecision(PLATFORMS, ['douyin', 'xiaohongshu']), { enabled: false, blockedPlatforms: ['xiaohongshu'] })
    // 未选账号 → 不拦截（还没有冲突面）
    assert.deepEqual(coverDecision(PLATFORMS, []), { enabled: true, blockedPlatforms: [] })
    // 去重
    assert.deepEqual(coverDecision(PLATFORMS, ['XiaoHongShu', 'xiaohongshu']).blockedPlatforms, ['xiaohongshu'])
  })
})

describe('imageLimit（图片数量上限）', () => {
  it('takes the minimum across selected platforms; undefined when unlimited', () => {
    assert.equal(imageLimit(PLATFORMS, ['douyin']), 35)
    assert.equal(imageLimit(PLATFORMS, ['douyin', 'xiaohongshu']), 18)
    assert.equal(imageLimit(PLATFORMS, ['bilibili']), undefined)
    assert.equal(imageLimit(PLATFORMS, []), undefined)
  })
})

describe('formCapabilities（表单整体裁剪视图）', () => {
  const accounts = [
    { id: 'a1', platform: 'douyin', status: 'active' },
    { id: 'a2', platform: 'xiaohongshu', status: 'active' },
  ]

  it('aggregates cover / limit / conflicts for an image draft', () => {
    const caps = formCapabilities({ platforms: PLATFORMS, selectedAccounts: accounts, type: 'image', imageCount: 20 })
    assert.equal(caps.cover.enabled, false)
    assert.deepEqual(caps.cover.blockedPlatforms, ['xiaohongshu'])
    assert.equal(caps.imageLimit, 18)
    assert.equal(caps.imageOverLimit, true)
    assert.deepEqual(caps.typeConflicts, [])
  })

  it('video draft with image-only platform surfaces type conflicts', () => {
    const caps = formCapabilities({
      platforms: PLATFORMS,
      selectedAccounts: [{ id: 'a3', platform: 'bilibili', status: 'active' }, { id: 'a4', platform: 'xiaohongshu', status: 'active' }],
      type: 'video',
    })
    assert.deepEqual(caps.typeConflicts, [])
    const conflicting = formCapabilities({
      platforms: { weibo: { media_types: ['image'], supports_cover: false } },
      selectedAccounts: [{ id: 'a5', platform: 'weibo', status: 'active' }],
      type: 'video',
    })
    assert.deepEqual(conflicting.typeConflicts, ['weibo'])
  })

  it('tolerates missing selections', () => {
    const caps = formCapabilities({ platforms: PLATFORMS, selectedAccounts: [], type: 'image', imageCount: 0 })
    assert.equal(caps.cover.enabled, true)
    assert.equal(caps.imageOverLimit, false)
  })
})

describe('accountUsable（可用性判定，与 Host 同义）', () => {
  it('active/expiring usable; expired/error/agent_off not', () => {
    const account = { platform: 'tiktok', provider: 'tiktok_direct' }
    assert.deepEqual(accountUsable({ ...account, status: 'active' }), { ok: true, reason: '' })
    assert.deepEqual(accountUsable({ ...account, status: 'expiring' }), { ok: true, reason: '' })
    assert.deepEqual(accountUsable({ ...account, status: 'expired' }), { ok: false, reason: 'expired' })
    assert.deepEqual(accountUsable({ ...account, status: 'error' }), { ok: false, reason: 'error' })
    assert.deepEqual(accountUsable({ ...account, status: 'active', agent_usable: false }), { ok: false, reason: 'agentOff' })
    assert.deepEqual(accountUsable({}), { ok: false, reason: 'error' })
  })
})

describe('groupAccountsByPlatform（两级勾选分组）', () => {
  it('groups, sorts platforms, and marks usability per row', () => {
    const groups = groupAccountsByPlatform([
      { id: '1', provider: 'tiktok_direct', platform: 'tiktok', status: 'active' },
      { id: '2', provider: 'tiktok_direct', platform: 'tiktok', status: 'expired' },
      { id: '3', provider: 'tiktok_direct', platform: 'tiktok', status: 'active', agent_usable: false },
      { id: '4' },
      { id: '5', provider: 'zernio', platform: 'tiktok', status: 'active' },
      { id: '6', provider: 'unknown', platform: 'tiktok', status: 'active' },
    ])
    assert.deepEqual(groups.map((g) => g.platform), ['tiktok'])
    assert.deepEqual(groups[0].accounts.map((a) => a.id), ['1', '2', '3'])
    assert.deepEqual(groups[0].accounts.map((a) => a.usable), [true, false, false])
    assert.equal(groups[0].accounts[1].unusableReason, 'expired')
    assert.equal(groups[0].accounts[2].unusableReason, 'agentOff')
    assert.deepEqual(groupAccountsByPlatform('junk'), [])
  })
})

describe('parseTopics', () => {
  it('splits on spaces and commas, strips leading #', () => {
    assert.deepEqual(parseTopics('#旅行 摄影,ai，vlog'), ['旅行', '摄影', 'ai', 'vlog'])
    assert.deepEqual(parseTopics('  '), [])
    assert.deepEqual(parseTopics('single'), ['single'])
  })
})
