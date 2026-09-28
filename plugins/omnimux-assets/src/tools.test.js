import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, createFallbackDefineTool } from './index.js'

test('omnimux-assets tools registration and execution', async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'assets-tools-test-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp

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

  apply(mockCtx)

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
