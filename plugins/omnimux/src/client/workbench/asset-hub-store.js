/**
 * Asset Hub Navigation Store & White-list Definitions.
 * 严格遵循 specs/three-column-asset-hub.spec.md 与 design.md 规范。
 */

import { ASSET_HUB_TAB_ID } from './geometry.js'

export { ASSET_HUB_TAB_ID }

/**
 * 一级 Tab 严格白名单
 * @type {readonly ['canvas', 'assets', 'inspiration', 'products']}
 */
export const PRIMARY_TABS = Object.freeze(['canvas', 'assets', 'inspiration', 'products'])

/**
 * 二级筛选标签白名单（首项必须严格固定为「全部」）
 */
export const SECONDARY_FILTER_WHITELIST = Object.freeze({
  canvas: Object.freeze([]),
  assets: Object.freeze(['全部', '本地上传', '生成资产', '数字人', '商品图']),
  inspiration: Object.freeze(['全部', '爆款视频', '分镜脚本', '创意提示词', '视觉风格']),
  products: Object.freeze(['全部', '商品主图', '模特展示', '卖点细节', '场景切片']),
})

/**
 * 状态机文案字典（严格字面值锁定，零自由发挥）
 */
export const ASSET_HUB_I18N_SPEC = Object.freeze({
  primaryTabs: {
    canvas: '画布',
    assets: '资产库',
    inspiration: '灵感库',
    products: '商品库',
  },
  actions: {
    fullscreen: '全屏',
    exitFullscreen: '退出全屏',
    collapse: '收起',
    upload: '上传',
    addProduct: '添加商品',
    clearSearch: '清除搜索',
    retry: '重试',
  },
  searchPlaceholder: '搜索素材',
  empty: {
    assets: '暂无资产',
    inspiration: '暂无灵感',
    products: '暂无商品',
    search: '无匹配结果',
    error: '加载失败',
  },
})

const STORAGE_KEY_ACTIVE_TAB = 'omnimux:asset-hub:active-tab'

function readPersistedTab() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const stored = sessionStorage.getItem(STORAGE_KEY_ACTIVE_TAB)
      if (stored && PRIMARY_TABS.includes(stored)) {
        return stored
      }
    }
  } catch {
    // ignore
  }
  return 'assets'
}

function persistActiveTab(tab) {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY_ACTIVE_TAB, tab)
    }
  } catch {
    // ignore
  }
}

/**
 * 创建 AssetHub 导航状态机
 */
export function createAssetHubNavStore() {
  let state = {
    activeTab: readPersistedTab(),
    secondaryFilters: {
      canvas: '',
      assets: '全部',
      inspiration: '全部',
      products: '全部',
    },
    searchQuery: '',
    isFullscreen: false,
  }

  const listeners = new Set()

  function emit() {
    for (const listener of listeners) {
      try {
        listener()
      } catch (err) {
        console.error('[AssetHubNavStore] listener error:', err)
      }
    }
  }

  return {
    getSnapshot() {
      return state
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setActiveTab(tab) {
      if (!PRIMARY_TABS.includes(tab) || state.activeTab === tab) return
      state = { ...state, activeTab: tab }
      persistActiveTab(tab)
      emit()
    },
    setSecondaryFilter(tab, filter) {
      const allowed = SECONDARY_FILTER_WHITELIST[tab]
      if (!allowed || !allowed.includes(filter)) return
      if (state.secondaryFilters[tab] === filter) return
      state = {
        ...state,
        secondaryFilters: {
          ...state.secondaryFilters,
          [tab]: filter,
        },
      }
      emit()
    },
    setSearchQuery(query) {
      const cleaned = String(query || '')
      if (state.searchQuery === cleaned) return
      state = { ...state, searchQuery: cleaned }
      emit()
    },
    setIsFullscreen(isFullscreen) {
      const next = Boolean(isFullscreen)
      if (state.isFullscreen === next) return
      state = { ...state, isFullscreen: next }
      emit()
    },
    reset() {
      state = {
        activeTab: 'assets',
        secondaryFilters: {
          canvas: '',
          assets: '全部',
          inspiration: '全部',
          products: '全部',
        },
        searchQuery: '',
        isFullscreen: false,
      }
      emit()
    },
  }
}

let globalStore = null

export function getGlobalAssetHubNavStore() {
  if (typeof window !== 'undefined') {
    if (!window.__omnimuxAssetHubNavStore) {
      window.__omnimuxAssetHubNavStore = createAssetHubNavStore()
    }
    return window.__omnimuxAssetHubNavStore
  }
  if (!globalStore) {
    globalStore = createAssetHubNavStore()
  }
  return globalStore
}
