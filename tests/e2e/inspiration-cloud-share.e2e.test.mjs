/**
 * E2E: 「灵感分享」云端条目零上传分享路径（Issue #1996）
 *
 * The defect this covers is not a missing asset — it is a missing *source*: a
 * cloud card's id (`2789`) exists only in the cloud, so the publish path read
 * the local library first, found nothing, and answered `404 not found`. The
 * cloud entry's media is already in the cloud, so the fix is a second publish
 * path that transfers nothing and republishes the addresses the cloud already
 * serves for it.
 *
 * Drives the whole path in one process, offline:
 *
 *   apply(ctx)  →  the plugin's own HTTP entry  →  share handler
 *                                                  └── hub capability `inspirationShare.publishRemote`
 *                                                        └── media readability probe (stubbed transport)
 *                                                        └── publish (stubbed transport)
 *   …and then renders the real preview modal against the row the server wrote,
 *   which is what the user actually reads: two real stages while the job runs,
 *   the cloud's link afterwards, and — when the cloud cannot serve the video —
 *   the warning that says so, beside the link rather than instead of it.
 *
 * The assertions that matter most are the negative ones: the uploader is never
 * called on this path, and a share that had to drop its video still says so.
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

const cacheDir = join(root, 'plugins/omnimux-inspiration/src/client/.esbuild-cache', 'e2e-cloud-share')
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

const SITE = 'https://omnimux.ai'
const COVER_PATH = '/api/inspiration/v1/public/media/inspiration-covers/'
const PUBLICATION_PATH = '/api/inspiration/v1/public/media/r2/publications/'

/** The cloud entry every cloud case in this file publishes, in the catalogue's own camelCase. */
function cloudRow(id, overrides = {}) {
  return {
    id,
    type: 'video',
    title: '情绪共鸣型助眠歌单推广',
    caption: 'Give it a try 🥺',
    category: 'Health & Wellness',
    coverUrl: `${COVER_PATH}${id}`,
    mediaUrls: [`${PUBLICATION_PATH}genviral/videos/${id}/video.mp4`],
    ...overrides,
  }
}

/**
 * The two cloud calls a publish makes — plus the probe — stubbed at the
 * transport boundary.
 *
 * `uploadMedia` is recorded but must stay empty on every cloud case: "zero
 * upload" is the property this whole path exists for, and a stub is the only
 * place that can prove it was never called.
 * @param {{ publishError?: Error, unreadable?: string[], uploadError?: Error }} [opts]
 */
function cloudStub(opts = {}) {
  const uploads = []
  const publishes = []
  const probes = []
  const unreadable = opts.unreadable ?? []
  return {
    uploads,
    publishes,
    probes,
    client: {
      async withSkSite(path, options) {
        publishes.push({ url: `${SITE}${path}`, body: options.body, method: options.method })
        if (opts.publishError) throw opts.publishError
        return {
          success: true,
          message: '灵感发布成功',
          data: {
            share_id: 'insp_cloud_e2e_7a31',
            share_url: 'https://omnimux.ai/s/insp_cloud_e2e_7a31',
            storage_bucket: 'omnimux-files',
            is_admin: false,
            expires_at: '2026-09-18T23:00:00+08:00',
            expires_in: '72h',
            created_at: '2026-09-15T23:00:00+08:00',
          },
        }
      },
    },
    /**
     * The public media endpoint: it answers **404 to HEAD**, so a readability
     * probe has to be a ranged GET. Anything in `unreadable` answers the 404 the
     * upstream storage defect produces today.
     */
    fetcher: async (url, options = {}) => {
      probes.push({ url, method: options.method, range: options.headers?.Range })
      const dead = unreadable.some((path) => String(url).endsWith(path))
      return { status: dead ? 404 : 206, body: { cancel: async () => {} } }
    },
    uploadMedia: async (source, options) => {
      uploads.push({ source, options })
      if (opts.uploadError) throw opts.uploadError
      return `https://files.omnimux.ai/e2e/${source.split('/').pop()}`
    },
  }
}

/**
 * The hub capability, wired exactly as the hub wires it: the real probe runs
 * against the stubbed transport, and the uploader is the recorded stub.
 */
function capabilityFrom(cloud) {
  return createInspirationShareApi({
    client: cloud.client,
    siteBaseUrl: SITE,
    resolveApiKey: () => 'sk-e2e-gateway',
    uploadMedia: cloud.uploadMedia,
    statFile: async (path) => ({ size: Number(String(path).length) }),
    fetcher: cloud.fetcher,
  })
}

/** Boot the plugin the way the host does, with the real hub capability exposed. */
function bootPlugin({ capability }) {
  const home = mkdtempSync(join(tmpdir(), 'inspiration-cloud-e2e-'))
  sandboxes.push(home)
  process.env.DSH_HOME = home

  const registrations = []
  const injects = []
  const ctx = {
    tools: { register() {}, get() { return undefined } },
    get(capability) {
      return capability === 'inspirationShare' ? this.capability : undefined
    },
    capability,
    inject(deps, callback) {
      injects.push(callback)
    },
    effect() {},
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

/** A local media file the local-path publish can actually stat and read. */
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

/** The publish request a cloud row produces, exactly as the page builds it. */
function cloudShareRequest(row) {
  return {
    source: 'cloud',
    type: row.type,
    title: row.title,
    caption: row.caption,
    category: row.category,
    coverUrl: row.coverUrl,
    mediaUrls: row.mediaUrls,
  }
}

/* ------------------------------------------------------------------ 用例 */

describe('E2E: 云端灵感零上传分享 (#1996)', () => {
  it('AC1 云端条目零上传发布成功：探测封面与视频后直接发布现成地址', async () => {
    const cloud = cloudStub()
    const world = bootPlugin({ capability: capabilityFrom(cloud) })
    const row = cloudRow(2789)

    const started = await http(world.route, {
      method: 'POST',
      url: `${LOCAL_PREFIX}/${row.id}/share`,
      body: cloudShareRequest(row),
    })
    assert.equal(started.status, 202, `POST share → ${JSON.stringify(started.body)}`)
    assert.equal(started.body.data.share_status, 'running')
    assert.equal(started.body.data.share_source, 'cloud', '云端分享必须标记来源为 cloud')
    assert.equal(started.body.data.share_stage, 'preparing')

    const settled = await waitForShare(world.route, row.id, 'done')
    assert.equal(settled.share_url, 'https://omnimux.ai/s/insp_cloud_e2e_7a31')
    assert.equal(settled.share_expires_in, '72h')
    assert.equal(settled.share_media_skipped, null, '素材可读时不得标注缺失')

    // 零上传：这是整条链路存在的理由，必须由 stub 证明它从未被调用。
    assert.equal(cloud.uploads.length, 0, '云端分享不得产生任何素材上传')

    // 发布用的就是云端现成地址，且已绝对化。
    assert.equal(cloud.publishes.length, 1)
    const body = cloud.publishes[0].body
    assert.equal(cloud.publishes[0].url, `${SITE}/api/inspiration/v1/publish`)
    assert.equal(body.cover_url, `${SITE}${COVER_PATH}2789`)
    assert.equal(body.media_url, `${SITE}${PUBLICATION_PATH}genviral/videos/2789/video.mp4`)
    assert.equal(body.media_type, 'video')
    assert.equal(body.title, row.title)
    assert.equal(body.prompt, row.caption)
    assert.equal(body.category, 'Health & Wellness')

    // 可读性探测走的是 GET + Range（该端点对 HEAD 一律 404）。
    assert.equal(cloud.probes.length, 2, '封面与视频各探测一次')
    for (const probe of cloud.probes) {
      assert.equal(probe.method, 'GET', '可读性探测必须用 GET')
      assert.equal(probe.range, 'bytes=0-0')
    }
    assert.deepEqual(cloud.probes.map((probe) => probe.url).sort(), [
      `${SITE}${COVER_PATH}2789`,
      `${SITE}${PUBLICATION_PATH}genviral/videos/2789/video.mp4`,
    ].sort())
  })

  it('AC2 视频不可读时仍出链接，并明确标注只分享封面与文案', async () => {
    const cloud = cloudStub({ unreadable: [`${PUBLICATION_PATH}genviral/videos/2690/video.mp4`] })
    const world = bootPlugin({ capability: capabilityFrom(cloud) })
    const row = cloudRow(2690)

    const started = await http(world.route, {
      method: 'POST',
      url: `${LOCAL_PREFIX}/${row.id}/share`,
      body: cloudShareRequest(row),
    })
    assert.equal(started.status, 202)

    const settled = await waitForShare(world.route, row.id, 'done')
    assert.equal(settled.share_url, 'https://omnimux.ai/s/insp_cloud_e2e_7a31', '视频不可读不得阻断分享')
    assert.equal(settled.share_media_skipped, 'video', '必须记录被跳过的素材类型')
    assert.equal(cloud.uploads.length, 0)

    // 打不开的地址绝不出现在发布载荷里。
    const body = cloud.publishes[0].body
    assert.equal('media_url' in body, false, '不可读的视频地址不得进入发布载荷')
    assert.equal(body.cover_url, `${SITE}${COVER_PATH}2690`, '封面照常带上')

    // 界面：链接照常展示，旁边给出明确提示，且不得挂一个打不开的播放器。
    const document = await renderModal(settled)
    assert.ok(document.querySelector('.omnimux-inspiration-share-input'), '必须展示链接')
    const notice = document.querySelector('[data-share-notice="media-unavailable"]')
    assert.ok(notice, '视频不可读必须在结果区给出标注')
    assert.equal(
      notice.textContent,
      '云端视频素材当前不可访问（上游存储问题，工单 No. 257），本次仅分享封面与文案',
    )
    assert.equal(document.querySelector('video'), null, '不得静默给出打不开的播放器')
  })

  it('AC3 封面与视频都不可读：失败且不产生链接', async () => {
    const cloud = cloudStub({
      unreadable: [
        `${COVER_PATH}2750`,
        `${PUBLICATION_PATH}genviral/videos/2750/video.mp4`,
      ],
    })
    const world = bootPlugin({ capability: capabilityFrom(cloud) })
    const row = cloudRow(2750)

    const started = await http(world.route, {
      method: 'POST',
      url: `${LOCAL_PREFIX}/${row.id}/share`,
      body: cloudShareRequest(row),
    })
    assert.equal(started.status, 202)

    const failed = await waitForShare(world.route, row.id, 'failed')
    assert.match(failed.share_error, /不可访问/)
    assert.equal(failed.share_url, null, '失败时不得给出链接')
    assert.equal(cloud.publishes.length, 0, '素材全不可读时不得调用发布')
    assert.equal(cloud.uploads.length, 0)

    const document = await renderModal(failed)
    assert.equal(document.querySelector('.omnimux-inspiration-share-input'), null, '失败时不得展示链接')
    assert.match(document.querySelector('.omnimux-inspiration-share-tip.is-error').textContent, /不可访问/)
  })

  it('AC5/AC6 云端任务的进度可被轮询读到，且阶段列表不含「上传素材」', async () => {
    const cloud = cloudStub()
    const world = bootPlugin({ capability: capabilityFrom(cloud) })
    const row = cloudRow(2812)

    const started = await http(world.route, {
      method: 'POST',
      url: `${LOCAL_PREFIX}/${row.id}/share`,
      body: cloudShareRequest(row),
    })
    // The page polls the very endpoint the local rows live on; a 404 here would
    // tell the poller the row is gone and freeze the progress on the first tick.
    const polled = await http(world.route, { url: `${LOCAL_PREFIX}/${row.id}` })
    assert.equal(polled.status, 200, '云端任务行必须可轮询')
    assert.equal(polled.body.data.share_source, 'cloud')

    const runningRow = { ...started.body.data, share_status: 'running', share_stage: 'publishing' }
    const document = await renderModal(runningRow)
    const steps = [...document.querySelectorAll('[data-share-step]')]
    assert.deepEqual(steps.map((step) => step.getAttribute('data-share-step')), ['preparing', 'publishing'])
    assert.equal(
      document.querySelector('[data-share-step="uploading"]'),
      null,
      '云端分享没有上传阶段，不得渲染',
    )
    assert.equal(document.querySelector('.omnimux-inspiration-share-input'), null, '运行中不得展示链接')
    assert.equal(
      document.querySelector('[data-share-step="publishing"]').getAttribute('data-share-state'),
      'active',
    )
  })

  it('AC4 本地条目分享链路不受影响：仍走上传素材 → 发布', async () => {
    const cloud = cloudStub()
    const world = bootPlugin({ capability: capabilityFrom(cloud) })

    const mediaPath = mediaFile(world.home, 'clip.mp4', 4096)
    const coverPath = mediaFile(world.home, 'cover.jpg', 2048)
    const created = await http(world.route, {
      method: 'POST',
      url: LOCAL_PREFIX,
      body: {
        title: 'E2E 本地灵感',
        content: '本地素材仍按上传链路发布',
        category: '电影质感街景',
        local_paths: { video: mediaPath, cover: coverPath },
      },
    })
    assert.equal(created.status, 201)
    const id = created.body.data.id

    const started = await http(world.route, { method: 'POST', url: `${LOCAL_PREFIX}/${id}/share` })
    assert.equal(started.status, 202)
    assert.equal(started.body.data.share_source, 'local')

    const settled = await waitForShare(world.route, id, 'done')
    assert.equal(settled.share_url, 'https://omnimux.ai/s/insp_cloud_e2e_7a31')
    assert.deepEqual(
      cloud.uploads.map((entry) => entry.source),
      [coverPath, mediaPath],
      '本地链路仍必须先上传封面与视频',
    )
    // 上传后的地址才是发布载荷里的素材地址，不是任何云端现成地址。
    assert.equal(cloud.publishes[0].body.cover_url, 'https://files.omnimux.ai/e2e/cover.jpg')
    assert.equal(cloud.publishes[0].body.media_url, 'https://files.omnimux.ai/e2e/clip.mp4')

    const document = await renderModal({ ...settled, share_status: 'running', share_stage: 'uploading' })
    const steps = [...document.querySelectorAll('[data-share-step]')]
    assert.deepEqual(
      steps.map((step) => step.getAttribute('data-share-step')),
      ['preparing', 'uploading', 'publishing'],
      '本地链路必须保持三步进度',
    )
  })

  it('未知 id 仍按原契约回答 404，不会被误判为云端条目', async () => {
    const cloud = cloudStub()
    const world = bootPlugin({ capability: capabilityFrom(cloud) })

    const missing = await http(world.route, {
      method: 'POST',
      url: `${LOCAL_PREFIX}/insp_00000000/share`,
      body: {},
    })
    assert.equal(missing.status, 404)
    assert.equal(cloud.publishes.length, 0)
  })
})
