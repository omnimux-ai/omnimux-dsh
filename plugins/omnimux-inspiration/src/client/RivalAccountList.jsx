/**
 * Left column of the rival workbench: the account cards and the column's own
 * action.
 *
 * The account search and the platform filter are not here — they are the shell's
 * filter row, the one every tab shares, so this column holds only what is scoped
 * to the accounts in it: refreshing all of them, and the empty state whose
 * account-specific import is the useful next step while there is no list yet.
 *
 * Presentational only — every action is a callback, so the panel above owns the
 * state and the network. `dsh-ui-kit` supplies the controls (UI01 forbids native
 * `<button>`/`<select>`), and the platform mark is inline SVG (UI04 forbids
 * emoji glyphs).
 */

import { Button } from 'dsh-ui-kit'
import { toAccountView } from './rival-format.js'

/** Small platform glyph, drawn rather than typed (no emoji, no icon font). */
export function PlatformMark({ platform }) {
  const paths = {
    tiktok: 'M8 3v7.2a3 3 0 1 0 2.4 2.95V6.6a4.6 4.6 0 0 0 3 1.1V4.9A3.6 3.6 0 0 1 10.4 3H8Z',
    instagram: 'M5.5 2h5A3.5 3.5 0 0 1 14 5.5v5A3.5 3.5 0 0 1 10.5 14h-5A3.5 3.5 0 0 1 2 10.5v-5A3.5 3.5 0 0 1 5.5 2Zm2.5 3.4A2.6 2.6 0 1 0 10.6 8 2.6 2.6 0 0 0 8 5.4Zm3.6-.9a.7.7 0 1 0 .7.7.7.7 0 0 0-.7-.7Z',
    youtube: 'M2.4 5.6A2 2 0 0 1 4.2 4c2.4-.2 5.2-.2 7.6 0a2 2 0 0 1 1.8 1.6 18 18 0 0 1 0 4.8A2 2 0 0 1 11.8 12c-2.4.2-5.2.2-7.6 0a2 2 0 0 1-1.8-1.6 18 18 0 0 1 0-4.8ZM6.8 6.2v3.6L9.9 8 6.8 6.2Z',
    x: 'M3 2.6h3.3l2.6 3.5 3-3.5H14l-4.3 5 4.6 6.2h-3.3L8.2 10l-3.3 3.8H2.7l4.6-5.2L3 2.6Z',
  }
  const d = paths[platform] || paths.x
  return (
    <svg className="omnimux-rival-platform-mark" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  )
}

/**
 * @param {{
 *   account: Record<string, any>,
 *   t: (key: string) => string,
 *   active: boolean,
 *   onSelect: (id: string) => void,
 * }} props
 */
function AccountCard({ account, t, active, onSelect }) {
  const view = toAccountView(account)
  const hasError = view.errorCode && view.errorCode !== 'identity-unverified'
  return (
    <div
      className={`omnimux-rival-account-card${active ? ' is-active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(view.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect(view.id)
      }}
      aria-label={view.displayName}
      data-account-id={view.id}
    >
      <div className="omnimux-rival-account-head">
        <span className="omnimux-rival-account-avatar" aria-hidden="true">
          {view.handle ? view.handle.replace(/^@/, '').slice(0, 1).toUpperCase() : ''}
        </span>
        <div className="omnimux-rival-account-titles">
          <span className="omnimux-rival-account-name">{view.displayName}</span>
          <span className="omnimux-rival-account-meta">
            <PlatformMark platform={view.platform} />
            <span className="omnimux-rival-account-handle">{view.handle}</span>
          </span>
        </div>
      </div>
      <div className="omnimux-rival-account-stats">
        <span>{view.followersText}</span>
        <span className="omnimux-rival-account-state" data-state={account.refresh_state}>
          {t(view.stateKey)}
        </span>
      </div>
      <div className="omnimux-rival-account-foot">
        <span>{view.updatedText}</span>
        {view.potentialCount > 0 ? (
          <span className="omnimux-rival-account-potential">
            {t('rivalAccounts.potential.flagged')} {view.potentialCount}
          </span>
        ) : null}
      </div>
      {view.tags.length > 0 ? (
        <div className="omnimux-rival-account-tags">
          {view.tags.map((tag) => (
            <span key={tag} className="omnimux-rival-tag">{tag}</span>
          ))}
        </div>
      ) : null}
      {view.identityHintKey ? (
        <p className="omnimux-rival-account-hint">{t(view.identityHintKey)}</p>
      ) : null}
      {hasError && view.errorMessage ? (
        <p className="omnimux-rival-account-error">{view.errorMessage}</p>
      ) : null}
    </div>
  )
}

/**
 * @param {{
 *   accounts: Array<Record<string, any>>,
 *   selectedId: string | null,
 *   t: (key: string) => string,
 *   onSelect: (id: string) => void,
 *   onImport: () => void,
 *   onRefreshAll: () => void,
 *   onRemove: (id: string) => void,
 *   refreshing: boolean,
 *   paused: { global: boolean, reason: string | null },
 * }} props
 */
export function RivalAccountList(props) {
  const {
    accounts, selectedId, t, onSelect, onImport, onRefreshAll, onRemove,
    refreshing, paused,
  } = props

  return (
    <div className="omnimux-rival-left">
      <div className="omnimux-rival-column-actions">
        <Button variant="outline" size="sm" disabled={refreshing} onClick={onRefreshAll}>
          {refreshing ? t('rivalAccounts.refresh.running') : t('rivalAccounts.refresh.all')}
        </Button>
      </div>
      {paused.global ? (
        <div className="omnimux-rival-banner" role="status">
          {t('rivalAccounts.refresh.budgetPaused')}
        </div>
      ) : null}
      {accounts.length === 0 ? (
        <div className="omnimux-rival-empty">
          <p className="omnimux-rival-empty-title">{t('rivalAccounts.empty.title')}</p>
          <p className="omnimux-rival-empty-text">{t('rivalAccounts.empty.description')}</p>
          <Button variant="primary" size="sm" className="omnimux-rival-empty-cta" onClick={onImport}>
            {t('rivalAccounts.import.btn')}
          </Button>
        </div>
      ) : (
        <div className="omnimux-rival-account-list">
          {accounts.map((account) => (
            <div key={account.id} className="omnimux-rival-account-row">
              <AccountCard
                account={account}
                t={t}
                active={account.id === selectedId}
                onSelect={onSelect}
              />
              <div className="omnimux-rival-account-actions">
                <Button variant="ghost" size="sm" onClick={() => onRemove(account.id)}>
                  {t('rivalAccounts.account.remove')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
