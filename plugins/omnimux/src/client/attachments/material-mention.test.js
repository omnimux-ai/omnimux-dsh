import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createMaterialMentionSource,
  materialCandidates,
  registerMaterialMentionSource,
  serializeMaterialMention,
} from './materialMentionSource.ts'
import { createAttachmentStore } from './store.ts'

function withStore(run) {
  const store = createAttachmentStore()
  const root = globalThis
  const previousWindow = root.window
  const previousStore = root.__omnimuxAttachments
  root.window = {
    addEventListener() {},
    removeEventListener() {},
    __omnimuxAttachments: store,
  }
  try {
    return run(store)
  } finally {
    if (previousWindow) root.window = previousWindow
    else delete root.window
    if (previousStore) root.__omnimuxAttachments = previousStore
    else delete root.__omnimuxAttachments
  }
}

describe('material @ mention', () => {
  it('lists loaded materials first and drops them after removal', () => {
    withStore((store) => {
      store.addAttachment('s1', {
        sourcePlugin: 'omnimux-assets',
        kind: 'image',
        entityId: 'a1',
        title: '海浪封面',
        relativePath: 'assets/wave.png',
      })
      store.setActiveSessionId('s1')
      const listed = materialCandidates('s1', '')
      assert.equal(listed.length, 1)
      assert.equal(listed[0].name, '海浪封面')
      assert.equal(listed[0].section, '已加入素材')
      assert.equal(materialCandidates('s1', '不存在').length, 0)

      const source = createMaterialMentionSource()
      assert.equal(source.order, -10)
      assert.equal(source.trigger, '@')
      const picked = source.onPick({
        candidate: listed[0],
        session: { sessionId: 's1' },
      })
      assert.equal(picked.insert.source, 'material')
      assert.equal(picked.insert.label, '海浪封面')

      const text = serializeMaterialMention('s1', picked.insert.ref)
      assert.equal(text, '@海浪封面')
      assert.equal(source.codec.clipboardText(picked.insert.ref), '海浪封面')
      assert.equal(picked.insert.clipboardText, '海浪封面')

      // 测试带空格的素材标题用 @"名称" 转义包裹
      const res2 = store.addAttachment('s1', {
        sourcePlugin: 'omnimux-assets',
        kind: 'video',
        entityId: 'a2',
        title: 'US beauty hook 01',
        relativePath: 'assets/us-beauty.mp4',
      })
      const textWithSpaces = serializeMaterialMention('s1', `material:${res2.attachment.id}`)
      assert.equal(textWithSpaces, '@"US beauty hook 01"')

      store.removeAttachment('s1', store.getSnapshot('s1')[0].id)
      store.removeAttachment('s1', res2.attachment.id)
      assert.equal(materialCandidates('s1', '').length, 0)
    })
  })

  it('returns no group when the composer has no materials', () => {
    withStore(() => {
      assert.deepEqual(materialCandidates('empty', ''), [])
    })
  })

  it('does not list materials that belong to another conversation', () => {
    withStore((store) => {
      store.addAttachment('other', {
        sourcePlugin: 'omnimux-assets',
        kind: 'image',
        entityId: 'other',
        title: '别人的封面',
        relativePath: 'assets/other.png',
      })
      store.setActiveSessionId('other')
      assert.deepEqual(materialCandidates('empty', ''), [])
    })
  })

  it('registers the material menu only once', () => {
    const calls = []
    const triggers = {
      live: { sources: [] },
      registerSource(source) {
        calls.push(source.name)
        this.live.sources.push(source)
        return () => {}
      },
    }
    const effects = []
    registerMaterialMentionSource({
      get: () => triggers,
      effect: (dispose) => effects.push(dispose),
      inject: (_names, run) => run({ inputTriggers: triggers, effect: (dispose) => effects.push(dispose) }),
    })
    assert.deepEqual(calls, ['material'])
    assert.equal(effects.length, 1)
  })

  it('strips double quotes and newlines from material title to prevent token corruption', () => {
    withStore((store) => {
      const res1 = store.addAttachment('s1', {
        sourcePlugin: 'omnimux-assets',
        kind: 'video',
        entityId: 'a3',
        title: 'demo "final"\r\n edit',
        relativePath: 'assets/demo.mp4',
      })
      const text1 = serializeMaterialMention('s1', `material:${res1.attachment.id}`)
      assert.equal(text1, '@"demo final edit"')

      const res2 = store.addAttachment('s1', {
        sourcePlugin: 'omnimux-assets',
        kind: 'image',
        entityId: 'a4',
        title: '"clean"',
        relativePath: 'assets/clean.png',
      })
      const text2 = serializeMaterialMention('s1', `material:${res2.attachment.id}`)
      assert.equal(text2, '@clean')
    })
  })
})
