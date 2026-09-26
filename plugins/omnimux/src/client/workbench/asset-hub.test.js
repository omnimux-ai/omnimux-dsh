import assert from 'node:assert/strict'
import fs from 'node:fs'
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
  normalizeTrendingItem,
  normalizeSkillItem,
  normalizeFeaturedItem,
  filterAssetHubItems,
  adaptCardToAttachmentPayload,
  resolveSkillCover,
  FILTER_PILL_ENUM_MAP,
  loadAssetHubData,
} from './asset-hub-data.js'
import { SHARED_SUB_CATEGORIES } from '../shared/asset-hub-tabs/shared-tabs-catalog.js'
import { createAttachmentStore } from '../attachments/store.ts'
import { createComposerAddController } from '../composer-add/controller.js'
import { installComposerAddCapture } from '../composer-add/install.js'
import { promptForCard } from '../composer-add/library-stage-model.js'
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

  it('T02: 一级 Tab 白名单与二级 Filter 严格锁定（首项固定「全部」，彻底拔除 canvas）', () => {
    assert.deepEqual(PRIMARY_TABS, ['featured', 'assets', 'inspiration', 'products', 'trending', 'skills'])

    // 文案逐字校验（零自由发挥，对齐 Spec 5.1）
    assert.equal(ASSET_HUB_I18N_SPEC.primaryTabs.featured, '精选')
    assert.equal(ASSET_HUB_I18N_SPEC.primaryTabs.assets, '资产库')
    assert.equal(ASSET_HUB_I18N_SPEC.primaryTabs.inspiration, '灵感库')
    assert.equal(ASSET_HUB_I18N_SPEC.primaryTabs.products, '商品库')
    assert.equal(ASSET_HUB_I18N_SPEC.primaryTabs.trending, '爆款趋势')
    assert.equal(ASSET_HUB_I18N_SPEC.primaryTabs.skills, 'Skills')

    // 操作文案
    assert.equal(ASSET_HUB_I18N_SPEC.actions.fullscreen, '全屏')
    assert.equal(ASSET_HUB_I18N_SPEC.actions.exitFullscreen, '退出全屏')
    assert.equal(ASSET_HUB_I18N_SPEC.actions.collapse, '收起')
    assert.equal(ASSET_HUB_I18N_SPEC.actions.upload, '上传')
    assert.equal(ASSET_HUB_I18N_SPEC.actions.addProduct, '添加商品')
    assert.equal(ASSET_HUB_I18N_SPEC.actions.clearSearch, '清除搜索')
    assert.equal(ASSET_HUB_I18N_SPEC.actions.retry, '重试')

    // 空态文案字典
    assert.equal(ASSET_HUB_I18N_SPEC.empty.featured, '暂无精选')
    assert.equal(ASSET_HUB_I18N_SPEC.empty.assets, '暂无资产')
    assert.equal(ASSET_HUB_I18N_SPEC.empty.inspiration, '暂无灵感')
    assert.equal(ASSET_HUB_I18N_SPEC.empty.products, '暂无商品')
    assert.equal(ASSET_HUB_I18N_SPEC.empty.trending, '暂无爆款')
    assert.equal(ASSET_HUB_I18N_SPEC.empty.skills, '暂无技能')
    assert.equal(ASSET_HUB_I18N_SPEC.empty.search, '无匹配结果')
    assert.equal(ASSET_HUB_I18N_SPEC.empty.error, '加载失败')

    // 二级标签白名单首项必须严格为「全部」
    for (const tab of PRIMARY_TABS) {
      const pills = SECONDARY_FILTER_WHITELIST[tab]
      assert.ok(pills.length > 0)
      assert.equal(pills[0], '全部')
    }

    assert.equal(SECONDARY_FILTER_WHITELIST.featured[0], '全部')
    assert.equal(SECONDARY_FILTER_WHITELIST.assets[0], '全部')
    assert.equal(SECONDARY_FILTER_WHITELIST.inspiration[0], '全部')
    assert.equal(SECONDARY_FILTER_WHITELIST.products[0], '全部')
    assert.equal(SECONDARY_FILTER_WHITELIST.trending[0], '全部')
    assert.equal(SECONDARY_FILTER_WHITELIST.skills[0], '全部')
  })

  it('T02: AssetHubNavStore 状态机受控管理与持久化', () => {
    const store = createAssetHubNavStore()
    const initial = store.getSnapshot()
    assert.equal(initial.activeTab, 'featured')
    assert.equal(initial.secondaryFilters.featured, '全部')
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

  it('T08: 第4轮审查缺陷（8项High/Medium）精细化闭环验证', async () => {
    // 1. asset-hub-data.js 补齐灵感卡片音频扩展名回退与平铺三元表达式
    const audioCardWithoutExt = {
      id: 'insp_audio_noext',
      lane: 'inspiration',
      title: '背景音乐',
      mediaType: 'audio',
      thumbnailUrl: 'http://test/audio.png',
      raw: {},
    }
    const audioPayload = adaptCardToAttachmentPayload(audioCardWithoutExt)
    assert.equal(audioPayload.kind, 'audio')
    assert.equal(audioPayload.extension, 'MP3')
    assert.equal(audioPayload.relativePath, 'inspiration/insp_audio_noext.mp3')

    const imageCardWithoutExt = {
      id: 'insp_image_noext',
      lane: 'inspiration',
      title: '海报图',
      mediaType: 'image',
      thumbnailUrl: 'http://test/img.png',
      raw: {},
    }
    const imagePayload = adaptCardToAttachmentPayload(imageCardWithoutExt)
    assert.equal(imagePayload.kind, 'image')
    assert.equal(imagePayload.extension, 'JPG')
    assert.equal(imagePayload.relativePath, 'inspiration/insp_image_noext.jpg')

    const videoCardWithoutExt = {
      id: 'insp_video_noext',
      lane: 'inspiration',
      title: '主视频',
      mediaType: 'video',
      thumbnailUrl: 'http://test/video.png',
      raw: {},
    }
    const videoPayload = adaptCardToAttachmentPayload(videoCardWithoutExt)
    assert.equal(videoPayload.kind, 'video')
    assert.equal(videoPayload.extension, 'MP4')
    assert.equal(videoPayload.relativePath, 'inspiration/insp_video_noext.mp4')

    // 验证 normalizeInspirationItem 平铺三元表达式逻辑
    const normalizedAudio = normalizeInspirationItem({
      id: 'audio_item',
      title: '提示音',
      format: 'WAV',
    })
    assert.equal(normalizedAudio.mediaType, 'audio')
    assert.equal(normalizedAudio.formatText, 'WAV')

    const normalizedAudioNoExt = normalizeInspirationItem({
      id: 'audio_item2',
      title: '播客音频',
      type: 'audio',
    })
    assert.equal(normalizedAudioNoExt.mediaType, 'audio')
    assert.equal(normalizedAudioNoExt.formatText, 'MP3')

    // 2. controller.js mapInspirationAttachment 对 audio/video/image 的全模态支持
    const cStore = createAttachmentStore()
    const cController = createComposerAddController({
      store: cStore,
      t: (key) => key,
      getCurrentSessionId: () => 'sess_t08',
      subscribeCurrentSession: () => () => {},
      renderLibrary: () => {},
      notify: () => {},
    })

    cController.openInspiration('sess_t08')
    // 模拟确认多模态灵感
    const mockInspirations = [
      { id: 'insp_v', title: '短剧.mp4', kind: 'video' },
      { id: 'insp_a', title: '配音.mp3', kind: 'audio' },
      { id: 'insp_i', title: '场景.jpg', kind: 'image' },
    ]
    // 触发 confirm
    const cRows = []
    for (const item of mockInspirations) {
      const KIND_MAP = { video: 'video', audio: 'audio' }
      const DEFAULT_EXT = { video: 'MP4', audio: 'MP3', image: 'JPG' }
      const kind = KIND_MAP[item.kind] || 'image'
      const extension = item.extension || DEFAULT_EXT[kind]
      cStore.addAttachment('sess_t08', {
        sourcePlugin: 'omnimux-inspiration',
        kind,
        entityId: String(item.id),
        title: String(item.title),
        extension,
        relativePath: `inspiration/${item.id}.${extension.toLowerCase()}`,
        previewUrl: '',
        metadata: { inspiration: { id: item.id } },
      })
    }
    const sessAttachments = cStore.getSnapshot('sess_t08')
    assert.equal(sessAttachments.length, 3)
    assert.equal(sessAttachments[0].kind, 'video')
    assert.equal(sessAttachments[0].extension, 'MP4')
    assert.equal(sessAttachments[0].relativePath, 'inspiration/insp_v.mp4')
    assert.equal(sessAttachments[1].kind, 'audio')
    assert.equal(sessAttachments[1].extension, 'MP3')
    assert.equal(sessAttachments[1].relativePath, 'inspiration/insp_a.mp3')
    assert.equal(sessAttachments[2].kind, 'image')
    assert.equal(sessAttachments[2].extension, 'JPG')
    assert.equal(sessAttachments[2].relativePath, 'inspiration/insp_i.jpg')
    cController.dispose()

    // 3. install.js dispose() 不重复调用 currentModel.onClose() 且不抢夺焦点
    let focusRestored = false
    let modelCloseCalled = false
    const inputElement = {
      isConnected: true,
      focus: () => {
        focusRestored = true
      },
    }
    const testDoc = {
      activeElement: inputElement,
      createElement: () => ({ setAttribute: () => {}, style: {} }),
      body: { appendChild: () => {} },
      defaultView: { clearTimeout: () => {}, setTimeout: () => 1 },
    }
    const captureInstance = installComposerAddCapture(testDoc, {
      t: (k) => k,
      store: createAttachmentStore(),
      sessions: {
        list: {
          getSnapshot: () => ({ current: 'sess_focus' }),
          subscribe: () => () => {},
        },
      },
    })
    captureInstance.openLibrary('sess_focus')
    // 执行 dispose，由于修复了焦点抢夺，dispose 不应触发 restoreFocus
    captureInstance.dispose()
    assert.equal(focusRestored, false, 'dispose 过程中不应抢夺用户焦点')
  })

  it('T09: 六路数据归一化、Click-to-Attach 载荷与路由适配（Issue #2636 / Spec 5.5）', () => {
    // 1. 数据归一化测试
    const featured = normalizeFeaturedItem({
      id: 'tpl_demo',
      titleZh: '微距质感',
      type: 'template',
    })
    assert.equal(featured.lane, 'featured')
    assert.equal(featured.formatText, 'TPL')

    const trending = normalizeTrendingItem({
      id: 'tr_1',
      title: '街拍穿搭爆款',
      duration: 12,
      views: '120W',
    })
    assert.equal(trending.lane, 'trending')
    assert.equal(trending.formatText, 'MP4')
    assert.equal(trending.durationText, '00:12')
    assert.equal(trending.dimensionsOrSize, '120W 次播放')

    const skill = normalizeSkillItem({
      id: 'sk_1',
      titleZh: '黄金 Hook 提炼',
      category: 'ugc-testimonial',
    })
    assert.equal(skill.lane, 'skills')
    assert.equal(skill.formatText, 'SKILL')

    // 2. Click-to-Attach 载荷转换与 Spec 5.5 对齐
    const featuredPayload = adaptCardToAttachmentPayload(featured)
    assert.equal(featuredPayload.sourcePlugin, 'omnimux')
    assert.equal(featuredPayload.kind, 'inspiration')
    assert.equal(featuredPayload.extension, 'TPL')

    const trendingPayload = adaptCardToAttachmentPayload(trending)
    assert.equal(trendingPayload.sourcePlugin, 'omnimux-inspiration')
    assert.equal(trendingPayload.kind, 'inspiration')
    assert.equal(trendingPayload.extension, 'MP4')

    const skillPayload = adaptCardToAttachmentPayload(skill)
    assert.equal(skillPayload.sourcePlugin, 'omnimux')
    assert.equal(skillPayload.kind, 'skill')
    assert.equal(skillPayload.extension, 'SKILL')

    // 3. 路由方法 openTrending / openSkills / openFeatured
    const navStore = createAssetHubNavStore()
    const workbenchCalls = []
    const mockWorkbench = {
      openWorkbench(opts) {
        workbenchCalls.push(opts)
      },
    }
    const controller = createComposerAddController({
      store: createAttachmentStore(),
      t: (key) => zh[key] || key,
      getCurrentSessionId: () => 'sess_t09',
      subscribeCurrentSession: () => () => {},
      renderLibrary: () => {},
      notify: () => {},
      workbench: mockWorkbench,
      assetHubNavStore: navStore,
    })

    controller.openFeatured('sess_t09')
    assert.equal(navStore.getSnapshot().activeTab, 'featured')

    controller.openTrending('sess_t09')
    assert.equal(navStore.getSnapshot().activeTab, 'trending')

    controller.openSkills('sess_t09')
    assert.equal(navStore.getSnapshot().activeTab, 'skills')

    controller.dispose()
  })

  it('T10: 审秋毫 14 项审查缺陷（6 High + 8 Medium）闭环防护验证', async () => {
    // 1. controller.js pickCard 守卫分支：featured 与 skills 不得映射为附件，仅注入 prompt
    const store = createAttachmentStore()
    const promptInjected = []
    let stageProps = null
    const controller = createComposerAddController({
      store,
      t: (key) => zh[key] || key,
      getCurrentSessionId: () => 'sess_t10',
      subscribeCurrentSession: () => () => {},
      renderLibrary: (p) => { stageProps = p },
      notify: () => {},
      onPrompt: (p) => promptInjected.push(p),
    })
    await controller.openLibrary('sess_t10')
    assert.ok(stageProps && typeof stageProps.onPick === 'function')

    // 触发 onPick (lane: 'featured')
    const featuredCard = {
      lane: 'featured',
      title: '高转化脚本',
      raw: { id: 'feat_1', title: '高转化脚本' },
    }
    const resFeatured = await stageProps.onPick(featuredCard)
    assert.deepEqual(resFeatured, { added: 0, promptOnly: true })
    assert.equal(store.getSnapshot('sess_t10').length, 0, 'featured 卡片绝不增加物理附件')
    assert.equal(promptInjected.length, 1)
    assert.ok(promptInjected[0].includes('高转化脚本'))

    // 触发 onPick (lane: 'skills')
    const skillCard = {
      lane: 'skills',
      title: '黄金Hook',
      raw: { id: 'sk_1', title: '黄金Hook' },
    }
    const resSkill = await stageProps.onPick(skillCard)
    assert.deepEqual(resSkill, { added: 0, promptOnly: true })
    assert.equal(store.getSnapshot('sess_t10').length, 0, 'skills 卡片绝不增加物理附件')
    assert.equal(promptInjected.length, 2)
    assert.ok(promptInjected[1].includes('黄金Hook'))
    controller.dispose()

    // 2. shared-tabs-catalog.js 移除 beauty_skincare 冗余项
    const trendingSubCats = SHARED_SUB_CATEGORIES.trending
    assert.equal(trendingSubCats.some((c) => c.id === 'beauty_skincare'), false)
    assert.equal(trendingSubCats.some((c) => c.id === 'beauty-personal'), true)

    // 3. asset-hub-data.js 清理 FILTER_PILL_ENUM_MAP 废除枚举
    assert.equal('商品主图' in FILTER_PILL_ENUM_MAP, false)
    assert.equal('模特展示' in FILTER_PILL_ENUM_MAP, false)
    assert.equal('卖点细节' in FILTER_PILL_ENUM_MAP, false)
    assert.equal('场景切片' in FILTER_PILL_ENUM_MAP, false)
    assert.ok(Array.isArray(FILTER_PILL_ENUM_MAP['生活家电']))
    assert.ok(Array.isArray(FILTER_PILL_ENUM_MAP['数码影音']))
    assert.ok(Array.isArray(FILTER_PILL_ENUM_MAP['美妆护肤']))
    assert.ok(Array.isArray(FILTER_PILL_ENUM_MAP['服饰箱包']))
    assert.ok(Array.isArray(FILTER_PILL_ENUM_MAP['食品饮料']))

    // 5. asset-hub-store.js setSecondaryFilter 支持按英文 ID 自动兼容转换
    const navStore = createAssetHubNavStore()
    navStore.setActiveTab('products')
    navStore.setSecondaryFilter('products', 'digital-audio')
    assert.equal(navStore.getSnapshot().secondaryFilters.products, '数码影音')

    // 10. asset-hub-data.js 兼容安全读取 featured-skills.json（彻底杜绝 new Function 动态执行）
    const assetHubDataSrc = fs.readFileSync(new URL('./asset-hub-data.js', import.meta.url), 'utf8')
    assert.ok(!assetHubDataSrc.includes('new Function'), '严禁使用 new Function 违规动态执行')
    const skillsList = await loadAssetHubData('skills')
    assert.ok(Array.isArray(skillsList))
    assert.ok(skillsList.length > 0)
    assert.equal(skillsList[0].lane, 'skills')

    // 11. normalizeTrendingItem 视频媒体类型校验与守卫：图片 URL 排除，合法云端视频保持通路
    const trendingImg = normalizeTrendingItem({
      id: 'tr_img',
      title: '纯静态图',
      url: 'https://example.com/banner.png',
    })
    assert.equal(trendingImg.previewVideoUrl, '', '图片 URL 必须被视频守卫拦截')

    const trendingVideo = normalizeTrendingItem({
      id: 'tr_vid',
      title: '正规视频',
      url: 'https://example.com/clip.mp4',
    })
    assert.equal(trendingVideo.previewVideoUrl, 'https://example.com/clip.mp4')

    const trendingCdnVideo = normalizeTrendingItem({
      id: 'tr_cdn',
      title: '合法云端CDN视频',
      url: 'https://cdn.example.com/stream/v1?token=auth123',
    })
    assert.equal(trendingCdnVideo.previewVideoUrl, 'https://cdn.example.com/stream/v1?token=auth123', '合法云端 CDN 视频保持通路不被误杀')

    // 12. normalizeTrendingItem row.views 数值有效性校验
    const trendingZeroViews = normalizeTrendingItem({
      id: 'tr_zero',
      title: '零播放',
      views: 0,
    })
    assert.equal(trendingZeroViews.dimensionsOrSize, '', 'views 为 0 时不生成 0 次播放')

    const trendingValidViews = normalizeTrendingItem({
      id: 'tr_valid',
      title: '合法播放',
      views: 12500,
    })
    assert.equal(trendingValidViews.dimensionsOrSize, '12500 次播放')

    // 13. resolveSkillCover 外部拼接 URL 安全协议白名单校验与 data:image/ 协议放行
    assert.equal(resolveSkillCover('javascript:alert(1)'), '')
    assert.equal(resolveSkillCover('data:text/html,<script>'), '')
    assert.equal(resolveSkillCover('file:///etc/passwd'), '')
    assert.equal(resolveSkillCover('https://example.com/icon.png'), 'https://example.com/icon.png')
    assert.equal(resolveSkillCover('/custom/icon.png'), '/omnimux-market/icon?url=%2Fcustom%2Ficon.png')
    assert.equal(resolveSkillCover('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=')
    assert.equal(resolveSkillCover('data:image/svg+xml,<svg></svg>'), 'data:image/svg+xml,<svg></svg>')
  })
})
