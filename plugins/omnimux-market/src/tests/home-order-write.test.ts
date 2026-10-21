// @ts-nocheck — 本文件保持纯 JS 语法（写前测试门禁口径），由 tsc 原样编译执行。
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { afterEach } from 'node:test'
import { withDefaults } from '../config-store.js'
import {
  clearHomeOrderState,
  handleApi,
  homeOrderStatePath,
  setHomeOrderPathsForTests,
  writeHomeOrderState,
} from '../local-api.js'

/**
 * Issue #3503 + #3509：homeCustomOrder 写路径必须真实落盘、失败不得假成功。
 * - 自定义排序写入用户可写覆盖文件（DSH_HOME），catalog 的默认推荐永不被改写
 * - 重置（order: []）= 删除覆盖文件，GET 回退打包默认（source: 'default'）
 * - 写失败 → 500 + 固定错误码，错误体不含安装路径
 * - 非法 order → 400；POST 必须同源，GET 保持可用
 * 失败注入只在 mkdtemp 临时目录内进行，绝不触碰真实 catalog / 用户 DSH_HOME。
 */

const cfg = withDefaults({})

afterEach(() => {
  setHomeOrderPathsForTests(null)
})

function makePaths(t, options) {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-market-home-order-'))
  t.after(() => {
    chmodSync(dir, 0o700)
    rmSync(dir, { recursive: true, force: true })
  })
  const catalogPath = join(dir, 'skill-recommendations.json')
  const statePath = join(dir, 'home-order.json')
  const catalog = options && options.catalog !== undefined
    ? options.catalog
    : { featuredSkills: ['a', 'b', 'c'], homeRecommendations: ['default-a', 'default-b'], keep: { x: 1 } }
  if (catalog !== null) {
    writeFileSync(catalogPath, typeof catalog === 'string' ? catalog : `${JSON.stringify(catalog, null, 2)}\n`)
  }
  setHomeOrderPathsForTests({ state: statePath, catalog: catalogPath })
  return { dir, catalogPath, statePath }
}

async function withServer(t) {
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
  if (!address || typeof address === 'string') throw new Error('market test server has no address')
  return address.port
}

function urlOf(port) {
  return `http://127.0.0.1:${port}/omnimux-market`
}

function sameOriginHeaders(port) {
  return { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` }
}

function postOrder(port, body, headers) {
  return fetch(urlOf(port), {
    method: 'POST',
    headers: headers || sameOriginHeaders(port),
    body: JSON.stringify(body),
  })
}

function fetchOrder(port) {
  return fetch(`${urlOf(port)}?method=homeCustomOrder`, { method: 'GET' })
}

function stateOrder(statePath) {
  return JSON.parse(readFileSync(statePath, 'utf8')).order
}

function assertNoInstallPath(errorText, paths) {
  const text = String(errorText)
  for (const value of [paths.dir, paths.statePath, paths.catalogPath, 'home-order.json', tmpdir()]) {
    assert.equal(text.includes(value), false, `error must not leak path ${value}: ${text}`)
  }
}

test('自定义排序写入覆盖文件，catalog 默认推荐保持原样', async (t) => {
  const paths = makePaths(t)
  const catalogBefore = readFileSync(paths.catalogPath, 'utf8')
  const port = await withServer(t)

  const response = await postOrder(port, { method: 'homeCustomOrder', order: ['b', 'a'] })
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(body, { ok: true, order: ['b', 'a'] })
  assert.deepEqual(stateOrder(paths.statePath), ['b', 'a'])
  assert.equal(readFileSync(paths.catalogPath, 'utf8'), catalogBefore, 'catalog default must stay untouched')
})

test('重置（order: []）：删除覆盖文件，GET 回退打包默认（source: default）', async (t) => {
  const paths = makePaths(t)
  const catalogBefore = readFileSync(paths.catalogPath, 'utf8')
  const port = await withServer(t)

  const moved = await postOrder(port, { method: 'homeCustomOrder', order: ['b', 'a'] })
  assert.equal(moved.status, 200)
  assert.equal(existsSync(paths.statePath), true)

  const reset = await postOrder(port, { method: 'homeCustomOrder', order: [] })
  const resetBody = await reset.json()
  assert.equal(reset.status, 200)
  assert.deepEqual(resetBody, { ok: true, order: [] })
  assert.equal(existsSync(paths.statePath), false, 'reset must remove the custom override')

  const read = await fetchOrder(port)
  const readBody = await read.json()
  assert.equal(read.status, 200)
  assert.deepEqual(readBody, { ok: true, order: ['default-a', 'default-b'], source: 'default' })
  assert.equal(readFileSync(paths.catalogPath, 'utf8'), catalogBefore)
})

test('GET 返回自定义排序与来源标记', async (t) => {
  const paths = makePaths(t)
  const port = await withServer(t)

  const write = await postOrder(port, { method: 'homeCustomOrder', order: ['b', 'a'] })
  assert.equal(write.status, 200)

  const read = await fetchOrder(port)
  const body = await read.json()
  assert.equal(read.status, 200)
  assert.deepEqual(body, { ok: true, order: ['b', 'a'], source: 'custom' })
  assert.deepEqual(stateOrder(paths.statePath), ['b', 'a'])
})

test('非法 order：缺失/非数组返回 400，不写覆盖文件', async (t) => {
  const paths = makePaths(t)
  const port = await withServer(t)

  const payloads = [
    { method: 'homeCustomOrder' },
    { method: 'homeCustomOrder', order: 'b,a' },
    { method: 'homeCustomOrder', order: { a: 1 } },
    { method: 'homeCustomOrder', order: null },
  ]
  for (const payload of payloads) {
    const response = await postOrder(port, payload)
    const body = await response.json()
    assert.equal(response.status, 400, `payload ${JSON.stringify(payload)} must be rejected`)
    assert.equal(body.ok, false)
    assert.match(body.error, /order must be an array/)
  }
  assert.equal(existsSync(paths.statePath), false)
})

test('覆盖文件损坏：GET 容错回退默认，下一次写入可恢复', async (t) => {
  const paths = makePaths(t)
  writeFileSync(paths.statePath, '{"order": [')
  const port = await withServer(t)

  const read = await fetchOrder(port)
  const readBody = await read.json()
  assert.equal(read.status, 200)
  assert.deepEqual(readBody, { ok: true, order: ['default-a', 'default-b'], source: 'default' })

  const write = await postOrder(port, { method: 'homeCustomOrder', order: ['b'] })
  assert.equal(write.status, 200)
  assert.deepEqual(stateOrder(paths.statePath), ['b'])
})

test('写失败（只读目录）：500 + 固定错误码，错误体不含路径，catalog 不变', async (t) => {
  const paths = makePaths(t)
  const catalogBefore = readFileSync(paths.catalogPath, 'utf8')
  const port = await withServer(t)
  chmodSync(paths.dir, 0o500)

  assert.throws(() => writeHomeOrderState(paths.statePath, ['b']), /home order state not writable \((?:EACCES|EPERM)\)/)

  const response = await postOrder(port, { method: 'homeCustomOrder', order: ['b'] })
  const body = await response.json()
  assert.equal(response.status, 500)
  assert.equal(body.ok, false)
  assert.match(body.error, /^home custom order not saved: home order state not writable \((?:EACCES|EPERM)\)$/)
  assertNoInstallPath(body.error, paths)
  assert.equal(readFileSync(paths.catalogPath, 'utf8'), catalogBefore)
})

test('清除失败（只读目录）：500 + 固定错误码，错误体不含路径', async (t) => {
  const paths = makePaths(t)
  writeFileSync(paths.statePath, `${JSON.stringify({ version: 1, order: ['b'] })}\n`)
  const port = await withServer(t)
  chmodSync(paths.dir, 0o500)

  assert.throws(() => clearHomeOrderState(paths.statePath), /home order state not writable \((?:EACCES|EPERM)\)/)

  const response = await postOrder(port, { method: 'homeCustomOrder', order: [] })
  const body = await response.json()
  assert.equal(response.status, 500)
  assert.equal(body.ok, false)
  assert.match(body.error, /^home custom order not saved: home order state not writable /)
  assertNoInstallPath(body.error, paths)
})

test('非同源 POST：cross-site / Origin 不匹配 / 缺 Origin 均 403，不写覆盖文件', async (t) => {
  const paths = makePaths(t)
  const port = await withServer(t)

  const cases = [
    { label: 'cross-site', headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}`, 'sec-fetch-site': 'cross-site' } },
    { label: 'wrong origin', headers: { 'content-type': 'application/json', origin: 'http://evil.example' } },
    { label: 'missing origin', headers: { 'content-type': 'application/json' } },
  ]
  for (const item of cases) {
    const response = await postOrder(port, { method: 'homeCustomOrder', order: ['hijacked'] }, item.headers)
    const body = await response.json()
    assert.equal(response.status, 403, `${item.label} must be rejected`)
    assert.equal(body.ok, false)
    assert.match(body.error, /same-origin/)
  }
  assert.equal(existsSync(paths.statePath), false)
})

test('catalog 缺失：GET 返回空默认，自定义排序仍可写入（互不依赖）', async (t) => {
  const paths = makePaths(t, { catalog: null })
  const port = await withServer(t)

  const read = await fetchOrder(port)
  const readBody = await read.json()
  assert.equal(read.status, 200)
  assert.deepEqual(readBody, { ok: true, order: [], source: 'default' })

  const write = await postOrder(port, { method: 'homeCustomOrder', order: ['b'] })
  assert.equal(write.status, 200)
  assert.deepEqual(stateOrder(paths.statePath), ['b'])
})

test('默认状态路径位于 DSH_HOME，而不是包内 catalog', () => {
  const statePath = homeOrderStatePath()
  assert.equal(statePath.endsWith('omnimux-market-home-order.json'), true)
  assert.equal(statePath.includes('skill-recommendations.json'), false)
})
