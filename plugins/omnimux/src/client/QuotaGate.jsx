import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Button } from 'dsh-ui-kit'
import { ModalCloseButton } from './components/ModalCloseButton.jsx'
import { close, getSnapshot, openWallet, subscribe } from './quota-gate.js'
import { injectHubStyles } from './styles.js'

export function QuotaGate({ t }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  useEffect(() => { injectHubStyles() }, [])
  useEffect(() => {
    if (snapshot.phase !== 'open') return undefined
    const handler = (event) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [snapshot.phase])
  if (snapshot.phase !== 'open' || typeof document === 'undefined' || !document.body) return null
  return createPortal(
    <div className="omnimux-quota-gate-backdrop" onClick={close} data-omnimux-quota-gate="">
      <div className="omnimux-quota-gate-dialog" role="dialog" aria-modal="true" aria-labelledby="omnimux-quota-gate-title" onClick={(event) => event.stopPropagation()}>
        <ModalCloseButton
          placement="top-right"
          className="omnimux-quota-gate-close"
          ariaLabel={t('quota.gate.close')}
          title={t('quota.gate.close')}
          onClose={close}
        />
        <div className="omnimux-quota-gate-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6" />
            <path d="M12 16.5h.01" />
          </svg>
        </div>
        <h2 id="omnimux-quota-gate-title">{t('quota.gate.title')}</h2>
        <p>{t('quota.gate.description')}</p>
        <div className="omnimux-quota-gate-actions">
          <Button variant="primary" onClick={openWallet}>{t('quota.gate.topUp')}</Button>
          <Button variant="ghost" onClick={close}>{t('quota.gate.close')}</Button>
        </div>
      </div>
    </div>, document.body,
  )
}
