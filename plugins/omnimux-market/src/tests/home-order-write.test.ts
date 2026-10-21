// @ts-nocheck — 本文件保持纯 JS 语法（写前测试门禁口径），由 tsc 原样编译执行。
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { afterEach } from 'node:test'
import { withDefaults } from '../config-store.js'
import { handleApi, persistHomeCustomOrder, setHomeOrderConfigPathForTests } from '../local-api.js'

/**
 * Issue #3503 + #3509：homeCustomOrder 写路径必须真实落盘、失败不得假成功。
 * - 写失败（损坏 JSON / 只读目录 / 缺文件）→ 500 + ok:false，错误体不含安装路径
 * - 重置（order: []）→ 200 且真实清空 homeRecommendations，GET 可读回 []
 * - 非法 order（缺失/非数组）→ 400，不静默当空数组
 * - POST 必须同源（trustedRestartRequest），GET 读路径保持可用
 * 失败注入只在 mkdtemp 临时目录内进行，绝不触碰真实 catalog 或用户 HOME。
 * 每个用例起临时 HTTP 服务（port 0），走真实请求/响应。本文件保持 JS 语法。
 */

const cfg = withDefaults({})

afterEach(() => {
  setHomeOrderConfigPathForTests(null)
})

function makeConfig(t, initial) {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-market-home-order-'))
  t.after(() => {
    chmodSync(dir, 0o700)
    rmSync(dir, { recursive: true, force: true })
  })
  const configPath = join(dir, 'skill-recommendations.json')
  if (initial !== undefined) {
    writeFileSync(configPath, typeof initial === 'string' ? initial : `${JSON.stringify(initial, null, 2)}\n`)
  }
  setHomeOrderConfigPathForTests(configPath)
  return { dir, configPath }
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

function assertNoInstallPath(errorText, dir, configPath) {
  const text = String(errorText)
  assert.equal(text.includes(dir), false, `error must not leak the install dir: ${text}`)
  assert.equal(text.includes(configPath), false, `error must not leak the config path: ${text}`)
  assert.equal(text.includes('skill-recommendations.json'), false, `error must not leak the file name: ${text}`)
  assert.equal(text.includes(tmpdir()), false, `error must not leak the tmp dir: ${text}`)
}

test('正常写盘：同源 POST 返回 200，配置真实更新且保留其他字段', async (t) => {
  const { configPath } = makeConfig(t, { homeRecommendations: ['old'], keep: { x: 1 } })
  const port = await withServer(t)

  const response = await postOrder(port, { method: 'homeCustomOrder', order: ['b', 'a'] })
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(body, { ok: true, order: ['b', 'a'] })

  const saved = JSON.parse(readFileSync(configPath, 'utf8'))
  assert.deepEqual(saved.homeRecommendations, ['b', 'a'])
  assert.deepEqual(saved.keep, { x: 1 })
})

test('重置（order: []）：真实清空 catalog，GET 读回空数组', async (t) => {
  const { configPath } = makeConfig(t, { homeRecommendations: ['old', 'stale'], keep: true })
  const port = await withServer(t)

  const response = await postOrder(port, { method: 'homeCustomOrder', order: [] })
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(body, { ok: true, order: [] })
  assert.deepEqual(JSON.parse(readFileSync(configPath, 'utf8')).homeRecommendations, [])

  const read = await fetchOrder(port)
  const readBody = await read.json()
  assert.equal(read.status, 200)
  assert.deepEqual(readBody, { ok: true, order: [] })
})

test('非法 order：缺失/非数组返回 400，catalog 不被改写', async (t) => {
  const original = { homeRecommendations: ['keep-me'] }
  const { configPath } = makeConfig(t, original)
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
  assert.deepEqual(JSON.parse(readFileSync(configPath, 'utf8')), original)
})

test('损坏 JSON：persist 抛错，POST 返回 500 且错误体不含路径，坏文件不被覆盖', async (t) => {
  const corrupt = '{"homeRecommendations": ['
  const { dir, configPath } = makeConfig(t, corrupt)
  const port = await withServer(t)

  assert.throws(() => persistHomeCustomOrder(configPath, ['b']), /recommendations catalog is not valid JSON/)

  const response = await postOrder(port, { method: 'homeCustomOrder', order: ['b'] })
  const body = await response.json()
  assert.equal(response.status, 500)
  assert.equal(body.ok, false)
  assert.match(body.error, /^home custom order not saved: recommendations catalog is not valid JSON$/)
  assertNoInstallPath(body.error, dir, configPath)
  assert.equal(readFileSync(configPath, 'utf8'), corrupt)
})

test('只读目录：写盘失败返回 500 + 错误码，错误体不含路径，原文件保持原值', async (t) => {
  const original = { homeRecommendations: ['old'] }
  const { dir, configPath } = makeConfig(t, original)
  const port = await withServer(t)
  chmodSync(dir, 0o500)

  assert.throws(() => persistHomeCustomOrder(configPath, ['b']), /recommendations catalog not writable \((?:EACCES|EPERM)\)/)

  const response = await postOrder(port, { method: 'homeCustomOrder', order: ['b'] })
  const body = await response.json()
  assert.equal(response.status, 500)
  assert.equal(body.ok, false)
  assert.match(body.error, /^home custom order not saved: recommendations catalog not writable \((?:EACCES|EPERM)\)$/)
  assertNoInstallPath(body.error, dir, configPath)
  assert.deepEqual(JSON.parse(readFileSync(configPath, 'utf8')), original)
})

test('缺文件：返回 500 且不创建文件，错误体不含路径', async (t) => {
  const { dir, configPath } = makeConfig(t, undefined)
  const port = await withServer(t)

  assert.throws(() => persistHomeCustomOrder(configPath, ['b']), /recommendations catalog missing/)

  const response = await postOrder(port, { method: 'homeCustomOrder', order: ['b'] })
  const body = await response.json()
  assert.equal(response.status, 500)
  assert.equal(body.ok, false)
  assert.match(body.error, /^home custom order not saved: recommendations catalog missing$/)
  assertNoInstallPath(body.error, dir, configPath)
  assert.equal(existsSync(configPath), false)
})

test('非同源 POST：cross-site / Origin 不匹配 / 缺 Origin 均 403，catalog 不变', async (t) => {
  const original = { homeRecommendations: ['keep-me'] }
  const { configPath } = makeConfig(t, original)
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
  assert.deepEqual(JSON.parse(readFileSync(configPath, 'utf8')), original)
})
