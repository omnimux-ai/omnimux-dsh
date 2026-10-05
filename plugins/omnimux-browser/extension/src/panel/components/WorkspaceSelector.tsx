import { memo, useEffect, useRef, useState } from 'react'
import { RefreshIcon, CheckIcon } from './icons.tsx'
import {
  discoverInstances,
  instanceStatusText,
  INSTANCE_SELECTOR_COPY,
  KNOWN_INSTANCE_NAMES,
  type DiscoveredInstance,
  type InstanceStatus,
  type UiLocale,
} from '../../shared/instance-discovery.ts'

export interface WorkspaceItem {
  id: string
  name: string
  path: string
  port: number
  instanceNameZh: string
  instanceNameEn: string
  status: InstanceStatus
  latencyMs?: number
  isRecommended?: boolean
  isActive?: boolean
}

function toWorkspaceItem(inst: DiscoveredInstance, selectedPort: number): WorkspaceItem {
  return {
    id: inst.id,
    name: inst.nameZh,
    path: `http://127.0.0.1:${inst.port}`,
    port: inst.port,
    instanceNameZh: inst.nameZh,
    instanceNameEn: inst.nameEn,
    status: inst.status,
    latencyMs: inst.latencyMs,
    isRecommended: inst.isRecommended,
    isActive: inst.port === selectedPort,
  }
}

/**
 * 触发按钮的选中实例：本轮发现结果优先；已知端口本轮离线被过滤时
 * 回退名称映射表（避免已知实例闪成占位文案）。无法解析视为未选中。
 */
function resolveSelected(
  instances: DiscoveredInstance[],
  selectedPort: number,
): DiscoveredInstance | undefined {
  const hit = instances.find((i) => i.port === selectedPort)
  if (hit) return hit
  const known = KNOWN_INSTANCE_NAMES[selectedPort]
  if (!known) return undefined
  return {
    id: known.id,
    port: selectedPort,
    nameZh: known.nameZh,
    nameEn: known.nameEn,
    status: 'offline',
    isRecommended: known.isRecommended ?? false,
    isCustom: false,
  }
}

function dotClass(status: InstanceStatus | undefined, bridgeConnected: boolean): string {
  if (bridgeConnected || status === 'online') return 'online'
  if (status === 'unavailable') return 'standby'
  return 'offline'
}

export const WorkspaceSelector = memo(function WorkspaceSelector({
  bridgeConnected,
  locale = 'zh',
  targetPort = 43128,
  onSelectWorkspace,
}: {
  bridgeConnected: boolean
  locale?: UiLocale
  targetPort?: number
  onSelectWorkspace?: (ws: WorkspaceItem) => void
}) {
  const copy = INSTANCE_SELECTOR_COPY[locale]
  const [selectedPort, setSelectedPort] = useState<number>(() => {
    const saved = localStorage.getItem('omnimux_target_port')
    const p = saved ? parseInt(saved, 10) : targetPort
    return !isNaN(p) && p > 0 ? p : 43128
  })
  const [instances, setInstances] = useState<DiscoveredInstance[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [probing, setProbing] = useState(false)
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customPortInput, setCustomPortInput] = useState('')
  // 竞态护栏：以最后一次打开/刷新的探测结果为准，stale response 直接丢弃。
  const discoverySeq = useRef(0)

  const refreshInstances = async () => {
    const seq = ++discoverySeq.current
    setProbing(true)
    try {
      const found = await discoverInstances([selectedPort])
      if (seq !== discoverySeq.current) return
      setInstances(found)
    } finally {
      if (seq === discoverySeq.current) setProbing(false)
    }
  }

  // 首次挂载先探一轮；之后每次打开下拉重新探测，关闭期间不轮询。
  useEffect(() => {
    void refreshInstances()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPort])

  const handleToggleOpen = () => {
    const next = !isOpen
    setIsOpen(next)
    if (next) void refreshInstances()
  }

  const handleSelect = (inst: DiscoveredInstance) => {
    if (inst.status === 'offline') return
    setSelectedPort(inst.port)
    setIsOpen(false)
    setShowCustomInput(false)
    try {
      localStorage.setItem('omnimux_target_port', String(inst.port))
      localStorage.setItem('omnimux_target_instance', inst.id)
    } catch {
      // Ignore
    }
    onSelectWorkspace?.(toWorkspaceItem(inst, inst.port))
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
      const existing = instances.find((i) => i.port === p)
      onSelectWorkspace?.(toWorkspaceItem(existing ?? {
        id: 'custom',
        port: p,
        nameZh: INSTANCE_SELECTOR_COPY.zh.localInstance,
        nameEn: INSTANCE_SELECTOR_COPY.en.localInstance,
        status: 'offline',
        isRecommended: false,
        isCustom: true,
      }, p))
    }
  }

  const resolved = resolveSelected(instances, selectedPort)
  const engineDot = dotClass(resolved?.status, bridgeConnected)

  return (
    <div className="workspace-selector-container">
      <button
        type="button"
        className="workspace-selector-trigger"
        onClick={handleToggleOpen}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title={copy.selectInstance}
      >
        <div className="ws-trigger-left">
          <span className={`engine-dot ${engineDot}`} />
          <span className="ws-name">
            {resolved ? (locale === 'en' ? resolved.nameEn : resolved.nameZh) : copy.selectInstance}
          </span>
          {resolved && <span className="ws-port"> :{resolved.port}</span>}
        </div>
      </button>

      {isOpen && (
        <div className="workspace-dropdown-menu" role="listbox">
          <div className="instance-list">
            {instances.length === 0 && probing && (
              <div className="instance-empty">{copy.detecting}</div>
            )}
            {instances.length === 0 && !probing && (
              <div className="instance-empty">{copy.emptyInstances}</div>
            )}
            {instances.map((inst) => {
              const isChosen = inst.port === selectedPort
              const isEffectiveOnline = inst.status === 'online' || (isChosen && bridgeConnected)
              const effectiveStatus: InstanceStatus = isEffectiveOnline ? 'online' : inst.status
              const disabled = effectiveStatus === 'offline'
              return (
                <div
                  key={inst.id}
                  role="option"
                  aria-selected={isChosen}
                  aria-disabled={disabled || undefined}
                  className={`instance-item-row ${isChosen ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                  onClick={() => handleSelect({ ...inst, status: effectiveStatus })}
                >
                  <div className="instance-row-left">
                    <span className={`instance-health-dot ${effectiveStatus === 'online' ? 'online' : effectiveStatus === 'unavailable' ? 'standby' : 'offline'}`} />
                    <span className="instance-name">{locale === 'en' ? inst.nameEn : inst.nameZh}</span>
                    <span className="instance-port-tag">:{inst.port}</span>
                    {inst.isRecommended && (
                      <span className="instance-rec-pill">{copy.recommended}</span>
                    )}
                  </div>
                  <div className="instance-row-right">
                    <span className={`health-pill ${effectiveStatus === 'online' ? 'online' : effectiveStatus === 'unavailable' ? 'standby' : 'offline'}`}>
                      {instanceStatusText({ ...inst, status: effectiveStatus }, locale)}
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
              <div className="instance-footer-row">
                <button
                  type="button"
                  className="custom-port-trigger-btn"
                  onClick={() => setShowCustomInput(true)}
                >
                  {copy.customPort}
                </button>
                <button
                  type="button"
                  className="probe-refresh-icon-btn"
                  disabled={probing}
                  aria-label={copy.refresh}
                  onClick={(e) => {
                    e.stopPropagation()
                    void refreshInstances()
                  }}
                >
                  <RefreshIcon size={12} className={probing ? 'spinning' : ''} />
                </button>
              </div>
            ) : (
              <div className="custom-port-input-row">
                <input
                  type="number"
                  placeholder={copy.customPortPlaceholder}
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
                  {copy.customConfirm}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
