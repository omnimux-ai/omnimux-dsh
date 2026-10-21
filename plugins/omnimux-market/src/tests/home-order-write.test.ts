import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { afterEach } from 'node:test'
import { withDefaults } from '../config-store.js'
import { handleApi, persistHomeCustomOrder, setHomeOrderConfigPathForTests } from '../local-api.js'

/**
 * Issue #3503：homeCustomOrder 写盘失败必须返回 500 + ok:false，不得假成功。
 * 失败注入只在临时目录内进行，绝不触碰真实 catalog 或用户 HOME。
 * 每个用例起一个临时 HTTP 服务（port 0），走真实请求/响应，验证 status 与 body。
 * 本文件保持 JS 语法（写前门禁允许的测试候选口径），类型由上下文推断。
 */

const cfg = withDefaults({})

afterEach(() => {
  setHomeOrderConfigPathForTests(null)
})

test('正常写盘：POST 返回 200，配置真实更新且保留其他字段', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-market-home-order-'))
  t.after(() => {
    chmodSync(dir, 0o700)
    rmSync(dir, { recursive: true, force: true })
  })
  const configPath = join(dir, 'skill-recommendations.json')
  writeFileSync(configPath, `${JSON.stringify({ homeRecommendations: ['old'], keep: { x: 1 } }, null, 2)}\n`)
  setHomeOrderConfigPathForTests(configPath)

  const server = createServer((req, res) => {
    void handleApi(req, res, cfg)
  })
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(undefined))
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('market test server has no address')
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/omnimux-market`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'homeCustomOrder', order: ['b', 'a'] }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.deepEqual(body, { ok: true, order: ['b', 'a'] })
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => {
      server.close(() => resolve(undefined))
    })
  }

  const saved = JSON.parse(readFileSync(configPath, 'utf8'))
  assert.deepEqual(saved.homeRecommendations, ['b', 'a'])
  assert.deepEqual(saved.keep, { x: 1 })
})

test('损坏 JSON：persist 抛错，POST 返回 500 + ok:false，坏文件不被覆盖', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-market-home-order-'))
  t.after(() => {
    chmodSync(dir, 0o700)
    rmSync(dir, { recursive: true, force: true })
  })
  const configPath = join(dir, 'skill-recommendations.json')
  const corrupt = '{"homeRecommendations": ['
  writeFileSync(configPath, corrupt)
  setHomeOrderConfigPathForTests(configPath)

  assert.throws(() => persistHomeCustomOrder(configPath, ['b']), /config JSON invalid/)

  const server = createServer((req, res) => {
    void handleApi(req, res, cfg)
  })
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(undefined))
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('market test server has no address')
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/omnimux-market`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'homeCustomOrder', order: ['b'] }),
    })
    const body = await response.json()
    assert.equal(response.status, 500)
    assert.equal(body.ok, false)
    assert.match(body.error, /^home custom order not saved: .*config JSON invalid/)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => {
      server.close(() => resolve(undefined))
    })
  }

  assert.equal(readFileSync(configPath, 'utf8'), corrupt)
})

test('只读目录：写盘失败抛错，POST 返回 500 + ok:false，原文件保持原值', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-market-home-order-'))
  t.after(() => {
    chmodSync(dir, 0o700)
    rmSync(dir, { recursive: true, force: true })
  })
  const configPath = join(dir, 'skill-recommendations.json')
  writeFileSync(configPath, `${JSON.stringify({ homeRecommendations: ['old'] }, null, 2)}\n`)
  chmodSync(dir, 0o500)
  setHomeOrderConfigPathForTests(configPath)

  assert.throws(() => persistHomeCustomOrder(configPath, ['b']), /EACCES|EPERM|permission/i)

  const server = createServer((req, res) => {
    void handleApi(req, res, cfg)
  })
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(undefined))
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('market test server has no address')
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/omnimux-market`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'homeCustomOrder', order: ['b'] }),
    })
    const body = await response.json()
    assert.equal(response.status, 500)
    assert.equal(body.ok, false)
    assert.match(body.error, /^home custom order not saved: /)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => {
      server.close(() => resolve(undefined))
    })
  }

  const saved = JSON.parse(readFileSync(configPath, 'utf8'))
  assert.deepEqual(saved.homeRecommendations, ['old'])
})

test('缺文件 + 非空 order：persist 抛错，POST 返回 500 + ok:false 且不创建文件', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-market-home-order-'))
  t.after(() => {
    chmodSync(dir, 0o700)
    rmSync(dir, { recursive: true, force: true })
  })
  const configPath = join(dir, 'missing-skill-recommendations.json')
  setHomeOrderConfigPathForTests(configPath)

  assert.throws(() => persistHomeCustomOrder(configPath, ['b']), /config file not found/)

  const server = createServer((req, res) => {
    void handleApi(req, res, cfg)
  })
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(undefined))
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('market test server has no address')
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/omnimux-market`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'homeCustomOrder', order: ['b'] }),
    })
    const body = await response.json()
    assert.equal(response.status, 500)
    assert.equal(body.ok, false)
    assert.match(body.error, /^home custom order not saved: .*config file not found/)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => {
      server.close(() => resolve(undefined))
    })
  }

  assert.equal(existsSync(configPath), false)
})

test('order: [] 维持既有语义：返回 200 但不落盘（另立 Issue 跟进，本 PR 不改语义）', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-market-home-order-'))
  t.after(() => {
    chmodSync(dir, 0o700)
    rmSync(dir, { recursive: true, force: true })
  })
  const configPath = join(dir, 'skill-recommendations.json')
  const original = `${JSON.stringify({ homeRecommendations: ['old'] }, null, 2)}\n`
  writeFileSync(configPath, original)
  setHomeOrderConfigPathForTests(configPath)

  const server = createServer((req, res) => {
    void handleApi(req, res, cfg)
  })
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(undefined))
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('market test server has no address')
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/omnimux-market`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'homeCustomOrder', order: [] }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.deepEqual(body, { ok: true, order: [] })
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => {
      server.close(() => resolve(undefined))
    })
  }

  assert.equal(readFileSync(configPath, 'utf8'), original)
})
