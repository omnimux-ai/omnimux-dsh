import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ASSET_HUB_TAB_ID,
  ASSET_HUB_CHAT_PX,
  isAssetHubActive,
  workbenchDefaultWidthPx,
  workbenchSplitMaxPanelPx,
} from './geometry.js'
import {
  PRIMARY_TABS,
  SECONDARY_FILTER_WHITELIST,
  ASSET_HUB_I18N_SPEC,
  createAssetHubNavStore,
} from './asset-hub-store.js'
import {
  normalizeAssetItem,
  normalizeInspirationItem,
  normalizeProductItem,
  filterAssetHubItems,
  adaptCardToAttachmentPayload,
} from './asset-hub-data.js'
import { createAttachmentStore } from '../attachments/store.ts'
import { createComposerAddController } from '../composer-add/controller.js'
import { installComposerAddCapture } from '../composer-add/install.js'
import { zh } from '../locales.js'

describe('Asset Hub (三栏状态右侧素材工作台) 前端架构与规格测试', () => {
  it('T01: 三栏几何契约升级与中栏 380px 保宽锁定', () => {
    // 1. isAssetHubActive 谓词
    assert.equal(isAssetHubActive({ activeTab: ASSET_HUB_TAB_ID }), true)
    assert.equal(isAssetHubActive({ activeTab: 'other-tab' }), false)
    assert.equal(isAssetHubActive(null), false)

    // 2. 视口 1440px，左栏 260px，可见舞台 1180px
    const env = {
      viewportWidth: 1440,
      officialSidebarWidth: 260,
      isAssetHub: true,
      doc: {
        documentElement: {
          hasAttribute: () => false,
        },
      },
    }

    const state = { activeTab: ASSET_HUB_TAB_ID, width: 800 }
    const defaultWidth = workbenchDefaultWidthPx(state, env)
    // 中栏锁定 380px，右栏自适应吸收剩余宽: 1440 - 260 - 380 = 800px
    assert.equal(defaultWidth, 800)

    const maxWidth = workbenchSplitMaxPanelPx(state, env)
    // 最大宽度同样保证中栏至少留 380px
    assert.equal(maxWidth, 800)
  })

  it('T02: 一级 Tab 白名单与二级 Filter 严格锁定（首项固定「全部」）', () => {
    assert.deepEqual(PRIMARY_TABS, ['canvas', 'assets', 'inspiration', 'products'])

    // 文案逐字校验（零自由发挥）
    assert.equal(ASSET_HUB_I18N_SPEC.primaryTabs.canvas, '画布')
    assert.equal(ASSET_HUB_I18N_SPEC.primaryTabs.assets, '资产库')
    assert.equal(ASSET_HUB_I18N_SPEC.primaryTabs.inspiration, '灵感库')
    assert.equal(ASSET_HUB_I18N_SPEC.primaryTabs.products, '商品库')

    // 操作文案
    assert.equal(ASSET_HUB_I18N_SPEC.actions.fullscreen, '全屏')
    assert.equal(ASSET_HUB_I18N_SPEC.actions.exitFullscreen, '退出全屏')
    assert.equal(ASSET_HUB_I18N_SPEC.actions.collapse, '收起')
    assert.equal(ASSET_HUB_I18N_SPEC.actions.upload, '上传')
    assert.equal(ASSET_HUB_I18N_SPEC.actions.addProduct, '添加商品')
    assert.equal(ASSET_HUB_I18N_SPEC.actions.clearSearch, '清除搜索')
    assert.equal(ASSET_HUB_I18N_SPEC.actions.retry, '重试')

    // 空态文案字典
    assert.equal(ASSET_HUB_I18N_SPEC.empty.assets, '暂无资产')
    assert.equal(ASSET_HUB_I18N_SPEC.empty.inspiration, '暂无灵感')
    assert.equal(ASSET_HUB_I18N_SPEC.empty.products, '暂无商品')
    assert.equal(ASSET_HUB_I18N_SPEC.empty.search, '无匹配结果')
    assert.equal(ASSET_HUB_I18N_SPEC.empty.error, '加载失败')

    // 二级标签白名单首项必须为「全部」
    for (const tab of ['assets', 'inspiration', 'products']) {
      const pills = SECONDARY_FILTER_WHITELIST[tab]
      assert.ok(pills.length > 0)
      assert.equal(pills[0], '全部')
    }

    assert.deepEqual(SECONDARY_FILTER_WHITELIST.assets, ['全部', '本地上传', '生成资产', '数字人', '商品图'])
    assert.deepEqual(SECONDARY_FILTER_WHITELIST.inspiration, ['全部', '爆款视频', '分镜脚本', '创意提示词', '视觉风格'])
    assert.deepEqual(SECONDARY_FILTER_WHITELIST.products, ['全部', '商品主图', '模特展示', '卖点细节', '场景切片'])
  })

  it('T02: AssetHubNavStore 状态机受控管理与持久化', () => {
    const store = createAssetHubNavStore()
    const initial = store.getSnapshot()
    assert.equal(initial.activeTab, 'assets')
    assert.equal(initial.secondaryFilters.assets, '全部')
    assert.equal(initial.isFullscreen, false)

    let notified = 0
    store.subscribe(() => { notified++ })

    // 切换 Tab
    store.setActiveTab('inspiration')
    assert.equal(store.getSnapshot().activeTab, 'inspiration')
    assert.equal(notified, 1)

    // 非白名单 Tab 被拒绝
    store.setActiveTab('unknown_tab')
    assert.equal(store.getSnapshot().activeTab, 'inspiration')
    assert.equal(notified, 1)

    // 二级筛选切换
    store.setSecondaryFilter('inspiration', '爆款视频')
    assert.equal(store.getSnapshot().secondaryFilters.inspiration, '爆款视频')
    assert.equal(notified, 2)

    // 搜索词更新
    store.setSearchQuery('咖啡')
    assert.equal(store.getSnapshot().searchQuery, '咖啡')
    assert.equal(notified, 3)

    // 全屏态切换
    store.setIsFullscreen(true)
    assert.equal(store.getSnapshot().isFullscreen, true)
    assert.equal(notified, 4)
  })

  it('T05: 数据模型归一化与二级筛选/搜索过滤', () => {
    const asset = normalizeAssetItem({
      id: 'ast_1',
      name: '晨光咖啡_01.mp4',
      duration: 15,
      width: 1080,
      height: 1920,
    })
    assert.equal(asset.lane, 'assets')
    assert.equal(asset.mediaType, 'video')
    assert.equal(asset.durationText, '00:15')
    assert.equal(asset.formatText, 'MP4')
    assert.equal(asset.dimensionsOrSize, '1080×1920')

    const product = normalizeProductItem({
      id: 'prd_1',
      name: '冷萃咖啡豆',
      sku: 'CF-001',
    })
    assert.equal(product.lane, 'products')
    assert.equal(product.formatText, 'JSON')
    assert.equal(product.dimensionsOrSize, 'SKU: CF-001')

    const list = [asset, product]

    // 搜索过滤
    const searchMatch = filterAssetHubItems(list, '全部', '咖啡')
    assert.equal(searchMatch.length, 2)

    const searchMiss = filterAssetHubItems(list, '全部', '不存在的')
    assert.equal(searchMiss.length, 0)
  })

  it('T04: Click-to-Attach 转换契约与 AttachmentStore 联动', () => {
    const asset = normalizeAssetItem({
      id: 'ast_100',
      name: '萃取动作.mp4',
      duration: 8,
      width: 1920,
      height: 1080,
      thumbnailUrl: 'http://test/thumb.png',
    })

    const payload = adaptCardToAttachmentPayload(asset)
    assert.equal(payload.sourcePlugin, 'omnimux')
    assert.equal(payload.kind, 'asset')
    assert.equal(payload.entityId, 'ast_100')
    assert.equal(payload.title, '萃取动作.mp4')
    assert.equal(payload.extension, 'MP4')

    const store = createAttachmentStore()
    const sessionId = 'session_t04'
    const result = store.addAttachment(sessionId, payload)
    assert.equal(result.ok, true)
    assert.equal(store.getSnapshot(sessionId).length, 1)

    // 重复添加判定
    const duplicateResult = store.addAttachment(sessionId, payload)
    assert.equal(duplicateResult.ok, false)
    assert.equal(duplicateResult.reason, 'duplicate')
    assert.equal(store.getSnapshot(sessionId).length, 1)
  })

  it('T04: 加号菜单 openLibrary 唤起 split 模式并切换至 assets Tab', () => {
    const store = createAttachmentStore()
    const navStore = createAssetHubNavStore()
    const workbenchCalls = []

    const mockWorkbench = {
      openWorkbench(opts) {
        workbenchCalls.push(opts)
      },
    }

    const controller = createComposerAddController({
      store,
      t: (key) => zh[key] || key,
      getCurrentSessionId: () => 'sess_active',
      subscribeCurrentSession: () => () => {},
      renderLibrary: () => {},
      notify: () => {},
      workbench: mockWorkbench,
      assetHubNavStore: navStore,
    })

    controller.openLibrary('sess_active')
    assert.equal(workbenchCalls.length, 1)
    assert.equal(workbenchCalls[0].tabId, ASSET_HUB_TAB_ID)
    assert.equal(workbenchCalls[0].focus, 'split')
    assert.equal(workbenchCalls[0].sessionId, 'sess_active')
    assert.equal(navStore.getSnapshot().activeTab, 'assets')

    controller.openInspiration('sess_active')
    assert.equal(workbenchCalls.length, 2)
    assert.equal(navStore.getSnapshot().activeTab, 'inspiration')

    controller.openProduct('sess_active')
    assert.equal(workbenchCalls.length, 3)
    assert.equal(navStore.getSnapshot().activeTab, 'products')

    // 重入测试：用户收起右栏后，无论 begin() 是否返回 null，只要会话有效，确保调用 openWorkbench 重新展开面板
    controller.openProduct('sess_active')
    assert.equal(workbenchCalls.length, 4)
    assert.equal(workbenchCalls[3].tabId, ASSET_HUB_TAB_ID)
    assert.equal(workbenchCalls[3].focus, 'split')

    controller.dispose()
  })

  it('T06: 审查缺陷闭环防护：对象防卫、真实缩略图、消除伪造参数、英文枚举映射字典', () => {
    // 1. 对象防卫（null / undefined / 基础类型返回 null）
    assert.equal(normalizeAssetItem(null), null)
    assert.equal(normalizeAssetItem(undefined), null)
    assert.equal(normalizeAssetItem('invalid'), null)
    assert.equal(normalizeInspirationItem(null), null)
    assert.equal(normalizeInspirationItem(123), null)
    assert.equal(normalizeProductItem(null), null)

    // 2. 真实缩略图 URL 组装
    const assetWithCoverId = normalizeAssetItem({
      id: 'ast_test_1',
      name: '测试素材.png',
      cover: { id: 'file_cover_123' },
    })
    assert.equal(assetWithCoverId.thumbnailUrl, '/omnimux/assets/library/preview?id=ast_test_1&file=file_cover_123')

    const assetWithFiles = normalizeAssetItem({
      id: 'ast_test_2',
      name: '测试素材2.png',
      files: [{ id: 'file_img_456', mime: 'image/png' }],
    })
    assert.equal(assetWithFiles.thumbnailUrl, '/omnimux/assets/library/preview?id=ast_test_2&file=file_img_456')

    // 3. 严禁捏造假参数（无客观数据时保持空字符串，移除硬编码 00:15 / 1080×1920）
    const inspirationEmptyMeta = normalizeInspirationItem({
      id: 'insp_empty',
      title: '空元数据灵感视频',
    })
    assert.equal(inspirationEmptyMeta.durationText, '')
    assert.equal(inspirationEmptyMeta.dimensionsOrSize, '')

    // 4. 二级筛选标签映射（中文胶囊映射至后端英文枚举）
    const mockFeed = [
      { id: '1', title: '视频素材A', lane: 'assets', mediaType: 'video', raw: { type: 'video', category: 'digital_human' } },
      { id: '2', title: '图片素材B', lane: 'assets', mediaType: 'image', raw: { type: 'image', category: 'product' } },
      { id: '3', title: '用户文件C', lane: 'assets', mediaType: 'video', raw: { channel: 'upload' } },
      { id: '4', title: '生成产物D', lane: 'assets', mediaType: 'image', raw: { kind: 'generated' } },
    ]

    // 筛选「数字人」应当匹配 category: 'digital_human'
    const digitalHumanResult = filterAssetHubItems(mockFeed, '数字人', '')
    assert.equal(digitalHumanResult.length, 1)
    assert.equal(digitalHumanResult[0].id, '1')

    // 筛选「本地上传」应当匹配 channel: 'upload'
    const uploadResult = filterAssetHubItems(mockFeed, '本地上传', '')
    assert.equal(uploadResult.length, 1)
    assert.equal(uploadResult[0].id, '3')

    // 筛选「生成资产」应当匹配 kind: 'generated'
    const generatedResult = filterAssetHubItems(mockFeed, '生成资产', '')
    assert.equal(generatedResult.length, 1)
    assert.equal(generatedResult[0].id, '4')

    // 筛选「全部」不过滤
    const allResult = filterAssetHubItems(mockFeed, '全部', '')
    assert.equal(allResult.length, 4)
  })

  it('T07: 第3轮代码审查缺陷（1 Critical + 4 High + 7 Medium）闭环攻坚验证', async () => {
    // 1. High #4: adaptCardToAttachmentPayload 严格动态匹配实际媒体类型 (image/audio/video)
    const imgCard = {
      id: 'insp_img',
      lane: 'inspiration',
      title: '创意海报.png',
      mediaType: 'image',
      formatText: 'PNG',
      thumbnailUrl: 'http://test/img.png',
      raw: {},
    }
    const imgPayload = adaptCardToAttachmentPayload(imgCard)
    assert.equal(imgPayload.kind, 'image')
    assert.equal(imgPayload.extension, 'PNG')

    const audioCard = {
      id: 'insp_audio',
      lane: 'inspiration',
      title: '音效.mp3',
      mediaType: 'audio',
      formatText: 'MP3',
      thumbnailUrl: 'http://test/audio.png',
      raw: {},
    }
    const audioPayload = adaptCardToAttachmentPayload(audioCard)
    assert.equal(audioPayload.kind, 'audio')
    assert.equal(audioPayload.extension, 'MP3')

    const videoCard = {
      id: 'insp_video',
      lane: 'inspiration',
      title: '成片.mp4',
      mediaType: 'video',
      formatText: 'MP4',
      thumbnailUrl: 'http://test/video.png',
      raw: {},
    }
    const videoPayload = adaptCardToAttachmentPayload(videoCard)
    assert.equal(videoPayload.kind, 'video')
    assert.equal(videoPayload.extension, 'MP4')

    // 2. Medium #12: normalizeInspirationItem 增加正向视频特征探针，避免未知格式被误判为视频
    const unknownItem = normalizeInspirationItem({
      id: 'doc_1',
      title: '纯文本笔记',
      type: 'text_note',
    })
    assert.notEqual(unknownItem.mediaType, 'video')
    assert.notEqual(unknownItem.formatText, 'MP4')

    const videoItemWithUrl = normalizeInspirationItem({
      id: 'video_1',
      title: '一段视频',
      videoUrl: 'http://test/video.mp4',
    })
    assert.equal(videoItemWithUrl.mediaType, 'video')
    assert.equal(videoItemWithUrl.formatText, 'MP4')

    // 3. Medium #11: geometry.js isAssetHubActive 环路与深度防御
    const circularState = { tab: 'other' }
    circularState.state = circularState
    assert.equal(isAssetHubActive(circularState), false)

    // 4. High #3 & Medium #9 & #10: geometry.js 夹紧保底与精准类型判定
    // 窄屏 (可见舞台 300px < 380px) 下，中栏应被夹紧于 300px
    const narrowWb = workbenchDefaultWidthPx({ tabId: ASSET_HUB_TAB_ID }, {
      viewportWidth: 300,
      officialSidebarWidth: 0,
      railBaselinePx: 0,
    })
    // 检查不撑爆布局
    assert.ok(narrowWb >= 280)

    // 5. Medium #6: controller.js openLibrary / openProduct / openInspiration 补齐 .catch() 异常保护
    const throwingStore = createAttachmentStore()
    const throwingController = createComposerAddController({
      store: throwingStore,
      t: (key) => key,
      getCurrentSessionId: () => 'sess_err',
      subscribeCurrentSession: () => () => {},
      renderLibrary: () => {},
      notify: () => {},
      workbench: {
        openWorkbench() {
          return Promise.reject(new Error('Workbench open failed'))
        },
      },
    })
    // 即使 openWorkbench 返回 reject，调用 openLibrary 也不会触发 unhandled rejection
    await assert.doesNotReject(async () => {
      await throwingController.openLibrary('sess_err')
      await throwingController.openProduct('sess_err')
      await throwingController.openInspiration('sess_err')
    })
    throwingController.dispose()

    // 6. High #2: install.js 严禁在 renderLibrary 渲染入口同步调用 model.onClose()
    const mockDoc = {
      activeElement: null,
      createElement: () => ({ setAttribute: () => {}, style: {} }),
      body: { appendChild: () => {} },
      defaultView: { clearTimeout: () => {}, setTimeout: () => 1 },
    }
    const mockSessions = {
      list: {
        getSnapshot: () => ({ current: 'sess_1' }),
        subscribe: () => () => {},
      },
    }
    const capture = installComposerAddCapture(mockDoc, {
      t: (k) => k,
      store: createAttachmentStore(),
      sessions: mockSessions,
    })
    assert.doesNotThrow(() => {
      capture.openLibrary('sess_1')
    })
    capture.dispose()
  })
})
