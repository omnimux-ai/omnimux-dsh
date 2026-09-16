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

const ATTACHMENT = { id: 'one', title: 'brief', extension: 'MD', relativePath: 'brief.md', kind: 'document' }

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
    send: async () => act(async () => document.querySelector('button').click()),
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

test('技能手势在发送时补到草稿最前，不打乱用户原文', async () => {
  const env = await mountBridge({ draft: '请帮我分析拆解这个视频。' })
  try {
    window.__omnimuxActiveSkill = { slug: 'video-hook-analysis', name: '视频拆解' }
    await env.send()
    assert.equal(env.draft.value, '/video-hook-analysis 请帮我分析拆解这个视频。')
  } finally {
    delete window.__omnimuxActiveSkill
    await env.dispose()
  }
})

test('已经带手势令牌的草稿不会被重复补一遍', async () => {
  const env = await mountBridge({ draft: '/video-hook-analysis 请帮我分析拆解这个视频。' })
  try {
    window.__omnimuxActiveSkill = { slug: 'video-hook-analysis', name: '视频拆解' }
    await env.send()
    assert.equal(env.draft.value, '/video-hook-analysis 请帮我分析拆解这个视频。')
  } finally {
    delete window.__omnimuxActiveSkill
    await env.dispose()
  }
})
