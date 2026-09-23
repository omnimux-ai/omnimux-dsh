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

/** Legacy chips must belong to the same public composer card as the bridge. */
const DEFAULT_HTML = '<div data-phase="hero"><div data-composer-card><div id="bridge"></div><div data-composer-input="true" contenteditable="true"></div><button data-send-button>Send</button></div></div>'

/**
 * 分屏 / 多标签保活：宿主同时挂载两张输入框卡片，各自在自己的会话座位
 * `[data-composer-seat]` 里；本会话那张卡的内部就是本桥的锚点落点。
 */
const SPLIT_HTML = [
  '<div data-phase="hero">',
  '  <div data-composer-seat>',
  '    <div data-composer-card><div id="bridge"></div><div data-composer-input="true" contenteditable="true"></div></div>',
  '  </div>',
  '  <div data-composer-seat>',
  '    <div data-composer-card id="other-card"><div data-composer-input="true" contenteditable="true"></div></div>',
  '  </div>',
  '  <button data-send-button>Send</button>',
  '</div>',
].join('')

/**
 * 起一个最小宿主环境并装上桥接组件；返回可直接观察的草稿读写口。
 * `failAppend` 模拟宿主写入失败：追加块（带空行）抛错，提示语那种单行写入照常成功。
 */
async function mountBridge({ draft: initialDraft, sessionId = 'A', attachments = [], html, failAppend = false } = {}) {
  const dom = new JSDOM(html || DEFAULT_HTML)
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const draft = { value: initialDraft }
  const props = {
    sessionId,
    useInput: selector => selector({ draft: draft.value, phase: 'plain' }),
    inputActions: {
      setDraft(value) {
        if (failAppend && typeof value === 'string' && value.includes('\n\n')) {
          throw new Error('editor disposed')
        }
        draft.value = value
      },
    },
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
    async send() {
      await act(async () => document.querySelector('[data-send-button]').click())
      // Publish the changed host state separately from its setter receipt.
      await act(async () => root.render(React.createElement(AttachmentSubmitBridge, props)))
    },
    async dispose() {
      await act(async () => root.unmount())
      dom.window.close()
      globalThis.window = previous.window
      globalThis.document = previous.document
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
    },
  }
}

test('无会话归属的全局视频令牌不追加、不清空，附件上下文不进入正文', async () => {
  const tokenUrl = 'https://www.tiktok.com/@ryannreeddesignbuild/video/7391823719283719283'
  const env = await mountBridge({ draft: '请帮我分析拆解这个视频。', attachments: [ATTACHMENT] })
  try {
    window.__omnimuxVideoToken = { url: tokenUrl }
    await env.send()
    assert.equal(env.draft.value, '请帮我分析拆解这个视频。')
    assert.equal(env.draft.value.includes(tokenUrl), false, '不读取可能属于其他会话的全局令牌')
    assert.deepEqual(window.__omnimuxVideoToken, { url: tokenUrl }, '不迁移或清空在线旧状态')
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

test('视频胶囊：写入失败时保留胶囊，用户填的链接不许丢', async () => {
  const url = 'https://www.tiktok.com/@a/video/1'
  const env = await mountBridge({ draft: '请用我的产品复刻这个爆款视频', failAppend: true })
  try {
    mountChip('video', url)
    await env.send()
    assert.equal(env.draft.value, '请用我的产品复刻这个爆款视频', '写不进去时草稿保持原文')
    const chip = document.querySelector('[data-omx-video-token="true"]')
    assert.ok(chip, '写入失败必须保留胶囊让用户重试，绝不能不声不响地删掉')
    assert.equal(chip.querySelector('input').value, url, '用户填的链接还在胶囊里')
  } finally {
    await env.dispose()
  }
})

test('商品胶囊：写入失败时同样保留胶囊', async () => {
  const url = 'https://shop.example.com/p/1'
  const env = await mountBridge({ draft: '请帮我一键生成一条带货视频。', failAppend: true })
  try {
    mountChip('product', url)
    await env.send()
    assert.equal(env.draft.value, '请帮我一键生成一条带货视频。')
    const chip = document.querySelector('[data-omx-product-token="true"]')
    assert.ok(chip, '写入失败必须保留商品胶囊')
    assert.equal(chip.querySelector('input').value, url)
  } finally {
    await env.dispose()
  }
})

test('两种胶囊都写不进去时两枚都留着（各自独立判定，互不牵连）', async () => {
  const videoUrl = 'https://www.tiktok.com/@a/video/1'
  const productUrl = 'https://shop.example.com/p/1'
  const env = await mountBridge({ draft: '请用我的产品复刻这个爆款视频', failAppend: true })
  try {
    mountChip('video', videoUrl)
    mountChip('product', productUrl)
    await env.send()
    assert.ok(document.querySelector('[data-omx-video-token="true"]'))
    assert.ok(document.querySelector('[data-omx-product-token="true"]'))
  } finally {
    await env.dispose()
  }
})

test('提交只读本会话卡片里的胶囊（分屏 / 多标签保活）', async () => {
  const ownUrl = 'https://www.tiktok.com/@a/video/1'
  const foreignUrl = 'https://shop.example.com/p/9'
  const env = await mountBridge({ draft: '请用我的产品复刻这个爆款视频', html: SPLIT_HTML })
  try {
    const foreignChip = createQuickLinkChipNode('product', { label: '商品', doc: document })
    foreignChip.querySelector('input').value = foreignUrl
    document.querySelector('#other-card').appendChild(foreignChip)
    mountChip('video', ownUrl)
    await env.send()
    assert.equal(env.draft.value, `请用我的产品复刻这个爆款视频\n\n[视频](${ownUrl})`)
    assert.equal(env.draft.value.includes(foreignUrl), false, '别的会话的链接不得写进本会话草稿')
    assert.ok(document.querySelector('#other-card [data-omx-product-token="true"]'), '别的会话的胶囊不得被消费')
    assert.equal(document.querySelector('[data-omx-video-token="true"]'), null, '本会话的胶囊照常消费掉')
  } finally {
    await env.dispose()
  }
})
