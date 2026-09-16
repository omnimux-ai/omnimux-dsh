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
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
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
})
