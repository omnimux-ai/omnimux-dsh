import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const output = await build({
  entryPoints: [new URL('./composer-add/AttachmentSubmitBridge.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
})
const moduleObj = { exports: {} }
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  createRequire(import.meta.url),
  moduleObj,
  moduleObj.exports
)
const { AttachmentSubmitBridge } = moduleObj.exports
const { createQuickLinkChipNode } = await import('./composer-quick-shortcuts/dom.js')

const ATTACHMENT = { id: 'one', title: 'brief', extension: 'MD', relativePath: 'brief.md', kind: 'document' }

/**
 * 往输入框里放一枚链接胶囊（快捷方式插入的就是这种节点）。
 * 传 url 即模拟用户已经往胶囊里粘好链接；不传则胶囊仍是空的。
 */
function mountChip(kind, url) {
  const chip = createQuickLinkChipNode(kind, {
    label: kind === 'video' ? '视频' : '商品',
    doc: document,
  })
  document.querySelector('[data-composer-input="true"]').appendChild(chip)
  if (url) chip.querySelector('input').value = url
  return chip
}

/** 起一个最小宿主环境并装上桥接组件；返回可直接观察的草稿读写口。 */
async function mountBridge({ draft: initialDraft, sessionId = 'A', attachments = [] } = {}) {
  const dom = new JSDOM('<div data-phase="hero"><div id="bridge"></div><div data-composer-input="true" contenteditable="true"></div><button data-send-button>Send</button></div>')
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const draft = { value: initialDraft }
  const props = {
    sessionId,
    useInput: selector => selector({ draft: draft.value, phase: 'plain' }),
    inputActions: { setDraft(value) { draft.value = value } },
    attachmentStore: { getSnapshot: () => attachments },
    attachmentAdmission: { arm() {} },
    getCurrentSessionId: () => sessionId,
    t: key => key,
  }
  const root = createRoot(document.querySelector('#bridge'))
  await act(async () => root.render(React.createElement(AttachmentSubmitBridge, props)))
  return {
    draft,
    // 必须精确点发送键：胶囊自带的 × 删除按钮同样是 button，按标签名取会点到它。
    send: async () => act(async () => document.querySelector('[data-send-button]').click()),
    async dispose() {
      await act(async () => root.unmount())
      dom.window.close()
      globalThis.window = previous.window
      globalThis.document = previous.document
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
    },
  }
}

test('视频链接令牌在发送时回落为标准 Markdown，且不夹带附件上下文', async () => {
  const tokenUrl = 'https://www.tiktok.com/@ryannreeddesignbuild/video/7391823719283719283'
  const env = await mountBridge({ draft: '请帮我分析拆解这个视频。', attachments: [ATTACHMENT] })
  try {
    window.__omnimuxVideoToken = { url: tokenUrl }
    await env.send()
    assert.equal(env.draft.value, `请帮我分析拆解这个视频。\n\n[视频](${tokenUrl})`)
    assert.equal(env.draft.value.split(tokenUrl).length - 1, 1, '同一条链接只能出现一次')
    assert.equal(window.__omnimuxVideoToken, null, '令牌消费后必须清掉，避免下一轮重复追加')
    assert.ok(!env.draft.value.includes('### 会话关联上下文'), '附件数据块不得进入正文')
    assert.ok(!env.draft.value.includes('brief.md'), '附件路径不得进入正文')
  } finally {
    await env.dispose()
  }
})

test('选中技能后发送不再往草稿里补斜杠指令', async () => {
  const env = await mountBridge({ draft: '请帮我分析拆解这个视频。' })
  try {
    window.__omnimuxActiveSkill = { slug: 'video-hook-analysis', name: '视频拆解' }
    await env.send()
    assert.equal(env.draft.value, '请帮我分析拆解这个视频。')
    assert.equal(env.draft.value.includes('/video-hook-analysis'), false)
  } finally {
    delete window.__omnimuxActiveSkill
    await env.dispose()
  }
})

test('视频胶囊：空草稿里直接把链接写成 [视频](url)，发送后节点被消费掉', async () => {
  const url = 'https://www.tiktok.com/@a/video/7391823719283719283'
  const env = await mountBridge({ draft: '' })
  try {
    mountChip('video', url)
    await env.send()
    assert.equal(env.draft.value, `[视频](${url})`)
    assert.equal(document.querySelector('[data-omx-video-token="true"]'), null, '发送后胶囊必须被消费掉')
  } finally {
    await env.dispose()
  }
})

test('视频胶囊：胶囊还是空的（没填链接）时不写正文、也不偷偷删掉胶囊', async () => {
  const env = await mountBridge({ draft: '请用我的产品复刻这个爆款视频' })
  try {
    mountChip('video', '')
    mountChip('product', '')
    await env.send()
    assert.equal(env.draft.value, '请用我的产品复刻这个爆款视频')
    assert.ok(document.querySelector('[data-omx-video-token="true"]'), '空胶囊要留在输入框里等用户填')
    assert.ok(document.querySelector('[data-omx-product-token="true"]'))
  } finally {
    await env.dispose()
  }
})

test('商品胶囊：按既有商品槽位形态写成 [商品: url]', async () => {
  const env = await mountBridge({ draft: '请帮我一键生成一条带货视频。' })
  try {
    mountChip('product', 'https://shop.example.com/p/1')
    await env.send()
    assert.equal(env.draft.value, '请帮我一键生成一条带货视频。\n\n[商品: https://shop.example.com/p/1]')
    assert.equal(document.querySelector('[data-omx-product-token="true"]'), null)
  } finally {
    await env.dispose()
  }
})

test('两种胶囊同时存在时各写一条，同一条链接只出现一次', async () => {
  const videoUrl = 'https://www.tiktok.com/@a/video/1'
  const productUrl = 'https://shop.example.com/p/1'
  const env = await mountBridge({ draft: '请用我的产品复刻这个爆款视频' })
  try {
    mountChip('video', videoUrl)
    mountChip('product', productUrl)
    await env.send()
    assert.equal(env.draft.value, `请用我的产品复刻这个爆款视频\n\n[视频](${videoUrl})\n\n[商品: ${productUrl}]`)
    assert.equal(env.draft.value.split(videoUrl).length - 1, 1)
    assert.equal(env.draft.value.split(productUrl).length - 1, 1)
  } finally {
    await env.dispose()
  }
})

test('草稿里已经有同一条链接时不重复追加（只把胶囊消费掉）', async () => {
  const url = 'https://www.tiktok.com/@a/video/1'
  const env = await mountBridge({ draft: `已经写好了 [视频](${url})` })
  try {
    mountChip('video', url)
    await env.send()
    assert.equal(env.draft.value, `已经写好了 [视频](${url})`)
    assert.equal(env.draft.value.split(url).length - 1, 1)
    assert.equal(document.querySelector('[data-omx-video-token="true"]'), null)
  } finally {
    await env.dispose()
  }
})
