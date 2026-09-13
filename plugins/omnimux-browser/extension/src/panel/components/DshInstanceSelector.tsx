import { memo, useEffect, useState } from 'react'
import { ServerIcon, RefreshIcon, CheckIcon } from './icons.tsx'

export interface DshInstance {
  id: string
  nameZh: string
  nameEn: string
  port: number
  descriptionZh: string
  descriptionEn: string
  isRecommended?: boolean
}

export type HealthStatus = 'online' | 'standby' | 'offline' | 'checking'

export interface InstanceHealth {
  status: HealthStatus
  latencyMs?: number
  messageZh: string
  messageEn: string
}

export const PRESET_INSTANCES: DshInstance[] = [
  {
    id: 'omnimux-dev',
    nameZh: 'OmniMux Dev（开发版）',
    nameEn: 'OmniMux Dev',
    port: 45120,
    descriptionZh: '本地开发调试版应用，默认端口 45120',
    descriptionEn: 'Local developer build, default port 45120',
    isRecommended: true,
  },
  {
    id: 'dsh-desktop',
    nameZh: 'DSH Desktop（基础版）',
    nameEn: 'DSH Desktop',
    port: 43120,
    descriptionZh: '官方原生桌面端应用，默认端口 43120',
    descriptionEn: 'Official desktop application, default port 43120',
  },
  {
    id: 'omnimux-prd',
    nameZh: 'OmniMux PRD（正式版）',
    nameEn: 'OmniMux Production',
    port: 43128,
    descriptionZh: '正式生产发布版应用，默认端口 43128',
    descriptionEn: 'Production release app, default port 43128',
  },
]

export async function probeInstanceHealth(port: number): Promise<InstanceHealth> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1200)

    // 优先探测 bridge-config 或根路径
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
        messageZh: `已就绪 (${latency}ms)`,
        messageEn: `Ready (${latency}ms)`,
      }
    }

    // 401 / 403 说明端口正在监听运行且进程存活
    if (resp.status === 401 || resp.status === 403) {
      return {
        status: 'standby',
        latencyMs: latency,
        messageZh: `运行中 · 待连接 (${latency}ms)`,
        messageEn: `Running · Standby (${latency}ms)`,
      }
    }

    return {
      status: 'online',
      latencyMs: latency,
      messageZh: `服务在线 (HTTP ${resp.status})`,
      messageEn: `Active (HTTP ${resp.status})`,
    }
  } catch {
    const latency = Date.now() - start
    return {
      status: 'offline',
      latencyMs: latency,
      messageZh: '未启动 / 离线',
      messageEn: 'Offline',
    }
  }
}

export const DshInstanceSelector = memo(function DshInstanceSelector({
  locale = 'zh',
  activePort = 45120,
  onSelectInstance,
}: {
  locale?: 'zh' | 'en'
  activePort?: number
  onSelectInstance?: (instance: { id: string; port: number; name: string }) => void
}) {
  const isEn = locale === 'en'
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPort, setSelectedPort] = useState<number>(activePort)
  const [customPortInput, setCustomPortInput] = useState<string>('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [healthMap, setHealthMap] = useState<Record<number, InstanceHealth>>({})
  const [probing, setProbing] = useState(false)

  // 并发检查所有候选端口的在线状态
  const refreshAllHealth = async () => {
    setProbing(true)
    const targets = [...PRESET_INSTANCES.map((p) => p.port)]
    if (selectedPort && !targets.includes(selectedPort)) {
      targets.push(selectedPort)
    }

    const results: Record<number, InstanceHealth> = {}
    await Promise.all(
      targets.map(async (port) => {
        results[port] = await probeInstanceHealth(port)
      })
    )
    setHealthMap(results)
    setProbing(false)
  }

  useEffect(() => {
    void refreshAllHealth()
  }, [])

  useEffect(() => {
    setSelectedPort(activePort)
  }, [activePort])

  const currentPreset = PRESET_INSTANCES.find((p) => p.port === selectedPort)
  const activeHealth = healthMap[selectedPort]

  const handleSelect = (inst: DshInstance) => {
    setSelectedPort(inst.port)
    setShowCustomInput(false)
    setIsOpen(false)
    try {
      localStorage.setItem('omnimux_target_port', String(inst.port))
      localStorage.setItem('omnimux_target_instance', inst.id)
    } catch {
      // Ignore
    }
    onSelectInstance?.({ id: inst.id, port: inst.port, name: isEn ? inst.nameEn : inst.nameZh })
  }

  const handleApplyCustomPort = () => {
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
      onSelectInstance?.({
        id: 'custom',
        port: p,
        name: isEn ? `Custom Port (${p})` : `自定义端口 (${p})`,
      })
      void probeInstanceHealth(p).then((res) => {
        setHealthMap((prev) => ({ ...prev, [p]: res }))
      })
    }
  }

  return (
    <div className="dsh-instance-selector-container">
      <button
        type="button"
        className="dsh-instance-pill-btn"
        onClick={() => setIsOpen(!isOpen)}
        title={isEn ? 'Switch DSH / OmniMux engine instance' : '切换本地 DSH / OmniMux 运行实例'}
      >
        <span
          className={`instance-health-dot ${
            activeHealth?.status === 'online'
              ? 'online'
              : activeHealth?.status === 'standby'
                ? 'standby'
                : 'offline'
          }`}
        />
        <span className="inst-icon"><ServerIcon size={13} /></span>
        <span className="inst-label">
          {currentPreset
            ? (isEn ? currentPreset.nameEn : currentPreset.nameZh)
            : `${isEn ? 'Port' : '端口'} ${selectedPort}`}
        </span>
        <span className="inst-port-badge">{selectedPort}</span>
        <span className="inst-arrow">▾</span>
      </button>

      {isOpen && (
        <div className="dsh-instance-dropdown-menu">
          <div className="instance-dropdown-header">
            <span>{isEn ? 'Local DSH Instances & Ports' : '本地 DSH / OmniMux 实例版本'}</span>
            <button
              type="button"
              className="probe-refresh-icon-btn"
              onClick={(e) => {
                e.stopPropagation()
                void refreshAllHealth()
              }}
              title={isEn ? 'Re-check all ports' : '重新探测全部端口状态'}
            >
              <RefreshIcon size={12} className={probing ? 'spinning' : ''} />
            </button>
          </div>

          <div className="instance-list">
            {PRESET_INSTANCES.map((inst) => {
              const isChosen = inst.port === selectedPort
              const health = healthMap[inst.port]
              return (
                <div
                  key={inst.id}
                  className={`instance-item-card ${isChosen ? 'active' : ''}`}
                  onClick={() => handleSelect(inst)}
                >
                  <div className="instance-card-left">
                    <div className="instance-card-title-row">
                      <span
                        className={`instance-health-dot ${
                          health?.status === 'online'
                            ? 'online'
                            : health?.status === 'standby'
                              ? 'standby'
                              : health ? 'offline' : 'checking'
                        }`}
                      />
                      <span className="instance-name">{isEn ? inst.nameEn : inst.nameZh}</span>
                      {inst.isRecommended && (
                        <span className="instance-recommend-badge">{isEn ? 'Default' : '推荐默认'}</span>
                      )}
                    </div>
                    <div className="instance-desc">{isEn ? inst.descriptionEn : inst.descriptionZh}</div>
                  </div>
                  <div className="instance-card-right">
                    <span className="instance-port-tag">:{inst.port}</span>
                    <span
                      className={`health-pill ${
                        health?.status === 'online'
                          ? 'online'
                          : health?.status === 'standby'
                            ? 'standby'
                            : 'offline'
                      }`}
                    >
                      {health ? (isEn ? health.messageEn : health.messageZh) : (isEn ? 'Checking...' : '检测中...')}
                    </span>
                    {isChosen && (
                      <span className="instance-check-icon"><CheckIcon size={13} /></span>
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
                ＋ {isEn ? 'Specify Custom Port...' : '指定自定义本地端口...'}
              </button>
            ) : (
              <div className="custom-port-input-row">
                <input
                  type="number"
                  placeholder={isEn ? 'Port (e.g. 3080)' : '端口号 (例如 3080)'}
                  value={customPortInput}
                  onChange={(e) => setCustomPortInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleApplyCustomPort()
                  }}
                  className="custom-port-input"
                  autoFocus
                />
                <button
                  type="button"
                  className="custom-port-apply-btn"
                  onClick={handleApplyCustomPort}
                >
                  {isEn ? 'Connect' : '连接'}
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
