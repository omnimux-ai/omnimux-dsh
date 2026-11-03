#!/usr/bin/env node
/**
 * 真实浏览器验收：TikTok 官方直连首帖（Issue #3913）
 *
 * 网关 POST /api/social/v1/posts 把 account_ids 绑定为 []int64，而本仓链路把账号 id
 * 统一转成字符串。本脚本在隔离工作树内起只服务本机的临时服务，并按 Go 结构体语义
 * 严格校验发帖请求体（字符串 id 一律 invalid request body），因此证明的是
 * 「中枢真的把数字送出去了」，而不是「页面看起来成功」。
 *
 * 反向对照：脚本先用字符串 id 直接打一次发帖接口，必须被拒；这道对照不红即失败。
 *
 * 用法：node tests/e2e/publish-tiktok-first-post.browser.mjs
 * 证据：docs/evidence/publish-tiktok-first-post-3913/{live-qa-report.json,01-detail-published-private-notice.png}
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const req = createRequire(join(root, 'package.json'))
const esbuild = req('esbuild')
const { PNG } = req('pngjs')

const publishDir = join(root, 'plugins/omnimux-publish')
const evidenceDir = join(root, 'docs/evidence/publish-tiktok-first-post-3913')
mkdirSync(evidenceDir, { recursive: true })

const { parsePublishConfig } = await import(join(publishDir, 'src/config.js'))
const { createPublishDispatcher, registerPublishRoutes } = await import(join(publishDir, 'src/http-routes.js'))
const { createHubChannel } = await import(join(publishDir, 'src/hubtools.js'))
const { createAccountSource } = await import(join(publishDir, 'src/accounts.js'))
const { createMediaStore } = await import(join(publishDir, 'src/media.js'))
const { createRecordStore } = await import(join(publishDir, 'src/store.js'))
const { createSubmitService } = await import(join(publishDir, 'src/submit.js'))
const { createOfficialDispatcher } = await import(join(root, 'plugins/omnimux/src/official/http-routes.js'))
const { createPost, getPost, presignMedia } = await import(join(root, 'plugins/omnimux/src/official/publish.js'))
const { listAccounts } = await import(join(root, 'plugins/omnimux/src/official/accounts.js'))

const dataDir = mkdtempSync(join(tmpdir(), 'first-post-verify-'))
const store = createRecordStore({ paths: { recordsFile: join(dataDir, 'records.json') } })
const media = createMediaStore({
  paths: { mediaIndexFile: join(dataDir, 'media.json'), mediaDir: join(dataDir, 'media') },
  maxBytes: 10 * 1024 * 1024,
})

let bindingRejections = 0
let connectedAccounts = [{
  id: 41,
  provider: 'tiktok_direct',
  platform: 'tiktok',
  display_name: 'OmniMux TikTok Sandbox',
  username: 'omnimux.sandbox',
  status: 'active',
}]

function strictBind(accountIds) {
  if (!Array.isArray(accountIds) || accountIds.length === 0) return 'invalid request body'
  for (const id of accountIds) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      bindingRejections += 1
      return 'invalid request body'
    }
  }
  return null
}

const mockGatewayClient = {
  async withPat(path, init = {}) {
    const method = (init.method || 'GET').toUpperCase()
    if (method === 'GET' && path.startsWith('/api/social/v1/accounts?provider=tiktok_direct')) {
      return { success: true, data: { accounts: connectedAccounts } }
    }
    if (method === 'POST' && path === '/api/social/v1/connect') {
      setTimeout(() => {
        if (connectedAccounts.length === 0) {
          connectedAccounts = [{
            id: 41,
            provider: 'tiktok_direct',
            platform: 'tiktok',
            display_name: 'OmniMux TikTok Sandbox',
            username: 'omnimux.sandbox',
            status: 'active',
          }]
        }
      }, 300)
      return { success: true, data: { auth_url: 'https://www.tiktok.com/v2/auth/authorize?client_key=sb_test' } }
    }
    if (method === 'POST' && path === '/api/social/v1/media/presign') {
      return {
        success: true,
        data: {
          upload_url: 'https://storage.omnimux.ai/upload/' + encodeURIComponent(init.body?.filename || 'm'),
          public_url: 'https://cdn.omnimux.ai/media/' + encodeURIComponent(init.body?.filename || 'm'),
        },
      }
    }
    if (method === 'POST' && path === '/api/social/v1/posts') {
      const invalid = strictBind(init.body?.account_ids)
      if (invalid) return { success: false, message: invalid }
      return { success: true, data: { id: 'tt_publish_7001', provider: 'tiktok_direct', status: 'submitted' } }
    }
    if (method === 'GET' && path.startsWith('/api/social/v1/posts/')) {
      return { success: true, data: { id: 'tt_publish_7001', provider: 'tiktok_direct', status: 'published' } }
    }
    return { success: false, message: 'unhandled ' + method + ' ' + path }
  },
}

const metaStore = { read: () => ({}), readForAuthorization: () => ({}), update: () => ({}), remove: () => {} }
const avatarStore = { has: () => false, localUrlFor: () => '', sourceUrl: () => '', remove: () => {}, putFromUrl: async () => ({ ok: true }) }
const officialDispatcher = createOfficialDispatcher({ official: { mount: true }, client: mockGatewayClient, metaStore, avatarStore })

// Tools wrap the REAL hub functions, so the widening under test actually runs.
const handlers = {
  omnimux_accounts_list: (a) => listAccounts(mockGatewayClient, { provider: a.provider }),
  omnimux_publish_presign: (a) => presignMedia(mockGatewayClient, a),
  omnimux_publish_create: (a) => createPost(mockGatewayClient, a, metaStore),
  omnimux_publish_get: (a) => getPost(mockGatewayClient, a),
}
const tools = {
  get: (n) => (n in handlers ? { name: n } : undefined),
  async execute(exec) {
    const value = await handlers[exec.name](exec.arguments)
    return { content: [{ type: 'text', text: JSON.stringify(value) }], isError: false, value }
  },
}
const channel = createHubChannel({ tools, fetcher: async () => ({ ok: true, status: 200 }) })
const accountsSource = createAccountSource({ channel, overlayPath: '' })
const config = parsePublishConfig({ dataDir, submitTimeoutSeconds: 10 })
const service = createSubmitService({ store, media, channel, accounts: accountsSource, config })
const dispatcher = createPublishDispatcher({ store, media, accounts: accountsSource, service, config })
let routeHandler = null
registerPublishRoutes({ register(spec) { if (spec.path === '/omnimux/publish') routeHandler = spec.handler; return () => {} } }, dispatcher)

const rawReject = await mockGatewayClient.withPat('/api/social/v1/posts', { method: 'POST', body: { account_ids: ['41'], content: 'x' } })
if (rawReject.success !== false || rawReject.message !== 'invalid request body') {
  throw new Error('negative control failed: strict binding accepted string account ids')
}
const negativeControl = { stringIdsRejected: true, bindingRejections }

const createCalls = []
const captureClient = {
  async withPat(path, opts = {}) {
    createCalls.push({ path, opts })
    if (path.startsWith('/api/social/v1/accounts')) return { accounts: connectedAccounts }
    return { success: true, data: { id: 'tt_publish_7001' } }
  },
}
await createPost(captureClient, { provider: 'tiktok_direct', account_ids: ['41'], content: 'hello' }, { readForAuthorization: () => ({}) })
const sentIds = createCalls.find((c) => c.path === '/api/social/v1/posts').opts.body.account_ids
const hubWidened = Array.isArray(sentIds) && sentIds.length === 1 && sentIds[0] === 41 && typeof sentIds[0] === 'number'
if (!hubWidened) throw new Error('hub did not widen account ids: ' + JSON.stringify(sentIds))

const entryPath = join(publishDir, '.tmp-first-post-entry.jsx')
writeFileSync(entryPath, [
  "import React from 'react'",
  "import { createRoot } from 'react-dom/client'",
  "import { PublishStage } from './src/client/PublishStage.jsx'",
  "import { zh } from './src/client/locales.js'",
  'function t(key, vars = {}) {',
  '  let str = zh[key] || key',
  "  for (const [k, v] of Object.entries(vars || {})) str = str.replace('{' + k + '}', String(v ?? ''))",
  '  return str',
  '}',
  'window.__openedUrls = []',
  'window.open = (url) => { window.__openedUrls.push(String(url)); return null }',
  "createRoot(document.getElementById('stage-root')).render(React.createElement(PublishStage, { t, visible: true }))",
  'window.__publishStageMounted = true',
].join('\n'))

let bundleJs = ''
try {
  const bundled = await esbuild.build({
    absWorkingDir: publishDir, entryPoints: [entryPath], bundle: true, format: 'iife', platform: 'browser',
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, write: false, outdir: join(dataDir, 'dist'),
    loader: { '.css': 'empty', '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty', '.svg': 'text', '.png': 'empty' },
  })
  bundleJs = bundled.outputFiles.find((f) => f.path.endsWith('.js')).text
} finally { rmSync(entryPath, { force: true }) }

const css = [
  ':root{--dsw-alias-bg-base:#111215;--dsw-alias-bg-layer-1:#181a1f;--dsw-alias-bg-layer-2:#20232a;',
  '--dsw-alias-label-primary:#f1f5f9;--dsw-alias-label-secondary:#94a3b8;--dsw-alias-label-tertiary:#64748b;',
  '--dsw-alias-border-l1:#262932;--dsw-alias-brand-primary:#3b82f6;--dsw-alias-interactive-bg-hover:rgba(255,255,255,.06);',
  '--dsw-alias-interactive-bg-active:rgba(255,255,255,.12);--dsw-alias-state-warn:#f59e0b;',
  '--dsw-alias-state-success-subtle:rgba(16,185,129,.16);--dsw-alias-state-success-text:#10b981}',
  'html,body{margin:0;padding:0;width:100%;height:100vh;background:#111215;color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,sans-serif}',
  '#stage-root{width:100%;height:100vh;display:flex;flex-direction:column}',
].join('')
const html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>first post</title><style>' + css +
  '</style></head><body><div id="stage-root"></div><script>' + bundleJs + '</script></body></html>'

const server = createServer(async (incoming, res) => {
  const url = new URL(incoming.url || '/', 'http://127.0.0.1')
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
    return
  }
  if (url.pathname.startsWith('/omnimux/publish')) {
    await routeHandler(incoming, res)
    return
  }
  if (url.pathname.startsWith('/omnimux/accounts')) {
    const chunks = []
    for await (const chunk of incoming) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString('utf8')
    let body
    if (raw) { try { body = JSON.parse(raw) } catch { body = undefined } }
    const out = await officialDispatcher.dispatch({
      method: incoming.method,
      url: incoming.url,
      origin: incoming.headers.origin || 'http://127.0.0.1',
      referer: incoming.headers.referer,
      secFetchSite: incoming.headers['sec-fetch-site'] || 'same-origin',
      body,
    })
    res.writeHead(out.status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(out.body))
    return
  }
  res.writeHead(404).end('not found')
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const origin = 'http://127.0.0.1:' + server.address().port

const reportPath = join(evidenceDir, 'live-qa-report.json')
const ego = [
  "const fs = await import('node:fs');",
  "const task = await taskSpace('publish-tiktok-first-post-3913');",
  'try {',
  "  const page = task.page('p1');",
  '  await page.goto(' + JSON.stringify(origin) + ');',
  '  await page.waitForFunction(() => window.__publishStageMounted === true, undefined, { timeout: 15000 });',
  '  await page.click(\'.omnimux-publish-stage-switch button:has-text("账号")\', { label: \'switch to accounts\' });',
  "  await page.waitForSelector('.omnimux-publish-accounts-add', { state: 'visible', timeout: 10000 });",
  "  await page.click('.omnimux-publish-accounts-add', { label: 'open authorize' });",
  '  await page.waitForSelector(\'text="授权前请确认 VPN 节点"\', { state: \'visible\', timeout: 10000 });',
  '  await page.click(\'text="去授权"\', { label: \'authorize\' });',
  '  await page.waitForSelector(\'text="OmniMux TikTok Sandbox"\', { state: \'visible\', timeout: 12000 });',
  '  await page.click(\'.omnimux-publish-stage-switch button:has-text("发布")\', { label: \'back to publish\' });',
  '  await page.click(\'text="新增发布"\', { label: \'new post\' });',
  '  await page.click(\'text="图文"\', { label: \'image type\' });',
  '  await page.waitForSelector(\'text="OmniMux TikTok Sandbox"\', { state: \'visible\', timeout: 10000 });',
  '  await page.click(\'.omnimux-publish-accounts-row input[type="checkbox"]\', { label: \'pick account\' });',
  '  await page.fill(\'input[placeholder*="标题"]\', \'首帖验收：官方直连私密态\');',
  '  await page.fill(\'textarea\', \'验证账号 ID 对齐与私密提示\');',
  '  const shot = ' + JSON.stringify(join(dataDir, 'shot.png')) + ';',
  "  fs.writeFileSync(shot, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082','hex'));",
  '  await page.setInputFiles(\'input[type="file"]\', [shot]);',
  "  await page.waitForSelector('.omnimux-publish-media-item', { state: 'visible', timeout: 10000 });",
  '  await page.click(\'text="确认发布"\', { label: \'submit post\' });',
  '  await page.waitForSelector(\'text="分渠道发布结果"\', { state: \'visible\', timeout: 10000 });',
  "  const beforeRefresh = await page.evaluate(() => document.body.innerText);",
  "  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((n) => n.textContent.trim() === '同步平台状态'); if (b && !b.disabled) b.click(); });",
  '  await page.waitForSelector(\'text="已发布"\', { state: \'visible\', timeout: 10000 });',
  "  const notice = await page.evaluate(() => document.body.innerText.includes('TikTok 应用审核通过前'));",
  '  const bodyText = await page.evaluate(() => document.body.innerText);',
  '  await page.screenshot({ path: ' + JSON.stringify(join(evidenceDir, '01-detail-published-private-notice.png')) + ' });',
  '  fs.writeFileSync(' + JSON.stringify(reportPath) + ', JSON.stringify({',
  "    task: 'issue-3913-publish-tiktok-first-post',",
  '    spaceId: task.spaceId,',
  '    negativeControl: ' + JSON.stringify(negativeControl) + ',',
  '    hubWidened: ' + JSON.stringify(hubWidened) + ',',
  "    beforeRefresh: beforeRefresh.slice(0, 600),",
  '    privateNoticeShown: notice,',
  "    hasUpstreamPostId: bodyText.includes('tt_publish_7001'),",
  "    subtaskSubmitted: bodyText.includes('已提交'),",
  '    pass: ' + JSON.stringify(hubWidened) + ' && notice && bodyText.includes(\'tt_publish_7001\'),',
  '    timestamp: new Date().toISOString(),',
  '  }, null, 2));',
  '} finally { await task.finish({ keep: [] }); const spaces = await listTaskSpaces(); console.log("remaining spaces:", spaces); }',
].join('\n')

try {
  const child = spawn('ego-browser', ['nodejs'], { stdio: ['pipe', 'pipe', 'pipe'] })
  let err = ''
  child.stdout.on('data', (d) => process.stdout.write(d))
  child.stderr.on('data', (d) => { err += d; process.stderr.write(d) })
  child.stdin.end(ego)
  const code = await new Promise((res) => child.on('close', res))
  if (code !== 0) throw new Error('ego-browser exit ' + code + ': ' + err)
  const decoded = PNG.sync.read(readFileSync(join(evidenceDir, '01-detail-published-private-notice.png')))
  console.log('screenshot ok ' + decoded.width + 'x' + decoded.height)
  console.log(readFileSync(reportPath, 'utf8'))
} finally {
  server.close()
  rmSync(dataDir, { recursive: true, force: true })
}
