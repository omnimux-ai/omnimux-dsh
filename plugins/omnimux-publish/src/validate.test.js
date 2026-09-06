import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseDraftPayload, validateContent, validateForSubmit, validationError } from './validate.js'
import { PublishError } from './store.js'

const PLATFORMS = {
  tiktok: { media_types: ['image', 'video'], supports_cover: false, supports_schedule: false, max_images: 18 },
}

const ACCOUNTS = [
  { id: 'a1', provider: 'tiktok_direct', platform: 'tiktok', status: 'active' },
  { id: 'a2', provider: 'tiktok_direct', platform: 'tiktok', status: 'active' },
  { id: 'a3', provider: 'tiktok_direct', platform: 'tiktok', status: 'expired' },
  { id: 'a4', provider: 'tiktok_direct', platform: 'tiktok', status: 'active', agent_usable: false },
]

describe('validateContent（草稿内容自身校验）', () => {
  it('accepts a well-formed image draft', () => {
    const errors = validateContent({
      type: 'image',
      title: '标题',
      description: '描述',
      mediaRows: [{ id: 'm1', kind: 'image' }, { id: 'm2', kind: 'image' }],
      coverRow: null,
    })
    assert.deepEqual(errors, [])
  })

  it('accepts a well-formed video draft', () => {
    const errors = validateContent({
      type: 'video',
      description: '描述',
      mediaRows: [{ id: 'm1', kind: 'video' }],
      coverRow: { id: 'c1', kind: 'image' },
    })
    assert.deepEqual(errors, [])
  })

  it('rejects image draft without title / images', () => {
    const errors = validateContent({ type: 'image', mediaRows: [], title: '' })
    assert.ok(errors.some((e) => e.code === 'image-required'))
    assert.ok(errors.some((e) => e.code === 'title-required'))
    assert.ok(errors.some((e) => e.code === 'text-required'))
  })

  it('rejects video draft without a video file', () => {
    const errors = validateContent({ type: 'video', description: 'd', mediaRows: [{ id: 'm1', kind: 'image' }] })
    assert.ok(errors.some((e) => e.code === 'video-required'))
  })

  it('rejects unknown media kinds and non-image covers', () => {
    const errors = validateContent({
      type: 'image', title: 't',
      mediaRows: [{ id: 'm1', kind: 'image' }, { id: 'm2', kind: 'other' }],
      coverRow: { id: 'c1', kind: 'video' },
    })
    assert.ok(errors.some((e) => e.code === 'media-kind-unsupported'))
    assert.ok(errors.some((e) => e.code === 'cover-not-image'))
  })
})

describe('validateForSubmit: official account source, availability and capabilities', () => {
  const imageDraft = { type: 'image', title: 'title', mediaRows: [{ id: 'm1', kind: 'image' }], account_ids: ['a1'] }

  it('accepts a usable official account', () => {
    assert.equal(validateForSubmit(imageDraft, { accounts: ACCOUNTS, platforms: PLATFORMS }).ok, true)
  })

  it('rejects missing, unknown, Zernio and forged non-TikTok sources', () => {
    for (const row of [null, { id: 'a1', platform: 'tiktok' }, { id: 'a1', platform: 'tiktok', provider: 'unknown' }, { id: 'a1', platform: 'tiktok', provider: 'zernio' }, { id: 'a1', platform: 'instagram', provider: 'tiktok_direct' }]) {
      const verdict = validateForSubmit(imageDraft, { accounts: row ? [row] : [], platforms: PLATFORMS })
      assert.equal(verdict.ok, false)
      assert.ok(verdict.errors.some((e) => e.code === 'account-provider-mismatch'))
      assert.equal(validationError(verdict.errors).code, 'account-provider-mismatch')
    }
  })

  it('rejects expired and Agent-disabled official accounts', () => {
    for (const id of ['a3', 'a4']) {
      const result = validateForSubmit({ ...imageDraft, account_ids: [id] }, { accounts: ACCOUNTS, platforms: PLATFORMS })
      assert.ok(result.errors.some((e) => e.code === 'account-unavailable'))
    }
  })

  it('enforces cover, image count and media type capabilities after source validation', () => {
    const conflicts = validateForSubmit({ ...imageDraft, coverRow: { id: 'cover', kind: 'image' }, mediaRows: Array.from({ length: 20 }, (_, i) => ({ id: String(i), kind: 'image' })) }, { accounts: ACCOUNTS, platforms: PLATFORMS })
    assert.ok(conflicts.errors.some((e) => e.code === 'capability-conflict' && /不支持封面/.test(e.message)))
    assert.ok(conflicts.errors.some((e) => e.code === 'capability-conflict' && /最多 18 张图/.test(e.message)))
    const imageOnly = validateForSubmit({ type: 'video', description: 'd', mediaRows: [{ id: 'v', kind: 'video' }], account_ids: ['a1'] }, { accounts: ACCOUNTS, platforms: { tiktok: { media_types: ['image'] } } })
    assert.ok(imageOnly.errors.some((e) => e.code === 'capability-conflict' && /不支持视频/.test(e.message)))
  })

  it('distinguishes missing selection and missing platform capability definitions', () => {
    const empty = validateForSubmit({ ...imageDraft, account_ids: [] }, { accounts: ACCOUNTS, platforms: PLATFORMS })
    assert.ok(empty.errors.some((e) => e.code === 'accounts-required'))
    const unknown = validateForSubmit(imageDraft, { accounts: ACCOUNTS, platforms: {} })
    assert.ok(unknown.errors.some((e) => e.code === 'platform-unknown'))
  })
})

describe('validationError 形态', () => {
  it('carries structured details for the tool/HTTP faces', () => {
    const error = validationError([{ code: 'image-required', field: 'media', message: 'x' }])
    assert.ok(error instanceof PublishError)
    assert.equal(error.code, 'validation-failed')
    assert.deepEqual(error.details.errors.length, 1)
  })
})

describe('parseDraftPayload', () => {
  it('normalizes media refs with path or media_id', () => {
    const parsed = parseDraftPayload({ title: 't', media: [{ path: '/a.png' }, { media_id: 'abc' }] })
    assert.deepEqual(parsed.media, [{ path: '/a.png' }, { media_id: 'abc' }])
  })

  it('rejects media entries without path/media_id', () => {
    assert.throws(() => parseDraftPayload({ media: [{}] }), (e) => e.code === 'invalid-arguments')
    assert.throws(() => parseDraftPayload({ media: 'nope' }), (e) => e.code === 'invalid-arguments')
  })

  it('parses cover and rejects bad topics', () => {
    const parsed = parseDraftPayload({ cover: { media_id: 'c' }, topics: ['a', 'b'] })
    assert.deepEqual(parsed.cover, { media_id: 'c' })
    assert.throws(() => parseDraftPayload({ topics: [1] }), (e) => e.code === 'invalid-arguments')
    assert.throws(() => parseDraftPayload({ cover: {} }), (e) => e.code === 'invalid-arguments')
  })

  it('rejects non-object payloads', () => {
    assert.throws(() => parseDraftPayload('x'), (e) => e.code === 'invalid-arguments')
  })
})
