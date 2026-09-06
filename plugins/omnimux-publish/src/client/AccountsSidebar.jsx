import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, ConfirmModal, IconButton } from 'dsh-ui-kit'
import { IconEllipsisOutline16, IconPlusOutline16, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  disconnectHubAccount,
  errorText,
  listHubAccounts,
} from './api.js'
import {
  ACCOUNT_PLATFORM,
  accountDisplayName,
  accountHandle,
  accountStatusTone,
  extractAccounts,
  filterAccounts,
  isNeedsLogin,
} from './account-sidebar-view.js'
import { AuthorizeModal, authorizeBaseline } from './AuthorizeModal.jsx'
import { createDisconnectController } from './disconnect-controller.js'
import {
  IconSearchOutline16,
  IconUserOutline16,
} from './icons/accounts.js'

/**
 * 账号行状态文案：优先已知状态映射，未知值原样透传，空值回退「已连接」。
 * @param {(key: string) => string} t
 * @param {Record<string, unknown>} row
 */
function statusLabel(t, row) {
  const status = String(row?.status ?? '').trim().toLowerCase()
  if (status === 'connected' || status === 'active' || status === 'ok') return t('acct.status.connected')
  if (status === 'expired') return t('acct.status.expired')
  if (status === 'error' || status === 'failed' || status === 'revoked') return t('acct.status.error')
  if (status !== '') return status
  return t('acct.status.connected')
}

/**
 * 单个账号行：头像（hub 同源重写 avatar_url，缺失/加载失败退 SVG 占位）
 * + 显示名 + @username + 状态 pill（agent_usable=false 另置灰标注）。
 * @param {{
 *   t: (key: string, vars?: Record<string, unknown>) => string,
 *   row: Record<string, unknown>,
 *   onDisconnect: (row: Record<string, unknown>) => void,
 * }} props
 */
function AccountItem({ t, row, onDisconnect }) {
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [anchorEl, setAnchorEl] = useState(null)
  const avatarUrl = typeof row.avatar_url === 'string' ? row.avatar_url : ''
  const tone = row.agent_usable === false ? 'muted' : accountStatusTone(row)
  const name = accountDisplayName(row)
  const handle = accountHandle(row)
  const accountId = String(row.id ?? '')

  const handleMenuToggle = (event) => {
    event.stopPropagation()
    setAnchorEl(event.currentTarget)
    setMenuOpen((open) => !open)
  }

  const handleMenuClose = (event) => {
    event?.stopPropagation?.()
    setMenuOpen(false)
  }

  const handleDisconnect = () => {
    setMenuOpen(false)
    onDisconnect(row)
  }

  return (
    <div className="omnimux-publish-accounts-item">
      <span className="omnimux-publish-accounts-avatar">
        {avatarUrl !== '' && !avatarFailed ? (
          <img
            className="omnimux-publish-accounts-avatar-img"
            src={avatarUrl}
            alt=""
            loading="lazy"
            onError={() => { setAvatarFailed(true) }}
          />
        ) : (
          <IconUserOutline16 size={18} />
        )}
      </span>
      <span className="omnimux-publish-accounts-item-main">
        <span className="omnimux-publish-accounts-item-name">{name}</span>
        {handle !== '' ? (
          <span className="omnimux-publish-accounts-item-handle">{handle}</span>
        ) : null}
      </span>
      <span className={`omnimux-publish-accounts-item-status ${tone}`}>
        {row.agent_usable === false ? t('acct.agentOff') : statusLabel(t, row)}
      </span>
      <div className="omnimux-publish-accounts-item-menu" onClick={(event) => event.stopPropagation()}>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t('acct.more', { name })}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={handleMenuToggle}
        >
          <IconEllipsisOutline16 />
        </IconButton>
        {menuOpen && anchorEl ? (
          <Menu
            open={menuOpen}
            portal
            anchor={null}
            getAnchorRect={() => anchorEl.getBoundingClientRect()}
            align="end"
            dense
            items={[{
              id: `disconnect-${accountId}`,
              label: t('acct.disconnect'),
              danger: true,
            }]}
            onSelect={() => { handleDisconnect() }}
            onClose={handleMenuClose}
          />
        ) : null}
      </div>
    </div>
  )
}

/**
 * 空态：暂无授权账号 + 新增账号主按钮。
 * @param {{
 *   t: (key: string) => string,
 *   onAdd: () => void,
 * }} props
 */
function EmptyState({ t, onAdd }) {
  return (
    <div className="omnimux-publish-accounts-empty">
      <div className="omnimux-publish-accounts-empty-title">{t('acct.empty')}</div>
      <Button
        variant="primary"
        size="default"
        leadingIcon={<IconPlusOutline16 />}
        onClick={onAdd}
      >
        {t('acct.add')}
      </Button>
    </div>
  )
}

/**
 * 发布 Stage 内「账号」侧栏视图：左侧 336px 账号列表面板（头部 + 新增 +
 * 搜索 + 账号行 / 空态 / 登录引导态），右侧说明留白区。
 * 数据源：GET /omnimux/accounts?platform=tiktok（hub 权威 ViewRow 合并，
 * 本插件不自建账号路由）。「新增账号」弹 AuthorizeModal 走官方授权。
 * @param {{
 *   t: (key: string, vars?: Record<string, unknown>) => string,
 * }} props
 */
export function AccountsSidebar({ t }) {
  const [phase, setPhase] = useState('loading') // loading | ready | need-login
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingDisconnect, setPendingDisconnect] = useState(null)
  const [disconnectingId, setDisconnectingId] = useState('')
  const [disconnectError, setDisconnectError] = useState('')
  const mountedRef = useRef(true)
  const disconnectControllerRef = useRef(null)

  const loadAccounts = useCallback(() => {
    return listHubAccounts({ platform: ACCOUNT_PLATFORM }).then((result) => {
      if (!mountedRef.current) return true
      if (isNeedsLogin(result)) {
        setPhase('need-login')
        setRows([])
        return true
      }
      if (!result.ok) {
        setPhase('ready')
        setError(errorText(result.body, result.status))
        return true
      }
      setPhase('ready')
      setError('')
      setRows(extractAccounts(result.body))
      return true
    }).catch((caught) => {
      if (mountedRef.current) {
        setPhase('ready')
        setError(caught instanceof Error ? caught.message : String(caught))
      }
      return true
    })
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void loadAccounts()
    return () => { mountedRef.current = false }
  }, [loadAccounts])

  const filtered = filterAccounts(rows, query)

  /** 授权完成（检测到新账号或用户点「我已完成」）：关弹窗并刷新列表。 */
  const handleConnected = useCallback(() => {
    setModalOpen(false)
    void loadAccounts()
  }, [loadAccounts])

  /** 授权流程遇 401：关弹窗，整体进入登录引导态。 */
  const handleNeedLogin = useCallback(() => {
    setModalOpen(false)
    setPhase('need-login')
  }, [])

  /** 仅打开确认框；取消/关闭不会发送 DELETE。 */
  const handleDisconnectRequest = useCallback((row) => {
    setDisconnectError('')
    setPendingDisconnect(row)
  }, [])

  const handleDisconnectClose = useCallback(() => {
    if (disconnectingId !== '') return
    setPendingDisconnect(null)
    setDisconnectError('')
  }, [disconnectingId])

  /**
   * Host 以 id 精确定位账号。控制器在 React state 生效前同步加锁；失败时不改
   * rows，让用户看到可重试的同一确认框，卸载后的迟到结果不再更新组件状态。
   */
  const handleDisconnectConfirm = useCallback(() => {
    const accountId = pendingDisconnect?.id
    if (disconnectControllerRef.current === null) {
      disconnectControllerRef.current = createDisconnectController({
        disconnect: disconnectHubAccount,
        reload: loadAccounts,
        isMounted: () => mountedRef.current,
        isNeedsLogin,
        errorText,
        onStart: (id) => {
          setDisconnectingId(id)
          setDisconnectError('')
        },
        onFailure: setDisconnectError,
        onNeedLogin: () => {
          setPendingDisconnect(null)
          setPhase('need-login')
        },
        onSuccess: () => { setPendingDisconnect(null) },
        onFinally: () => { setDisconnectingId('') },
      })
    }
    void disconnectControllerRef.current.confirm(accountId)
  }, [loadAccounts, pendingDisconnect])

  const pendingDisconnectName = accountDisplayName(pendingDisconnect ?? {})
  const pendingDisconnectId = String(pendingDisconnect?.id ?? '')
  const disconnecting = pendingDisconnectId !== '' && disconnectingId === pendingDisconnectId

  return (
    <div className="omnimux-publish-accounts-view">
      <aside className="omnimux-publish-accounts-sidebar">
        <div className="omnimux-publish-accounts-head">
          <span className="omnimux-publish-accounts-head-title">{t('acct.title')}</span>
        </div>

        {phase === 'need-login' ? (
          <>
            <div className="omnimux-publish-accounts-note">{t('acct.needLogin')}</div>
            <div className="omnimux-publish-accounts-note">{t('acct.needLogin.hint')}</div>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              size="default"
              className="omnimux-publish-accounts-add"
              leadingIcon={<IconPlusOutline16 />}
              onClick={() => { setModalOpen(true) }}
            >
              {t('acct.add')}
            </Button>

            <div className="omnimux-publish-accounts-search">
              <span className="omnimux-publish-accounts-search-icon"><IconSearchOutline16 /></span>
              <input
                type="search"
                className="omnimux-publish-accounts-search-input"
                placeholder={t('acct.searchPlaceholder')}
                value={query}
                onChange={(event) => { setQuery(event.currentTarget.value) }}
              />
            </div>

            {phase === 'loading' ? (
              <div className="omnimux-publish-accounts-note">{t('acct.loading')}</div>
            ) : null}

            {error !== '' ? (
              <div role="alert" className="omnimux-publish-accounts-error">
                {t('acct.loadFailed', { reason: error })}
              </div>
            ) : null}

            {phase === 'ready' && error === '' ? (
              rows.length === 0 ? (
                <EmptyState t={t} onAdd={() => { setModalOpen(true) }} />
              ) : filtered.length === 0 ? (
                <div className="omnimux-publish-accounts-note">{t('acct.noMatches')}</div>
              ) : (
                <div className="omnimux-publish-accounts-items">
                  {filtered.map((row) => (
                    <AccountItem
                      key={String(row.id)}
                      t={t}
                      row={row}
                      onDisconnect={handleDisconnectRequest}
                    />
                  ))}
                </div>
              )
            ) : null}
          </>
        )}
      </aside>

      <section className="omnimux-publish-accounts-panel">
        <div className="omnimux-publish-accounts-panel-title">{t('acct.panel.title')}</div>
        <div className="omnimux-publish-accounts-panel-body">{t('acct.panel.body')}</div>
      </section>

      {modalOpen ? (
        <AuthorizeModal
          t={t}
          baselineIds={authorizeBaseline(rows)}
          onClose={() => { setModalOpen(false) }}
          onNeedLogin={handleNeedLogin}
          onConnected={handleConnected}
        />
      ) : null}
      <ConfirmModal
        open={pendingDisconnect !== null}
        title={t('acct.disconnectTitle')}
        confirmLabel={disconnectError === '' ? t('acct.disconnect') : t('acct.retry')}
        cancelLabel={t('auth.cancel')}
        closeLabel={t('close')}
        confirmVariant="danger"
        confirmLoading={disconnecting}
        onConfirm={() => { void handleDisconnectConfirm() }}
        onClose={handleDisconnectClose}
      >
        <p>{t('acct.disconnectConfirm', { name: pendingDisconnectName })}</p>
        {disconnectError !== '' ? (
          <p className="omnimux-publish-accounts-modal-error" role="alert">
            {t('acct.disconnectFailed', { reason: disconnectError })}
          </p>
        ) : null}
      </ConfirmModal>
    </div>
  )
}
