import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, createFallbackDefineTool } from './index.js'
import { defaultCatalogDir } from './cloud-catalog.js'

/**
 * Copy the two files the tool path reads (manifest + index) from the shipped
 * catalog into a private directory under `root`. `saveToLocal` resolves every
 * row from `index.json`, so the page shards are never touched — and neither is
 * the shared shipped `<plugin>/cloud-catalog/.staging`, which sibling test
 * processes sweep concurrently (#3058).
 * @param {string} root
 * @returns {string}
 */
function makeTempCatalog(root) {
  const catalogDir = join(root, 'cloud-catalog')
  mkdirSync(catalogDir, { recursive: true })
  const shipped = defaultCatalogDir()
  for (const name of ['manifest.json', 'index.json']) {
    copyFileSync(join(shipped, name), join(catalogDir, name))
  }
  return catalogDir
}

test('omnimux-assets tools registration and execution', async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'assets-tools-test-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  const catalogDir = makeTempCatalog(tmp)

  t.after(() => {
    if (prevHome !== undefined) process.env.DSH_HOME = prevHome
    else delete process.env.DSH_HOME
    rmSync(tmp, { recursive: true, force: true })
  })

  const registered = new Map()
  const mockCtx = {
    tools: {
      register(tool) {
        registered.set(tool.name, tool)
      },
    },
    systemPrompt: { section() {} },
  }

  apply(mockCtx, { catalogDir })

  assert.ok(registered.has('assets_list'), 'assets_list registered')
  assert.ok(registered.has('assets_search'), 'assets_search registered')
  assert.ok(registered.has('assets_get'), 'assets_get registered')
  assert.ok(registered.has('assets_upload'), 'assets_upload registered')
  assert.ok(registered.has('assets_create'), 'assets_create registered')
  assert.ok(registered.has('assets_update'), 'assets_update registered')
  assert.ok(registered.has('assets_delete'), 'assets_delete registered')
  assert.ok(registered.has('assets_cloud_save'), 'assets_cloud_save registered')

  // 1. Test assets_create
  const createTool = registered.get('assets_create')
  const createRes = await createTool.execute({
    name: '林晓',
    type: 'character',
    description: '短剧女主角，性格开朗',
    tags: ['主角', '女性'],
  })
  assert.equal(createRes.ok, true)
  assert.equal(createRes.asset.name, '林晓')
  assert.equal(createRes.asset.type, 'character')
  const assetId = createRes.asset.id

  // 2. Test assets_get
  const getTool = registered.get('assets_get')
  const getRes = await getTool.execute({ id: assetId })
  assert.ok(getRes && typeof getRes === 'object')
  assert.deepEqual(Object.keys(getRes), ['asset'])
  assert.equal(getRes.asset.id, assetId)
  assert.equal(getRes.asset.name, '林晓')
  await assert.rejects(
    async () => getTool.execute({ id: 123 }),
    (err) => {
      assert.equal(err.code, 'INVALID_ARGS')
      return true
    }
  )

  // 3. Test assets_search
  const searchTool = registered.get('assets_search')
  const searchRes = await searchTool.execute({ query: '林晓' })
  assert.equal(searchRes.assets.length, 1)
  assert.equal(searchRes.assets[0].id, assetId)

  // 4. Test assets_update
  const updateTool = registered.get('assets_update')
  const updateRes = await updateTool.execute({
    id: assetId,
    description: '短剧女主角，性格开朗温和',
    tags: ['主角', '女性', '都市'],
  })
  assert.equal(updateRes.ok, true)
  assert.equal(updateRes.asset.description, '短剧女主角，性格开朗温和')
  assert.deepEqual(updateRes.asset.tags, ['主角', '女性', '都市'])

  // 5. Test assets_delete without confirm
  const deleteTool = registered.get('assets_delete')
  await assert.rejects(
    async () => deleteTool.execute({ id: assetId, confirm: false }),
    { message: /confirm must be explicitly true/ }
  )

  // 6. Test assets_delete with confirm
  const deleteRes = await deleteTool.execute({ id: assetId, confirm: true })
  assert.equal(deleteRes.ok, true)
  assert.equal(deleteRes.id, assetId)
  assert.equal(deleteRes.deleted, true)

  // Verify it is gone
  await assert.rejects(
    async () => getTool.execute({ id: assetId }),
    { message: /no asset/ }
  )

  // 7. Test assets_cloud_save
  const cloudSaveTool = registered.get('assets_cloud_save')
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const isPng = String(url).includes('.png')
    return {
      ok: true,
      headers: { get: () => (isPng ? 'image/png' : 'audio/wav') },
      arrayBuffer: async () => new TextEncoder().encode(isPng ? 'mock-png' : 'mock-wav').buffer,
    }
  }

  try {
    const saveRes = await cloudSaveTool.execute({ id: 'character-fantasy-genrex-2908f54b4d8c' })
    assert.equal(saveRes.ok, true)
    assert.ok(saveRes.asset)
    assert.equal(saveRes.asset.name, 'Angel Influencer')
    assert.equal(saveRes.asset.source, 'cloud:character-fantasy-genrex-2908f54b4d8c')
    assert.ok(saveRes.asset.files.length >= 2, 'should download both cover image and audio media')

    // 8. Test assets_search with cloud fallback
    const cloudSearchRes = await searchTool.execute({ query: 'Greaser' })
    assert.ok(cloudSearchRes.cloud_assets?.length > 0, 'should return cloud matching assets when local has none')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('assets_cloud_save refuses a preview-only row without touching the staging sweep (#3058)', async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'assets-tools-preview-save-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp
  // 本测试独占一份目录副本：探针与 handler 的暂存区都在其中，别的进程对
  // 随包目录的并发清扫永远扫不到它们（#3058 复测不再依赖时序运气）。
  const catalogDir = makeTempCatalog(tmp)
  const stagingRoot = join(catalogDir, '.staging')

  t.after(() => {
    if (prevHome !== undefined) process.env.DSH_HOME = prevHome
    else delete process.env.DSH_HOME
    rmSync(tmp, { recursive: true, force: true })
  })

  const registered = new Map()
  const mockCtx = {
    tools: {
      register(tool) {
        registered.set(tool.name, tool)
      },
    },
    systemPrompt: { section() {} },
  }
  apply(mockCtx, { catalogDir })
  const cloudSaveTool = registered.get('assets_cloud_save')
  const listTool = registered.get('assets_list')

  // 两个探针切片模拟「别的保存留下的过期残片」：空切片与超过 30 分钟的
  // 非空切片都会被裸清扫收走——它们还活着就证明清扫根本没跑，也就是
  // handler 对盘上其它 staging 保持了用户批准的 0 磁盘变更。
  const emptyProbe = join(stagingRoot, 'tools-test-sweep-empty')
  const staleProbe = join(stagingRoot, 'tools-test-sweep-stale')
  const seedProbes = () => {
    mkdirSync(emptyProbe, { recursive: true })
    mkdirSync(staleProbe, { recursive: true })
    writeFileSync(join(staleProbe, '.keep'), '')
    const old = new Date(Date.now() - 60 * 60 * 1000)
    utimesSync(staleProbe, old, old)
    utimesSync(join(staleProbe, '.keep'), old, old)
  }
  seedProbes()

  let fetches = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    fetches += 1
    return {
      ok: true,
      headers: { get: () => 'audio/mpeg' },
      arrayBuffer: async () => new TextEncoder().encode('mock-audio').buffer,
    }
  }

  try {
    // 1. preview-only 音色行：拒绝透传，且 0 fetch / 0 library.add / 0 staging 清扫。
    await assert.rejects(
      async () => cloudSaveTool.execute({ id: 'audio-voiceover-004a4873d762' }),
      (err) => {
        assert.equal(err.code, 'voice-preview-only')
        return true
      }
    )
    assert.equal(fetches, 0, '用途拒绝不得发出任何网络请求')
    const listRes = await listTool.execute({ scope: 'assets' })
    assert.equal(listRes.assets.length, 0, 'preview-only 行不得入库')
    assert.ok(existsSync(emptyProbe), '用途拒绝后 handler 不得再跑过期暂存切片清扫')
    assert.ok(existsSync(staleProbe), '用途拒绝后 handler 不得再跑过期暂存切片清扫')

    // 2. 真实错误的清理原逻辑不变：catalog-not-found 照常清扫掉探针切片。
    rmSync(emptyProbe, { recursive: true, force: true })
    rmSync(staleProbe, { recursive: true, force: true })
    seedProbes()
    await assert.rejects(
      async () => cloudSaveTool.execute({ id: 'no-such-cloud-asset' }),
      (err) => {
        assert.equal(err.code, 'catalog-not-found')
        return true
      }
    )
    assert.equal(existsSync(emptyProbe), false, '真实错误后仍应照常清理过期暂存切片')
    assert.equal(existsSync(staleProbe), false, '真实错误后仍应照常清理过期暂存切片')

    // 3. 普通保存路径的清扫原逻辑不变：成功后同样清扫探针切片。
    seedProbes()
    const saveRes = await cloudSaveTool.execute({ id: 'character-fantasy-genrex-2908f54b4d8c' })
    assert.equal(saveRes.ok, true)
    assert.ok(saveRes.asset, '普通保存应返回入库资产')
    assert.equal(existsSync(emptyProbe), false, '普通保存后仍应照常清理过期暂存切片')
    assert.equal(existsSync(staleProbe), false, '普通保存后仍应照常清理过期暂存切片')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('assets_get defineTool integration with host ToolRuntime', async (t) => {
  const hostToolsPath = '/Applications/DSH Desktop.app/Contents/Resources/app/node_modules/@deepseek-ai/dsh-tools/lib/index.js'
  const hostCordisPath = '/Applications/DSH Desktop.app/Contents/Resources/app/node_modules/@deepseek-ai/cordis/lib/index.js'

  const { existsSync } = await import('node:fs')
  if (!existsSync(hostToolsPath) || !existsSync(hostCordisPath)) {
    t.skip('Host @deepseek-ai/dsh-tools or @deepseek-ai/cordis not found in environment')
    return
  }

  const { ToolRuntime, ToolArgsError } = await import(hostToolsPath)
  const { Context } = await import(hostCordisPath)

  const tmp = mkdtempSync(join(tmpdir(), 'assets-host-integration-test-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp

  t.after(() => {
    if (prevHome !== undefined) process.env.DSH_HOME = prevHome
    else delete process.env.DSH_HOME
    rmSync(tmp, { recursive: true, force: true })
  })

  const ctx = new Context()
  ctx.systemPrompt = { tools() {}, section() {}, getSectionOrder() { return 10 } }
  const runtime = new ToolRuntime(ctx)
  apply(ctx)

  const createTool = runtime.get('assets_create')
  const createRes = await createTool.execute({
    name: '测试资产',
    type: 'character',
    description: '用于契约验证的资产',
  })
  assert.equal(createRes.ok, true)
  const assetId = createRes.asset.id

  const getTool = runtime.get('assets_get')
  assert.ok(getTool, 'assets_get should be registered in ToolRuntime')

  // 1. 传入合法的 { id } 能正确返回 { asset }
  const validRes = await getTool.execute({ id: assetId })
  assert.ok(validRes.asset)
  assert.deepEqual(Object.keys(validRes), ['asset'])
  assert.equal(validRes.asset.id, assetId)
  assert.equal(validRes.asset.name, '测试资产')

  // 2. 传入非 string 的非法参数（如 { id: 123 }）时，真实 ToolRuntime 抛出 ToolArgsError（INVALID_ARGS）
  await assert.rejects(
    async () => getTool.execute({ id: 123 }),
    (err) => {
      assert.ok(err instanceof ToolArgsError, 'should be instance of ToolArgsError')
      assert.equal(err.name, 'ToolArgsError')
      assert.equal(err.code, 'INVALID_ARGS')
      return true
    }
  )

  // 3. 验证通过 ToolRuntime.execute 调度非法参数管道同样产出 INVALID_ARGS 错误
  const execRes = await runtime.execute({
    callId: 'call_host_dsl_test',
    name: 'assets_get',
    arguments: { id: 123 },
    signal: new AbortController().signal,
  })
  assert.equal(execRes.isError, true)
  assert.equal(execRes.error?.info?.name, 'ToolArgsError')
  assert.equal(execRes.error?.info?.code, 'INVALID_ARGS')
})

test('fallback defineTool rejects unexpected extra properties with ToolArgsError (strict check)', async () => {
  const fallbackDefineTool = createFallbackDefineTool()
  const dummyTool = fallbackDefineTool({
    name: 'test_strict_tool',
    description: 'Test strict properties check in fallback defineTool',
    parameters: {
      id: { type: 'string', required: true, description: 'Identifier' },
    },
    async execute(args) {
      return { success: true, id: args.id }
    },
  })

  // 1. 合法入参顺利通过
  const validRes = await dummyTool.execute({ id: 'valid_id' })
  assert.deepEqual(validRes, { success: true, id: 'valid_id' })

  // 2. 传入非法多余属性 { id: 'x', extra: true } 会被拒绝并抛出 ToolArgsError
  await assert.rejects(
    async () => dummyTool.execute({ id: 'x', extra: true }),
    (err) => {
      assert.equal(err.name, 'ToolArgsError')
      assert.equal(err.code, 'INVALID_ARGS')
      assert.ok(Array.isArray(err.violations))
      assert.ok(err.violations.some((v) => v.includes('unexpected extra property "extra"')))
      return true
    }
  )

  // 3. 缺失必填字段也会被拒绝
  await assert.rejects(
    async () => dummyTool.execute({}),
    (err) => {
      assert.equal(err.name, 'ToolArgsError')
      assert.equal(err.code, 'INVALID_ARGS')
      return true
    }
  )
})
