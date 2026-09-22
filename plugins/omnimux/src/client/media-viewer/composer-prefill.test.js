import test from 'node:test'
import assert from 'node:assert/strict'
import {
  peekComposerPrefill,
  queueComposerPrefill,
  resetComposerPrefill,
  subscribeComposerPrefill,
  takeComposerPrefill,
} from './composer-prefill.js'

test('填入请求只被取走一次，空内容不入队', () => {
  resetComposerPrefill()
  assert.equal(queueComposerPrefill({ prompt: '   ', kind: 'image' }), null)
  const queued = queueComposerPrefill({ prompt: 'blue hill', kind: 'video', token: 'a' })
  assert.equal(queued.kind, 'video')
  assert.equal(takeComposerPrefill('other'), null)
  assert.equal(peekComposerPrefill()?.prompt, 'blue hill')
  const seen = []
  const stop = subscribeComposerPrefill((value) => seen.push(value))
  assert.equal(takeComposerPrefill('a')?.prompt, 'blue hill')
  assert.equal(peekComposerPrefill(), null)
  assert.equal(seen.at(-1), null)
  queueComposerPrefill({ prompt: 'again', kind: 'image', token: 'b' })
  resetComposerPrefill()
  assert.equal(seen.at(-1), null)
  stop()
})
