import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { zh } from './locales.js'

// A document must exist before react-dom is evaluated (see the note in
// InspirationImportStatus.test.js): react-dom snapshots its "is there a DOM"
// answer in module scope, and the branch it picks when there is none breaks
// event handling entirely.
const bootstrap = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost:3000' })
globalThis.window = bootstrap.window
globalThis.document = bootstrap.window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')

const here = fileURLToPath(new URL('.', import.meta.url))
const cache = join(here, '.esbuild-cache', 'share-render')
mkdirSync(cache, { recursive: true })
after(() => rmSync(cache, { recursive: true, force: true }))

const result = await build({
  entryPoints: [join(here, 'InspirationPreviewModal.jsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  write: false,
  external: ['lucide-react', 'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
  alias: { 'dsh-ui-kit': join(here, 'test-fixtures/ui-kit-shim.mjs') },
})
const bundlePath = join(cache, 'preview.mjs')
writeFileSync(bundlePath, result.outputFiles[0].text)
const { InspirationPreviewModal } = await import(bundlePath)

/** Mounted windows this suite has not released yet, released by `after`. */
const pending = []

after(async () => {
  while (pending.length > 0) await pending.pop()()
})

/**
 * Mount the modal in jsdom and open its share popover by clicking the trigger.
 * @param {Record<string, any>} row
 */
async function mountModal(row) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost:3000',
  })
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // The publish poll asks the Host about the row; a rejected request leaves the
  // row as it is, which is what the assertions below read.
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) })

  let root = null
  const teardown = async () => {
    if (root) {
      const mounted = root
      root = null
      await React.act(async () => mounted.unmount())
    }
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.fetch = previous.fetch
    dom.window.close()
  }
  pending.push(teardown)

  const host = dom.window.document.getElementById('host')
  root = createRoot(host)
  await React.act(async () => {
    root.render(React.createElement(InspirationPreviewModal, {
      row,
      t: (key) => zh[key] || key,
      onClose() {},
    }))
  })

  const trigger = dom.window.document.querySelector('.omnimux-inspiration-share-trigger-btn')
  assert.ok(trigger, '弹窗右上角必须存在分享按钮')
  await React.act(async () => {
    trigger.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  })

  return { document: dom.window.document, window: dom.window }
}

/**
 * Mount the modal so the test can hand it a *different* row afterwards — the
 * shape a publish produces, where the Host's own row replaces the catalogue's.
 * @param {Record<string, any>} row
 */
async function mountRerenderable(row, callbacks = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost:3000',
  })
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) })

  let root = null
  pending.push(async () => {
    if (root) {
      const mounted = root
      root = null
      await React.act(async () => mounted.unmount())
    }
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.fetch = previous.fetch
    dom.window.close()
  })

  const render = async (next) => {
    await React.act(async () => {
      root.render(React.createElement(InspirationPreviewModal, {
        row: next,
        t: (key) => zh[key] || key,
        onClose: callbacks.onClose || (() => {}),
        onReplicate: callbacks.onReplicate,
      }))
    })
  }

  root = createRoot(dom.window.document.getElementById('host'))
  await render(row)
  assert.ok(
    dom.window.document.querySelector('.omnimux-inspiration-share-trigger-btn'),
    '弹窗右上角必须存在分享按钮',
  )
  return { document: dom.window.document, window: dom.window, render }
}

describe('InspirationPreviewModal share popover', () => {
  it('renders the share button in header actions area', async () => {
    const { document } = await mountModal({ id: 'insp-1', title: '测试灵感分享素材' })
    const shareBtn = document.querySelector('.omnimux-inspiration-share-trigger-btn')
    assert.match(shareBtn.textContent, /分享/)

    const actions = document.querySelector('.omnimux-inspiration-modal-header-actions')
    assert.ok(actions.contains(shareBtn), '分享按钮应位于 header-actions 容器内')
  })

  it('offers the create action before anything is published', async () => {
    const { document } = await mountModal({ id: 'insp-idle', title: '未发布素材' })

    const submit = document.querySelector('.omnimux-inspiration-share-submit-btn')
    assert.ok(submit, '未发布时必须提供创建链接按钮')
    assert.match(submit.textContent, /创建链接/)
    assert.equal(document.querySelector('.omnimux-inspiration-share-progress'), null)
    assert.equal(document.querySelector('.omnimux-inspiration-share-input'), null, '未发布时不得展示任何链接')
  })

  it('renders the real publish progress from the row, and no link while it runs', async () => {
    const { document } = await mountModal({
      id: 'insp-running',
      title: '发布中素材',
      share_status: 'running',
      share_stage: 'uploading',
    })

    const progress = document.querySelector('.omnimux-inspiration-share-progress')
    assert.ok(progress, '运行中必须渲染进度区')
    const steps = [...document.querySelectorAll('[data-share-step]')]
    assert.deepEqual(
      steps.map((step) => step.getAttribute('data-share-step')),
      ['preparing', 'generating_prompt', 'uploading', 'publishing'],
    )
    assert.deepEqual(steps.map((step) => step.getAttribute('data-share-state')), ['done', 'done', 'active', 'todo'])
    assert.match(steps[2].textContent, /上传素材/)
    assert.equal(steps[2].getAttribute('aria-current'), 'step')

    assert.equal(document.querySelector('.omnimux-inspiration-share-input'), null, '运行中不得展示链接')
    assert.equal(document.querySelector('.omnimux-inspiration-share-submit-btn'), null, '运行中不再提供创建按钮')
  })

  it('renders the same-video prompt step while the job is generating it', async () => {
    const { document } = await mountModal({
      id: 'insp-prompt',
      title: '生成同款提示词中',
      share_status: 'running',
      share_stage: 'generating_prompt',
    })

    const steps = [...document.querySelectorAll('[data-share-step]')]
    assert.deepEqual(
      steps.map((step) => step.getAttribute('data-share-step')),
      ['preparing', 'generating_prompt', 'uploading', 'publishing'],
    )
    assert.deepEqual(steps.map((step) => step.getAttribute('data-share-state')), ['done', 'active', 'todo', 'todo'])
    assert.match(steps[1].textContent, /生成Prompt/)
    assert.equal(steps[1].getAttribute('aria-current'), 'step')
  })

  it('renders the first step as active when the job has only just started', async () => {
    const { document } = await mountModal({
      id: 'insp-preparing',
      title: '准备素材中',
      share_status: 'running',
      share_stage: 'preparing',
    })

    const steps = [...document.querySelectorAll('[data-share-step]')]
    assert.deepEqual(steps.map((step) => step.getAttribute('data-share-state')), ['active', 'todo', 'todo', 'todo'])
    assert.match(steps[0].textContent, /准备素材/)
  })

  it('renders the link the cloud returned, with its own validity', async () => {
    const { document } = await mountModal({
      id: 'insp-done',
      title: '已发布素材',
      share_status: 'done',
      share_stage: null,
      share_url: 'https://omnimux.ai/s/insp_17d391a7eb0b4a82',
      share_expires_in: '72h',
    })

    const input = document.querySelector('.omnimux-inspiration-share-input')
    assert.ok(input, '发布成功必须展示链接输入框')
    assert.equal(input.value, 'https://omnimux.ai/s/insp_17d391a7eb0b4a82')
    assert.equal(document.querySelector('.omnimux-inspiration-share-progress'), null)
    const meta = document.querySelector('.omnimux-inspiration-share-meta').textContent
    assert.match(meta, /链接有效期 72 小时/)
    assert.match(meta, /已发布/)
    assert.ok(
      document.querySelector('.omnimux-inspiration-share-link-box button'),
      '链接旁必须提供复制按钮',
    )
  })

  it('renders the failure reason in the popover and still no link', async () => {
    const { document } = await mountModal({
      id: 'insp-failed',
      title: '失败素材',
      share_status: 'failed',
      share_error: '未配置 OmniMux 网关密钥（sk-）：请在凭据中配置 OMNIMUX_API_KEY 后再分享',
    })

    const alert = document.querySelector('.omnimux-inspiration-share-tip.is-error')
    assert.ok(alert, '失败原因必须渲染在分享浮层内')
    assert.match(alert.textContent, /网关密钥/)
    assert.equal(document.querySelector('.omnimux-inspiration-share-input'), null, '失败时不展示任何链接')
    assert.match(document.querySelector('.omnimux-inspiration-share-submit-btn').textContent, /重新创建链接/)
  })

  /*
   * Issue #2075. A catalogue row numbers its entries (`2789`) and the Host's own
   * row for the same entry answers the string form (`"2789"`), so starting a
   * publish flips the id's type. Reading that flip as "a different entry" closed
   * the popover and cleared the failure reason the instant the user clicked
   * create — a click that appeared to do nothing at all.
   */
  it('keeps the popover open when the same entry answers its id as a string', async () => {
    const { document, render } = await mountRerenderable({ id: 2789, is_local: false, title: '云端作品' })

    const trigger = document.querySelector('.omnimux-inspiration-share-trigger-btn')
    await React.act(async () => {
      trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    assert.ok(document.querySelector('.omnimux-inspiration-share-popover'), '分享浮层必须先能打开')

    // A publish started and the Host's row replaced the catalogue's one.
    await render({
      id: '2789',
      is_local: false,
      title: '云端作品',
      share_status: 'failed',
      share_error: '云端素材地址缺失',
    })

    assert.ok(
      document.querySelector('.omnimux-inspiration-share-popover'),
      '同一条记录 id 形态翻转后，分享浮层必须保持打开',
    )
    const alert = document.querySelector('.omnimux-inspiration-share-tip.is-error')
    assert.ok(alert, '失败原因不得被清除')
    assert.match(alert.textContent, /云端素材地址缺失/)
    assert.match(document.querySelector('.omnimux-inspiration-share-submit-btn').textContent, /重新创建链接/)
  })

  it('still resets the popover when the user opens a different entry', async () => {
    const { document, render } = await mountRerenderable({ id: 2789, is_local: false, title: '第一条云端作品' })

    const trigger = document.querySelector('.omnimux-inspiration-share-trigger-btn')
    await React.act(async () => {
      trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    assert.ok(document.querySelector('.omnimux-inspiration-share-popover'))

    await render({ id: 2690, is_local: false, title: '另一条云端作品' })

    assert.equal(
      document.querySelector('.omnimux-inspiration-share-popover'),
      null,
      '换成另一条记录时，浮层必须按既有语义复位',
    )
  })
})

describe('InspirationPreviewModal saved gallery', () => {
  it('renders every saved image in source order and resets when the item changes', async () => {
    const urls = ['one', 'two', 'three', 'four'].map(id => `https://pbs.twimg.com/media/${id}.jpg`)
    const row = { id: 'gallery-1', type: 'image', content_shape: 'gallery', title: '四张配图', media_urls: [], media_items: urls.map(url => ({ type: 'image', url })) }
    const { document, render } = await mountRerenderable(row)
    const images = () => [...document.querySelectorAll('.omnimux-post-source img')].map(node => node.getAttribute('src'))
    assert.equal(document.querySelector('video'), null)
    assert.deepEqual(images(), urls)
    await render({ ...row, id: 'gallery-2' })
    assert.deepEqual(images(), urls)
    await render({ ...row, id: 'legacy-gallery', media_items: undefined, media_urls: urls })
    assert.deepEqual(images(), urls, 'legacy galleries retain every picture')
    await render({ id: 'text-1', type: 'link', content_shape: 'text', title: '文字', content: '完整推文正文' })
    assert.equal(document.querySelector('.omnimux-post-body').textContent, '完整推文正文')
    assert.equal(document.querySelector('video'), null)
    assert.deepEqual(images(), [])
  })
})

describe('post media and analysis playback', () => {
  it('keeps both videos mounted when selecting references and seeks the historical analyzed video', async () => {
    const first = '/omnimux/inspiration/local/media/videos/first.mp4'
    const second = '/omnimux/inspiration/local/media/videos/second.mp4'
    const { document, window } = await mountRerenderable({
      id: 'insp-media-timecode', title: '帖子素材', type: 'video', media_urls: [first, second],
      media_items: [{ type: 'video', url: first }, { type: 'video', url: second }, { type: 'image', url: '/omnimux/inspiration/local/media/images/photo.jpg' }],
      deconstruction: { shots: [{ id: 'shot-a', time_range: '00:10-00:12', script: '镜头台词' }] },
    })
    window.HTMLMediaElement.prototype.play = async function () {}
    const nodes = [...document.querySelectorAll('video')]
    assert.equal(nodes.length, 2)
    nodes[0].currentTime = 7
    const select = document.querySelector('.omnimux-post-media .omnimux-post-asset-footer [aria-pressed]')
    await React.act(async () => select.dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
    assert.equal(document.querySelector('video'), nodes[0])
    assert.equal(nodes[0].currentTime, 7, 'reference selection must preserve playback')
    await React.act(async () => document.querySelector('.omnimux-inspiration-shot-card button').dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
    assert.equal(document.querySelector('video'), nodes[0])
    assert.equal(nodes[0].currentTime, 10)
    assert.equal(nodes[1].getAttribute('src'), second)
  })
})

describe('post detail object interactions', () => {
  it('opens the full image, zooms and closes only the top overlay', async () => {
    let closes = 0
    const { document, window } = await mountRerenderable({ id: 'full-image', title: '配图', content: '完整原文', type: 'image', media_items: [{ type: 'image', url: 'https://pbs.twimg.com/media/photo.jpg' }] }, { onClose: () => { closes++ } })
    const click = async node => React.act(async () => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
    await click(document.querySelector('.omnimux-post-image-open'))
    const overlay = document.querySelector('.omnimux-post-lightbox')
    assert.ok(overlay)
    await click(overlay.querySelector(`[aria-label="${zh['post.zoomIn']}"]`))
    assert.equal(overlay.querySelector('img').style.maxWidth, 'none')
    await click([...overlay.querySelectorAll('button')].find(node => /150%/.test(node.textContent)))
    assert.equal(overlay.querySelector('img').style.maxWidth, '')
    await React.act(async () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(document.querySelector('.omnimux-post-lightbox'), null)
    assert.equal(closes, 0, 'Escape must leave the underlying post open')
  })

  it('sends the selected object and directions, keeping failures on their own object', async () => {
    const item = { id: 'scoped', title: '混合', content: '独立正文', media_items: [{ type: 'video', url: 'https://video.twimg.com/a.mp4' }, { type: 'image', url: 'https://pbs.twimg.com/media/photo.jpg' }] }
    const { document, window } = await mountRerenderable(item)
    const requests = []
    globalThis.fetch = async (url, init) => {
      if (init.method === 'GET') return { ok: true, status: 200, json: async () => ({ data: item }) }
      requests.push({ url, body: JSON.parse(init.body) })
      return { ok: false, status: 422, json: async () => ({ error: '图片处理失败' }) }
    }
    const click = async node => React.act(async () => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
    await click([...document.querySelectorAll('.omnimux-post-media button')].find(node => node.textContent === zh['post.analyzeImage']))
    await click(document.querySelectorAll('.omnimux-post-direction input')[1])
    await click([...document.querySelectorAll('.omnimux-post-analysis-scroll button')].find(node => node.textContent === zh['post.analyzeTarget']))
    assert.equal(requests.length, 1)
    assert.equal(requests[0].body.scope, 'media')
    assert.equal(requests[0].body.media_index, 1)
    assert.deepEqual(requests[0].body.directions, ['content', 'creative'])
    assert.match(document.querySelector('[role="alert"]').textContent, /图片处理失败/)
    await click([...document.querySelectorAll('.omnimux-post-targets button')].find(node => node.textContent === zh['post.body']))
    assert.equal(document.querySelector('[role="alert"]'), null, 'the image failure must not appear on the body')
  })
})

  it('preserves an edited draft when the purpose changes and saves only after confirmation', async () => {
    const item = { id: 'manual-draft', title: '正文参考', content: '完整帖子正文', type: 'link' }
    const { document, window, render } = await mountRerenderable(item)
    let stored = item
    const writes = []
    globalThis.fetch = async (_url, init) => {
      if (init.method === 'GET') return { ok: true, status: 200, json: async () => ({ data: stored }) }
      const payload = JSON.parse(init.body)
      writes.push(payload)
      stored = { ...item, creation_draft: payload.draft }
      return { ok: true, status: 200, json: async () => ({ data: stored }) }
    }
    const click = async node => React.act(async () => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
    await click(document.querySelector('.omnimux-post-original [aria-pressed]'))
    await click(document.querySelector('.omnimux-post-reference-bar button'))
    let drawer = document.querySelector('.omnimux-post-creation-drawer')
    const field = drawer.querySelectorAll('textarea')[1]
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(field, '保留我手工写下的创作要求')
      field.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    await click([...drawer.querySelectorAll('.omnimux-post-purpose button')].find(node => node.textContent === zh['post.purpose.story']))
    assert.equal(field.value, '保留我手工写下的创作要求')
    assert.ok(drawer.querySelector('.omnimux-post-warning'))
    await click([...drawer.querySelectorAll('button')].find(node => node.textContent === zh['post.saveDraft']))
    assert.equal(writes.length, 0, 'stale manual prose needs an explicit decision before saving')
    await click([...drawer.querySelectorAll('button')].find(node => node.textContent === zh['post.keepDraft']))
    await click([...drawer.querySelectorAll('button')].find(node => node.textContent === zh['post.saveDraft']))
    assert.equal(writes.length, 1)
    assert.equal(writes[0].draft.text, '保留我手工写下的创作要求')
    assert.equal(writes[0].draft.purpose, 'story')
    await render({ id: 'another-post', title: '另一条', content: '其他正文' })
    await render(stored)
    await click(document.querySelector('.omnimux-post-reference-bar button'))
    drawer = document.querySelector('.omnimux-post-creation-drawer')
    assert.equal(drawer.querySelectorAll('textarea')[1].value, '保留我手工写下的创作要求')
  })

it('translates only the original body and keeps model analysis separate', async () => {
  const { sourceFingerprint } = await import('../analysis-input.js')
  const item = { id: 'body-translation', title: '正文翻译', content: 'Original post body', type: 'link' }
  const { document, window } = await mountRerenderable(item)
  const requests = []
  globalThis.fetch = async (_url, init) => {
    if (init.method === 'GET') return { ok: true, status: 200, json: async () => ({ data: item }) }
    requests.push(JSON.parse(init.body))
    return { ok: true, status: 200, json: async () => ({ data: { ...item, body_translation: { text: '原帖中文译文', source_fingerprint: sourceFingerprint(item.content) } } }) }
  }
  const click = async node => React.act(async () => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
  await click([...document.querySelectorAll('.omnimux-post-original button')].find(node => node.textContent === zh['post.translateBody']))
  assert.equal(requests.length, 1)
  assert.equal(requests[0].scope, 'body')
  assert.equal(document.querySelector('.omnimux-post-body').textContent, '原帖中文译文')
  assert.equal(document.querySelector('.omnimux-post-result'), null)
  await click([...document.querySelectorAll('.omnimux-post-original button')].find(node => node.textContent === zh['post.showOriginal']))
  assert.equal(document.querySelector('.omnimux-post-body').textContent, item.content)
})
