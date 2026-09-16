/**
 * E2E: 「灵感分享」真实发布链路（Issue #1978）
 *
 * Drives the whole path in one process, offline:
 *
 *   apply(ctx)  →  the plugin's own HTTP entry  →  share handler
 *                                                  └── hub capability `inspirationShare`
 *                                                        └── official client (stubbed transport)
 *   …and then renders the real preview modal against the row the server wrote,
 *   which is what the user actually reads: stage progress while the job runs, the
 *   cloud's link afterwards, and the reason — never a link — when it fails.
 *
 * The only stub is the transport at the far end (multipart upload + publish
 * JSON); every layer in between is the shipping code, so a change that drops the
 * gateway key, invents a link locally, or loses a stage shows up here.
 */

import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { apply } from '../../plugins/omnimux-inspiration/src/index.js'
import { LOCAL_PREFIX } from '../../plugins/omnimux-inspiration/src/http-routes.js'
import { createInspirationShareApi } from '../../plugins/omnimux/src/official/inspiration-share.js'
import { zh } from '../../plugins/omnimux-inspiration/src/client/locales.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const root = fileURLToPath(new URL('../../', import.meta.url))

/* ------------------------------------------------------------------ 浏览器侧 */

// react-dom must be evaluated with a document already in place; see the note in
// InspirationImportStatus.test.js.
const bootstrap = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost:3000' })
globalThis.window = bootstrap.window
globalThis.document = bootstrap.window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')

const cacheDir = join(root, 'plugins/omnimux-inspiration/src/client/.esbuild-cache', 'e2e-real-publish')
mkdirSync(cacheDir, { recursive: true })
const bundled = await build({
  entryPoints: [join(root, 'plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  write: false,
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
  alias: { 'dsh-ui-kit': join(root, 'plugins/omnimux-inspiration/src/client/test-fixtures/ui-kit-shim.mjs') },
})
const bundlePath = join(cacheDir, 'modal.mjs')
writeFileSync(bundlePath, bundled.outputFiles[0].text)
const { InspirationPreviewModal } = await import(bundlePath)

const mounted = []

after(async () => {
  while (mounted.length > 0) await mounted.pop()()
  rmSync(cacheDir, { recursive: true, force: true })
})

/**
 * Mount the preview modal on a row and open its share popover.
 * @param {Record<string, any>} row
 */
async function renderModal(row) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost:3000',
  })
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) })

  let reactRoot = null
  mounted.push(async () => {
    if (reactRoot) {
      const instance = reactRoot
      reactRoot = null
      await React.act(async () => instance.unmount())
    }
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.fetch = previous.fetch
    dom.window.close()
  })

  reactRoot = createRoot(dom.window.document.getElementById('host'))
  await React.act(async () => {
    reactRoot.render(React.createElement(InspirationPreviewModal, {
      row,
      t: (key) => zh[key] || key,
      onClose() {},
    }))
  })
  const trigger = dom.window.document.querySelector('.omnimux-inspiration-share-trigger-btn')
  assert.ok(trigger, '分享按钮必须存在')
  await React.act(async () => {
    trigger.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  })
  return dom.window.document
}

/* ------------------------------------------------------------------ 服务端侧 */

const sandboxes = []

after(() => {
  while (sandboxes.length > 0) rmSync(sandboxes.pop(), { recursive: true, force: true })
})

/**
 * The two cloud calls the publish makes, stubbed at the transport boundary.
 * @param {{ publishError?: Error, uploadError?: Error }} [opts]
 */
function cloudStub(opts = {}) {
  const uploads = []
  const publishes = []
  const client = {
    async withSkSite(path, options) {
      if (options.body?.category === 'skip') throw new Error('unused')
      publishes.push({ url: `https://omnimux.ai${path}`, body: options.body, headers: options.headers })
      if (opts.publishError) throw opts.publishError
      return {
        success: true,
        message: '灵感发布成功',
        data: {
          share_id: 'insp_e2e_9f2c41ab',
          share_url: 'https://omnimux.ai/s/insp_e2e_9f2c41ab',
          storage_bucket: 'omnimux-files',
          is_admin: false,
          expires_at: '2026-09-18T23:00:00+08:00',
          expires_in: '72h',
          created_at: '2026-09-15T23:00:00+08:00',
        },
      }
    },
  }
  return {
    client,
    uploads,
    publishes,
    uploadMedia: async (source, options) => {
      uploads.push({ source, options })
      if (opts.uploadError) throw opts.uploadError
      return `https://files.omnimux.ai/e2e/${source.split('/').pop()}`
    },
  }
}

/** Boot the plugin the way the host does, with the real hub capability exposed. */
function bootPlugin({ capability }) {
  const home = mkdtempSync(join(tmpdir(), 'inspiration-e2e-'))
  sandboxes.push(home)
  process.env.DSH_HOME = home

  const registrations = []
  const injects = []
  const effects = []
  const ctx = {
    tools: { register() {}, get() { return undefined } },
    get(capability) {
      return capability === 'inspirationShare' ? this.capability : undefined
    },
    capability,
    inject(deps, callback) {
      injects.push(callback)
    },
    effect(callback) {
      effects.push(callback)
    },
  }
  apply(ctx)

  const webServer = { register: (route) => { registrations.push(route); return () => {} } }
  for (const callback of injects) callback({ webServer, effect: () => {} })
  const route = registrations.find((entry) => entry.path === LOCAL_PREFIX)
  assert.ok(route, `插件必须注册 ${LOCAL_PREFIX} 路由`)
  return { home, route }
}

/** One request through the route the plugin registered on the host. */
async function http(route, { method = 'GET', url, body } = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const req = Readable.from(payload === '' ? [] : [Buffer.from(payload, 'utf8')])
  req.method = method
  req.url = url
  req.headers = payload === '' ? { host: '127.0.0.1' } : { host: '127.0.0.1', 'content-type': 'application/json' }
  const state = { status: 0, body: '' }
  const res = {
    writeHead(status) { state.status = status; return this },
    end(chunk) { state.body += typeof chunk === 'string' ? chunk : (chunk ? Buffer.from(chunk).toString('utf8') : ''); return this },
  }
  await route.handler(req, res)
  return { status: state.status, body: state.body ? JSON.parse(state.body) : null }
}

/** A local media file the publish can actually stat and read. */
function mediaFile(home, name, bytes) {
  const path = join(home, name)
  writeFileSync(path, '')
  truncateSync(path, bytes)
  return path
}

async function waitForShare(route, id, status) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const row = (await http(route, { url: `${LOCAL_PREFIX}/${id}` })).body.data
    if (row?.share_status === status) return row
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`row ${id} never reached ${status}`)
}

/* ------------------------------------------------------------------ 用例 */

describe('E2E: 灵感分享真实发布链路 (#1978)', () => {
  it('上传素材 → 云端发布 → 界面展示云端返回的真实链接与有效期', async () => {
    const cloud = cloudStub()
    const capability = createInspirationShareApi({
      client: cloud.client,
      siteBaseUrl: 'https://omnimux.ai',
      resolveApiKey: () => 'sk-e2e-gateway',
      uploadMedia: cloud.uploadMedia,
      statFile: async (path) => ({ size: Number(String(path).length) }),
    })
    const world = bootPlugin({ capability })

    const mediaPath = mediaFile(world.home, 'clip.mp4', 4096)
    const coverPath = mediaFile(world.home, 'cover.jpg', 2048)
    const created = await http(world.route, {
      method: 'POST',
      url: LOCAL_PREFIX,
      body: {
        title: 'E2E 曼哈顿街景',
        content: '90 年代曼哈顿电影感街景',
        category: '电影质感街景',
        local_paths: { video: mediaPath, cover: coverPath },
      },
    })
    assert.equal(created.status, 201)
    const id = created.body.data.id

    const started = await http(world.route, { method: 'POST', url: `${LOCAL_PREFIX}/${id}/share` })
    assert.equal(started.status, 202, `POST share → ${JSON.stringify(started.body)}`)
    assert.equal(started.body.data.share_status, 'running')

    // While it runs the modal shows the real stage list and no link.
    const running = await renderModal(started.body.data)
    assert.ok(running.querySelector('.omnimux-inspiration-share-progress'), '运行中必须显示发布进度')
    assert.equal(running.querySelector('.omnimux-inspiration-share-input'), null, '运行中不得展示链接')

    const settled = await waitForShare(world.route, id, 'done')
    assert.equal(settled.share_url, 'https://omnimux.ai/s/insp_e2e_9f2c41ab')
    assert.equal(settled.share_expires_in, '72h')

    // Both assets went up through the site upload route with the gateway key.
    assert.deepEqual(cloud.uploads.map((row) => row.source), [coverPath, mediaPath])
    assert.equal(cloud.uploads[0].options.baseUrl, 'https://omnimux.ai/api')
    assert.equal(cloud.uploads[0].options.apiKey, 'sk-e2e-gateway')
    assert.equal(cloud.publishes[0].body.media_type, 'video')
    assert.equal(cloud.publishes[0].body.category, '电影质感街景')
    assert.equal(cloud.publishes[0].url, 'https://omnimux.ai/api/inspiration/v1/publish')

    // And the row the server wrote is exactly what the user reads.
    const done = await renderModal(settled)
    const input = done.querySelector('.omnimux-inspiration-share-input')
    assert.ok(input, '发布完成后必须展示链接')
    assert.equal(input.value, 'https://omnimux.ai/s/insp_e2e_9f2c41ab')
    assert.match(done.querySelector('.omnimux-inspiration-share-meta').textContent, /链接有效期 72 小时/)
  })

  it('缺少网关密钥时：服务端落失败原因，界面只在浮层内展示原因且不给链接', async () => {
    const capability = createInspirationShareApi({
      client: cloudStub().client,
      siteBaseUrl: 'https://omnimux.ai',
      resolveApiKey: () => undefined,
      uploadMedia: async () => 'https://files.omnimux.ai/never.png',
      statFile: async () => ({ size: 1024 }),
    })
    const world = bootPlugin({ capability })
    const mediaPath = mediaFile(world.home, 'nokey.mp4', 2048)
    const created = await http(world.route, {
      method: 'POST',
      url: LOCAL_PREFIX,
      body: { title: 'E2E 缺凭证', content: '提示词', local_paths: { video: mediaPath } },
    })
    const id = created.body.data.id

    const started = await http(world.route, { method: 'POST', url: `${LOCAL_PREFIX}/${id}/share` })
    assert.equal(started.status, 202)

    const failed = await waitForShare(world.route, id, 'failed')
    assert.match(failed.share_error, /网关密钥/)
    assert.equal(failed.share_url, null)

    const document = await renderModal(failed)
    assert.match(document.querySelector('.omnimux-inspiration-share-tip.is-error').textContent, /网关密钥/)
    assert.equal(document.querySelector('.omnimux-inspiration-share-input'), null, '失败时不得展示链接')
    assert.match(
      document.querySelector('.omnimux-inspiration-share-submit-btn').textContent,
      /重新创建链接/,
      '失败后必须能就地重试',
    )
  })

  it('无素材 / 文件缺失 / 超限 / 标题或提示词为空：直接给可执行中文提示，不起任务', async () => {
    const cloud = cloudStub()
    const capability = createInspirationShareApi({
      client: cloud.client,
      siteBaseUrl: 'https://omnimux.ai',
      resolveApiKey: () => 'sk-e2e-gateway',
      uploadMedia: cloud.uploadMedia,
      statFile: async (path) => ({ size: Number(String(path).length) }),
    })
    const world = bootPlugin({ capability })

    const bare = await http(world.route, {
      method: 'POST',
      url: LOCAL_PREFIX,
      body: { title: '无素材', content: '提示词' },
    })
    const noAssets = await http(world.route, { method: 'POST', url: `${LOCAL_PREFIX}/${bare.body.data.id}/share` })
    assert.equal(noAssets.status, 400)
    assert.match(noAssets.body.error, /没有可上传的素材/)

    const missing = await http(world.route, {
      method: 'POST',
      url: LOCAL_PREFIX,
      body: { title: '文件缺失', content: '提示词', local_paths: { video: join(world.home, 'never.mp4') } },
    })
    const absent = await http(world.route, { method: 'POST', url: `${LOCAL_PREFIX}/${missing.body.data.id}/share` })
    assert.equal(absent.status, 400)
    assert.match(absent.body.error, /素材文件不存在/)

    const oversized = await http(world.route, {
      method: 'POST',
      url: LOCAL_PREFIX,
      body: {
        title: '超限',
        content: '提示词',
        local_paths: { video: mediaFile(world.home, 'big.mp4', 101 * 1024 * 1024) },
      },
    })
    const tooBig = await http(world.route, { method: 'POST', url: `${LOCAL_PREFIX}/${oversized.body.data.id}/share` })
    assert.equal(tooBig.status, 400)
    assert.match(tooBig.body.error, /100MB/)

    const noPrompt = await http(world.route, {
      method: 'POST',
      url: LOCAL_PREFIX,
      body: { title: '没有提示词', local_paths: { video: mediaFile(world.home, 'p.mp4', 1024) } },
    })
    const empty = await http(world.route, { method: 'POST', url: `${LOCAL_PREFIX}/${noPrompt.body.data.id}/share` })
    assert.equal(empty.status, 400)
    assert.match(empty.body.error, /提示词为空/)

    assert.equal(cloud.uploads.length, 0, '前置校验失败的请求不得上传任何素材')
    assert.equal(cloud.publishes.length, 0, '前置校验失败的请求不得调用发布接口')
  })

  it('本地绝不产生伪造链接：该 ID 在分享接口上不存在', async () => {
    const cloud = cloudStub()
    const capability = createInspirationShareApi({
      client: cloud.client,
      siteBaseUrl: 'https://omnimux.ai',
      resolveApiKey: () => 'sk-e2e-gateway',
      uploadMedia: cloud.uploadMedia,
      statFile: async () => ({ size: 1024 }),
    })
    const world = bootPlugin({ capability })
    const item = await http(world.route, {
      method: 'POST',
      url: LOCAL_PREFIX,
      body: { title: '来自本地的 ID', content: '提示词', local_paths: { video: mediaFile(world.home, 'v.mp4', 1024) } },
    })
    const id = item.body.data.id

    // Before publishing the row carries no link at all — the endpoint and the
    // local id are never turned into one.
    const before = await http(world.route, { url: `${LOCAL_PREFIX}/${id}` })
    assert.equal(before.body.data.share_url, null)
    assert.equal(before.body.data.share_id, null)

    await http(world.route, { method: 'POST', url: `${LOCAL_PREFIX}/${id}/share` })
    const settled = await waitForShare(world.route, id, 'done')
    assert.equal(settled.share_id, 'insp_e2e_9f2c41ab', '链接只能来自云端返回的 share_id')
    assert.doesNotMatch(settled.share_url, /insp_(?!e2e)/, '不得出现由本地 id 拼出的分享链接')
  })
})
