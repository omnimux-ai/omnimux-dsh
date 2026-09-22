import test from 'node:test'
import assert from 'node:assert/strict'
import {
  peekComposerPrefill,
  queueComposerPrefill,
  resetComposerPrefill,
  takeComposerPrefill,
} from './composer-prefill.js'

test('填入请求只被取走一次，空内容不入队', () => {
  resetComposerPrefill()
  assert.equal(queueComposerPrefill({ prompt: '   ', kind: 'image' }), null)
  const queued = queueComposerPrefill({ prompt: 'blue hill', kind: 'video', token: 'a' })
  assert.equal(queued.kind, 'video')
  assert.equal(takeComposerPrefill('other'), null)
  assert.equal(peekComposerPrefill()?.prompt, 'blue hill')
  assert.equal(takeComposerPrefill('a')?.prompt, 'blue hill')
  assert.equal(peekComposerPrefill(), null)
})
