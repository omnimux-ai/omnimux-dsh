import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { STARTERS, STARTER_GROUPS } from './catalog.js'
import { isBlankConversation, selectStarter, syncVideoUrls } from './state.js'
import { installGuideSubmitGuard } from './submit-guard.js'

function StarterIcon({ icon }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {icon === "chart-column" && <><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></>}
    {icon === "file-pen" && <><path d="M12.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.34" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /><path d="M10.378 12.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z" /></>}
    {icon === "message-square-text" && <><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" /><path d="M7 11h10" /><path d="M7 15h6" /><path d="M7 7h8" /></>}
    {icon === "clapperboard" && <><path d="m12.296 3.464 3.02 3.956" /><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z" /><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="m6.18 5.276 3.1 3.899" /></>}
    {icon === "wand-sparkles" && <><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" /><path d="m14 7 3 3" /><path d="M5 6v4" /><path d="M19 14v4" /><path d="M10 2v2" /><path d="M7 8H3" /><path d="M21 16h-4" /><path d="M11 3H9" /></>}
    {icon === "chart-line" && <><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="m19 9-5 5-4-4-3 3" /></>}
  </svg>
}

/** The owner hooks address the rendered session, including its first draft. */
export function SessionGuide(props) {
  const session = props.useSession(value => value)
  const hasTargets = props.useConversation(value => value.activeTargets.size > 0)
  if (!isBlankConversation(session, hasTargets)) return null
  return <BlankSessionGuide {...props} key={props.sessionId} pendingSubmit={Boolean(session.pendingSubmissions?.length)} />
}

function BlankSessionGuide({ sessionId, useInput, inputActions, store, t, getCurrentSessionId, getMaterials, attachmentDrafts, pendingSubmit }) {
  const input = useInput(value => value)
  const state = useSyncExternalStore(store.subscribe, () => store.get(sessionId), () => store.get(sessionId))
  const [notice, setNotice] = useState(null)
  const guideRef = useRef(null)
  const live = useRef(null)
  const composing = useRef(false)
  const timer = useRef(null)
  const mounted = useRef(true)
  const submittingDraft = useRef(null)
  const selected = STARTERS.find(card => card.id === state.selectedId)
  const multipleReferences = selected?.references === 'many' || /[\r\n]/.test(state.urlValue)
  live.current = { input, inputActions, state, selected }

  const current = useCallback(() => mounted.current && sessionId && sessionId !== 'default'
    && getCurrentSessionId() === sessionId, [getCurrentSessionId, sessionId])

  function focusEditor() {
    // Scope is the exact slot owner's conversation; this lookup only moves focus.
    const root = guideRef.current?.closest('[data-omnimux-starter-host]')
    root?.querySelector('[data-composer-input="true"]')?.focus()
  }

  const sync = useCallback(() => {
    clearTimeout(timer.current)
    const { input: value, inputActions: actions, state: previous, selected: card } = live.current
    if (!current()) return 'unavailable'
    if (!card?.references || previous.manualUrl) return previous.manualUrl ? 'manualUrl' : 'ready'
    if (composing.current) return 'composing'
    const result = syncVideoUrls(previous, value.draft, {
      multiple: card.references === 'many' || /[\r\n]/.test(previous.urlValue), label: t(card.id === 'review-insights' ? 'guide.productUrl' : card.references === 'many' ? 'guide.urls' : 'guide.url'),
    })
    try {
      if (result.draft !== value.draft) {
        if (!actions?.setDraft || value.phase !== 'plain') return 'unavailable'
        const root = guideRef.current?.closest('[data-omnimux-starter-host]')
        const field = root?.ownerDocument.activeElement
        const preserveFocus = field?.closest?.('[data-omnimux-starter-materials]') && 'selectionStart' in field
        const selection = preserveFocus ? [field.selectionStart, field.selectionEnd] : null
        actions.setDraft(result.draft)
        if (preserveFocus && current()) {
          field.focus()
          if (selection[0] !== null) field.setSelectionRange(...selection)
        }
      }
      // Keep event handlers current even before React commits the next render.
      live.current = { ...live.current, input: { ...value, draft: result.draft }, state: result.state }
      if (result.state !== previous) store.set(sessionId, result.state)
      setNotice(['ready', 'synced'].includes(result.status) ? null : result.status)
      return result.status
    } catch { setNotice('unavailable'); return 'unavailable' }
  }, [current, sessionId, store, t])

  useLayoutEffect(() => {
    mounted.current = true
    const root = guideRef.current?.closest('[data-phase]')
    if (!root) return
    root.setAttribute('data-omnimux-starter-host', '')
    const dispose = installGuideSubmitGuard(root, () => {
      if (!current()) return true
      const result = sync()
      if (result === 'synced') setNotice('synced')
      else if (result === 'unavailable') setNotice('unavailable')
      else if (result === 'composing') setNotice('composing')
      const ready = result === 'ready' || result === 'manualUrl'
      if (ready) submittingDraft.current = live.current.input.draft
      return ready
    })
    return () => {
      mounted.current = false
      clearTimeout(timer.current)
      root.removeAttribute('data-omnimux-starter-host')
      dispose()
    }
  }, [current, sync])

  // A body edit/deletion transfers ownership of our reference paragraph to the user.
  useEffect(() => {
    if (pendingSubmit || (submittingDraft.current !== null && input.draft === '')) return
    submittingDraft.current = null
    if (!state.urlBlock || state.manualUrl || composing.current) return
    const result = syncVideoUrls(state, input.draft, { multiple: true, label: t('guide.urls') })
    if (result.status === 'manualUrl') {
      store.set(sessionId, result.state)
      setNotice('manualUrl')
    }
  }, [input.draft, state, sessionId, store, t, pendingSubmit])

  function choose(card) {
    if (!current() || input.phase !== 'plain' || !inputActions?.setDraft) { setNotice('unavailable'); return }
    const result = selectStarter(live.current.state, live.current.input.draft,
      { id: card.id, prompt: t(`guide.${card.id}.prompt`) })
    if (result.status === 'unchanged') { focusEditor(); return }
    try {
      inputActions.setDraft(result.draft)
      // Template replacement owns this write; selected materials will be reassembled.
      attachmentDrafts?.delete(sessionId)
      live.current = { ...live.current, state: result.state, selected: card, input: { ...input, draft: result.draft } }
      store.set(sessionId, result.state)
      setNotice(result.state.manualUrl ? 'manualUrl' : null)
      focusEditor()
    } catch { setNotice('unavailable') }
  }

  function editUrl(value) {
    const next = { ...live.current.state, urlValue: value }
    live.current = { ...live.current, state: next }
    store.set(sessionId, next)
    clearTimeout(timer.current)
    if (!composing.current) timer.current = setTimeout(sync, 250)
  }

  function material(kind) {
    if (!current()) return
    const actions = getMaterials()
    if (!actions) { setNotice('materialUnavailable'); return }
    if (kind === 'library') actions.openLibrary(sessionId)
    else void actions.addFiles(sessionId).catch(() => { if (current()) setNotice('materialUnavailable') })
  }

  const urlId = `omnimux-starter-url-${sessionId}`
  const hintId = `${urlId}-hint`
  const error = notice === 'invalidUrl' || notice === 'singleUrl'
  return <>
    {selected?.references && <div className="omnimux-starter-materials" data-omnimux-starter-materials="">
      <label htmlFor={urlId}>{t(selected.id === 'review-insights' ? 'guide.productUrl' : selected.references === 'many' ? 'guide.urls' : 'guide.url')}</label>
      {multipleReferences
        ? <textarea id={urlId} rows={2} value={state.urlValue} disabled={state.manualUrl}
          placeholder={t('guide.urlsPlaceholder')} aria-invalid={error} aria-describedby={hintId}
          onChange={event => editUrl(event.target.value)} onBlur={sync}
          onCompositionStart={() => { composing.current = true; clearTimeout(timer.current) }}
          onCompositionEnd={() => { composing.current = false; sync() }} />
        : <input id={urlId} type="url" value={state.urlValue} disabled={state.manualUrl}
          placeholder={t(selected.id === 'review-insights' ? 'guide.productUrlPlaceholder' : 'guide.urlPlaceholder')} aria-invalid={error} aria-describedby={hintId}
          onChange={event => editUrl(event.target.value)} onBlur={sync}
          onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); sync() } }}
          onCompositionStart={() => { composing.current = true; clearTimeout(timer.current) }}
          onCompositionEnd={() => { composing.current = false; sync() }} />}
      <p id={hintId}>{state.manualUrl ? t('guide.manualUrl') : t('guide.urlHint')}</p>
      <div className="omnimux-starter-material-actions">
        <button type="button" onClick={() => material('library')}>{t('guide.library')}</button>
        <button type="button" onClick={() => material('upload')}>{t('guide.upload')}</button>
      </div>
      <p>{t(selected.materials ? 'guide.materials' : 'guide.videoMaterials')}</p>
    </div>}
    <section ref={guideRef} className="omnimux-starter-guide" data-omnimux-starter-guide="" data-session-id={sessionId} aria-label={t('guide.title')}>
      {notice && <div className="omnimux-starter-notice" role="status">{t(`guide.${notice}`)}
        {notice === 'unavailable' && <button type="button" onClick={() => { setNotice(null); focusEditor() }}>{t('guide.retry')}</button>}
      </div>}
      <div className="omnimux-starter-groups">
        {STARTER_GROUPS.map(group => <section key={group} className="omnimux-starter-group" data-starter-group={group} aria-label={t(`guide.${group}`)}>
          <h2>{t(`guide.${group}`)}</h2>
          <div className="omnimux-starter-cards">
            {STARTERS.filter(card => card.group === group).map(card => <button key={card.id} type="button"
              data-starter-id={card.id} aria-pressed={state.selectedId === card.id} onClick={() => choose(card)}>
              <span className="omnimux-starter-icon"><StarterIcon icon={card.icon} /></span>
              <span className="omnimux-starter-label">{t(`guide.${card.id}.title`)}</span>
            </button>)}
          </div>
        </section>)}
      </div>
    </section>
  </>
}
