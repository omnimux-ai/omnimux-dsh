import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getNativeComposerSnapshot,
  publishNativeComposer,
  subscribeNativeComposer,
} from './nativeComposerBridge.ts'

describe('native composer bridge', () => {
  it('forwards native uploads to the tray above the composer', () => {
    const seen = []
    const stop = subscribeNativeComposer(() => seen.push(getNativeComposerSnapshot().attachments.length))
    publishNativeComposer({
      attachments: [{ id: 'n1', kind: 'file', title: 'clip.mp4' }],
      onRemoveAttachment() {},
    })
    assert.equal(getNativeComposerSnapshot().attachments[0].id, 'n1')
    publishNativeComposer(null)
    assert.deepEqual(getNativeComposerSnapshot().attachments, [])
    stop()
    assert.ok(seen.includes(1))
  })
})
