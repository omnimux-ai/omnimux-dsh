import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)

/** 用真实附件 Store 的 bundle 起一个隔离宿主。 */
async function loadModule(entry) {
  const output = await build({
    entryPoints: [new URL(entry, import.meta.url).pathname],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react'],
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(require, module, module.exports)
  return module.exports
}

function withWindow(html = '<div id="root"></div>') {
  const dom = new JSDOM(html, { url: 'http://localhost/' })
  const previous = { window: globalThis.window, document: globalThis.document }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  return {
    dom,
    restore() {
      globalThis.window = previous.window
      globalThis.document = previous.document
      dom.window.close()
    },
  }
}

const CARD = {
  id: 'insp_us_beauty',
  title: 'US beauty hook',
  cover: '/omnimux/inspiration/local/media/covers/us-beauty.jpg',
  sourceUrl: '/omnimux/inspiration/local/media/videos/us-beauty.mp4',
}

/** 复刻对象落进附件栏后，附件栏里必须真的多出这一条（卡面才有封面可画）。 */
test('addReplicateAttachment：把复刻对象挂进附件栏，封面与标题随行', async () => {
  const env = withWindow()
  try {
    const section = await loadModule('./TrendingReplicateSection.jsx')
    const store = (await loadModule('../../attachments/store.ts')).getGlobalAttachmentStore()
    store.setActiveSessionId('sess-1')

    const attachment = section.addReplicateAttachment(CARD)

    assert.ok(attachment, '必须返回落库后的附件')
    const list = store.getSnapshot('sess-1')
    assert.equal(list.length, 1)
    assert.equal(list[0].kind, 'video')
    assert.equal(list[0].entityId, 'insp_us_beauty')
    assert.equal(list[0].title, 'US beauty hook')
    assert.equal(list[0].previewUrl, '/omnimux/inspiration/local/media/covers/us-beauty.jpg')
    assert.equal(list[0].metadata.isRecreateTarget, true)

    // 重复挂载去重，不堆积
    section.addReplicateAttachment(CARD)
    assert.equal(store.getSnapshot('sess-1').length, 1, '同一对象重复挂载不得堆积')
  } finally {
    env.restore()
  }
})

test('removeReplicateAttachment：实体对得上才撤下，别的附件不受影响', async () => {
  const env = withWindow()
  try {
    const section = await loadModule('./TrendingReplicateSection.jsx')
    const store = (await loadModule('../../attachments/store.ts')).getGlobalAttachmentStore()
    store.setActiveSessionId('sess-1')
    store.addAttachment('sess-1', {
      sourcePlugin: 'omnimux',
      kind: 'asset',
      entityId: 'ast_unrelated',
      title: '其它资产',
      relativePath: 'assets/x.png',
    })
    section.addReplicateAttachment(CARD)
    assert.equal(store.getSnapshot('sess-1').length, 2)

    // 实体不匹配：不得误撤
    section.removeReplicateAttachment('insp_other')
    assert.equal(store.getSnapshot('sess-1').length, 2, '实体不匹配时不得撤下复刻对象')

    // 换片保留自身：keepEntityId 命中当前复刻对象时跳过
    section.removeReplicateAttachment(null, 'insp_us_beauty')
    assert.equal(store.getSnapshot('sess-1').length, 2, '换片保留自身时不得把自己撤掉')

    // 实体匹配：撤下复刻对象，别的附件留着
    section.removeReplicateAttachment('insp_us_beauty')
    const rest = store.getSnapshot('sess-1')
    assert.equal(rest.length, 1, '只应撤下复刻对象')
    assert.equal(rest[0].entityId, 'ast_unrelated')
  } finally {
    env.restore()
  }
})

test('removeReplicateAttachment：无实体参数时撤下当前会话里的复刻对象', async () => {
  const env = withWindow()
  try {
    const section = await loadModule('./TrendingReplicateSection.jsx')
    const store = (await loadModule('../../attachments/store.ts')).getGlobalAttachmentStore()
    store.setActiveSessionId('sess-1')
    section.addReplicateAttachment(CARD)

    section.removeReplicateAttachment(null)
    assert.equal(store.getSnapshot('sess-1').length, 0)

    // 已经没有复刻对象时再撤一次是安全的空操作
    assert.doesNotThrow(() => section.removeReplicateAttachment(null))
    assert.equal(store.getSnapshot('sess-1').length, 0)
  } finally {
    env.restore()
  }
})

test('addReplicateAttachment：附件栏满额时返回 null，不顶掉已有附件', async () => {
  const env = withWindow()
  try {
    const section = await loadModule('./TrendingReplicateSection.jsx')
    const store = (await loadModule('../../attachments/store.ts')).getGlobalAttachmentStore()
    store.setActiveSessionId('sess-1')
    for (let i = 0; i < 8; i += 1) {
      store.addAttachment('sess-1', {
        sourcePlugin: 'omnimux',
        kind: 'asset',
        entityId: `ast_${i}`,
        title: `资产 ${i}`,
        relativePath: `assets/${i}.png`,
      })
    }

    const attachment = section.addReplicateAttachment(CARD)
    assert.equal(attachment, null, '满额时必须明确失败，交回调用方决定')
    assert.equal(store.getSnapshot('sess-1').length, 8, '不得顶掉已有附件')
  } finally {
    env.restore()
  }
})
