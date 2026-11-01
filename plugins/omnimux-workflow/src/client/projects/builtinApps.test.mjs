/**
 * 官方内置应用清单读取与合并（builtinApps.js）的行为契约。
 *
 * 纯函数 + fetch 缝，不依赖 React/DOM：断言的是真实映射、真实去重顺序，
 * 以及「读不到 ≠ 没有」这条失败语义。
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  BUILTIN_APPS_ENDPOINT,
  builtinCoverUrl,
  fetchAppManifest,
  fetchBuiltinApps,
  mapBuiltinAppEntry,
  mergeAppEntries,
} from './builtinApps.js'

const jsonResponse = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  async json() { return body },
})

const builtinManifest = (appId, overrides = {}) => ({
  schemaVersion: '1.0.0',
  appId,
  version: '1.0.0',
  workflowBinding: { workspaceId: `ws-${appId}`, workflowVersion: 1 },
  metadata: { name: `内置 ${appId}`, category: 'video', description: '官方出厂应用' },
  ...overrides,
})

describe('builtinCoverUrl：封面取值优先级', () => {
  test('metadata.coverUrl 优先于 showcase 首条 posterUrl', () => {
    const manifest = builtinManifest('app_a', {
      metadata: { name: 'A', category: 'video', coverUrl: 'https://cdn.example.com/cover.webp' },
      showcase: { mode: 'carousel', items: [{ posterUrl: 'https://cdn.example.com/poster.webp' }] },
    })
    assert.equal(builtinCoverUrl(manifest), 'https://cdn.example.com/cover.webp')
  })

  test('缺 metadata.coverUrl 时回落到 showcase 首条 posterUrl', () => {
    const manifest = builtinManifest('app_b', {
      showcase: { mode: 'carousel', items: [{ posterUrl: 'https://cdn.example.com/poster.webp' }] },
    })
    assert.equal(builtinCoverUrl(manifest), 'https://cdn.example.com/poster.webp')
  })

  test('两者都没有 / 非对象输入时给空串，不抛异常', () => {
    assert.equal(builtinCoverUrl(builtinManifest('app_c')), '')
    assert.equal(builtinCoverUrl(null), '')
    assert.equal(builtinCoverUrl('nope'), '')
    assert.equal(builtinCoverUrl({ showcase: { items: [{}, null] } }), '')
  })
})

describe('mapBuiltinAppEntry：内置 manifest → 卡片条目', () => {
  test('输出与已发布条目同构，并标记 isBuiltin', () => {
    const entry = mapBuiltinAppEntry(builtinManifest('app-builtin-product-video', {
      metadata: {
        name: '商品生视频',
        category: 'video',
        description: '适用于商品短视频',
        coverUrl: 'https://cdn.example.com/cover.webp',
      },
    }))
    assert.ok(entry, '合法 manifest 必须产出条目')
    assert.equal(entry.appId, 'app-builtin-product-video')
    assert.equal(entry.name, '商品生视频')
    assert.equal(entry.category, 'video')
    assert.equal(entry.description, '适用于商品短视频')
    assert.equal(entry.coverUrl, 'https://cdn.example.com/cover.webp')
    assert.equal(entry.workspaceId, 'ws-app-builtin-product-video')
    assert.equal(entry.isBuiltin, true)
  })

  test('缺 appId 返回 null，不伪造条目', () => {
    assert.equal(mapBuiltinAppEntry({ metadata: { name: '无 id' } }), null)
    assert.equal(mapBuiltinAppEntry(null), null)
    assert.equal(mapBuiltinAppEntry([]), null)
  })

  test('缺封面时用 showcase posterUrl 兜底，而不是留空丢图', () => {
    const entry = mapBuiltinAppEntry(builtinManifest('app_b', {
      showcase: { mode: 'carousel', items: [{ posterUrl: 'https://cdn.example.com/p.webp' }] },
    }))
    assert.equal(entry.coverUrl, 'https://cdn.example.com/p.webp')
  })
})

describe('mergeAppEntries：用户已发布 + 官方内置合并', () => {
  const user = (appId) => ({ appId, name: `用户 ${appId}`, isBuiltin: false })
  const builtin = (appId) => ({ appId, name: `内置 ${appId}`, isBuiltin: true })

  test('用户条目在前、内置在后，且顺序各自稳定', () => {
    const merged = mergeAppEntries([user('u2'), user('u1')], [builtin('b1'), builtin('b2')])
    assert.deepEqual(merged.map((e) => e.appId), ['u2', 'u1', 'b1', 'b2'])
  })

  test('同一个 appId 只保留用户版本（覆盖发布的内置应用按用户应用管理）', () => {
    const merged = mergeAppEntries(
      [user('app-builtin-product-video')],
      [builtin('app-builtin-product-video'), builtin('b2')],
    )
    assert.deepEqual(merged.map((e) => e.appId), ['app-builtin-product-video', 'b2'])
    assert.equal(merged[0].isBuiltin, false)
  })

  test('非数组输入按空数组处理，不抛异常', () => {
    assert.deepEqual(mergeAppEntries(undefined, undefined), [])
    assert.deepEqual(mergeAppEntries(null, [builtin('b1')]).map((e) => e.appId), ['b1'])
    assert.deepEqual(mergeAppEntries([user('u1')], 'nope').map((e) => e.appId), ['u1'])
  })

  test('空 appId 的内置条目被跳过，不产生无主卡片', () => {
    const merged = mergeAppEntries([], [{ name: '没有 id' }, builtin('b1')])
    assert.deepEqual(merged.map((e) => e.appId), ['b1'])
  })
})

describe('fetchBuiltinApps：读不到 ≠ 没有', () => {
  test('成功响应按映射返回条目，error=false', async () => {
    const seen = []
    const result = await fetchBuiltinApps({
      fetchImpl: async (url, init) => {
        seen.push({ url, init })
        return jsonResponse({ apps: [builtinManifest('app_x'), builtinManifest('app_y')] })
      },
    })
    assert.equal(result.error, false)
    assert.deepEqual(result.entries.map((e) => e.appId), ['app_x', 'app_y'])
    assert.equal(seen[0].url, BUILTIN_APPS_ENDPOINT)
    assert.equal(seen[0].init.headers.Accept, 'application/json')
  })

  test('非 2xx 响应判为错误，不把失败伪装成空清单', async () => {
    const result = await fetchBuiltinApps({ fetchImpl: async () => jsonResponse({}, false) })
    assert.equal(result.error, true)
    assert.deepEqual(result.entries, [])
  })

  test('网络异常 / 坏 JSON / 坏载荷都是错误，不抛异常', async () => {
    const throwing = await fetchBuiltinApps({ fetchImpl: async () => { throw new Error('offline') } })
    assert.deepEqual(throwing, { entries: [], error: true })

    const badJson = await fetchBuiltinApps({
      fetchImpl: async () => ({ ok: true, status: 200, async json() { throw new SyntaxError('bad') } }),
    })
    assert.equal(badJson.error, true)

    const wrongShape = await fetchBuiltinApps({ fetchImpl: async () => jsonResponse({ apps: 'nope' }) })
    assert.equal(wrongShape.error, true)
  })

  test('没有 fetch 可用时也报错误而不是静默空', async () => {
    const original = globalThis.fetch
    globalThis.fetch = undefined
    try {
      const result = await fetchBuiltinApps()
      assert.deepEqual(result, { entries: [], error: true })
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('fetchAppManifest：内置应用标签页的 manifest 解析', () => {
  test('按 appId 请求单项接口并返回 manifest', async () => {
    let requested = ''
    const manifest = await fetchAppManifest('app-builtin-product-video', {
      fetchImpl: async (url) => {
        requested = url
        return jsonResponse({ app: builtinManifest('app-builtin-product-video') })
      },
    })
    assert.equal(requested, `${BUILTIN_APPS_ENDPOINT}/app-builtin-product-video`)
    assert.equal(manifest?.appId, 'app-builtin-product-video')
  })

  test('404 / 载荷 appId 不一致 / 空 appId 都返回 null', async () => {
    const notFound = await fetchAppManifest('app_missing', { fetchImpl: async () => jsonResponse({}, false) })
    assert.equal(notFound, null)

    const mismatched = await fetchAppManifest('app_a', {
      fetchImpl: async () => jsonResponse({ app: builtinManifest('app_b') }),
    })
    assert.equal(mismatched, null, '返回的 manifest 必须与请求的 appId 一致，不能张冠李戴')

    const empty = await fetchAppManifest('', { fetchImpl: async () => jsonResponse({ app: builtinManifest('app_a') }) })
    assert.equal(empty, null)
  })

  test('接口异常返回 null，不抛异常', async () => {
    const result = await fetchAppManifest('app_a', { fetchImpl: async () => { throw new Error('boom') } })
    assert.equal(result, null)
  })
})
