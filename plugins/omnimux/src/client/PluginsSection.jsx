import { useEffect, useMemo, useState } from 'react'
import { Button, ConfirmModal, IconButton, IconEllipsisOutline16, SearchField } from 'dsh-ui-kit'
import { getApps, installApp, uninstallApp } from './api.js'
import { canOpen, hasOverflowMenu, primaryActionFor } from './app-actions.js'
import { attemptOpen, notifyTabsChanged } from './open-app-flow.js'
import { useOmnimuxAuth } from './use-omnimux-auth.js'
import { AppMark, PluginLoginPanel, desktopBridge, fmt, matches } from './plugin-helpers.jsx'
import { injectHubStyles } from './styles.js'

/**
 * @param {{ t: (key: string) => string }} props
 */
export function PluginsSection({ t }) {
  useEffect(() => { injectHubStyles() }, [])
  const [view, setView] = useState(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [pendingRestart, setPendingRestart] = useState(false)
  const [popover, setPopover] = useState(null)
  const [gate, setGate] = useState(null)
  const [notice, setNotice] = useState('')
  const auth = useOmnimuxAuth()

  const applyView = (body) => {
    setView(body && typeof body === 'object' ? body : null)
    if (body && typeof body.error === 'string' && body.error) setError(body.error)
  }

  const refresh = () => {
    return getApps().then((result) => {
      if (!result.ok) {
        setError(String(result.body.error || `HTTP ${String(result.status)}`))
        return
      }
      setError(typeof result.body.error === 'string' ? result.body.error : '')
      applyView(result.body)
    }).catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught))
    })
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (popover === null || popover.kind !== 'menu') return undefined
    const onPointerDown = (event) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-omnimux-popover]') !== null) return
      setPopover(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown) }
  }, [popover])

  useEffect(() => {
    if (notice === '') return undefined
    const timer = window.setTimeout(() => { setNotice('') }, 6000)
    return () => { window.clearTimeout(timer) }
  }, [notice])

  const runChange = (key, work) => {
    setBusy(key)
    setError('')
    void work().then((result) => {
      if (!result.ok) {
        setError(String(result.body.error || `HTTP ${String(result.status)}`))
        return
      }
      setPendingRestart(true)
      // Uninstall removes the tab row Host-side; tell the sidebar rows to
      // re-fetch. Install/update change nothing yet (first open creates the
      // tab), but one extra GET is cheaper than a second refresh channel.
      notifyTabsChanged()
      return refresh()
    }).catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught))
    }).finally(() => {
      setBusy('')
    })
  }

  const install = (spec) => {
    if (!spec) return
    runChange(spec, () => installApp(spec))
  }

  const uninstall = (name) => {
    if (!name) return
    runChange(name, () => uninstallApp(name))
  }

  const restart = () => {
    const bridge = desktopBridge()
    if (bridge === undefined) {
      setError(t('dshPlugins.needDesktop'))
      return
    }
    setBusy('restart')
    setError('')
    void bridge.restartHost().then(() => {
      setPendingRestart(false)
    }).catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught))
    }).finally(() => {
      setBusy('')
    })
  }

  const readStage = () => document.documentElement.dataset.dshProductStage

  const runOpen = (app, isLoggedIn = auth.state.phase === 'ready') => {
    setNotice('')
    void attemptOpen(app, { pendingRestart, readStage, isLoggedIn }).then((result) => {
      if (result.kind === 'login') {
        setGate(app)
        return
      }
      if (result.kind === 'restart') setNotice(t('plugins.needRestart'))
    }).catch(() => {
      setNotice(t('plugins.needRestart'))
    })
  }

  useEffect(() => {
    if (gate === null || auth.state.phase !== 'ready') return
    const app = gate
    setGate(null)
    runOpen(app, true)
  }, [gate, auth.state.phase])

  const handleCardClick = (app) => {
    if (app.state === 'available') {
      setPopover({ kind: 'install', id: String(app.id) })
      return
    }
    runOpen(app)
  }

  const apps = Array.isArray(view?.apps) ? view.apps : []
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = useMemo(
    () => apps.filter((app) => matches(app, normalizedQuery)),
    [apps, normalizedQuery],
  )
  const softError = typeof view?.error === 'string' ? view.error : ''
  const dialogApp = popover && (popover.kind === 'install' || popover.kind === 'remove')
    ? apps.find((app) => String(app.id) === popover.id)
    : null

  return (
    <div className="omnimux-plugins">
      <div className="omnimux-plugins-toolbar">
        <SearchField
          className="omnimux-plugins-search"
          value={query}
          placeholder={t('plugins.search')}
          aria-label={t('plugins.search')}
          debounceMs={0}
          onValueChange={setQuery}
        />
      </div>
      {gate !== null ? <PluginLoginPanel t={t} auth={auth} onCancel={() => { setGate(null) }} /> : null}
      {view == null && error === '' ? <p className="omnimux-plugins-muted">{t('profile.loading')}</p> : null}
      {apps.length === 0 && view != null ? <p className="omnimux-plugins-muted">{t('plugins.empty')}</p> : null}
      {apps.length > 0 && filtered.length === 0 ? <p className="omnimux-plugins-muted">{t('plugins.emptySearch')}</p> : null}
      {filtered.length > 0 ? (
        <div className="omnimux-plugins-grid">
          {filtered.map((app) => {
            const key = String(app.id)
            const spec = typeof app.install_spec === 'string' ? app.install_spec : ''
            const name = typeof app.spec?.name === 'string' ? app.spec.name : ''
            const primary = primaryActionFor(app.state)
            const overflow = hasOverflowMenu(app.state)
            const appCaps = Array.isArray(app.capabilities) ? app.capabilities : []
            const badgeKey = app.state === 'update'
              ? 'plugins.update'
              : app.state === 'available'
                ? 'plugins.available'
                : 'plugins.installedShort'
            return (
              <article key={key} className="omnimux-plugins-card">
                <div
                  role="button"
                  tabIndex={0}
                  className="omnimux-plugins-card-body"
                  onClick={() => { handleCardClick(app) }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleCardClick(app)
                    }
                  }}
                >
                  <div className="omnimux-plugins-title-row">
                    <span className="omnimux-plugins-icon" aria-hidden="true">
                      <AppMark id={app.id} />
                    </span>
                    <div className="omnimux-plugins-title-line">
                      <h3 className="omnimux-plugins-title">{app.title}</h3>
                      {app.state ? (
                        <span className="omnimux-plugins-badge" data-state={app.state}>{t(badgeKey)}</span>
                      ) : null}
                    </div>
                  </div>
                  {app.summary ? <p className="omnimux-plugins-summary">{app.summary}</p> : null}
                  {appCaps.length > 0 ? (
                    <div className="omnimux-plugins-tags">
                      {appCaps.map((capKey) => (
                        <span key={capKey} className="omnimux-plugins-tag">{t(`plugins.cap.${capKey}`)}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
                {overflow ? (
                  <IconButton
                    className="omnimux-plugins-more"
                    variant="ghost"
                    size="sm"
                    aria-label={t('plugins.more')}
                    aria-haspopup="menu"
                    aria-expanded={popover?.kind === 'menu' && popover.id === key}
                    disabled={busy !== ''}
                    onClick={(event) => {
                      event.stopPropagation()
                      setPopover(popover?.kind === 'menu' && popover.id === key ? null : { kind: 'menu', id: key })
                    }}
                  >
                    <IconEllipsisOutline16 size={16} />
                  </IconButton>
                ) : null}
                <div className="omnimux-plugins-footer">
                  {primary !== null ? (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy !== '' || spec === ''}
                      onClick={(event) => { event.stopPropagation(); install(spec) }}
                    >
                      {t(primary === 'update' ? 'plugins.update' : 'plugins.install')}
                    </Button>
                  ) : null}
                </div>
                {popover?.id === key && popover.kind === 'menu' ? (
                  <div data-omnimux-popover="" role="menu" className="omnimux-plugins-popover">
                    <Button
                      role="menuitem"
                      variant="ghost"
                      size="sm"
                      className="omnimux-plugins-menu-item"
                      disabled={busy !== '' || !canOpen(app, pendingRestart)}
                      onClick={() => {
                        setPopover(null)
                        runOpen(app)
                      }}
                    >
                      <span className="omnimux-plugins-menu-item-stack">
                        <span>{t('plugins.openApp')}</span>
                        {pendingRestart ? <span className="omnimux-plugins-menu-hint">{t('plugins.needRestart')}</span> : null}
                      </span>
                    </Button>
                    <Button
                      role="menuitem"
                      variant="danger"
                      size="sm"
                      className="omnimux-plugins-menu-item"
                      disabled={busy !== '' || name === ''}
                      onClick={() => { setPopover({ kind: 'remove', id: key }) }}
                    >
                      {t('plugins.remove')}
                    </Button>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : null}
      {notice !== '' ? <p className="omnimux-plugins-muted">{notice}</p> : null}
      {pendingRestart ? (
        <Button
          variant="primary"
          className="omnimux-plugins-restart"
          disabled={busy !== ''}
          onClick={restart}
        >
          {t('dshPlugins.restart')}
        </Button>
      ) : null}
      {softError !== '' ? <p className="omnimux-plugins-muted">{softError}</p> : null}
      {error !== '' && error !== softError ? <p className="omnimux-plugins-error">{error}</p> : null}
      {dialogApp && popover?.kind === 'install' ? (
        <ConfirmModal
          open
          onClose={() => { setPopover(null) }}
          title={fmt(t('plugins.confirmInstall'), { title: dialogApp.title })}
          message={dialogApp.summary || undefined}
          closeLabel={t('plugins.cancel')}
          confirmLabel={t('plugins.install')}
          cancelLabel={t('plugins.cancel')}
          confirmLoading={busy !== ''}
          onConfirm={() => {
            const spec = typeof dialogApp.install_spec === 'string' ? dialogApp.install_spec : ''
            setPopover(null)
            install(spec)
          }}
        />
      ) : null}
      {dialogApp && popover?.kind === 'remove' ? (
        <ConfirmModal
          open
          onClose={() => { setPopover(null) }}
          title={fmt(t('plugins.confirmRemove'), { title: dialogApp.title })}
          closeLabel={t('plugins.cancel')}
          confirmLabel={t('plugins.remove')}
          cancelLabel={t('plugins.cancel')}
          confirmVariant="danger"
          confirmLoading={busy !== ''}
          onConfirm={() => {
            const name = typeof dialogApp.spec?.name === 'string' ? dialogApp.spec.name : ''
            setPopover(null)
            uninstall(name)
          }}
        />
      ) : null}
    </div>
  )
}
