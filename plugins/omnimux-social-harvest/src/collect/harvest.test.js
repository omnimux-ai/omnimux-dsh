/**
 * @file 采集执行器单测 —— 注入假 run，零子进程。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ERROR_CODES } from '../core/errors.js'
import { checkSiteLogin, executeHarvest, resolveArgs } from './harvest.js'
import { getCommand } from './registry.js'

const fakeRun = (out) => async () => out

describe('argv 构造（逐位断言）', () => {
  it('tiktok search', () => {
    const { command } = getCommand('tiktok', 'search')
    assert.deepEqual(command.argv({ query: 'blender', limit: 15 }),
      ['tiktok', 'search', 'blender', '-f', 'json', '--limit', '15'])
  })
  it('tiktok user', () => {
    const { command } = getCommand('tiktok', 'user')
    assert.deepEqual(command.argv({ target: '@abc', limit: 10 }),
      ['tiktok', 'user', '@abc', '-f', 'json', '--limit', '10'])
  })
  it('pinterest search-pins', () => {
    const { command } = getCommand('pinterest', 'search-pins')
    assert.deepEqual(command.argv({ query: 'kitchen', limit: 20 }),
      ['pinterest', 'search-pins', 'kitchen', '-f', 'json', '--limit', '20'])
  })
  it('pinterest download（无 limit）', () => {
    const { command } = getCommand('pinterest', 'download')
    assert.deepEqual(command.argv({ url: 'https://pin.it/x', limit: 15 }),
      ['pinterest', 'download', 'https://pin.it/x', '-f', 'json'])
  })
  it('twitter search 带 product', () => {
    const { command } = getCommand('twitter', 'search')
    assert.deepEqual(command.argv({ query: 'q', product: 'videos', limit: 5 }),
      ['twitter', 'search', 'q', '--product', 'videos', '-f', 'json', '--limit', '5'])
  })
  it('twitter timeline following 才带 --type', () => {
    const { command } = getCommand('twitter', 'timeline')
    assert.deepEqual(command.argv({ type: 'following', limit: 15 }),
      ['twitter', 'timeline', '-f', 'json', '--limit', '15', '--type', 'following'])
    assert.deepEqual(command.argv({ type: 'for-you', limit: 15 }),
      ['twitter', 'timeline', '-f', 'json', '--limit', '15'])
  })
  it('login 命令 argv', () => {
    const { command } = getCommand('youtube', 'login')
    assert.deepEqual(command.argv({}), ['youtube', 'login'])
  })
  it('douyin hashtag 带子动作', () => {
    const { command } = getCommand('douyin', 'hashtag')
    assert.deepEqual(command.argv({ query: '好物', limit: 15 }),
      ['douyin', 'hashtag', 'search', '好物', '-f', 'json'])
  })
  it('flow image argv', () => {
    const { command } = getCommand('flow', 'image')
    assert.deepEqual(command.argv({ prompt: 'sunset beach', ratio: '16:9', count: 2, output: './out.png' }),
      ['flow', 'image', 'sunset beach', '--ratio', '16:9', '--count', '2', '--output', './out.png', '-f', 'json'])
  })
  it('flow video argv', () => {
    const { command } = getCommand('flow', 'video')
    assert.deepEqual(command.argv({ prompt: 'pan over city', ratio: '9:16' }),
      ['flow', 'video', 'pan over city', '--ratio', '9:16', '-f', 'json'])
  })
})

describe('resolveArgs', () => {
  it('必填缺失 → ARG_INVALID', () => {
    const { command } = getCommand('tiktok', 'search')
    assert.throws(() => resolveArgs(command, {}), (e) => e.code === ERROR_CODES.ARG_INVALID)
  })
  it('limit 夹取到 [1,50]，缺省 15', () => {
    const { command } = getCommand('tiktok', 'search')
    assert.equal(resolveArgs(command, { query: 'a', limit: 999 }).limit, 50)
    assert.equal(resolveArgs(command, { query: 'a' }).limit, 15)
  })
  it('select 非法值回落默认', () => {
    const { command } = getCommand('twitter', 'search')
    assert.equal(resolveArgs(command, { query: 'a', product: 'nope' }).product, 'top')
  })
})

describe('executeHarvest', () => {
  it('成功：数组信封归一 + fetchedAtMs 注入', async () => {
    const items = [{ title: 'a' }, { title: 'b' }]
    const r = await executeHarvest(
      { siteId: 'tiktok', commandId: 'search', args: { query: 'q' }, nowMs: 1234 },
      { run: fakeRun({ stdout: JSON.stringify(items), stderr: '', code: 0 }) },
    )
    assert.equal(r.ok, true)
    assert.equal(r.site, 'tiktok')
    assert.equal(r.command, 'search')
    assert.equal(r.rawCount, 2)
    assert.equal(r.fetchedAtMs, 1234)
  })

  it('exit 66 → 合法空态（不抛错）', async () => {
    const r = await executeHarvest(
      { siteId: 'tiktok', commandId: 'search', args: { query: 'q' }, nowMs: 1 },
      { run: fakeRun({ stdout: '', stderr: '', code: 66 }) },
    )
    assert.deepEqual(r.items, [])
    assert.equal(r.rawCount, 0)
  })

  it('exit 77 → AUTH', async () => {
    await assert.rejects(
      executeHarvest(
        { siteId: 'tiktok', commandId: 'search', args: { query: 'q' }, nowMs: 1 },
        { run: fakeRun({ stdout: '', stderr: 'auth required', code: 77 }) },
      ),
      (e) => e.code === ERROR_CODES.AUTH,
    )
  })

  it('exit 0 但 ok:false 信封 → 走同一套分类', async () => {
    await assert.rejects(
      executeHarvest(
        { siteId: 'tiktok', commandId: 'search', args: { query: 'q' }, nowMs: 1 },
        { run: fakeRun({ stdout: 'ok: false\nerror:\n  code: COMMAND_EXEC\n  message: attach failed\n', stderr: '', code: 0 }) },
      ),
      (e) => e.code === ERROR_CODES.UNAVAILABLE,
    )
  })

  it('stdout 非 JSON → BAD_PAYLOAD', async () => {
    await assert.rejects(
      executeHarvest(
        { siteId: 'tiktok', commandId: 'search', args: { query: 'q' }, nowMs: 1 },
        { run: fakeRun({ stdout: '<html>', stderr: '', code: 0 }) },
      ),
      (e) => e.code === ERROR_CODES.BAD_PAYLOAD,
    )
  })

  it('未登记命令 → ARG_INVALID（白名单闸）', async () => {
    await assert.rejects(
      executeHarvest(
        { siteId: 'tiktok', commandId: 'like', args: {}, nowMs: 1 },
        { run: fakeRun({ stdout: '[]', stderr: '', code: 0 }) },
      ),
      (e) => e.code === ERROR_CODES.ARG_INVALID,
    )
  })

  it('返回超出 limit 时截断并留 warning', async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ title: `t${i}` }))
    const r = await executeHarvest(
      { siteId: 'tiktok', commandId: 'search', args: { query: 'q', limit: 5 }, nowMs: 1 },
      { run: fakeRun({ stdout: JSON.stringify(items), stderr: '', code: 0 }) },
    )
    assert.equal(r.items.length, 5)
    assert.equal(r.rawCount, 20)
    assert.equal(r.warnings.length, 1)
  })
})

describe('checkSiteLogin', () => {
  it('whoami 成功 → loggedIn: true', async () => {
    const r = await checkSiteLogin(
      { siteId: 'tiktok', nowMs: 1 },
      { run: fakeRun({ stdout: JSON.stringify([{ username: 'me' }]), stderr: '', code: 0 }) },
    )
    assert.equal(r.loggedIn, true)
  })
  it('whoami AUTH → loggedIn: false（不抛）', async () => {
    const r = await checkSiteLogin(
      { siteId: 'tiktok', nowMs: 1 },
      { run: fakeRun({ stdout: '', stderr: '401', code: 77 }) },
    )
    assert.equal(r.loggedIn, false)
  })
  it('pinterest 无 whoami → loggedIn: false 由调用方按 free 处理', async () => {
    const r = await checkSiteLogin(
      { siteId: 'pinterest', nowMs: 1 },
      { run: fakeRun({ stdout: '[]', stderr: '', code: 0 }) },
    )
    assert.equal(r.loggedIn, false)
  })
})
