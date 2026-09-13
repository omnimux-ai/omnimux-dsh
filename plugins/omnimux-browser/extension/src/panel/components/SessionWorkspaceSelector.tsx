import { memo, useEffect, useState, useRef } from 'react'
import { FolderIcon, ChevronDownIcon, CheckIcon, PlusIcon } from './icons.tsx'
import type { PanelApi } from '../api.ts'
import { safeGetStorage, safeSetStorage } from '../../i18n.ts'

export interface SessionWorkspaceItem {
  id: string
  name: string
  path?: string
  isDefault?: boolean
}

interface SessionWorkspaceSelectorProps {
  locale?: string
  api: PanelApi
  activePort: number
  bridgeConnected?: boolean
  selectedWorkspaceId?: string
  onSelectWorkspace: (ws: SessionWorkspaceItem) => void
}

export const SessionWorkspaceSelector = memo(function SessionWorkspaceSelector({
  locale = 'zh',
  api,
  activePort,
  bridgeConnected = false,
  selectedWorkspaceId,
  onSelectWorkspace,
}: SessionWorkspaceSelectorProps) {
  const isEn = locale === 'en'
  const [isOpen, setIsOpen] = useState(false)
  const [workspaces, setWorkspaces] = useState<SessionWorkspaceItem[]>([])
  const [customPath, setCustomPath] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // 从本地存储或 props 恢复选中工作区
  const [currentWsId, setCurrentWsId] = useState<string>(() => {
    return selectedWorkspaceId || safeGetStorage('omnimux_default_workspace_id') || 'default'
  })

  // 当端口或连接状态变化时，拉取当前实例下的工作区列表
  useEffect(() => {
    let cancelled = false
    const fetchWorkspaces = async () => {
      try {
        const res = await api.rpc<{
          items?: Array<{ workspaceId?: string; id?: string; name?: string; path?: string; isDefault?: boolean }>
        }>('workspace.list', {})
        if (cancelled) return
        const rawItems = res?.items ?? []
        const parsed: SessionWorkspaceItem[] = rawItems.map((item, idx) => ({
          id: item.workspaceId || item.id || `ws-${idx}`,
          name: item.name || item.path?.split('/').pop() || (isEn ? `Workspace ${idx + 1}` : `工作区 ${idx + 1}`),
          path: item.path,
          isDefault: item.isDefault ?? (idx === 0),
        }))

        if (parsed.length > 0) {
          setWorkspaces(parsed)
          // 若当前未选择或选择不在列表中，默认使用第一个默认工作区
          const match = parsed.find((w) => w.id === currentWsId)
          if (!match && parsed[0]) {
            setCurrentWsId(parsed[0].id)
            onSelectWorkspace(parsed[0])
          }
        } else {
          // 兜底通用工作区
          setWorkspaces([
            { id: 'default', name: isEn ? 'Default Workspace' : '默认工作区 (自动匹配)', isDefault: true },
            { id: 'project-root', name: isEn ? 'Current Project Root' : '当前工程根目录', path: './' },
          ])
        }
      } catch {
        if (cancelled) return
        setWorkspaces([
          { id: 'default', name: isEn ? 'Default Workspace' : '默认工作区 (自动匹配)', isDefault: true },
          { id: 'project-root', name: isEn ? 'Current Project Root' : '当前工程根目录', path: './' },
        ])
      }
    }

    void fetchWorkspaces()
    return () => { cancelled = true }
  }, [api, activePort, bridgeConnected, isEn])

  // 点击空白处收起
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setShowCustomInput(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const activeWs = workspaces.find((w) => w.id === currentWsId) || workspaces[0] || {
    id: 'default',
    name: isEn ? 'Default Workspace' : '默认工作区',
  }

  const handleSelect = (ws: SessionWorkspaceItem) => {
    setCurrentWsId(ws.id)
    safeSetStorage('omnimux_default_workspace_id', ws.id)
    safeSetStorage('omnimux_default_workspace_name', ws.name)
    if (ws.path) safeSetStorage('omnimux_default_workspace_path', ws.path)
    onSelectWorkspace(ws)
    setIsOpen(false)
    setShowCustomInput(false)
  }

  const handleAddCustom = () => {
    const trimmed = customPath.trim()
    if (!trimmed) return
    const newWs: SessionWorkspaceItem = {
      id: `custom-${Date.now()}`,
      name: trimmed.split(/[\\/]/).pop() || trimmed,
      path: trimmed,
    }
    setWorkspaces((prev) => [...prev, newWs])
    handleSelect(newWs)
    setCustomPath('')
  }

  return (
    <div className="workspace-selector-container session-ws-container" ref={containerRef}>
      <button
        type="button"
        className="workspace-selector-trigger session-ws-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        title={isEn ? 'Select workspace for new sessions' : '选择会话工作区，新会话默认在此工作区创建'}
      >
        <div className="ws-trigger-left">
          <span className="ws-icon"><FolderIcon size={14} /></span>
          <span className="ws-name">{activeWs.name}</span>
          {activeWs.path && <span className="ws-port-tag session-ws-path" title={activeWs.path}>{activeWs.path}</span>}
        </div>
        <span className="ws-chevron-arrow">
          <ChevronDownIcon size={14} />
        </span>
      </button>

      {isOpen && (
        <div className="workspace-dropdown-menu session-ws-dropdown">
          <div className="dropdown-header">
            <span>{isEn ? 'Available Workspaces' : '可用会话工作区'}</span>
            <button
              type="button"
              className="probe-refresh-icon-btn"
              onClick={(e) => {
                e.stopPropagation()
                setShowCustomInput(!showCustomInput)
              }}
              title={isEn ? 'Add custom workspace' : '添加自定义工作区路径'}
            >
              <PlusIcon size={12} />
            </button>
          </div>

          {showCustomInput && (
            <div className="custom-ws-input-box" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                className="custom-ws-input"
                placeholder={isEn ? '/path/to/workspace' : '输入本地工作区绝对路径...'}
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustom() }}
                autoFocus
              />
              <button type="button" className="custom-ws-add-btn" onClick={handleAddCustom}>
                {isEn ? 'Add' : '添加'}
              </button>
            </div>
          )}

          <div className="session-ws-list">
            {workspaces.map((ws) => {
              const isChosen = ws.id === currentWsId
              return (
                <div
                  key={ws.id}
                  className={`session-ws-item-row ${isChosen ? 'active' : ''}`}
                  onClick={() => handleSelect(ws)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="session-ws-item-left">
                    <FolderIcon size={14} className="ws-item-icon" />
                    <div className="session-ws-name-wrap">
                      <div className="session-ws-name-title">
                        <span className="session-ws-title-text">{ws.name}</span>
                        {ws.isDefault && (
                          <span className="session-ws-rec-tag">{isEn ? 'Default' : '默认'}</span>
                        )}
                      </div>
                      {ws.path && <div className="session-ws-path-text">{ws.path}</div>}
                    </div>
                  </div>
                  {isChosen && (
                    <div className="session-ws-item-right">
                      <span className="session-ws-check-mark"><CheckIcon size={14} /></span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
})
