import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from './index.js'

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
  assert.equal(getRes.asset.id, assetId)
  assert.equal(getRes.asset.name, '林晓')

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
})
