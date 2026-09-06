import { useEffect, useState } from 'react'
import { Button } from 'dsh-ui-kit'
import { listHubAccounts } from './api.js'
import { groupAccountsByPlatform } from './capabilities.js'

/**
 * M5 账号选择面板：平台 → 账号两级勾选（发布页左侧）。
 * 数据源：浏览器直 fetch hub GET /omnimux/accounts（hub 权威 ViewRow 合并，
 * 本插件不自建账号路由）。不可用账号（status 异常 / agent_usable=false）置灰
 * 并注明原因；底部「已选 N 个账号」。
 * @param {{
 *   t: (key: string, vars?: Record<string, unknown>) => string,
 *   selectedIds: string[],
 *   onChange: (accountIds: string[], selectedRows: Array<Record<string, unknown>>) => void,
 * }} props
 */
export function AccountPanel({ t, selectedIds, onChange }) {
  const [phase, setPhase] = useState('loading')
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let disposed = false
    listHubAccounts().then((result) => {
      if (disposed) return
      if (result.ok && result.body && Array.isArray(result.body.accounts)) {
        setRows(result.body.accounts)
        setPhase('ready')
        setError('')
        return
      }
      // hub 账号面未登录（401/403）→ 明确报因，不静默
      if (result.status === 401 || result.status === 403 || /needs-omnimux/.test(String(result.body?.error || ''))) {
        setPhase('need-login')
        return
      }
      setPhase('ready')
      setError(String(result.body?.error || `HTTP ${result.status}`))
    }).catch((caught) => {
      if (disposed) return
      setPhase('ready')
      setError(caught instanceof Error ? caught.message : String(caught))
    })
    return () => { disposed = true }
  }, [])

  const groups = groupAccountsByPlatform(rows)
  const selected = new Set(selectedIds)
  const currentIds = new Set(rows.map((row) => String(row.id)))
  const missingSelection = selectedIds.some((id) => !currentIds.has(id))
  const validSelectedIds = selectedIds.filter((id) => currentIds.has(id))

  /**
   * @param {string} id
   * @param {boolean} checked
   */
  const toggleAccount = (id, checked) => {
    const next = new Set(selected)
    if (checked) next.add(id)
    else next.delete(id)
    const selectedRows = rows.filter((row) => next.has(String(row.id)))
    onChange([...next], selectedRows)
  }

  /**
   * 平台级勾选：只作用于此平台所有可用账号（不可用行保持不可选）。
   * @param {string} platform
   * @param {boolean} checked
   */
  const togglePlatform = (platform, checked) => {
    const group = groups.find((g) => g.platform === platform)
    if (!group) return
    const next = new Set(selected)
    for (const account of group.accounts) {
      const id = String(account.id)
      if (checked && account.usable) next.add(id)
      else if (!checked) next.delete(id)
    }
    const selectedRows = rows.filter((row) => next.has(String(row.id)))
    onChange([...next], selectedRows)
  }

  if (phase === 'loading') {
    return (
      <aside className="omnimux-publish-accounts">
        <div className="omnimux-publish-accounts-title">{t('accounts.title')}</div>
        <div className="omnimux-publish-accounts-muted">{t('accounts.loading')}</div>
      </aside>
    )
  }

  if (phase === 'need-login') {
    return (
      <aside className="omnimux-publish-accounts">
        <div className="omnimux-publish-accounts-title">{t('accounts.title')}</div>
        <div className="omnimux-publish-accounts-stack">
          <div>{t('accounts.needLogin')}</div>
          <div className="omnimux-publish-accounts-muted">{t('accounts.needLogin.hint')}</div>
        </div>
      </aside>
    )
  }

  return (
    <aside className="omnimux-publish-accounts">
      <div className="omnimux-publish-accounts-title">{t('accounts.title')}</div>
      {error ? <div role="alert" className="omnimux-publish-accounts-alert">{error}</div> : null}
      {!error && missingSelection ? (
        <div role="alert" className="omnimux-publish-accounts-alert">
          <p>{t('accounts.sourceMismatch')}</p>
          <Button variant="outline" size="sm" onClick={() => { onChange(validSelectedIds, rows.filter((row) => selected.has(String(row.id)))) }}>
            {t('accounts.clearInvalid')}
          </Button>
        </div>
      ) : null}
      {!error && groups.length === 0 ? (
        <div className="omnimux-publish-accounts-stack">
          <div>{t('accounts.empty')}</div>
          <div className="omnimux-publish-accounts-muted">{t('accounts.empty.hint')}</div>
        </div>
      ) : (
        <div className="omnimux-publish-accounts-groups">
          {groups.map((group) => {
            const usableIds = group.accounts.filter((a) => a.usable).map((a) => String(a.id))
            const allChecked = usableIds.length > 0 && usableIds.every((id) => selected.has(id))
            const someChecked = usableIds.some((id) => selected.has(id))
            const platformLabel = t(`platform.${group.platform}`) !== `platform.${group.platform}`
              ? t(`platform.${group.platform}`)
              : group.platform
            return (
              <div key={group.platform}>
                <label className="omnimux-publish-accounts-group-label">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(node) => { if (node) node.indeterminate = !allChecked && someChecked }}
                    onChange={(event) => { togglePlatform(group.platform, event.currentTarget.checked) }}
                  />
                  <span className="omnimux-publish-accounts-platform">{platformLabel}</span>
                </label>
                <div className="omnimux-publish-accounts-list">
                  {group.accounts.map((account) => (
                    <AccountRow
                      key={String(account.id)}
                      t={t}
                      account={account}
                      checked={selected.has(String(account.id))}
                      onToggle={(checked) => { toggleAccount(String(account.id), checked) }}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="omnimux-publish-accounts-foot">
        {t('accounts.selected', { count: validSelectedIds.length })}
      </div>
    </aside>
  )
}

/**
 * @param {{
 *   t: (key: string, vars?: Record<string, unknown>) => string,
 *   account: Record<string, unknown> & { usable: boolean, unusableReason: 'expired' | 'error' | 'agentOff' | '' },
 *   checked: boolean,
 *   onToggle: (checked: boolean) => void,
 * }} props
 */
function AccountRow({ t, account, checked, onToggle }) {
  const name = String(account.display_name || account.username || account.name || account.id)
  const rowClass = account.usable
    ? 'omnimux-publish-accounts-row'
    : 'omnimux-publish-accounts-row is-disabled'
  return (
    <label className={rowClass}>
      <input
        type="checkbox"
        checked={checked}
        disabled={!account.usable}
        onChange={(event) => { onToggle(event.currentTarget.checked) }}
      />
      <span className="omnimux-publish-accounts-name">{name}</span>
      {account.usable ? null : (
        <span className="omnimux-publish-accounts-unavail">
          {t('accounts.unavailable', { reason: t(`accounts.reason.${account.unusableReason}`) })}
        </span>
      )}
    </label>
  )
}
