/**
 * Asset Hub Navigation Store & White-list Definitions.
 * 严格遵循 specs/asset-hub-shared-tabs.spec.md、specs/asset-hub-shared-tabs-architecture.md 与 design.md 规范。
 * 彻底拔除 canvas，对齐 6 大主库，以共享契约层为单一真源。
 */

import { ASSET_HUB_TAB_ID } from './geometry.js'
import {
  SHARED_PRIMARY_TABS,
  SHARED_SUB_CATEGORIES,
  SHARED_I18N_SPEC,
} from '../shared/asset-hub-tabs/shared-tabs-catalog.js'

export { ASSET_HUB_TAB_ID }

/**
 * 一级 Tab 严格白名单（6 大主库，彻底拔除 canvas）
 * @type {readonly ['featured', 'assets', 'inspiration', 'products', 'trending', 'skills']}
 */
export const PRIMARY_TABS = Object.freeze(SHARED_PRIMARY_TABS.map((t) => t.id))

/**
 * 二级筛选标签白名单（首项必须严格固定为「全部」）
 */
export const SECONDARY_FILTER_WHITELIST = Object.freeze({
  featured: Object.freeze(SHARED_SUB_CATEGORIES.featured.map((c) => c.nameZh)),
  assets: Object.freeze(SHARED_SUB_CATEGORIES.assets.map((c) => c.nameZh)),
  inspiration: Object.freeze(SHARED_SUB_CATEGORIES.inspiration.map((c) => c.nameZh)),
  products: Object.freeze(SHARED_SUB_CATEGORIES.products.map((c) => c.nameZh)),
  trending: Object.freeze(SHARED_SUB_CATEGORIES.trending.map((c) => c.nameZh)),
  skills: Object.freeze(SHARED_SUB_CATEGORIES.skills.map((c) => c.nameZh)),
})

/**
 * 状态机文案字典（严格字面值锁定，零自由发挥，对齐单一真源）
 */
export const ASSET_HUB_I18N_SPEC = SHARED_I18N_SPEC

const STORAGE_KEY_ACTIVE_TAB = 'omnimux:asset-hub:active-tab'

function readPersistedTab() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const stored = sessionStorage.getItem(STORAGE_KEY_ACTIVE_TAB)
      if (stored && PRIMARY_TABS.includes(stored) && stored !== 'canvas') {
        return stored
      }
    }
  } catch {
    // ignore
  }
  return 'featured'
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
      featured: '全部',
      assets: '全部',
      inspiration: '全部',
      products: '全部',
      trending: '全部',
      skills: '全部',
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
      let targetFilter = filter
      const subCats = SHARED_SUB_CATEGORIES[tab]
      if (Array.isArray(subCats)) {
        const found = subCats.find((c) => c.id === filter || c.nameEn === filter || c.nameZh === filter)
        if (found) targetFilter = found.nameZh
      }
      const allowed = SECONDARY_FILTER_WHITELIST[tab]
      if (!allowed || !allowed.includes(targetFilter)) return
      if (state.secondaryFilters[tab] === targetFilter) return
      state = {
        ...state,
        secondaryFilters: {
          ...state.secondaryFilters,
          [tab]: targetFilter,
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
        activeTab: 'featured',
        secondaryFilters: {
          featured: '全部',
          assets: '全部',
          inspiration: '全部',
          products: '全部',
          trending: '全部',
          skills: '全部',
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
