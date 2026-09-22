import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Button } from 'dsh-ui-kit'
import { AgentPanel, ByokPanel } from './RuntimeModeSection.jsx'
import { describeRuntimeGuide } from './runtime-guide-view.js'
import { injectHubStyles } from './styles.js'

/**
 * First-run runtime guide: before any feature, the user picks who generates
 * text and media. Official asks for the existing sign-in; a local agent must
 * probe; a custom key must pass its test. The choice writes `runtimeMode`
 * once, so the guide never shows again. Owned by the hub (shell.overlay),
 * never by the desktop shell.
 *
 * @param {{
 *   t: (key: string, params?: Record<string, string>) => string,
 *   scope?: {
 *     getSnapshot: () => object,
 *     subscribe: (listener: () => void) => () => void,
 *     set: (field: string, value: unknown) => Promise<void>,
 *   },
 * }} props
 */
export function RuntimeGuideGate({ t, scope }) {
  useEffect(() => { injectHubStyles() }, [])
  const snapshot = useSyncExternalStore(
    (listener) => {
      if (!scope || typeof scope.subscribe !== 'function') return () => {}
      return scope.subscribe(listener)
    },
    () => (scope && typeof scope.getSnapshot === 'function'
      ? scope.getSnapshot()
      : { status: 'unavailable', value: undefined }),
  )
  const value = snapshot && typeof snapshot.value === 'object' && snapshot.value ? snapshot.value : {}
  const guide = describeRuntimeGuide(value)

  const [step, setStep] = useState('choose')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const finish = useCallback(async (mode) => {
    try {
      const response = await fetch('/omnimux/runtime/mode', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${response.status}`)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [])

  const startOfficial = useCallback(() => {
    const auth = typeof window !== 'undefined' ? /** @type {any} */ (window).__omnimuxAuth : undefined
    if (auth && typeof auth.ensureLogin === 'function') {
      auth.ensureLogin({
        reason: t('runtime.official'),
        kind: 'explicit',
        onSuccess: () => { void finish('official') },
      })
      return
    }
    // No gate available: an existing session is as good as a fresh sign-in.
    void finish('official')
  }, [finish, t])

  if (!guide.visible) return null
  if (typeof document === 'undefined' || !document.body) return null

  return createPortal(
    (
      <div className="omnimux-login-gate-backdrop" data-omnimux-runtime-guide="">
        <div
          className="omnimux-login-gate-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="omnimux-runtime-guide-headline"
          onClick={(event) => { event.stopPropagation() }}
        >
          <section className="omnimux-runtime-guide-content">
            <h2 id="omnimux-runtime-guide-headline" className="omnimux-login-gate-headline">
              {t('runtime.title')}
            </h2>
            <p className="omnimux-login-gate-subdeck">{t('runtime.hint')}</p>

            {step === 'choose' ? (
              <div className="omnimux-models-card__group-card omnimux-runtime-guide-choices">
                <Button
                  variant="primary"
                  className="omnimux-login-gate-cta"
                  disabled={busy}
                  onClick={startOfficial}
                >
                  {t('runtime.official')}
                </Button>
                <div className="omnimux-runtime-guide-alt">
                  <Button variant="ghost" disabled={busy} onClick={() => { setError(''); setNotice(''); setStep('agent') }}>
                    {t('runtime.agent')}
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => { setError(''); setNotice(''); setStep('key') }}>
                    {t('runtime.key')}
                  </Button>
                </div>
                <p className="omnimux-models-card__desc omnimux-runtime-guide-hints">
                  {t('runtime.officialHint')} · {t('runtime.agentHint')} · {t('runtime.keyHint')}
                </p>
              </div>
            ) : null}

            {step === 'agent' ? (
              <div className="omnimux-runtime-guide-step">
                <AgentPanel
                  t={t}
                  value={value}
                  busy={busy}
                  setBusy={setBusy}
                  error={error}
                  setError={setError}
                  notice={notice}
                  setNotice={setNotice}
                  onVerified={() => { void finish('agent') }}
                />
                <Button variant="ghost" disabled={busy} onClick={() => { setError(''); setNotice(''); setStep('choose') }}>
                  {t('runtime.back')}
                </Button>
              </div>
            ) : null}

            {step === 'key' ? (
              <div className="omnimux-runtime-guide-step">
                <ByokPanel
                  t={t}
                  value={value}
                  busy={busy}
                  setBusy={setBusy}
                  error={error}
                  setError={setError}
                  notice={notice}
                  setNotice={setNotice}
                  onVerified={() => { void finish('key') }}
                />
                <Button variant="ghost" disabled={busy} onClick={() => { setError(''); setNotice(''); setStep('choose') }}>
                  {t('runtime.back')}
                </Button>
              </div>
            ) : null}

            {error ? <p className="omnimux-login-gate-error">{error}</p> : null}
            {notice ? <p className="omnimux-models-card__desc">{notice}</p> : null}
          </section>
        </div>
      </div>
    ),
    document.body,
  )
}
