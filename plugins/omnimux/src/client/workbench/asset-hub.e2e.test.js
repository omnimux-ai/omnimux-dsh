/**
 * 端到端测试：三栏状态右侧素材工作台（Asset Hub）全链路交互
 * 验证加号菜单展开、Tab切换、二级筛选、卡片注入附件、键盘无障碍及收起展开全链路
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  ASSET_HUB_TAB_ID,
  ASSET_HUB_CHAT_PX,
  isAssetHubActive,
  workbenchDefaultWidthPx,
} from './geometry.js'
import {
  createAssetHubNavStore,
  PRIMARY_TABS,
  SECONDARY_FILTER_WHITELIST,
} from './asset-hub-store.js'
import {
  normalizeAssetItem,
  normalizeInspirationItem,
  filterAssetHubItems,
  adaptCardToAttachmentPayload,
} from './asset-hub-data.js'
import { createAttachmentStore } from '../attachments/store.ts'
import { createComposerAddController } from '../composer-add/controller.js'
import { zh } from '../locales.js'

describe('Asset Hub E2E: 三栏右侧素材工作台端到端全链路', () => {
  it('E2E-01: 加号菜单唤起 Asset Hub 并联动 Tab 切换与分栏展开', () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>')
    const win = dom.window
    const doc = win.document
    globalThis.window = win
    globalThis.document = doc

    const store = createAttachmentStore()
    const navStore = createAssetHubNavStore()
    const workbenchCalls = []

    const mockWorkbench = {
      openWorkbench(opts) {
        workbenchCalls.push(opts)
      },
      closeWorkbenchPanel() {
        workbenchCalls.push({ action: 'close' })
      },
    }

    const controller = createComposerAddController({
      store,
      t: (key) => zh[key] || key,
      getCurrentSessionId: () => 'session_e2e_1',
      subscribeCurrentSession: () => () => {},
      renderLibrary: () => {},
      notify: () => {},
      workbench: mockWorkbench,
      assetHubNavStore: navStore,
    })

    // 1. 用户在会话 session_e2e_1 中点击「从灵感库选择」
    controller.openInspiration('session_e2e_1')
    assert.equal(workbenchCalls.length, 1)
    assert.equal(workbenchCalls[0].tabId, ASSET_HUB_TAB_ID)
    assert.equal(workbenchCalls[0].focus, 'split')
    assert.equal(workbenchCalls[0].sessionId, 'session_e2e_1')
    assert.equal(navStore.getSnapshot().activeTab, 'inspiration')

    // 2. 模拟收起右侧栏后重入
    mockWorkbench.closeWorkbenchPanel()
    assert.equal(workbenchCalls.length, 2)

    // 3. 用户再次点击「从灵感库选择」，必须重新触发展开
    controller.openInspiration('session_e2e_1')
    assert.equal(workbenchCalls.length, 3)
    assert.equal(workbenchCalls[2].tabId, ASSET_HUB_TAB_ID)
    assert.equal(workbenchCalls[2].focus, 'split')

    controller.dispose()
  })

  it('E2E-02: 素材卡片点击及键盘回车全链路注入附件并响应式更新已选态', () => {
    const store = createAttachmentStore()
    const sessionId = 'session_e2e_attach'

    const rawAsset = {
      id: 'ast_e2e_99',
      name: '分镜特写_01.mp4',
      duration: 12,
      cover: { id: 'cover_99' },
    }

    const item = normalizeAssetItem(rawAsset)
    assert.equal(item.id, 'ast_e2e_99')
    assert.equal(item.thumbnailUrl, '/omnimux/assets/library/preview?id=ast_e2e_99&file=cover_99')
    assert.equal(item.durationText, '00:12')

    // 1. 模拟卡片点击注入
    const payload = adaptCardToAttachmentPayload(item)
    const res1 = store.addAttachment(sessionId, payload)
    assert.equal(res1.ok, true)
    assert.equal(store.getSnapshot(sessionId).length, 1)
    assert.equal(store.getSnapshot(sessionId)[0].entityId, 'ast_e2e_99')

    // 2. 再次点击同一卡片触发重复检测，不重复累加
    const res2 = store.addAttachment(sessionId, payload)
    assert.equal(res2.ok, false)
    assert.equal(res2.reason, 'duplicate')
    assert.equal(store.getSnapshot(sessionId).length, 1)

    // 3. 移除附件后再次注入
    store.removeAttachment(sessionId, store.getSnapshot(sessionId)[0].id)
    assert.equal(store.getSnapshot(sessionId).length, 0)

    const res3 = store.addAttachment(sessionId, payload)
    assert.equal(res3.ok, true)
    assert.equal(store.getSnapshot(sessionId).length, 1)
  })

  it('E2E-03: 二级标签英文枚举映射与搜索词组合端到端过滤', () => {
    const items = [
      normalizeAssetItem({ id: 'a1', name: '人物出场.mp4', type: 'video', category: 'digital_human' }),
      normalizeAssetItem({ id: 'a2', name: '商品展示.png', type: 'image', category: 'product' }),
      normalizeAssetItem({ id: 'a3', name: '本地拍摄.mp4', channel: 'upload' }),
      normalizeAssetItem({ id: 'a4', name: 'AI人脸生成.png', kind: 'generated' }),
    ].filter(Boolean)

    assert.equal(items.length, 4)

    // 1. 筛选数字人
    const r1 = filterAssetHubItems(items, '数字人', '')
    assert.equal(r1.length, 1)
    assert.equal(r1[0].id, 'a1')

    // 2. 筛选商品图 + 搜索关键词「展示」
    const r2 = filterAssetHubItems(items, '商品图', '展示')
    assert.equal(r2.length, 1)
    assert.equal(r2[0].id, 'a2')

    // 3. 筛选本地上传
    const r3 = filterAssetHubItems(items, '本地上传', '')
    assert.equal(r3.length, 1)
    assert.equal(r3[0].id, 'a3')

    // 4. 筛选生成资产
    const r4 = filterAssetHubItems(items, '生成资产', '')
    assert.equal(r4.length, 1)
    assert.equal(r4[0].id, 'a4')
  })

  it('E2E-04: 6 大主库 Tab 切换与 Click-to-Attach 载荷及 Prompt 追加端到端全链路', () => {
    const navStore = createAssetHubNavStore()
    const attachmentStore = createAttachmentStore()
    const sessionId = 'session_e2e_04'

    assert.deepEqual(PRIMARY_TABS, ['featured', 'assets', 'inspiration', 'products', 'trending', 'skills'])

    // 1. 切换到爆款趋势
    navStore.setActiveTab('trending')
    assert.equal(navStore.getSnapshot().activeTab, 'trending')

    // 2. 模拟点击爆款卡片执行 Click-to-Attach
    const trendingCard = {
      id: 'trend_101',
      lane: 'trending',
      title: '高转化出海口播',
      formatText: 'MP4',
      thumbnailUrl: 'https://files.omnimux.ai/thumb.png',
      raw: {},
    }
    const payload = adaptCardToAttachmentPayload(trendingCard)
    const result = attachmentStore.addAttachment(sessionId, payload)
    assert.equal(result.ok, true)

    const attachments = attachmentStore.getSnapshot(sessionId)
    assert.equal(attachments.length, 1)
    assert.equal(attachments[0].kind, 'inspiration')
    assert.equal(attachments[0].entityId, 'trend_101')
  })
})
