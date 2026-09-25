import React, { useState, useEffect, useSyncExternalStore, useCallback, useMemo, useRef } from 'react'
import { AssetHubHeader } from './AssetHubHeader.jsx'
import { AssetHubToolbar } from './AssetHubToolbar.jsx'
import { AssetHubGrid } from './AssetHubGrid.jsx'
import { getGlobalAssetHubNavStore } from './asset-hub-store.js'
import { loadAssetHubData, filterAssetHubItems, adaptCardToAttachmentPayload } from './asset-hub-data.js'
import { getGlobalAttachmentStore } from '../attachments/store.ts'
import { LIBRARY_STAGE_PROMPT_EVENT, promptForCard } from '../composer-add/library-stage-model.js'
import {
  isHostRightSidebarFullscreen,
  enterHostRightSidebarFullscreen,
  exitHostRightSidebarFullscreen,
} from './host-fullscreen.js'
import { hostDocument } from './host-adapter.js'
import { installAssetHubStyles } from './styles/asset-hub-styles.js'

function getAssetHubCardPrompt(item) {
  const title = String(item?.title || item?.name || '').trim()
  if (!title) return ''
  if (item.lane === 'featured') return `请基于模板「${title}」，结合我的产品卖点生成对应视频脚本。`
  if (item.lane === 'assets') return `请参考附件素材「${title}」，进行风格对标与内容生成。`
  if (item.lane === 'inspiration') return `请基于灵感参考「${title}」，提炼其镜头节奏并复刻脚本。`
  if (item.lane === 'products') return `请基于商品「${title}」，分析核心卖点并规划宣传文案。`
  if (item.lane === 'trending') return `请对标热门爆款「${title}」，还原其前3秒黄金Hook与分镜结构。`
  if (item.lane === 'skills') return `为我运行技能「${title}」，指导下一步创作流程。`
  return promptForCard(item)
}

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

  // 3. 订阅当前会话的附件列表（会话响应式监听：通过 useSyncExternalStore 响应式监听 props.sessions.list.subscribe）
  const currentSessionFromStore = useSyncExternalStore(
    useCallback((listener) => {
      if (typeof props.sessions?.list?.subscribe === 'function') {
        return props.sessions.list.subscribe(listener)
      }
      return () => {}
    }, [props.sessions?.list]),
    () => props.sessions?.list?.getSnapshot?.()?.current,
    () => props.sessions?.list?.getSnapshot?.()?.current
  )
  const resolvedSessionId = props.sessionId || currentSessionFromStore || attachmentStore.getActiveSessionId()
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
        const dupMsg = props.t?.('composerAdd.toast.duplicate') || '已在附件列表中'
        showNotice(dupMsg)
        const doc = hostDocument() || (typeof document !== 'undefined' ? document : null)
        doc?.querySelector?.('[data-composer-input="true"]')?.focus?.({ preventScroll: true })
      } else if (result.reason === 'quota-exceeded') {
        showNotice(props.t?.('composerAdd.toast.quota') || '附件数量已达上限')
      } else {
        showNotice('添加失败')
      }
    } else {
      // 成功注入附件槽后，将素材对应的提示词追加到中间会话输入框草稿中（打通 Prompt 管道）
      const prompt = getAssetHubCardPrompt(item)
      if (prompt) {
        if (typeof props.onPrompt === 'function') {
          props.onPrompt(prompt, resolvedSessionId)
        }
        const doc = hostDocument() || (typeof document !== 'undefined' ? document : null)
        const win = doc?.defaultView || (typeof window !== 'undefined' ? window : null)
        win?.dispatchEvent?.(new win.CustomEvent(LIBRARY_STAGE_PROMPT_EVENT, {
          detail: { prompt, sessionId: resolvedSessionId },
        }))
      }
    }
  }

  const handlePrimaryAction = () => {
    const doc = hostDocument() || (typeof document !== 'undefined' ? document : null)
    if (!doc?.createElement) return
    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null)
    const input = doc.createElement('input')
    input.type = 'file'
    input.style.display = 'none'
    input.setAttribute('aria-hidden', 'true')
    doc.body.appendChild(input)

    let cleaned = false
    const removeInput = () => {
      if (cleaned) return
      cleaned = true
      input.remove()
      win?.removeEventListener?.('focus', onFocus)
      if (typeof window !== 'undefined' && window !== win) {
        window.removeEventListener('focus', onFocus)
      }
    }
    const onFocus = () => setTimeout(removeInput, 300)
    input.addEventListener('cancel', removeInput)
    win?.addEventListener?.('focus', onFocus)
    if (typeof window !== 'undefined' && window !== win) {
      window.addEventListener('focus', onFocus)
    }

    input.onchange = async () => {
      try {
        const file = input.files?.[0]
        if (!file) return
        const fetchFn = props.fetchImpl || (typeof window !== 'undefined' ? window.fetch : globalThis.fetch)
        if (typeof fetchFn !== 'function') {
          showNotice('上传服务未就绪')
          return
        }

        const form = new FormData()
        form.append('file', file)
        const response = await fetchFn('/omnimux/assets/library', {
          method: 'POST',
          body: form,
        })
        const resData = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(resData?.message || resData?.error || `上传失败 (${response.status})`)
        }
        showNotice(props.t?.('composerAdd.toast.uploaded') || '上传成功')
        setReloadToken((prev) => prev + 1)
      } catch (err) {
        showNotice(err instanceof Error ? err.message : '上传失败')
      } finally {
        removeInput()
      }
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
    </div>
  )
}
