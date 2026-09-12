import { memo, useEffect, useState } from 'react'
import { FolderIcon, RefreshIcon } from './icons.tsx'

export interface WorkspaceItem {
  id: string
  name: string
  path: string
  isActive?: boolean
}

export const WorkspaceSelector = memo(function WorkspaceSelector({
  bridgeConnected,
  locale = 'zh',
  onSelectWorkspace
}: {
  bridgeConnected: boolean
  locale?: 'zh' | 'en'
  onSelectWorkspace?: (ws: WorkspaceItem) => void
}) {
  const isEn = locale === 'en'
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceItem | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const fetchWorkspaces = async () => {
    setLoading(true)
    const ports = [43120, 45120, 43128]
    let loaded = false

    for (const port of ports) {
      try {
        const resp = await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
          signal: AbortSignal.timeout(1500)
        })
        if (resp.ok) {
          const data = await resp.json()
          const list: WorkspaceItem[] = Array.isArray(data) ? data : data?.workspaces || []
          if (list.length > 0) {
            setWorkspaces(list)
            const active = list.find((w) => w.isActive) || list[0]
            setActiveWorkspace(active)
            loaded = true
            break
          }
        }
      } catch {
        // Try next port
      }
    }

    if (!loaded) {
      const fallback: WorkspaceItem = {
        id: 'default-browser',
        name: 'omnimux-browser',
        path: '~/.dsh/browser-sessions',
        isActive: true
      }
      setWorkspaces([fallback])
      setActiveWorkspace(fallback)
    }
    setLoading(false)
  }

  useEffect(() => {
    void fetchWorkspaces()
  }, [])

  return (
    <div className="workspace-selector-container">
      <button
        type="button"
        className="workspace-selector-pill"
        onClick={() => setIsOpen(!isOpen)}
        title={isEn ? "Switch local DSH / OmniMux workspace" : "切换本地 DSH / OmniMux 工作区"}
      >
        <span className={`engine-dot ${bridgeConnected ? 'online' : loading ? 'connecting' : 'offline'}`} />
        <span className="ws-icon"><FolderIcon size={13} /></span>
        <span className="ws-name">{activeWorkspace?.name || (isEn ? 'Select Workspace' : '选择工作区')}</span>
        <span className="ws-arrow">▾</span>
      </button>

      {isOpen && (
        <div className="workspace-dropdown-menu">
          <div className="dropdown-header">{isEn ? 'Local Workspaces' : '本地工作区列表'}</div>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              type="button"
              className={`dropdown-item ${activeWorkspace?.id === ws.id ? 'active' : ''}`}
              onClick={() => {
                setActiveWorkspace(ws)
                setIsOpen(false)
                onSelectWorkspace?.(ws)
              }}
            >
              <span className="item-name">{ws.name}</span>
              <span className="item-path">{ws.path}</span>
            </button>
          ))}
          <div className="dropdown-footer">
            <button type="button" className="refresh-btn" onClick={fetchWorkspaces}>
              <RefreshIcon size={12} />
              <span>{isEn ? 'Refresh' : '刷新工作区'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
