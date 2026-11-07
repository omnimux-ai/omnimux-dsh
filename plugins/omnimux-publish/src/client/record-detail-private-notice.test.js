import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { showsPrivateNotice } from './detail-notice.js'

const OFFICIAL = { platform: 'tiktok', provider: 'tiktok_direct' }

describe('RecordDetail private-visibility notice (Issue #3913)', () => {
  it('shows for a submitted, reviewing or published direct task with a post id', () => {
    for (const status of ['submitted', 'reviewing', 'published']) {
      assert.equal(showsPrivateNotice([{ ...OFFICIAL, status, post_id: 'v_pub_1' }]), true, status)
    }
  })

  it('hides while the task is still submitting or failed', () => {
    for (const status of ['submitting', 'failed']) {
      assert.equal(showsPrivateNotice([{ ...OFFICIAL, status, post_id: 'v_pub_1' }]), false, status)
    }
  })

  it('hides when no upstream post id exists yet', () => {
    assert.equal(showsPrivateNotice([{ ...OFFICIAL, status: 'submitted', post_id: '' }]), false)
    assert.equal(showsPrivateNotice([{ ...OFFICIAL, status: 'submitted' }]), false)
  })

  it('hides for non-official and source-less historical tasks', () => {
    assert.equal(showsPrivateNotice([{ platform: 'tiktok', provider: 'zernio', status: 'published', post_id: 'x' }]), false)
    assert.equal(showsPrivateNotice([{ platform: 'tiktok', status: 'published', post_id: 'x' }]), false)
  })

  it('tolerates empty and malformed input', () => {
    assert.equal(showsPrivateNotice([]), false)
    assert.equal(showsPrivateNotice(undefined), false)
    assert.equal(showsPrivateNotice([null, 'x']), false)
  })
})

describe('privacy-aware private notice', () => {
  it('hides the notice when the record was published with a wider privacy level', () => {
    const tasks = [{ ...OFFICIAL, status: 'published', post_id: 'v_pub_2' }]
    assert.equal(showsPrivateNotice(tasks, { settings: { tiktok_options: { privacy_level: 'PUBLIC_TO_EVERYONE' } } }), false)
  })

  it('keeps the notice for SELF_ONLY and for legacy records without options', () => {
    const tasks = [{ ...OFFICIAL, status: 'published', post_id: 'v_pub_3' }]
    assert.equal(showsPrivateNotice(tasks, { settings: { tiktok_options: { privacy_level: 'SELF_ONLY' } } }), true)
    assert.equal(showsPrivateNotice(tasks, { settings: {} }), true)
  })
})
