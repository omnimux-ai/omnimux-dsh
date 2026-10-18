import { useEffect, useRef, useState } from 'react'
import { Button, DropdownSelect } from 'dsh-ui-kit'
import { jsonRequest } from './api-json.js'
import { walletUrl } from './quota-failure.js'
import { useOmnimuxAuth } from './use-omnimux-auth.js'
import { getAvatar, updateAvatar } from './avatar-api.js'
import { AvatarModal, EditableAvatar } from './ProfileAvatar.jsx'
import { injectHubStyles } from './styles.js'

function money(value) {
  return typeof value === 'number' ? `$${value.toFixed(2)}` : '—'
}

function DetailRow({ name, children, last }) {
  return (
    <div className="omnimux-profile-row" data-last={last ? 'true' : 'false'}>
      <span className="omnimux-profile-label">{name}</span>
      <span className="omnimux-profile-value">{children}</span>
    </div>
  )
}

function pickModelKeys(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  return {
    valid: Array.isArray(value.items) && typeof value.configured === 'boolean'
      && (value.source == null || value.source === 'account' || value.source === 'explicit'),
    configured: value.configured === true,
    source: value.source === 'account' || value.source === 'explicit' ? value.source : null,
    selectedId: Number.isSafeInteger(value.selectedId) ? value.selectedId : null,
    createUrl: typeof value.createUrl === 'string' && /^https?:\/\//.test(value.createUrl) ? value.createUrl : '',
    error: typeof value.error === 'string' ? value.error : '',
    items: Array.isArray(value.items) ? value.items.filter((item) => Number.isSafeInteger(item?.id)).map((item) => ({
      id: item.id,
      name: typeof item.name === 'string' ? item.name : '',
      expired_time: typeof item.expired_time === 'number' ? item.expired_time : null,
      remain_quota: typeof item.remain_quota === 'number' ? item.remain_quota : null,
      unlimited_quota: item.unlimited_quota === true,
      status: typeof item.status === 'number' ? item.status : null,
    })) : [],
  }
}

function modelKeyAvailable(item) {
  return item.status === 1
    && (item.expired_time === -1 || item.expired_time > Date.now() / 1000)
    && (item.unlimited_quota || (item.remain_quota ?? 0) > 0)
}

function AccountAnalysisService({ t, onOpen }) {
  const [view, setView] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState('')
  const mounted = useRef(false)
  const pending = useRef(false)
  const busy = phase === 'loading' || phase === 'saving'
  const selected = view?.items.find((item) => String(item.id) === selectedId)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function load() {
    if (pending.current) return
    pending.current = true
    setPhase('loading')
    setError('')
    try {
      const result = await jsonRequest('/omnimux/auth/model-keys', { pick: pickModelKeys, requireJson: true })
      if (!mounted.current) return
      if (!result.ok || !result.body.valid) throw new Error(result.body.error || t('profile.analysis.readError'))
      setView(result.body)
      setSelectedId(result.body.selectedId == null ? '' : String(result.body.selectedId))
      setPhase('idle')
    } catch (caught) {
      if (mounted.current) {
        setError(caught instanceof Error ? caught.message : t('profile.analysis.readError'))
        setPhase('idle')
      }
    } finally {
      pending.current = false
    }
  }

  async function enable() {
    if (pending.current || !selected || !modelKeyAvailable(selected) || view?.source === 'explicit') return
    const id = selected.id
    pending.current = true
    setPhase('saving')
    setError('')
    try {
      const result = await jsonRequest('/omnimux/auth/model-key', {
        method: 'POST', body: { id }, pick: pickModelKeys, requireJson: true,
      })
      if (!mounted.current) return
      if (!result.ok || !result.body.configured || result.body.source !== 'account' || result.body.selectedId !== id) {
        throw new Error(result.body.error || t('profile.analysis.saveError'))
      }
      setView((current) => ({ ...current, configured: true, source: 'account', selectedId: id }))
      setPhase('saved')
    } catch (caught) {
      if (mounted.current) {
        setError(caught instanceof Error ? caught.message : t('profile.analysis.saveError'))
        setPhase('idle')
      }
    } finally {
      pending.current = false
    }
  }

  return (
    <div className="omnimux-profile-card omnimux-profile-card--signed-out" data-omnimux-account-analysis="">
      <span className="omnimux-profile-label">{t('profile.analysis.title')}</span>
      <p className="omnimux-profile-message">{t('profile.analysis.description')}</p>
      {view ? (
        <>
          <p className="omnimux-profile-message" role="status">
            {view.source === 'explicit' && view.configured ? t('profile.analysis.explicit')
              : view.configured ? t('profile.analysis.configured') : t('profile.analysis.unconfigured')}
          </p>
          {view.source !== 'explicit' && view.items.length > 0 ? (
            <>
              <DropdownSelect id="omnimux-account-model-key" aria-label={t('profile.analysis.key')}
                placeholder={t('profile.analysis.key')} value={selectedId} disabled={busy}
                options={view.items.map((item) => ({
                  value: String(item.id),
                  label: `${item.name || t('profile.analysis.key')} · #${item.id}${modelKeyAvailable(item) ? '' : ` · ${t('profile.analysis.unavailable')}`}`,
                  disabled: !modelKeyAvailable(item),
                }))}
                onChange={(next) => { setSelectedId(next); setPhase('idle'); setError('') }} />
              {selected ? (
                <div>
                  <p className="omnimux-profile-message">{t('profile.analysis.quota')}: {selected.unlimited_quota
                    ? t('profile.analysis.unlimited') : selected.remain_quota == null ? '—'
                      : selected.remain_quota > 0 ? t('profile.analysis.available') : t('profile.analysis.depleted')}</p>
                  <p className="omnimux-profile-message">{t('profile.analysis.expiry')}: {selected.expired_time > 0
                    ? new Date(selected.expired_time * 1000).toLocaleDateString()
                    : selected.expired_time === -1 ? t('profile.analysis.noExpiry') : '—'}</p>
                </div>
              ) : null}
            </>
          ) : null}
          {view.source !== 'explicit' && !view.items.some(modelKeyAvailable) ? (
            <p className="omnimux-profile-message">{t('profile.analysis.empty')}</p>
          ) : null}
        </>
      ) : null}
      <div className="omnimux-profile-avatar-actions">
        <Button variant="outline" disabled={busy} onClick={() => { void load() }}>
          {phase === 'loading' ? t('profile.analysis.loading') : view ? t('profile.analysis.refresh') : t('profile.analysis.read')}
        </Button>
        {view && view.source !== 'explicit' && view.items.some(modelKeyAvailable) ? (
          <Button variant="primary" disabled={busy || !selected || !modelKeyAvailable(selected)} onClick={() => { void enable() }}>
            {phase === 'saving' ? t('profile.analysis.saving') : t('profile.analysis.enable')}
          </Button>
        ) : null}
        {view?.createUrl && view.source !== 'explicit' && !view.items.some(modelKeyAvailable) ? (
          <Button variant="outline" disabled={busy} onClick={() => onOpen(view.createUrl)}>
            {t('profile.analysis.console')}
          </Button>
        ) : null}
      </div>
      {phase === 'saved' ? <p className="omnimux-profile-message" role="status">{t('profile.analysis.saved')}</p> : null}
      {error ? <p className="omnimux-profile-error" role="alert">{error}</p> : null}
    </div>
  )
}

function SignedIn({ t, profile, onTopUp, onSignOut, onOpen }) {
  const name = profile.display_name || profile.username || ''
  const initial = (name.trim().charAt(0) || '?').toUpperCase()
  const balance = typeof profile.quota_usd === 'number' ? profile.quota_usd : 0
  const used = typeof profile.used_quota_usd === 'number' ? profile.used_quota_usd : 0
  const total = balance + used
  const usedPct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const [avatar, setAvatar] = useState(null)
  const [avatarError, setAvatarError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let cancelled = false
    getAvatar().then((result) => {
      if (cancelled) return
      if (result.ok && result.body.uri) {
        setAvatar(result.body)
        setAvatarError('')
      } else {
        setAvatarError(result.body.error || t('avatar.error'))
      }
    }).catch(() => {
      if (!cancelled) setAvatarError(t('avatar.error'))
    })
    return () => { cancelled = true }
  }, [t])

  async function applyAvatar(patch) {
    if (busy) return
    setBusy(true)
    try {
      const result = await updateAvatar(patch)
      if (result.ok && result.body.uri) {
        setAvatar(result.body)
        setAvatarError('')
      } else {
        setAvatarError(result.body.error || t('avatar.error'))
      }
    } catch {
      setAvatarError(t('avatar.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="omnimux-profile">
      <h2 className="omnimux-profile-title">{t('profile.title')}</h2>

      <div className="omnimux-profile-card omnimux-profile-card--identity">
        <EditableAvatar t={t} uri={avatar?.uri} initial={initial} onOpen={() => setEditing(true)} />
        <div className="omnimux-profile-identity">
          <span className="omnimux-profile-name">{name || '—'}</span>
          <span className="omnimux-profile-username">{profile.username || '—'}</span>
        </div>
        <span className="omnimux-profile-status">
          <span className="omnimux-profile-status-dot" />
          {t('profile.signedIn')}
        </span>
      </div>

      {avatarError && !editing ? (
        <p className="omnimux-profile-error">{avatarError}</p>
      ) : null}

      <div className="omnimux-profile-card omnimux-profile-card--quota">
        <div className="omnimux-profile-quota">
          <span className="omnimux-profile-label">{t('profile.quota')}</span>
          <span className="omnimux-profile-quota-amount">{money(profile.quota_usd)}</span>
          <span className="omnimux-profile-quota-used">
            {t('profile.used')} {money(profile.used_quota_usd)}
          </span>
          <div className="omnimux-profile-quota-track">
            <div
              className="omnimux-profile-quota-fill"
              style={{ '--quota-used': `${usedPct}%` }}
            />
          </div>
        </div>
        <Button variant="primary" onClick={onTopUp}>
          {t('profile.topUp')}
        </Button>
      </div>

      <div className="omnimux-profile-card omnimux-profile-card--details">
        <DetailRow name={t('profile.username')}>{profile.username || '—'}</DetailRow>
        <DetailRow name={t('profile.displayName')}>{profile.display_name || '—'}</DetailRow>
        <DetailRow name={t('profile.group')}>{profile.group || '—'}</DetailRow>
        <DetailRow name={t('profile.site')} last>{profile.base_url || '—'}</DetailRow>
      </div>

      <AccountAnalysisService key={`${profile.base_url || ''}:${profile.id || ''}`} t={t} onOpen={onOpen} />

      <Button variant="outline" className="omnimux-profile-logout" onClick={onSignOut}>
        {t('profile.logout')}
      </Button>

      {editing ? (
        <AvatarModal
          t={t}
          avatar={avatar}
          initial={initial}
          busy={busy}
          error={avatarError}
          onApply={applyAvatar}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </div>
  )
}

/**
 * @param {{ t: (key: string) => string }} props
 */
export function ProfileSection({ t }) {
  useEffect(() => { injectHubStyles() }, [])
  // Settings shell mounts this section only while it is the active nav row
  // (`renderSlot(..., { only: active })`), so every click on 个人资料 remounts
  // and re-runs verify — live `/self` refresh keeps quota/balance current.
  const { state, signOut, openUrl, recheck } = useOmnimuxAuth({ verifyOnMount: true })

  if (state.phase === 'ready') {
    const profile = state.profile || {}
    return (
      <SignedIn
        t={t}
        profile={profile}
        onTopUp={() => openUrl(walletUrl(profile.base_url))}
        onSignOut={() => { void signOut() }}
        onOpen={openUrl}
      />
    )
  }

  // Sign-in is converged onto the unified gate: this section only shows a
  // short message and a single entry button. The gate owns the device code,
  // the verification page, polling, and the resume-after-login intent queue.
  const signIn = () => {
    const gate = typeof window !== 'undefined' ? /** @type {any} */ (window).__omnimuxAuth : undefined
    if (gate && typeof gate.ensureLogin === 'function') {
      gate.ensureLogin({
        reason: t('auth.gate.reason.account'),
        kind: 'explicit',
        onSuccess: () => { void recheck({ verify: true }) },
      })
    } else {
      void recheck({ verify: true })
    }
  }

  const message = {
    checking: t('profile.loading'),
    'need-login': t('profile.signedOut'),
    denied: t('plugins.denied'),
    expired: t('plugins.expired'),
    error: t('plugins.error'),
  }[state.phase] || t('profile.signedOut')

  const showLogin = state.phase !== 'checking'

  return (
    <div className="omnimux-profile">
      <h2 className="omnimux-profile-title">{t('profile.title')}</h2>
      <div className="omnimux-profile-card omnimux-profile-card--signed-out">
        <p className="omnimux-profile-message">{message}</p>
        {showLogin ? (
          <Button variant="primary" onClick={signIn}>
            {t('plugins.login')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
