/**
 * @file 设置卡片（Settings → 插件 → 可配置）—— 社媒采集总开关。
 * 显式开启契约：默认关；开关经插件自有 HTTP 落盘 config.json（宿主工具执行时读同一真源）。
 */

import { useEffect, useState } from 'react'
import { Button } from 'dsh-ui-kit'

import { fetchStatus, saveEnabled } from './api.js'

const STYLES = `
.shc-card { display: flex; flex-direction: column; gap: 8px; font-size: 13px;
  color: var(--dsw-alias-label-primary); }
.shc-title { font-size: 13px; font-weight: 600; }
.shc-desc { font-size: 12px; color: var(--dsw-alias-label-tertiary); line-height: 1.6; }
.shc-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.shc-state { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.shc-state.on { color: var(--dsw-alias-label-success); }
`

export function SettingsCard({ t }) {
  const [enabled, setEnabled] = useState(null) // null = loading
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchStatus().then((res) => {
      if (res.ok) setEnabled(res.body.enabled === true)
      else setEnabled(false)
    })
  }, [])

  const toggle = async () => {
    if (enabled === null || busy) return
    setBusy(true)
    const next = !enabled
    const res = await saveEnabled(next)
    if (res.ok) setEnabled(next)
    setBusy(false)
  }

  return (
    <div className="shc-card">
      <style>{STYLES}</style>
      <div className="shc-title">{t('settings.title')}</div>
      <div className="shc-desc">{t('settings.desc')}</div>
      <div className="shc-row">
        <span className={`shc-state${enabled ? ' on' : ''}`}>
          {enabled === null ? '…' : enabled ? t('settings.enable') + ' · On' : t('settings.enable') + ' · Off'}
        </span>
        <Button variant="secondary" size="sm" onClick={toggle}
          loading={busy} disabled={enabled === null}>
          {enabled ? 'Off' : 'On'}
        </Button>
      </div>
    </div>
  )
}
