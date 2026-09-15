import { useEffect } from 'react'
import { PageHeader } from 'dsh-ui-kit'
import { AccountsSection } from './AccountsSection.jsx'
import { injectAccountsStyles } from './styles.js'

const TAB_ID = 'omnimux-accounts:library'

/**
 * Accounts workbench tab component in dsh-better-sidebar.
 * @param {{
 *   t: (key: string) => string,
 *   stage?: { getSnapshot: () => boolean, subscribe: Function, set: Function },
 *   store?: { reduce?: Function, getSnapshot?: Function },
 *   visible?: boolean,
 * }} props
 */
export function AccountsStage({ t, stage, store, visible = true }) {
  useEffect(() => { injectAccountsStyles() }, [])
  const everOpened = true

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (!api || typeof api.attachStore !== 'function' || !store) return undefined
    api.attachStore(store)
    return () => { api.detachStore?.(store) }
  }, [store])

  const handleClose = () => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (api && typeof api.closeTab === 'function') {
      api.closeTab(TAB_ID)
    } else {
      stage?.set?.(false)
    }
  }

  return (
    <div
      role="region"
      aria-label={t('title')}
      aria-hidden={visible ? undefined : 'true'}
      className="omnimux-accounts-stage"
      data-visible={visible ? 'true' : 'false'}
      style={{
        display: visible ? 'flex' : 'none',
        position: 'relative',
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        onClose={handleClose}
        closeTitle={t('close')}
      />
      <div className="omnimux-accounts-stage-body omx-stage-scroll">
        <AccountsSection t={t} active={visible} />
      </div>
    </div>
  )
}
