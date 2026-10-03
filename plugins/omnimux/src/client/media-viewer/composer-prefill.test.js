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

test('两个插件各打一份模块时，写入方与读取方仍共用同一个队列（Issue #2999）', async () => {
  // hub 与 viewer 各自打包这个文件；用不同 query 导入得到两份独立模块实例来模拟。
  const hub = await import('./composer-prefill.js?bundle=hub')
  const viewer = await import('./composer-prefill.js?bundle=viewer')
  assert.notEqual(hub.queueComposerPrefill, viewer.queueComposerPrefill)
  hub.resetComposerPrefill()

  const seen = []
  const stop = viewer.subscribeComposerPrefill((value) => seen.push(value))
  hub.queueComposerPrefill({ prompt: 'street interview', kind: 'video', token: 't1' })

  assert.equal(viewer.peekComposerPrefill()?.prompt, 'street interview')
  assert.equal(seen.at(-1)?.kind, 'video')
  assert.equal(viewer.takeComposerPrefill('t1')?.prompt, 'street interview')
  assert.equal(hub.peekComposerPrefill(), null)
  assert.equal(seen.at(-1), null)
  stop()
})
