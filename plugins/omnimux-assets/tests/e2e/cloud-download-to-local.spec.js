import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../../src/index.js'
import { addAssetToConversation } from '../../src/client/add-to-chat.js'

test('E2E: 公共素材加入会话、指令下载与自动入库全流程闭环', async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'assets-e2e-cloud-save-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp

  t.after(() => {
    if (prevHome !== undefined) process.env.DSH_HOME = prevHome
    else delete process.env.DSH_HOME
    rmSync(tmp, { recursive: true, force: true })
  })

  // 1. 模拟前端宿主环境与会话引用分发服务
  let deliveredRef = null
  let conversationRevealed = false
  const fakeWorkbench = {
    setConversationCollapsed(collapsed) {
      if (!collapsed) conversationRevealed = true
    },
    setFocus() {},
  }
  const fakeReferenceApi = {
    deliver(ref) {
      deliveredRef = ref
      fakeWorkbench.setConversationCollapsed(false)
    },
  }
  const fakeWindow = {
    __omnimuxReference: fakeReferenceApi,
    __omnimuxWorkbench: fakeWorkbench,
    dispatchEvent() { return true },
  }

  // 2. 模拟用户在公共素材库选择 Angel Influencer 并点击「加入对话」
  const cloudAsset = {
    id: 'character-fantasy-genrex-2908f54b4d8c',
    name: 'Angel Influencer',
    category: 'character',
    sub_category: 'fantasy-genrex',
    cover_url: 'file:library/opc/free-ai-avatars/versions/v1/files/Fantasy_GenreX/Angel Influencer/Angel Influencer.png',
    media_url: 'file:library/opc/free-ai-avatars/versions/v1/files/Fantasy_GenreX/Angel Influencer/089-angel-influencer.wav',
    media_type: 'audio',
    meta: {
      source_cover_url: 'https://assets.omnimux.ai/avatars/free-ai-avatars/Fantasy_GenreX/Angel%20Influencer/Angel%20Influencer.png',
      source_media_url: 'https://assets.omnimux.ai/avatars/free-ai-avatars/Fantasy_GenreX/Angel%20Influencer/089-angel-influencer.wav',
    },
  }

  const addResult = addAssetToConversation(cloudAsset, { window: fakeWindow })
  assert.equal(addResult.ok, true, '加入会话应成功')
  assert.equal(conversationRevealed, true, '应自动露出中间会话栏')
  assert.ok(deliveredRef, '应通过统一引用总线成功派发')
  assert.equal(deliveredRef.id, cloudAsset.id)
  assert.equal(deliveredRef.context.metadata.is_cloud, true)
  assert.equal(deliveredRef.context.metadata.source_cover_url, cloudAsset.meta.source_cover_url)
  assert.equal(deliveredRef.context.metadata.source_media_url, cloudAsset.meta.source_media_url)

  // 3. 模拟 Agent 装配与接收指令「帮我下载图片和音频到本地」
  const registeredTools = new Map()
  let emittedEvent = null
  const mockCtx = {
    tools: {
      register(tool) {
        registeredTools.set(tool.name, tool)
      },
    },
    systemPrompt: { section() {} },
    get(name) {
      if (name === 'hubEvents') {
        return {
          emit(event) {
            emittedEvent = event
          },
        }
      }
      return null
    },
  }

  apply(mockCtx)

  const cloudSaveTool = registeredTools.get('assets_cloud_save')
  assert.ok(cloudSaveTool, '助手必须具备 assets_cloud_save 工具')

  // Mock 真实网络直链拉取
  const originalFetch = globalThis.fetch
  const downloadedUrls = []
  globalThis.fetch = async (url) => {
    downloadedUrls.push(url)
    const isPng = String(url).includes('.png')
    return {
      ok: true,
      headers: { get: () => (isPng ? 'image/png' : 'audio/wav') },
      arrayBuffer: async () => new TextEncoder().encode(isPng ? 'e2e-png-data' : 'e2e-wav-data').buffer,
    }
  }

  try {
    // 4. Agent 执行下载并入库
    const saveRes = await cloudSaveTool.execute({ id: deliveredRef.id })
    assert.equal(saveRes.ok, true)
    assert.equal(saveRes.asset.name, 'Angel Influencer')
    assert.equal(saveRes.asset.type, 'character')

    // 验证双资源下载
    assert.equal(downloadedUrls.length, 2, '必须同时拉取图片封面与音频主媒体')
    assert.ok(downloadedUrls.some((u) => u.includes('Angel%20Influencer.png')))
    assert.ok(downloadedUrls.some((u) => u.includes('089-angel-influencer.wav')))

    // 验证本地资产条目中双文件的落盘与封面关联
    assert.equal(saveRes.asset.files.length, 2, '本地资产应包含图片与音频两个实体文件')
    assert.ok(saveRes.asset.files[0].original_name.includes('cover.png'))
    assert.ok(saveRes.asset.files[1].original_name.includes('.wav'))
    assert.equal(saveRes.asset.cover_file_id, saveRes.asset.files[0].id, '封面文件标识应指向图片')

    // 验证前端资产变更广播通知
    assert.ok(emittedEvent, '应触发资产变更事件广播')
    assert.equal(emittedEvent.type, 'omnimux:assets:changed')
    assert.equal(emittedEvent.payload.op, 'create')
    assert.deepEqual(emittedEvent.payload.ids, [saveRes.asset.id])

    // 5. 验证本地资产库列表查询联动
    const listTool = registeredTools.get('assets_list')
    const listRes = await listTool.execute({ scope: 'assets' })
    assert.equal(listRes.assets.length, 1)
    assert.equal(listRes.assets[0].name, 'Angel Influencer')
    assert.equal(listRes.assets[0].files.length, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})
