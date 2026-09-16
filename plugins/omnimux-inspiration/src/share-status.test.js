import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CLOUD_SHARE_STAGE_ORDER,
  SHARE_SOURCES,
  SHARE_STAGES,
  SHARE_STAGE_ORDER,
  shareDonePatch,
  shareFailedPatch,
  shareRunningPatch,
  shareStageOrderFor,
} from './share-status.js'

describe('share lifecycle — source-aware stages', () => {
  it('walks a shorter sequence for a cloud entry, which has no upload leg', () => {
    assert.deepEqual([...CLOUD_SHARE_STAGE_ORDER], [SHARE_STAGES.PREPARING, SHARE_STAGES.PUBLISHING])
    assert.deepEqual([...SHARE_STAGE_ORDER], [SHARE_STAGES.PREPARING, SHARE_STAGES.UPLOADING, SHARE_STAGES.PUBLISHING])
    assert.equal(shareStageOrderFor(SHARE_SOURCES.CLOUD), CLOUD_SHARE_STAGE_ORDER)
    assert.equal(shareStageOrderFor(SHARE_SOURCES.LOCAL), SHARE_STAGE_ORDER)
    // Anything unrecognised keeps the original local sequence.
    assert.equal(shareStageOrderFor(undefined), SHARE_STAGE_ORDER)
    assert.equal(shareStageOrderFor('nonsense'), SHARE_STAGE_ORDER)
  })

  it('stamps the source on the running row, defaulting to the local path', () => {
    assert.equal(shareRunningPatch(SHARE_STAGES.PREPARING).share_source, 'local')
    assert.equal(
      shareRunningPatch(SHARE_STAGES.PREPARING, { source: SHARE_SOURCES.CLOUD }).share_source,
      'cloud',
    )
    assert.equal(
      shareRunningPatch(SHARE_STAGES.PREPARING, { source: 'nonsense' }).share_source,
      'local',
    )
  })

  it('clears a previous attempt\'s link and any stale skip marker when claiming the row', () => {
    const patch = shareRunningPatch(SHARE_STAGES.PREPARING, { source: 'cloud', now: 'T0' })
    assert.deepEqual(patch, {
      share_status: 'running',
      share_stage: 'preparing',
      share_source: 'cloud',
      share_started_at: 'T0',
      share_completed_at: null,
      share_error: null,
      share_url: null,
      share_id: null,
      share_storage_bucket: null,
      share_is_admin: null,
      share_expires_at: null,
      share_expires_in: null,
      share_media_skipped: null,
    })
  })

  it('records which asset the cloud could not serve, and only a real one', () => {
    const done = (mediaSkipped) => shareDonePatch({ shareId: 's', shareUrl: 'u', mediaSkipped }).share_media_skipped
    assert.equal(done('video'), 'video')
    assert.equal(done('image'), 'image')
    assert.equal(done(''), null)
    assert.equal(done(undefined), null)
    assert.equal(done('audio'), null)
    assert.equal(done(true), null)
  })

  it('keeps the cloud answer verbatim on the done row', () => {
    const patch = shareDonePatch({
      shareId: 'insp_1',
      shareUrl: 'https://omnimux.ai/s/insp_1',
      storageBucket: 'omnimux-files',
      isAdmin: true,
      expiresAt: '2026-09-18T23:00:00+08:00',
      expiresIn: '72h',
    }, { now: 'T1' })

    assert.equal(patch.share_status, 'done')
    assert.equal(patch.share_stage, null)
    assert.equal(patch.share_completed_at, 'T1')
    assert.equal(patch.share_url, 'https://omnimux.ai/s/insp_1')
    assert.equal(patch.share_expires_in, '72h')
    assert.equal(patch.share_is_admin, true)
  })

  it('never leaves a link or a skip marker on a failed row', () => {
    const patch = shareFailedPatch('云端素材不可访问')
    assert.equal(patch.share_status, 'failed')
    assert.equal(patch.share_url, null)
    assert.equal(patch.share_id, null)
    assert.equal(patch.share_media_skipped, null)
    assert.equal(patch.share_error, '云端素材不可访问')

    assert.equal(shareFailedPatch('').share_error, '分享发布失败，请稍后重试')
  })
})
