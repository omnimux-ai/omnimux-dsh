import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply } from '../../plugins/omnimux-inspiration/src/index.js'
import { createLocalStore } from '../../plugins/omnimux-inspiration/src/local-store.js'
import { resolveInspirationPaths } from '../../plugins/omnimux-inspiration/src/paths.js'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const LOCAL = '/omnimux/inspiration/local'
const definitions = [
  ['dance1', '舞蹈参考一', '舞蹈'], ['dance2', '舞蹈参考二', '舞蹈'],
  ['fashion1', '穿搭参考一', '穿搭'], ['fashion2', '穿搭参考二', '穿搭'],
  ['portrait1', '人像参考一', '人像'], ['portrait2', '人像参考二', '人像'],
  ['city1', '城市参考', '城市'], ['travel1', '旅行参考', '旅行'],
]
const hostCss = ':root{color-scheme:light;--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#f7f7f7;--dsw-alias-bg-layer-2:#efefef;--dsw-alias-label-primary:#1b1b1b;--dsw-alias-label-secondary:#777;--dsw-alias-label-tertiary:#999;--dsw-alias-label-primary-foreground:#fff;--dsw-alias-border-l1:#eee;--dsw-alias-border-l2:#e5e5e5;--dsw-alias-border-l3:#ccc;--dsw-alias-brand-primary:#1b1b1b;--dsw-alias-button-primary-fill:#1b1b1b;--dsw-alias-button-primary-hover:#333;--dsw-alias-interactive-bg-hover:#f1f1f1;}html,body{margin:0;width:100%;height:100%;font-family:system-ui}body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}#fixture-stage{display:flex;flex-direction:column;height:100vh}#root{display:flex;flex:1 1 auto;flex-direction:column;min-height:0}'

/**
 * Real product Section + real apply-registered handler + an independent durable
 * library. Only the unrelated cloud catalogue is synthetic and explicitly empty.
 * Deferred/failed list reads are transport faults; writes are never substituted.
 * @param {{ root?: string, evidenceDir: string }} options
 */
export async function startInspirationCollectionsFixture({ root = REPO_ROOT, evidenceDir }) {
  assert.ok(evidenceDir.startsWith(root + '/'), 'Evidence must stay in this checkout')
  mkdirSync(evidenceDir, { recursive: true })
  const storeHome = mkdtempSync(join(evidenceDir, 'store-'))
  const paths = resolveInspirationPaths({ homeDir: storeHome })
  const previousHome = process.env.DSH_HOME
  const nativeFetch = globalThis.fetch
  process.env.DSH_HOME = storeHome
  const counters = { syntheticCloud: 0, blockedCapabilities: 0, blockedExternalFetch: 0, injectedReadFailures: 0 }
  const requests = []
  const pendingReads = new Set()
  const plannedReads = []
  let origin = ''
  let server
  let route
  let disposers = []
  let instance = 0
  let closed = false
  let identity
  globalThis.fetch = (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    if (!origin || url.origin !== origin) {
      counters.blockedExternalFetch += 1
      throw new Error('External requests disabled in isolated collection fixture')
    }
    return nativeFetch(input, { ...options, redirect: 'error' })
  }

  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }
  const unmount = () => {
    for (const dispose of disposers.reverse()) dispose()
    disposers = []
    route = null
  }
  const restart = () => {
    unmount()
    const registrations = []
    const effect = factory => {
      const dispose = factory()
      if (typeof dispose === 'function') disposers.push(dispose)
    }
    apply({
      tools: { register() {}, get() { return { async execute() {
        counters.blockedCapabilities += 1
        throw new Error('Account/model/cloud capability disabled in isolated fixture')
      } } } },
      get() { return undefined },
      effect,
      inject(_deps, callback) {
        callback({ effect, webServer: { register(entry) { registrations.push(entry); return () => {} } } })
      },
    })
    assert.equal(registrations.length, 1)
    assert.equal(registrations[0].path, LOCAL)
    route = registrations[0]
    instance += 1
  }
  const readDisk = () => JSON.parse(readFileSync(paths.libraryFile, 'utf8'))
  const close = async () => {
    if (closed) return { alreadyClosed: true }
    closed = true
    const errors = []
    for (const release of pendingReads) release()
    try { unmount() } catch (error) { errors.push(error) }
    if (server) {
      server.closeAllConnections()
      await new Promise(done => server.close(done))
    }
    try { rmSync(storeHome, { recursive: true, force: true }) } catch (error) { errors.push(error) }
    globalThis.fetch = nativeFetch
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    const receipt = { serverClosed: !server || !server.listening, storeRemoved: !existsSync(storeHome), environmentRestored: process.env.DSH_HOME === previousHome }
    if (errors.length) throw new AggregateError(errors, 'Collection fixture cleanup failed')
    return receipt
  }

  try {
    const require = createRequire(join(root, 'package.json'))
    const { build } = require('esbuild')
    const result = await build({
      absWorkingDir: root,
      stdin: {
        contents: [
          "import React from 'react'; import {createRoot} from 'react-dom/client';",
          "import {InspirationSection} from './plugins/omnimux-inspiration/src/client/InspirationSection.jsx';",
          "import {zh} from './plugins/omnimux-inspiration/src/client/locales.js';",
          "import {injectInspirationStyles} from './plugins/omnimux-inspiration/src/client/styles.js';",
          "import {injectCollectionStyles} from './plugins/omnimux-inspiration/src/client/collection-styles.js';",
          "injectInspirationStyles(); injectCollectionStyles();",
          "createRoot(document.getElementById('root')).render(React.createElement(InspirationSection,{active:true,t:key=>zh[key]||key}));",
        ].join('\n'),
        resolveDir: root, sourcefile: 'collections-real-section-entry.jsx', loader: 'jsx',
      },
      bundle: true, write: false, metafile: true, format: 'iife', platform: 'browser', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"development"' }, outdir: join(evidenceDir, 'in-memory-build'),
      loader: { '.css': 'css', '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.svg': 'text', '.png': 'dataurl' },
      logLevel: 'silent',
    })
    const js = result.outputFiles.find(file => file.path.endsWith('.js'))?.text
    assert.ok(js)
    const css = hostCss + '\n' + result.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n')
    const sourcePaths = [
      'plugins/omnimux-inspiration/src/index.js', 'plugins/omnimux-inspiration/src/local-store.js',
      'plugins/omnimux-inspiration/src/local-collections.js', 'plugins/omnimux-inspiration/src/collection-handlers.js',
      'plugins/omnimux-inspiration/src/http-routes.js', 'plugins/omnimux-inspiration/src/http-handlers.js',
      'tests/e2e/inspiration-collections.fixture.mjs',
      'tests/e2e/inspiration-collections.browser.mjs', 'tests/e2e/inspiration-collections.e2e.test.mjs',
      ...Object.keys(result.metafile.inputs).filter(file => existsSync(resolve(root, file))),
    ]
    const files = Object.fromEntries([...new Set(sourcePaths)].sort().map(file => [file, hash(readFileSync(resolve(root, file)))]))
    identity = {
      root, pid: process.pid, sourceSha256: hash(JSON.stringify(files)), bundleSha256: hash(js), cssSha256: hash(css),
      head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      sourceFiles: files, evidenceScope: 'real-section-and-production-apply-handler; synthetic-empty-cloud; not-full-host-install',
    }
    restart()
    server = createServer({ maxHeaderSize: 131072 }, async (req, res) => {
      res.setHeader('cache-control', 'no-store')
      res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; font-src 'self' data:; object-src 'none'; frame-src 'none'")
      try {
        if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) {
          json(res, 403, { error: 'same-origin-only' }); return
        }
        const url = new URL(req.url || '/', origin)
        if (req.method === 'GET' && url.pathname === '/') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>合集功能隔离回归</title><link rel="stylesheet" href="/fixture.css"><main id="fixture-stage" class="omnimux-inspiration-stage"><div id="root" class="omx-stage-scroll"></div></main><script src="/bundle.js"></script></html>')
          return
        }
        if (req.method === 'GET' && (url.pathname === '/bundle.js' || url.pathname === '/fixture.css')) {
          res.writeHead(200, { 'content-type': url.pathname === '/bundle.js' ? 'text/javascript' : 'text/css' })
          res.end(url.pathname === '/bundle.js' ? js : css); return
        }
        if (req.method === 'GET' && /^\/covers\/[a-z]+\d+\.webp$/.test(url.pathname)) {
          const key = url.pathname.split('/').pop()
          const file = join(paths.coversDir, key)
          if (existsSync(file)) { res.writeHead(200, { 'content-type': 'image/webp' }); res.end(readFileSync(file)); return }
        }
        if (req.method === 'GET' && ['/omnimux/inspiration', '/omnimux/inspiration/categories'].includes(url.pathname)) {
          counters.syntheticCloud += 1
          json(res, 200, { success: true, data: { items: [], total: 0, platforms: [], categories: [] } }); return
        }
        if (url.pathname === LOCAL || url.pathname.startsWith(LOCAL + '/')) {
          const entry = { method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), status: null, instance, body: '' }
          requests.push(entry)
          let body = ''
          req.on('data', chunk => { if (body.length < 65536) body += chunk.toString('utf8').slice(0, 65536 - body.length) })
          res.once('finish', () => { entry.status = res.statusCode; if (body) { try { entry.body = JSON.parse(body) } catch { entry.body = '[invalid-json]' } } })
          if (req.method === 'GET' && url.pathname === LOCAL) {
            const plannedIndex = plannedReads.findIndex(plan => plan.match(url))
            if (plannedIndex >= 0) {
              const planned = plannedReads.splice(plannedIndex, 1)[0]
              planned.entered()
              if (planned.failure) {
                counters.injectedReadFailures += 1
                json(res, 503, { error: 'qa-list-unavailable' }); return
              }
              await planned.released
              if (res.destroyed) return
            }
          }
          await route.handler(req, res); return
        }
        json(res, 404, { error: 'not-found' })
      } catch (error) {
        if (!res.headersSent) json(res, 500, { error: 'fixture-error', kind: error.name })
        else res.destroy()
      }
    })
    await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
    origin = 'http://127.0.0.1:' + server.address().port
    const store = createLocalStore({ paths })
    mkdirSync(paths.coversDir, { recursive: true })
    const coverFiles = [2, 3, 4].map(number => 'plugins/omnimux/assets/skill-card-covers/skill-card-' + number + '.webp')
    identity.coverSources = Object.fromEntries(coverFiles.map(file => [file, hash(readFileSync(join(root, file)))]))
    for (const [index, [key, title, category]] of definitions.entries()) {
      const bytes = readFileSync(join(root, coverFiles[index % coverFiles.length]))
      assert.equal(bytes.subarray(0, 4).toString(), 'RIFF')
      assert.equal(bytes.subarray(8, 12).toString(), 'WEBP')
      writeFileSync(join(paths.coversDir, key + '.webp'), bytes)
      const cover = origin + '/covers/' + key + '.webp'
      store.add({
        id: 'qa-' + key, title, category, type: 'image', source_platform: 'tiktok',
        source_url: 'https://example.com/qa/' + key, cover_url: cover, media_urls: [cover],
        media_items: [{ type: 'image', url: cover }], tags: [category],
        created_at: '2026-10-' + String(18 - index).padStart(2, '0') + 'T00:00:00.000Z',
      })
    }
    assert.equal(readDisk().collections.length, 0)
    return {
      origin, root, paths, identity, counters, requests, readDisk, restart, close,
      get instance() { return instance },
      /** Apply a single transport-only fault to a matching real list request. */
      planListRead({ match = () => true, failure = false } = {}) {
        let entered, release
        const reached = new Promise(done => { entered = done })
        const released = new Promise(done => { release = done })
        pendingReads.add(release)
        plannedReads.push({ match, failure, entered, released })
        return { reached, release: () => { pendingReads.delete(release); release() } }
      },
    }
  } catch (error) {
    await close()
    throw error
  }
}
