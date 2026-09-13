import { memo, useEffect, useState } from 'react'
import { ServerIcon, RefreshIcon, CheckIcon } from './icons.tsx'

export interface DshInstance {
  id: string
  nameZh: string
  nameEn: string
  port: number
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
    nameZh: 'OmniMux Dev',
    nameEn: 'OmniMux Dev',
    port: 45120,
    isRecommended: true,
  },
  {
    id: 'dsh-desktop',
    nameZh: 'DSH Desktop',
    nameEn: 'DSH Desktop',
    port: 43120,
  },
  {
    id: 'omnimux-prd',
    nameZh: 'OmniMux PRD',
    nameEn: 'OmniMux PRD',
    port: 43128,
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
        messageZh: `已就绪 (${latency}ms)`,
        messageEn: `Ready (${latency}ms)`,
      }
    }

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
      messageZh: `在线 (${latency}ms)`,
      messageEn: `Online (${latency}ms)`,
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
        name: isEn ? `Custom (${p})` : `自定义 (${p})`,
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
            <span>{isEn ? 'DSH / OmniMux Instances' : '本地 DSH / OmniMux 实例'}</span>
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
              const latencyText = health?.latencyMs !== undefined ? `${health.latencyMs}ms` : ''
              const statusLabel = health?.status === 'online'
                ? (latencyText || (isEn ? 'Online' : '在线'))
                : health?.status === 'standby'
                  ? (isEn ? `Ready ${latencyText}` : `就绪 ${latencyText}`)
                  : health?.status === 'offline'
                    ? (isEn ? 'Offline' : '离线')
                    : '...'

              return (
                <div
                  key={inst.id}
                  className={`instance-item-row ${isChosen ? 'active' : ''}`}
                  onClick={() => handleSelect(inst)}
                >
                  <div className="instance-row-left">
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
                    <span className="instance-port-tag">:{inst.port}</span>
                    {inst.isRecommended && (
                      <span className="instance-rec-pill">{isEn ? 'REC' : '推荐'}</span>
                    )}
                  </div>
                  <div className="instance-row-right">
                    <span
                      className={`health-pill ${
                        health?.status === 'online'
                          ? 'online'
                          : health?.status === 'standby'
                            ? 'standby'
                            : 'offline'
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
