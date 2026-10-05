/**
 * R3 监控池状态条与 R4「刷新」主按钮（#3111，规格 §2.2 R3/R4、§8.1）。
 *
 * 状态条只有一行：左侧今日剩余刷新额度，右侧数据新鲜度（无刷新事实时不
 * 渲染）。额度文案逐字取字典 `今日剩余刷新额度 {left}/{total}`。
 *
 * `RivalRefreshButton` 是筛选行的主按钮：额度耗尽 / 筛选集内有「已停止」
 * 账号 / 手动刷新冷却期三者之一成立时置灰但可点，D4 原因弹层只报一条
 * 原因，优先级 额度 > 停止 > 冷却（规格 B12）。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from 'dsh-ui-kit'

/**
 * Hours until the daily ledger resets at local midnight.
 * @param {number} [nowMs]
 * @returns {number}
 */
export function hoursToMidnight(nowMs = Date.now()) {
  const next = new Date(nowMs)
  next.setHours(24, 0, 0, 0)
  return Math.max(1, Math.ceil((next.getTime() - nowMs) / 3_600_000))
}

/**
 * One reason the refresh button can be held back, in display priority
 * (规格 B12：多个原因同时成立只显示一条，额度 > 停止 > 冷却）。
 * @param {{ quotaLeft?: number, stoppedInSelection?: boolean, cooldownLeft?: number | null }} gate
 * @returns {{ kind: 'quota' | 'stopped' | 'cooldown' } | null}
 */
export function refreshGate(gate) {
  if (typeof gate?.quotaLeft === 'number' && gate.quotaLeft <= 0) return { kind: 'quota' }
  if (gate?.stoppedInSelection) return { kind: 'stopped' }
  const left = gate?.cooldownLeft
  if (typeof left === 'number' && left > 0) return { kind: 'cooldown' }
  return null
}

/**
 * @param {{
 *   t: (key: string) => string,
 *   quota: { left: number, total: number } | null,
 *   freshnessMinutes: number | null,
 * }} props
 */
export function RivalPoolStatusBar({ t, quota, freshnessMinutes }) {
  return (
    <div className="omnimux-rival-pool" data-rival-pool="true">
      <div className="omnimux-rival-pool-row is-meta">
        {quota ? (
          <span className="omnimux-rival-pool-quota">
            {t('rivalAccounts.pool.quota')
              .replace('{left}', String(quota.left))
              .replace('{total}', String(quota.total))}
          </span>
        ) : null}
        {typeof freshnessMinutes === 'number' && freshnessMinutes > 1 ? (
          <span className="omnimux-rival-pool-freshness">
            {t('rivalAccounts.pool.freshness').replace('{n}', String(freshnessMinutes))}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/**
 * R4「刷新」主按钮 + 额度角标 + D4 原因弹层。
 * @param {{
 *   t: (key: string) => string,
 *   gate: {{ quotaLeft?: number, stoppedInSelection?: boolean, cooldownLeft?: number | null }},
 *   quota: { left: number, total: number } | null,
 *   cooldownLeft: number | null,
 *   fresh: boolean,
 *   onRefresh: () => void,
 * }} props
 */
export function RivalRefreshButton(props) {
  const { t, gate, quota, cooldownLeft, fresh, onRefresh } = props
  const [reasonOpen, setReasonOpen] = useState(false)
  const wrapRef = useRef(null)

  const block = refreshGate(gate)
  const blocked = block !== null

  const close = useCallback(() => setReasonOpen(false), [])
  useEffect(() => {
    if (!reasonOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close()
    }
    const onPointerDown = (event) => {
      const root = wrapRef.current
      if (root && event.target instanceof root.ownerDocument.defaultView.Node
        && root.contains(event.target)) return
      close()
    }
    const doc = wrapRef.current?.ownerDocument ?? (typeof document !== 'undefined' ? document : null)
    if (!doc) return undefined
    doc.addEventListener('keydown', onKeyDown)
    doc.addEventListener('mousedown', onPointerDown)
    return () => {
      doc.removeEventListener('keydown', onKeyDown)
      doc.removeEventListener('mousedown', onPointerDown)
    }
  }, [close, reasonOpen])

  const reasonText = block?.kind === 'quota'
    ? t('rivalAccounts.refresh.quota').replace('{n}', String(hoursToMidnight()))
    : block?.kind === 'stopped'
      ? t('rivalAccounts.refresh.stopped')
      : block?.kind === 'cooldown'
        ? t('rivalAccounts.refresh.cooldown').replace('{n}', String(cooldownLeft ?? 1))
        : null

  const handleClick = () => {
    if (blocked) {
      setReasonOpen((previous) => !previous)
      return
    }
    onRefresh()
  }

  return (
    <span className="omnimux-rival-refresh-wrap" ref={wrapRef}>
      <Button
        variant="primary"
        size="sm"
        className={`omnimux-rival-refresh${blocked ? ' is-blocked' : ''}${fresh && !blocked ? ' is-fresh' : ''}`}
        aria-disabled={blocked ? 'true' : 'false'}
        onClick={handleClick}
      >
        {fresh ? t('rivalAccounts.refresh.fresh') : t('rivalAccounts.refresh.btn')}
        {quota ? (
          <span className="omnimux-rival-refresh-badge">
            {`${quota.left}/${quota.total}`}
          </span>
        ) : null}
      </Button>
      {reasonOpen && reasonText ? (
        <div className="omnimux-rival-reason" role="alert">
          {reasonText}
        </div>
      ) : null}
    </span>
  )
}
