import { useEffect, useRef, useState } from 'react'
import { Button, ModalDialog } from 'dsh-ui-kit'
import { connectTikTokAccount, errorText, listHubAccounts } from './api.js'
import {
  ACCOUNT_PLATFORM,
  extractAccounts,
  findNewAccount,
  isNeedsLogin,
  pickAuthUrl,
  snapshotAccountIds,
} from './account-sidebar-view.js'
import { IconChevronOutline16, IconWarningOutline16 } from './icons/accounts.js'

/** 授权结果轮询间隔（ms）。 */
const AUTH_POLL_MS = 3000

/**
 * TikTok 授权确认弹窗，四个阶段：
 *  1. confirm  — VPN 节点警示横幅（可展开/收起详情）+ 取消 / 去授权；
 *  2. opening  — POST /omnimux/accounts 请求中；
 *  3. waiting  — 已 window.open(auth_url)（仅 https），提供「重新打开」与
 *     「我已完成」，同时每 3s 轮询账号列表检测新 id；
 *  4. error    — 非 2xx，可重试。
 * 401/needs-omnimux → 关闭弹窗并回调 onNeedLogin 走登录引导。
 * Esc 关闭；轮询定时器在关闭/完成/检测/卸载四条路径上全部清理。
 * @param {{
 *   t: (key: string, vars?: Record<string, unknown>) => string,
 *   baselineIds: Set<string>,
 *   onClose: () => void,
 *   onNeedLogin: () => void,
 *   onConnected: (row: Record<string, unknown> | null) => void,
 * }} props
 */
export function AuthorizeModal({ t, baselineIds, onClose, onNeedLogin, onConnected }) {
  const [phase, setPhase] = useState('confirm') // confirm | opening | waiting | error
  const [expanded, setExpanded] = useState(true)
  const [authUrl, setAuthUrl] = useState('')
  const [error, setError] = useState('')
  /** @type {import('react').MutableRefObject<(() => void) | null>} */
  const stopRef = useRef(null)
  const baselineRef = useRef(baselineIds instanceof Set ? baselineIds : new Set())

  /** 停止轮询（幂等）。 */
  function stopPoll() {
    const stop = stopRef.current
    stopRef.current = null
    if (stop) stop()
  }

  // 卸载兜底：任何退出路径之外的残留定时器都在此清理。
  useEffect(() => () => { stopPoll() }, [])

  /** 每个用户驱动的出口：先停轮询，再交还控制权。 */
  function handleClose() {
    stopPoll()
    onClose()
  }

  function handleNeedLogin() {
    stopPoll()
    onNeedLogin()
  }

  /** 启动 3s 轮询：检测到 baseline 之外的新账号即停并回调 onConnected。 */
  function startWatch() {
    stopPoll()
    let stopped = false
    /** @type {number | ReturnType<typeof setTimeout>} */
    let timer = 0

    const stop = () => {
      if (stopped) return
      stopped = true
      if (timer) {
        clearTimeout(timer)
        timer = 0
      }
      if (stopRef.current === stop) stopRef.current = null
    }
    stopRef.current = stop

    const poll = async () => {
      if (stopped) return
      try {
        const result = await listHubAccounts({ platform: ACCOUNT_PLATFORM })
        if (stopped) return
        if (result.ok) {
          const fresh = findNewAccount(baselineRef.current, extractAccounts(result.body))
          if (fresh !== null) {
            stop()
            onConnected(fresh)
            return
          }
        }
      } catch {
        // 瞬时网络失败 —— 持续轮询直至被停止
      }
      if (!stopped) timer = setTimeout(() => { void poll() }, AUTH_POLL_MS)
    }

    timer = setTimeout(() => { void poll() }, AUTH_POLL_MS)
  }

  /** 去授权：POST connect → 校验 https auth_url → 新窗口打开 → 进入等待态。 */
  async function startAuthorize() {
    setPhase('opening')
    setError('')
    setAuthUrl('')
    try {
      const result = await connectTikTokAccount()
      if (isNeedsLogin(result)) {
        handleNeedLogin()
        return
      }
      if (!result.ok) {
        setError(errorText(result.body, result.status))
        setPhase('error')
        return
      }
      const url = pickAuthUrl(result.body)
      if (url === '') {
        setError(errorText(result.body, result.status))
        setPhase('error')
        return
      }
      setAuthUrl(url)
      window.open(url, '_blank', 'noopener,noreferrer')
      setPhase('waiting')
      startWatch()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPhase('error')
    }
  }

  /** 我已完成：停轮询并交由父级刷新列表后关闭。 */
  function handleDone() {
    stopPoll()
    onConnected(null)
  }

  const warnBanner = (
    <div className="omnimux-publish-accounts-warn">
      <button /* exempt-ui01: 折叠提示面板手风琴头部 */
        type="button"
        className="omnimux-publish-accounts-warn-head"
        aria-expanded={expanded}
        onClick={() => { setExpanded((prev) => !prev) }}
      >
        <span className="omnimux-publish-accounts-warn-icon"><IconWarningOutline16 /></span>
        <span className="omnimux-publish-accounts-warn-title">{t('auth.warnTitle')}</span>
        <span className="omnimux-publish-accounts-warn-chevron">
          <IconChevronOutline16 direction={expanded ? 'up' : 'down'} />
        </span>
      </button>
      {expanded ? (
        <div className="omnimux-publish-accounts-warn-detail">{t('auth.warnDetail')}</div>
      ) : null}
    </div>
  )

  const footer = phase === 'confirm' || phase === 'opening'
    ? (
      <>
        <Button variant="outline" onClick={handleClose} disabled={phase === 'opening'}>
          {t('auth.cancel')}
        </Button>
        <Button variant="primary" loading={phase === 'opening'} onClick={() => { void startAuthorize() }}>
          {t('auth.go')}
        </Button>
      </>
    )
    : phase === 'waiting'
      ? (
        <>
          <Button variant="outline" onClick={handleClose}>{t('auth.cancel')}</Button>
          <Button variant="primary" onClick={handleDone}>{t('auth.done')}</Button>
        </>
      )
      : (
        <>
          <Button variant="outline" onClick={handleClose}>{t('auth.cancel')}</Button>
          <Button variant="primary" onClick={() => { void startAuthorize() }}>{t('auth.retry')}</Button>
        </>
      )

  return (
    <ModalDialog
      open
      onClose={handleClose}
      title={t('auth.title')}
      closeLabel={t('close')}
      size="md"
      footer={footer}
    >
      {phase === 'confirm' || phase === 'opening' ? warnBanner : null}

      {phase === 'opening' ? (
        <p className="omnimux-publish-accounts-modal-hint">{t('auth.opening')}</p>
      ) : null}

      {phase === 'waiting' ? (
        <>
          {warnBanner}
          <p className="omnimux-publish-accounts-modal-note">{t('auth.opened')}</p>
          <div>
            <Button
              variant="ghost"
              onClick={() => { window.open(authUrl, '_blank', 'noopener,noreferrer') }}
            >
              {t('auth.reopen')}
            </Button>
          </div>
          <p className="omnimux-publish-accounts-modal-hint">{t('auth.waiting')}</p>
        </>
      ) : null}

      {phase === 'error' ? (
        <p className="omnimux-publish-accounts-modal-error" role="alert">
          {t('auth.failed')}{error !== '' ? `：${error}` : ''}
        </p>
      ) : null}
    </ModalDialog>
  )
}

/**
 * 便捷重导出：父级拿当前列表生成轮询 baseline。
 * @param {Array<Record<string, unknown>>} rows
 * @returns {Set<string>}
 */
export function authorizeBaseline(rows) {
  return snapshotAccountIds(rows)
}
