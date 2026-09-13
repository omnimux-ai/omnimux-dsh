import { useEffect, useRef, useState } from 'react'
import { Button, ModalDialog } from 'dsh-ui-kit'
import { connectAccount } from './api.js'
import { ArrowRightIcon, PlatformBrandIcon, ShieldCheckIcon } from './icons.jsx'
import { COMING_PLATFORMS, SUPPORTED_PLATFORMS } from './platforms.js'
import { localeText } from './view.js'

/**
 * Connect dialog, two phases:
 *  1. platform picker — supported platforms are large clickable buttons,
 *     coming platforms render disabled with an "即将支持" badge;
 *  2. waiting — the site OAuth page has been opened (auth_url), with a
 *     reopen fallback (https only), an "I'm done" button, and the
 *     watchConnect poll running until a new account appears.
 * Esc closes; the first supported platform gets focus on open; the poll
 * timer is stopped on every exit path (user close, done, detection,
 * unmount) — see use-accounts.watchConnect.
 * @param {{
 *   t: (key: string) => string,
 *   watchConnect: (platform: string, onChange: (row: Record<string, unknown> | null) => void) => () => void,
 *   onClose: () => void,
 *   onConnected: (row: Record<string, unknown> | null) => void,
 * }} props
 */
export function ConnectModal({ t, watchConnect, onClose, onConnected }) {
  const [phase, setPhase] = useState('select') // select | opening | waiting | error
  const [platform, setPlatform] = useState('')
  const [authUrl, setAuthUrl] = useState('')
  const [error, setError] = useState('')
  const firstPlatformRef = useRef(null)
  /** @type {import('react').MutableRefObject<(() => void) | null>} */
  const stopRef = useRef(null)

  useEffect(() => {
    firstPlatformRef.current?.focus()
  }, [])

  useEffect(() => () => {
    const stop = stopRef.current
    stopRef.current = null
    if (stop) stop()
  }, [])

  /** Every user-driven exit: stop the poll, hand refresh back to the owner. */
  function handleClose() {
    const stop = stopRef.current
    stopRef.current = null
    if (stop) stop()
    onClose()
  }

  /**
   * @param {string} id
   */
  async function startConnect(id) {
    setPlatform(id)
    setPhase('opening')
    setError('')
    setAuthUrl('')
    try {
      const result = await connectAccount(id)
      if (result.status === 401) {
        handleClose()
        return
      }
      if (!result.ok) {
        setError(String((result.body && typeof result.body === 'object' && result.body.error) || `HTTP ${String(result.status)}`))
        setPhase('error')
        return
      }
      const body = result.body && typeof result.body === 'object' ? /** @type {Record<string, unknown>} */ (result.body) : {}
      const url = typeof body.auth_url === 'string' && /^https:\/\//i.test(body.auth_url) ? body.auth_url : ''
      setAuthUrl(url)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      setPhase('waiting')
      stopRef.current = watchConnect(id, (row) => {
        stopRef.current = null
        onConnected(row)
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPhase('error')
    }
  }

  const footer = phase === 'waiting'
    ? (
      <>
        <Button variant="outline" onClick={handleClose}>{t('action.cancel')}</Button>
        <Button variant="primary" onClick={handleClose}>{t('connect.done')}</Button>
      </>
    )
    : phase === 'error'
      ? (
        <>
          <Button variant="outline" onClick={handleClose}>{t('action.cancel')}</Button>
          {platform !== '' ? (
            <Button variant="primary" onClick={() => { void startConnect(platform) }}>
              {t('connect.retry')}
            </Button>
          ) : null}
        </>
      )
      : undefined

  return (
    <ModalDialog
      open
      onClose={handleClose}
      title={t('connect.title')}
      closeLabel={t('close')}
      size="lg"
      footer={footer}
    >
      {phase === 'select' || phase === 'opening' ? (
        <div className="omnimux-accounts-modal-body">
          <p className="omnimux-accounts-modal-subtitle">
            {localeText(t, 'connect.subtitle', t('connect.choosePlatform'))}
          </p>
          <div className="omnimux-accounts-platform-grid">
            {SUPPORTED_PLATFORMS.map((id, index) => (
              <Button
                key={id}
                ref={index === 0 ? firstPlatformRef : undefined}
                className="omnimux-accounts-platform-btn"
                disabled={phase === 'opening'}
                onClick={() => { void startConnect(id) }}
              >
                <div className={`omnimux-accounts-brand-icon omnimux-accounts-brand-icon--${id}`}>
                  <PlatformBrandIcon platform={id} size={22} />
                </div>
                <div className="omnimux-accounts-platform-info">
                  <div className="omnimux-accounts-platform-name-row">
                    <span className="omnimux-accounts-platform-name">
                      {localeText(t, `platform.${id}`, id)}
                    </span>
                  </div>
                  <span className="omnimux-accounts-platform-desc">
                    {localeText(t, `platform.desc.${id}`, '')}
                  </span>
                </div>
                <div className="omnimux-accounts-platform-action" aria-hidden="true">
                  <ArrowRightIcon size={14} />
                </div>
              </Button>
            ))}
            {COMING_PLATFORMS.map((id) => (
              <div key={id} className="omnimux-accounts-platform-btn omnimux-accounts-platform-btn--coming">
                <div className={`omnimux-accounts-brand-icon omnimux-accounts-brand-icon--${id}`}>
                  <PlatformBrandIcon platform={id} size={22} />
                </div>
                <div className="omnimux-accounts-platform-info">
                  <div className="omnimux-accounts-platform-name-row">
                    <span className="omnimux-accounts-platform-name">
                      {localeText(t, `platform.${id}`, id)}
                    </span>
                    <span className="omnimux-accounts-platform-soon">{t('connect.comingSoon')}</span>
                  </div>
                  <span className="omnimux-accounts-platform-desc">
                    {localeText(t, `platform.desc.${id}`, '')}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="omnimux-accounts-modal-security">
            <ShieldCheckIcon size={14} className="omnimux-accounts-security-icon" />
            <span>{t('connect.securityTip')}</span>
          </div>
        </div>
      ) : null}

      {phase === 'waiting' ? (
        <div className="omnimux-accounts-modal-body">
          <p className="omnimux-accounts-modal-text">{t('connect.opened')}</p>
          {authUrl !== '' ? (
            <Button
              variant="ghost"
              className="omnimux-accounts-modal-link"
              onClick={() => { window.open(authUrl, '_blank', 'noopener,noreferrer') }}
            >
              {t('connect.reopen')}
            </Button>
          ) : null}
          <p className="omnimux-accounts-muted">{t('connect.waiting')}</p>
        </div>
      ) : null}

      {phase === 'error' ? (
        <p className="omnimux-accounts-error" role="alert">
          {t('connect.failed')}{error !== '' ? `：${error}` : ''}
        </p>
      ) : null}
    </ModalDialog>
  )
}
