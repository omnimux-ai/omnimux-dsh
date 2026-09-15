import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  decideSharePollOutcome,
  expiryDurationText,
  isShareFailed,
  isShareRunning,
  shareErrorText,
  shareLocaleKeys,
  shareStageOf,
  shareSteps,
  shareUrlOf,
  shareValidityText,
} from './share-status.js'
import { en, zh } from './locales.js'

/** The locale lookup the component passes in. */
const t = (key, dict = zh) => dict[key] || key

describe('share status — presentation contract', () => {
  it('reads a row with no share fields as never published', () => {
    assert.equal(isShareRunning({}), false)
    assert.equal(isShareFailed({}), false)
    assert.equal(shareUrlOf({}), '')
    assert.equal(shareErrorText({}), '')
    assert.equal(shareStageOf({}), '')
    assert.deepEqual(shareSteps({}, t), [])
  })

  it('marks each step from the stage the server published', () => {
    const states = (row) => shareSteps(row, t).map((step) => `${step.id}:${step.state}`)

    assert.deepEqual(states({ share_status: 'running', share_stage: 'preparing' }), [
      'preparing:active',
      'uploading:todo',
      'publishing:todo',
    ])
    assert.deepEqual(states({ share_status: 'running', share_stage: 'uploading' }), [
      'preparing:done',
      'uploading:active',
      'publishing:todo',
    ])
    assert.deepEqual(states({ share_status: 'running', share_stage: 'publishing' }), [
      'preparing:done',
      'uploading:done',
      'publishing:active',
    ])
    // A running row with no usable stage still says something: the first step.
    assert.deepEqual(states({ share_status: 'running' }), [
      'preparing:active',
      'uploading:todo',
      'publishing:todo',
    ])
  })

  it('labels the steps in the page language', () => {
    const row = { share_status: 'running', share_stage: 'uploading' }
    assert.deepEqual(shareSteps(row, t).map((step) => step.label), ['准备素材', '上传素材', '发布中'])
    assert.deepEqual(shareSteps(row, (key) => t(key, en)).map((step) => step.label), [
      'Preparing assets',
      'Uploading assets',
      'Publishing',
    ])
  })

  it('renders the link only for a row the cloud published', () => {
    assert.equal(shareUrlOf({ share_status: 'done', share_url: 'https://omnimux.ai/s/insp_a' }), 'https://omnimux.ai/s/insp_a')
    assert.equal(shareUrlOf({ share_status: 'running', share_url: 'https://omnimux.ai/s/insp_a' }), '')
    assert.equal(shareUrlOf({ share_status: 'failed', share_url: 'https://omnimux.ai/s/insp_a' }), '')
    assert.equal(shareUrlOf({ share_status: 'idle' }), '')
  })

  it('surfaces a failure reason only on a failed row', () => {
    assert.equal(shareErrorText({ share_status: 'failed', share_error: '素材超过 100MB 上限' }), '素材超过 100MB 上限')
    assert.equal(shareErrorText({ share_status: 'done', share_error: 'stale text' }), '')
    assert.equal(shareErrorText({ share_status: 'failed', share_error: '   ' }), '')
  })

  it('describes validity from the cloud value, never from an assumption', () => {
    assert.equal(shareValidityText({ share_expires_in: '72h' }, t), '链接有效期 72 小时')
    assert.equal(shareValidityText({ share_expires_in: '48h' }, t), '链接有效期 48 小时')
    assert.equal(shareValidityText({ share_expires_in: '3d' }, t), '链接有效期 3 天')
    assert.equal(shareValidityText({ share_expires_in: 'permanent' }, t), '链接有效期 永久')
    assert.equal(shareValidityText({ share_expires_in: 'forever' }, t), '链接有效期 永久')
    assert.equal(shareValidityText({}, t), '')
    assert.equal(shareValidityText({ share_expires_in: 'più tardi' }, t), '链接有效期 più tardi')
    assert.equal(expiryDurationText('72H', t), '72 小时')
  })

  it('stops polling exactly when the publish settles, whichever way', () => {
    assert.deepEqual(decideSharePollOutcome(null, { share_status: 'running' }), { action: 'keep' })
    assert.deepEqual(decideSharePollOutcome({ ok: false, status: 500 }, { share_status: 'running' }), { action: 'keep' })
    assert.deepEqual(decideSharePollOutcome({ ok: false, status: 404 }, { share_status: 'running' }), { action: 'gone' })
    assert.deepEqual(decideSharePollOutcome({ ok: true, status: 200, body: {} }, { share_status: 'running' }), { action: 'keep' })

    const running = { ok: true, status: 200, body: { data: { id: 'x', share_status: 'running', share_stage: 'uploading' } } }
    assert.equal(decideSharePollOutcome(running, null).action, 'pending')

    const failed = { ok: true, status: 200, body: { data: { id: 'x', share_status: 'failed', share_error: 'boom' } } }
    assert.equal(decideSharePollOutcome(failed, null).action, 'failed')

    const done = { ok: true, status: 200, body: { data: { id: 'x', share_status: 'done', share_url: 'https://omnimux.ai/s/insp_a' } } }
    assert.equal(decideSharePollOutcome(done, null).action, 'settled')

    const idle = { ok: true, status: 200, body: { data: { id: 'x' } } }
    assert.equal(decideSharePollOutcome(idle, null).action, 'settled')
  })

  it('keeps its locale keys present in both languages', () => {
    for (const key of shareLocaleKeys()) {
      assert.equal(typeof zh[key], 'string', `zh is missing ${key}`)
      assert.equal(typeof en[key], 'string', `en is missing ${key}`)
    }
  })
})
