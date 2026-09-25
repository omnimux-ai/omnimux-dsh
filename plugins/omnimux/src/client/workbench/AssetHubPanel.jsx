import React, { useState, useEffect, useSyncExternalStore, useCallback, useMemo, useRef } from 'react'
import { AssetHubHeader } from './AssetHubHeader.jsx'
import { AssetHubToolbar } from './AssetHubToolbar.jsx'
import { AssetHubGrid } from './AssetHubGrid.jsx'
import { getGlobalAssetHubNavStore } from './asset-hub-store.js'
import { loadAssetHubData, filterAssetHubItems, adaptCardToAttachmentPayload } from './asset-hub-data.js'
import { getGlobalAttachmentStore } from '../attachments/store.ts'
import {
  isHostRightSidebarFullscreen,
  enterHostRightSidebarFullscreen,
  exitHostRightSidebarFullscreen,
} from './host-fullscreen.js'
import { hostDocument } from './host-adapter.js'
import { installAssetHubStyles } from './styles/asset-hub-styles.js'

/**
 * 右栏素材工作台（Asset Hub Panel）
 * 彻底废除旧全屏弹窗，作为右侧边栏第三栏原生工作台运行。
 */
export function AssetHubPanel(props) {
  useEffect(() => {
    return installAssetHubStyles(hostDocument())
  }, [])

  const navStore = getGlobalAssetHubNavStore()
  const attachmentStore = getGlobalAttachmentStore()

  // 1. 订阅导航状态机
  const navState = useSyncExternalStore(
    navStore.subscribe,
    navStore.getSnapshot,
    navStore.getSnapshot
  )
  const { activeTab, secondaryFilters, searchQuery } = navState
  const currentFilter = secondaryFilters[activeTab] || '全部'

  // 2. 宿主全屏状态跟踪
  const [isFullscreen, setIsFullscreen] = useState(() => isHostRightSidebarFullscreen(hostDocument()))

  useEffect(() => {
    const doc = hostDocument()
    const updateFs = () => {
      const fs = isHostRightSidebarFullscreen(doc)
      setIsFullscreen(fs)
      navStore.setIsFullscreen(fs)
    }

    updateFs()

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && isHostRightSidebarFullscreen(doc)) {
        e.preventDefault()
        exitHostRightSidebarFullscreen(doc)
        updateFs()
      }
    }

    const observer = doc?.defaultView?.MutationObserver
      ? new doc.defaultView.MutationObserver(updateFs)
      : null

    if (observer && doc?.documentElement) {
      observer.observe(doc.documentElement, {
        attributes: true,
        attributeFilter: ['data-sidebar-right-panel', 'data-rightbar-fullscreen'],
        subtree: true,
      })
    }

    doc?.defaultView?.addEventListener?.('keydown', onKeyDown)

    return () => {
      observer?.disconnect()
      doc?.defaultView?.removeEventListener?.('keydown', onKeyDown)
    }
  }, [navStore])

  // 3. 订阅当前会话的附件列表
  const resolvedSessionId = props.sessionId || attachmentStore.getActiveSessionId()
  const attachments = useSyncExternalStore(
    useCallback((listener) => attachmentStore.subscribe(resolvedSessionId, listener), [attachmentStore, resolvedSessionId]),
    () => attachmentStore.getSnapshot(resolvedSessionId),
    () => attachmentStore.getSnapshot(resolvedSessionId)
  )

  const attachedIds = useMemo(() => {
    const ids = new Set()
    for (const att of attachments) {
      if (att.entityId) ids.add(att.entityId)
      if (att.id) ids.add(att.id)
    }
    return ids
  }, [attachments])

  // 4. 数据加载
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  // 提示反馈
  const [notice, setNotice] = useState(null)
  const noticeTimerRef = useRef(null)

  const showNotice = useCallback((msg) => {
    if (!msg) return
    if (typeof props.notify === 'function') {
      props.notify(msg)
    } else {
      setNotice(msg)
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
      noticeTimerRef.current = setTimeout(() => {
        setNotice(null)
      }, 2000)
    }
  }, [props.notify])

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'canvas') {
      setData([])
      setLoading(false)
      setError(null)
      return
    }

    let active = true
    const controller = new AbortController()

    setLoading(true)
    setError(null)

    loadAssetHubData(activeTab, { signal: controller.signal })
      .then((items) => {
        if (!active) return
        setData(items)
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        if (err.name === 'AbortError') return
        setError(err)
        setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [activeTab, reloadToken])

  // 5. 过滤后的卡片
  const displayItems = useMemo(() => {
    return filterAssetHubItems(data, currentFilter, searchQuery)
  }, [data, currentFilter, searchQuery])

  // 6. 交互处理
  const handleToggleFullscreen = () => {
    const doc = hostDocument()
    if (isHostRightSidebarFullscreen(doc)) {
      exitHostRightSidebarFullscreen(doc)
      setIsFullscreen(false)
      navStore.setIsFullscreen(false)
    } else {
      enterHostRightSidebarFullscreen(doc)
      setIsFullscreen(true)
      navStore.setIsFullscreen(true)
    }
  }

  const handleCollapse = () => {
    const wb = props.workbench || (typeof window !== 'undefined' ? window.__omnimuxWorkbench : null)
    return wb?.closePanel?.() ?? wb?.closeWorkbenchPanel?.()
  }

  const handleAttach = (item) => {
    const payload = adaptCardToAttachmentPayload(item)
    const result = attachmentStore.addAttachment(resolvedSessionId, payload)
    if (!result.ok) {
      if (result.reason === 'duplicate') {
        showNotice(props.t?.('composerAdd.toast.duplicate') || '已在附件列表中')
        const doc = hostDocument() || (typeof document !== 'undefined' ? document : null)
        doc?.querySelector?.('[data-composer-input="true"]')?.focus?.({ preventScroll: true })
      } else if (result.reason === 'quota-exceeded') {
        showNotice(props.t?.('composerAdd.toast.quota') || '附件数量已达上限')
      } else {
        showNotice('添加失败')
      }
    }
  }

  const handlePrimaryAction = () => {
    const doc = hostDocument() || (typeof document !== 'undefined' ? document : null)
    if (!doc?.createElement) return
    const input = doc.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.style.display = 'none'
    input.setAttribute('aria-hidden', 'true')
    doc.body.appendChild(input)
    input.onchange = () => {
      try {
        if (input.files && input.files.length > 0) {
          setReloadToken((prev) => prev + 1)
        }
      } finally {
        input.remove()
      }
    }
    input.oncancel = () => {
      input.remove()
    }
    input.click()
  }

  return (
    <div className={`omx-hub-panel${isFullscreen ? ' is-fullscreen' : ''}`}>
      {/* 顶栏 */}
      <AssetHubHeader
        activeTab={activeTab}
        isFullscreen={isFullscreen}
        onTabChange={(tab) => navStore.setActiveTab(tab)}
        onToggleFullscreen={handleToggleFullscreen}
        onCollapse={handleCollapse}
      />

      {notice ? (
        <div className="omx-hub-notice-toast" role="status" aria-live="polite">
          {notice}
        </div>
      ) : null}

      {/* 画布视图分支 */}
      {activeTab === 'canvas' ? (
        <div className="omx-hub-canvas-view">
          <div className="omx-hub-state">
            <p className="omx-hub-state__msg">画布创作区</p>
          </div>
        </div>
      ) : (
        <>
          {/* 工具栏 */}
          <AssetHubToolbar
            activeTab={activeTab}
            currentFilter={currentFilter}
            searchQuery={searchQuery}
            onFilterChange={(f) => navStore.setSecondaryFilter(activeTab, f)}
            onSearchChange={(q) => navStore.setSearchQuery(q)}
            onActionClick={handlePrimaryAction}
          />

          {/* 卡片滚动流 */}
          <div className="omx-hub-content">
            <AssetHubGrid
              activeTab={activeTab}
              items={displayItems}
              attachedIds={attachedIds}
              loading={loading}
              error={error}
              isSearching={Boolean(searchQuery.trim())}
              onAttach={handleAttach}
              onRetry={() => setReloadToken((prev) => prev + 1)}
              onClearSearch={() => navStore.setSearchQuery('')}
              onPrimaryAction={handlePrimaryAction}
            />
          </div>
        </>
      )}
    </div>
  )
}
