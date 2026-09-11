import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Button } from 'dsh-ui-kit'
import { ModalCloseButton } from './components/ModalCloseButton.jsx'
import { begin, cancel, getSnapshot, retry, subscribe } from './auth-gate.js'
import { parseLogoSvg, resolveHeroLogoSvg } from './hero-brand.js'
import {
  LOGIN_GATE_COPY_KEYS as COPY,
  LOGIN_GATE_FEATURE_KEYS,
  describeLoginGate,
  runLoginGateIntent,
} from './login-gate-view.js'
import { injectHubStyles } from './styles.js'

function GateBrandLogo() {
  const { viewBox, inner } = parseLogoSvg(resolveHeroLogoSvg())
  return (
    <div className="omnimux-login-gate-brand-logo" data-omnimux-login-gate-logo="">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={viewBox}
        aria-hidden="true"
        focusable="false"
        dangerouslySetInnerHTML={{ __html: inner }}
      />
    </div>
  )
}

function openVerificationUrl(url) {
  if (typeof url === 'string' && url) window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Unified Login gate modal. Renders only while the gate store is not
 * `closed`; otherwise returns null so it never occupies the stage or claims a
 * product slot. Mounted via React Portal onto `document.body`.
 * @param {{ t: (key: string) => string }} props
 */
export function LoginGate({ t }) {
  useEffect(() => { injectHubStyles() }, [])
  const gate = useSyncExternalStore(subscribe, getSnapshot)
  const view = describeLoginGate(gate)

  useEffect(() => {
    if (!view.visible) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [view.visible])

  if (!view.visible) return null
  if (typeof document === 'undefined' || !document.body) return null

  const failedDetail = {
    denied: t('plugins.denied'),
    expired: t('plugins.expired'),
    error: t('plugins.error'),
  }[view.phase]

  const onCta = () => {
    runLoginGateIntent(view, { begin, retry, openUrl: openVerificationUrl })
  }

  return createPortal(
    (
      <div
        className="omnimux-login-gate-backdrop"
        data-omnimux-login-gate=""
        data-phase={view.phase}
        onClick={() => { cancel() }}
      >
        <div
          className="omnimux-login-gate-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="omnimux-login-gate-headline"
          onClick={(event) => { event.stopPropagation() }}
        >
          <ModalCloseButton
            placement="top-right"
            className="omnimux-login-gate-close"
            ariaLabel={t(COPY.close)}
            title={t(COPY.close)}
            onClose={() => { cancel() }}
          />

          <section className="omnimux-login-gate-hero" aria-hidden="true">
            <div className="omnimux-login-gate-hero-glow" />
            <div className="omnimux-login-gate-hero-media" />
            <img
              className="omnimux-login-gate-hero-jellyfish"
              src="https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=600&q=80"
              alt="Ocean Aesthetic"
            />
            <div className="omnimux-login-gate-hero-scrim" />
            <div className="omnimux-login-gate-hero-type">
              <div className="omnimux-login-gate-hero-tag">
                <span className="omnimux-login-gate-hero-tag-dot" />
                <span>{t(COPY.tag)}</span>
              </div>
              <div className="omnimux-login-gate-hero-brand">OmniMux</div>
              <div className="omnimux-login-gate-hero-title omnimux-login-gate-hero-ai">AI</div>
            </div>
          </section>

          <section className="omnimux-login-gate-content">
            <div>
              <div className="omnimux-login-gate-brand">
                <GateBrandLogo />
                <div className="omnimux-login-gate-brand-title">{t(COPY.brandTitle)}</div>
              </div>
              <h2 id="omnimux-login-gate-headline" className="omnimux-login-gate-headline">
                {t(COPY.headline)}
              </h2>
              <p className="omnimux-login-gate-subdeck">{t(COPY.subdeck)}</p>
              <ul className="omnimux-login-gate-features">
                {LOGIN_GATE_FEATURE_KEYS.map((key) => (
                  <li key={key} className="omnimux-login-gate-feature">
                    <span className="omnimux-login-gate-bullet" />
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="omnimux-login-gate-footer">
              {view.showError && failedDetail ? (
                <p className="omnimux-login-gate-error">{failedDetail}</p>
              ) : null}

              {view.showWaiting ? (
                <div className="omnimux-login-gate-waiting">
                  <div className="omnimux-login-gate-waiting-info">
                    <span className="omnimux-login-gate-spinner" aria-hidden="true" />
                    <span>{t(COPY.waitingDeviceCode)}</span>
                    {view.phase === 'waiting' ? (
                      <span className="omnimux-login-gate-code">{view.userCode}</span>
                    ) : null}
                  </div>
                  {view.phase === 'waiting' && gate.verification_url ? (
                    <Button
                      variant="ghost"
                      className="omnimux-login-gate-reopen"
                      onClick={() => { window.open(gate.verification_url, '_blank', 'noopener,noreferrer') }}
                    >
                      {t(COPY.reopen)}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {view.showCta ? (
                <Button
                  variant="primary"
                  className="omnimux-login-gate-cta"
                  onClick={onCta}
                >
                  {view.showRetry ? t(COPY.retry) : t(COPY.cta)}
                </Button>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    ),
    document.body,
  )
}
