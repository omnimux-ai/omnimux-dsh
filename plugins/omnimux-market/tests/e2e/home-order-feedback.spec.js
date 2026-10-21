// @ts-nocheck — 纯 JS 测试语法（写前测试门禁口径）。
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { withDefaults } from '../../lib/config-store.js'
import { handleApi, setHomeOrderPathsForTests } from '../../lib/local-api.js'
import { handleMoveToTop, handleResetOrder } from '../../src/client/plaza/plazaUtils.js'

/**
 * Issue #3528 E2E：客户端 home-order 写失败不再静默 —— 用真实 local-api 产生 500，
 * 验证客户端 warn 含服务端错误、无 unhandled rejection；可写目录成功时无 warn。
 */

const cfg = withDefaults({})

function makeApi(port, tracker) {
  return async (method, payload) => {
    const body = Object.assign({ method }, payload)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/omnimux-market`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` },
        body: JSON.stringify(body),
      })
      const json = await response.json()
      if (!response.ok || json.ok === false) throw new Error(json.error || `HTTP ${response.status}`)
      return json
    } finally {
      if (tracker) tracker.settled = true
    }
  }
}

async function waitFor(predicate, label) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`timed out waiting for ${label}`)
}

async function withMarketServer(t) {
  const server = createServer((req, res) => {
    void handleApi(req, res, cfg)
  })
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(undefined))
  })
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => {
      server.close(() => resolve(undefined))
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('market e2e server has no address')
  return address.port
}

function makePaths(t) {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-market-feedback-'))
  const catalogPath = join(dir, 'skill-recommendations.json')
  const statePath = join(dir, 'home-order.json')
  writeFileSync(catalogPath, `${JSON.stringify({ featuredSkills: ['a', 'b'], homeRecommendations: ['default-a'] }, null, 2)}\n`)
  setHomeOrderPathsForTests({ state: statePath, catalog: catalogPath })
  t.after(() => {
    chmodSync(dir, 0o700)
    rmSync(dir, { recursive: true, force: true })
    setHomeOrderPathsForTests(null)
  })
  return { dir, statePath }
}

function captureWarnings(t) {
  const warnings = []
  const originalWarn = console.warn
  console.warn = (message) => {
    warnings.push(String(message))
  }
  t.after(() => {
    console.warn = originalWarn
  })
  return warnings
}

test('真实 local-api 写失败：客户端 warn 含服务端错误且无 unhandled rejection', async (t) => {
  const paths = makePaths(t)
  writeFileSync(paths.statePath, `${JSON.stringify({ version: 1, order: ['old'] })}\n`)
  const port = await withMarketServer(t)
  const warnings = captureWarnings(t)
  chmodSync(paths.dir, 0o500)

  const seen = []
  const state = {
    setCustomOrder(value) {
      seen.push(value)
    },
  }
  const unhandled = []
  const onUnhandled = (reason) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  try {
    handleResetOrder(state, makeApi(port))
    await waitFor(() => warnings.length > 0, 'client warning')
    assert.deepEqual(seen, [null])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /^\[omnimux-market\] home custom order write failed \(reset\): home custom order not saved: home order state not writable \((?:EACCES|EPERM)\)$/)
    assert.deepEqual(unhandled, [])
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
})

test('真实 local-api 写成功：无 warn，覆盖文件落盘且 GET 返回自定义排序', async (t) => {
  const paths = makePaths(t)
  const port = await withMarketServer(t)
  const warnings = captureWarnings(t)

  const seen = []
  const tracker = { settled: false }
  const state = {
    setCustomOrder(value) {
      seen.push(value)
    },
  }
  handleMoveToTop('b', [{ id: 'a' }, { id: 'b' }], state, makeApi(port, tracker))
  await waitFor(() => tracker.settled, 'client api request settled')
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(seen, [['b', 'a']])
  assert.deepEqual(warnings, [])
  assert.deepEqual(JSON.parse(readFileSync(paths.statePath, 'utf8')).order, ['b', 'a'])

  const read = await fetch(`http://127.0.0.1:${port}/omnimux-market?method=homeCustomOrder`, { method: 'GET' })
  const body = await read.json()
  assert.equal(read.status, 200)
  assert.deepEqual(body, { ok: true, order: ['b', 'a'], source: 'custom' })
})
