import { memo, useEffect, useRef, useState } from 'react'
import { RefreshIcon, CheckIcon } from './icons.tsx'
import {
  discoverInstances,
  instanceStatusText,
  INSTANCE_SELECTOR_COPY,
  KNOWN_INSTANCE_NAMES,
  type DiscoveredInstance,
  type UiLocale,
} from '../../shared/instance-discovery.ts'

export interface DshInstance {
  id: string
  nameZh: string
  nameEn: string
  port: number
  isRecommended?: boolean
}

export const DshInstanceSelector = memo(function DshInstanceSelector({
  locale = 'zh',
  activePort = 43128,
  onSelectInstance,
}: {
  locale?: UiLocale
  activePort?: number
  onSelectInstance?: (instance: { id: string; port: number; name: string }) => void
}) {
  const copy = INSTANCE_SELECTOR_COPY[locale]
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPort, setSelectedPort] = useState<number>(activePort)
  const [customPortInput, setCustomPortInput] = useState<string>('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [instances, setInstances] = useState<DiscoveredInstance[]>([])
  const [probing, setProbing] = useState(false)
  const discoverySeq = useRef(0)

  const refreshInstances = async (ports?: readonly number[]) => {
    const seq = ++discoverySeq.current
    setProbing(true)
    try {
      const found = await discoverInstances(ports ?? [selectedPort])
      if (seq !== discoverySeq.current) return
      setInstances(found)
    } finally {
      if (seq === discoverySeq.current) setProbing(false)
    }
  }

  useEffect(() => {
    void refreshInstances()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setSelectedPort(activePort)
  }, [activePort])

  const selected = instances.find((i) => i.port === selectedPort)
  // 触发按钮只显示已解析的选中实例名（名称映射表内端口按映射名）；未解析一律回退占位文案。
  const resolved = selected ?? (KNOWN_INSTANCE_NAMES[selectedPort] ? {
    ...KNOWN_INSTANCE_NAMES[selectedPort],
    port: selectedPort,
    status: 'offline' as const,
    isRecommended: KNOWN_INSTANCE_NAMES[selectedPort].isRecommended ?? false,
    isCustom: false,
  } : undefined)

  const handleSelect = (inst: DiscoveredInstance) => {
    if (inst.status === 'offline') return
    setSelectedPort(inst.port)
    setShowCustomInput(false)
    setIsOpen(false)
    try {
      localStorage.setItem('omnimux_target_port', String(inst.port))
      localStorage.setItem('omnimux_target_instance', inst.id)
    } catch {
      // Ignore
    }
    onSelectInstance?.({ id: inst.id, port: inst.port, name: locale === 'en' ? inst.nameEn : inst.nameZh })
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
        name: `${copy.localInstance} :${p}`,
      })
      void refreshInstances([p])
    }
  }

  return (
    <div className="dsh-instance-selector-container">
      <button
        type="button"
        className="dsh-instance-pill-btn"
        onClick={() => {
          const next = !isOpen
          setIsOpen(next)
          if (next) void refreshInstances()
        }}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title={copy.selectInstance}
      >
        <span
          className={`instance-health-dot ${
            resolved?.status === 'online'
              ? 'online'
              : resolved?.status === 'unavailable'
                ? 'standby'
                : 'offline'
          }`}
        />
        <span className="inst-label">
          {resolved ? (locale === 'en' ? resolved.nameEn : resolved.nameZh) : copy.selectInstance}
        </span>
        {resolved && <span className="inst-port"> :{resolved.port}</span>}
      </button>

      {isOpen && (
        <div className="dsh-instance-dropdown-menu" role="listbox">
          <div className="instance-list">
            {instances.length === 0 && probing && (
              <div className="instance-empty">{copy.detecting}</div>
            )}
            {instances.length === 0 && !probing && (
              <div className="instance-empty">{copy.emptyInstances}</div>
            )}
            {instances.map((inst) => {
              const isChosen = inst.port === selectedPort
              const disabled = inst.status === 'offline'
              return (
                <div
                  key={inst.id}
                  role="option"
                  aria-selected={isChosen}
                  aria-disabled={disabled || undefined}
                  className={`instance-item-row ${isChosen ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                  onClick={() => handleSelect(inst)}
                >
                  <div className="instance-row-left">
                    <span
                      className={`instance-health-dot ${
                        inst.status === 'online'
                          ? 'online'
                          : inst.status === 'unavailable'
                            ? 'standby'
                            : 'offline'
                      }`}
                    />
                    <span className="instance-name">{locale === 'en' ? inst.nameEn : inst.nameZh}</span>
                    <span className="instance-port-tag">:{inst.port}</span>
                    {inst.isRecommended && (
                      <span className="instance-rec-pill">{copy.recommended}</span>
                    )}
                  </div>
                  <div className="instance-row-right">
                    <span
                      className={`health-pill ${
                        inst.status === 'online'
                          ? 'online'
                          : inst.status === 'unavailable'
                            ? 'standby'
                            : 'offline'
                      }`}
                    >
                      {instanceStatusText(inst, locale)}
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
