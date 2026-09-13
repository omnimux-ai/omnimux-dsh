import { memo, useEffect, useState } from 'react'
import { FolderIcon, RefreshIcon, CheckIcon, ChevronDownIcon } from './icons.tsx'

export interface WorkspaceItem {
  id: string
  name: string
  path: string
  port: number
  instanceNameZh: string
  instanceNameEn: string
  isRecommended?: boolean
  isActive?: boolean
}

export type HealthStatus = 'online' | 'standby' | 'offline'

export interface InstanceHealth {
  status: HealthStatus
  latencyMs?: number
  messageZh: string
  messageEn: string
}

export const PRESET_INSTANCES = [
  {
    id: 'omnimux-dev',
    port: 45120,
    nameZh: 'OmniMux Dev',
    nameEn: 'OmniMux Dev',
    defaultPath: '~/Desktop/Project/dsh-plugin/product/omnimux-dsh',
    isRecommended: true,
  },
  {
    id: 'dsh-desktop',
    port: 43120,
    nameZh: 'DSH Desktop',
    nameEn: 'DSH Desktop',
    defaultPath: '~/.dsh',
  },
  {
    id: 'omnimux-prd',
    port: 43128,
    nameZh: 'OmniMux PRD',
    nameEn: 'OmniMux PRD',
    defaultPath: '~/.omnimux',
  },
]

export async function probeInstanceHealth(port: number): Promise<InstanceHealth> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1200)

    const resp = await fetch(`http://127.0.0.1:${port}/ext/bridge-config`, {
      signal: controller.signal,
    }).catch(async () => {
      return fetch(`http://127.0.0.1:${port}/`, {
        signal: controller.signal,
      })
    })

    clearTimeout(timer)
    const latency = Date.now() - start

    if (resp.ok) {
      return {
        status: 'online',
        latencyMs: latency,
        messageZh: `${latency}ms`,
        messageEn: `${latency}ms`,
      }
    }

    if (resp.status === 401 || resp.status === 403) {
      return {
        status: 'online', // 本地端口监听中且响应，属于真实可用在线状态
        latencyMs: latency,
        messageZh: `就绪 ${latency}ms`,
        messageEn: `Ready ${latency}ms`,
      }
    }

    return {
      status: 'online',
      latencyMs: latency,
      messageZh: `${latency}ms`,
      messageEn: `${latency}ms`,
    }
  } catch {
    const latency = Date.now() - start
    return {
      status: 'offline',
      latencyMs: latency,
      messageZh: '离线',
      messageEn: 'Offline',
    }
  }
}

export const WorkspaceSelector = memo(function WorkspaceSelector({
  bridgeConnected,
  locale = 'zh',
  targetPort = 45120,
  onSelectWorkspace,
}: {
  bridgeConnected: boolean
  locale?: 'zh' | 'en'
  targetPort?: number
  onSelectWorkspace?: (ws: WorkspaceItem) => void
}) {
  const isEn = locale === 'en'
  const [selectedPort, setSelectedPort] = useState<number>(() => {
    const saved = localStorage.getItem('omnimux_target_port')
    const p = saved ? parseInt(saved, 10) : targetPort
    return !isNaN(p) && p > 0 ? p : 45120
  })
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceItem | null>(null)
  const [healthMap, setHealthMap] = useState<Record<number, InstanceHealth>>({})
  const [isOpen, setIsOpen] = useState(false)
  const [probing, setProbing] = useState(false)
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customPortInput, setCustomPortInput] = useState('')

  const refreshInstances = async () => {
    setProbing(true)
    const targets = Array.from(new Set([...PRESET_INSTANCES.map((p) => p.port), selectedPort]))
    const healthResults: Record<number, InstanceHealth> = {}

    await Promise.all(
      targets.map(async (port) => {
        healthResults[port] = await probeInstanceHealth(port)
      })
    )
    setHealthMap(healthResults)

    // 构建各实例对应的工作区列表
    const list: WorkspaceItem[] = PRESET_INSTANCES.map((inst) => {
      const h = healthResults[inst.port]
      return {
        id: inst.id,
        name: inst.nameZh,
        path: inst.defaultPath,
        port: inst.port,
        instanceNameZh: inst.nameZh,
        instanceNameEn: inst.nameEn,
        isRecommended: inst.isRecommended,
        healthStatus: h?.status || 'offline',
        latencyMs: h?.latencyMs,
        isActive: inst.port === selectedPort,
      }
    })

    if (!PRESET_INSTANCES.some((p) => p.port === selectedPort)) {
      const h = healthResults[selectedPort]
      list.push({
        id: 'custom',
        name: isEn ? `Custom Port (${selectedPort})` : `自定义实例 (${selectedPort})`,
        path: `http://127.0.0.1:${selectedPort}`,
        port: selectedPort,
        instanceNameZh: `自定义 (${selectedPort})`,
        instanceNameEn: `Custom (${selectedPort})`,
        healthStatus: h?.status || 'offline',
        latencyMs: h?.latencyMs,
        isActive: true,
      })
    }

    setWorkspaces(list)
    const cur = list.find((w) => w.port === selectedPort) || list[0]
    setActiveWorkspace(cur)
    setProbing(false)
  }

  useEffect(() => {
    void refreshInstances()
  }, [selectedPort])

  const handleSelect = (ws: WorkspaceItem) => {
    setSelectedPort(ws.port)
    setActiveWorkspace(ws)
    setIsOpen(false)
    setShowCustomInput(false)
    try {
      localStorage.setItem('omnimux_target_port', String(ws.port))
      localStorage.setItem('omnimux_target_instance', ws.id)
    } catch {
      // Ignore
    }
    onSelectWorkspace?.(ws)
  }

  const handleApplyCustom = () => {
    const p = parseInt(customPortInput.trim(), 10)
    if (!isNaN(p) && p > 0 && p <= 65535) {
      setSelectedPort(p)
      setShowCustomInput(false)
      setIsOpen(false)
      try {
        localStorage.setItem('omnimux_target_port', String(p))
        localStorage.setItem('omnimux_target_instance', 'custom')
      } catch {
        // Ignore
      }
      onSelectWorkspace?.({
        id: 'custom',
        name: isEn ? `Custom (${p})` : `自定义实例 (${p})`,
        path: `http://127.0.0.1:${p}`,
        port: p,
        instanceNameZh: `自定义 (${p})`,
        instanceNameEn: `Custom (${p})`,
        isActive: true,
      })
    }
  }

  // 状态指示点：只要本地探活为 online，或者 WebSocket 已连接，均点亮为绿色在线；避免红点误导
  const currentHealth = healthMap[selectedPort]
  const isOnline = bridgeConnected || currentHealth?.status === 'online'

  return (
    <div className="workspace-selector-container">
      <button
        type="button"
        className="workspace-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        title={isEn ? 'Switch instance and default workspace' : '选择连接的实例与默认工作区'}
      >
        <div className="ws-trigger-left">
          <span className={`engine-dot ${isOnline ? 'online' : probing ? 'connecting' : 'offline'}`} />
          <span className="ws-icon"><FolderIcon size={14} /></span>
          <span className="ws-name">
            {activeWorkspace?.instanceNameZh || activeWorkspace?.name || (isEn ? 'Select Workspace' : '选择工作区')}
          </span>
          <span className="ws-port-tag">:{selectedPort}</span>
        </div>
        <span className="ws-chevron-arrow">
          <ChevronDownIcon size={14} />
        </span>
      </button>

      {isOpen && (
        <div className="workspace-dropdown-menu">
          <div className="dropdown-header">
            <span>{isEn ? 'Available Instances & Workspaces' : '可用实例与工作区'}</span>
            <button
              type="button"
              className="probe-refresh-icon-btn"
              onClick={(e) => {
                e.stopPropagation()
                void refreshInstances()
              }}
              title={isEn ? 'Refresh all ports' : '重新探测实例状态'}
            >
              <RefreshIcon size={12} className={probing ? 'spinning' : ''} />
            </button>
          </div>

          <div className="instance-list">
            {workspaces.map((ws) => {
              const isChosen = ws.port === selectedPort
              const health = healthMap[ws.port]
              const latencyText = health?.latencyMs !== undefined ? `${health.latencyMs}ms` : ''
              const statusLabel = health?.status === 'online'
                ? (latencyText ? `${isEn ? 'Online' : '在线'} ${latencyText}` : (isEn ? 'Online' : '在线'))
                : (isEn ? 'Offline' : '离线')

              return (
                <div
                  key={ws.id}
                  className={`instance-item-row ${isChosen ? 'active' : ''}`}
                  onClick={() => handleSelect(ws)}
                >
                  <div className="instance-row-left">
                    <span
                      className={`instance-health-dot ${
                        health?.status === 'online'
                          ? 'online'
                          : health ? 'offline' : 'checking'
                      }`}
                    />
                    <span className="instance-name">{isEn ? ws.instanceNameEn : ws.instanceNameZh}</span>
                    <span className="instance-port-tag">:{ws.port}</span>
                    {ws.isRecommended && (
                      <span className="instance-rec-pill">{isEn ? 'REC' : '推荐'}</span>
                    )}
                  </div>
                  <div className="instance-row-right">
                    <span
                      className={`health-pill ${
                        health?.status === 'online' ? 'online' : 'offline'
                      }`}
                    >
                      {statusLabel}
                    </span>
                    {isChosen && (
                      <span className="instance-check-mark"><CheckIcon size={12} /></span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="instance-custom-footer">
            {!showCustomInput ? (
              <button
                type="button"
                className="custom-port-trigger-btn"
                onClick={() => setShowCustomInput(true)}
              >
                ＋ {isEn ? 'Custom Port...' : '自定义端口...'}
              </button>
            ) : (
              <div className="custom-port-input-row">
                <input
                  type="number"
                  placeholder={isEn ? 'Port (e.g. 3080)' : '端口号 (如 3080)'}
                  value={customPortInput}
                  onChange={(e) => setCustomPortInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleApplyCustom()
                  }}
                  className="custom-port-input"
                  autoFocus
                />
                <button
                  type="button"
                  className="custom-port-apply-btn"
                  onClick={handleApplyCustom}
                >
                  {isEn ? 'OK' : '确认'}
                </button>
                <button
                  type="button"
                  className="custom-port-cancel-btn"
                  onClick={() => setShowCustomInput(false)}
                >
                  {isEn ? 'Cancel' : '取消'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
