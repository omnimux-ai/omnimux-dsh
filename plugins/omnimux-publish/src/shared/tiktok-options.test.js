import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_TIKTOK_OPTIONS,
  TIKTOK_PRIVACY_LEVELS,
  buildCreateTikTokOptions,
  normalizeTikTokOptions,
  privacyChoices,
  tiktokOptionProblems,
} from './tiktok-options.js'

describe('normalizeTikTokOptions', () => {
  it('fills defaults and keeps booleans strict', () => {
    assert.deepEqual(normalizeTikTokOptions(undefined), { ...DEFAULT_TIKTOK_OPTIONS })
    const options = normalizeTikTokOptions({ privacy_level: 'public_to_everyone', allow_comment: 'false', commercial_content: 1 })
    assert.equal(options.privacy_level, 'PUBLIC_TO_EVERYONE')
    assert.equal(options.allow_comment, false)
    assert.equal(options.commercial_content, false)
  })

  it('drops unknown privacy levels back to SELF_ONLY', () => {
    assert.equal(normalizeTikTokOptions({ privacy_level: 'EVERYONE' }).privacy_level, 'SELF_ONLY')
    assert.equal(normalizeTikTokOptions({ privacy_level: '' }).privacy_level, 'SELF_ONLY')
  })

  it('accepts every documented privacy level', () => {
    for (const level of TIKTOK_PRIVACY_LEVELS) {
      assert.equal(normalizeTikTokOptions({ privacy_level: level }).privacy_level, level)
    }
  })
})

describe('privacyChoices', () => {
  it('trusts creator-info options when present', () => {
    assert.deepEqual(privacyChoices({ privacy_level_options: ['SELF_ONLY'] }), ['SELF_ONLY'])
    assert.deepEqual(
      privacyChoices({ privacy_level_options: ['public_to_everyone', 'SELF_ONLY'] }),
      ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
    )
  })

  it('falls back to all levels when creator-info is missing or empty', () => {
    assert.deepEqual(privacyChoices(null), [...TIKTOK_PRIVACY_LEVELS])
    assert.deepEqual(privacyChoices({ privacy_level_options: [] }), [...TIKTOK_PRIVACY_LEVELS])
    assert.deepEqual(privacyChoices({ privacy_level_options: ['UNKNOWN'] }), [...TIKTOK_PRIVACY_LEVELS])
  })
})

describe('tiktokOptionProblems', () => {
  it('accepts the default combination', () => {
    assert.deepEqual(tiktokOptionProblems(normalizeTikTokOptions(undefined)), [])
  })

  it('requires a commercial kind and music confirmation', () => {
    assert.deepEqual(
      tiktokOptionProblems(normalizeTikTokOptions({ commercial_content: true })),
      ['commercial-brand-required', 'music-confirmation-required'],
    )
  })

  it('refuses branded content with SELF_ONLY', () => {
    assert.deepEqual(
      tiktokOptionProblems(normalizeTikTokOptions({ commercial_content: true, branded_content: true, music_usage_confirmed: true })),
      ['branded-requires-public'],
    )
  })
})

describe('buildCreateTikTokOptions', () => {
  it('returns undefined when nothing was stored', () => {
    assert.equal(buildCreateTikTokOptions(undefined), undefined)
    assert.equal(buildCreateTikTokOptions(null), undefined)
  })

  it('maps interaction toggles and privacy level', () => {
    assert.deepEqual(
      buildCreateTikTokOptions({ privacy_level: 'PUBLIC_TO_EVERYONE', allow_comment: false, allow_duet: false, allow_stitch: true }),
      { privacy_level: 'PUBLIC_TO_EVERYONE', allow_comment: false, allow_duet: false, allow_stitch: true },
    )
  })

  it('includes commercial disclosure and music confirmation only when chosen', () => {
    const body = buildCreateTikTokOptions({
      privacy_level: 'PUBLIC_TO_EVERYONE', commercial_content: true, your_brand: true, music_usage_confirmed: true,
    })
    assert.equal(body.commercial_content, true)
    assert.equal(body.your_brand, true)
    assert.equal(body.branded_content, false)
    assert.equal(body.music_usage_confirmed, true)
    const plain = buildCreateTikTokOptions({ privacy_level: 'SELF_ONLY' })
    assert.equal(Object.hasOwn(plain, 'commercial_content'), false)
    assert.equal(Object.hasOwn(plain, 'music_usage_confirmed'), false)
  })
})
