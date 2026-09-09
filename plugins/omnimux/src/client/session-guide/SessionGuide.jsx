import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { STARTERS, STARTER_GROUPS } from './catalog.js'
import { isBlankConversation, selectStarter, syncVideoUrls } from './state.js'
import { installGuideSubmitGuard } from './submit-guard.js'

function StarterIcon({ group }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {group === 'discover' ? <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></>
      : group === 'understand' ? <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5" /></>
        : <><path d="m4 20 11-11 4 4L8 24M14 4V1M20 7h3M5 8V4M3 6h4" transform="translate(0 -2)" /></>}
  </svg>
}

/** The owner hooks address the rendered session, including its first draft. */
export function SessionGuide(props) {
  const session = props.useSession(value => value)
  const hasTargets = props.useConversation(value => value.activeTargets.size > 0)
  if (!isBlankConversation(session, hasTargets)) return null
  return <BlankSessionGuide {...props} key={props.sessionId} />
}

function BlankSessionGuide({ sessionId, useInput, inputActions, store, t, getCurrentSessionId, getMaterials }) {
  const input = useInput(value => value)
  const state = useSyncExternalStore(store.subscribe, () => store.get(sessionId), () => store.get(sessionId))
  const [pending, setPending] = useState(null)
  const [notice, setNotice] = useState(null)
  const guideRef = useRef(null)
  const live = useRef(null)
  const composing = useRef(false)
  const timer = useRef(null)
  const mounted = useRef(true)
  const selected = STARTERS.find(card => card.id === state.selectedId)
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
    if (!card || previous.manualUrl) return previous.manualUrl ? 'manualUrl' : 'ready'
    if (composing.current) return 'composing'
    const result = syncVideoUrls(previous, value.draft, {
      multiple: card.references === 'many', label: t(card.references === 'many' ? 'guide.urls' : 'guide.url'),
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
      return result === 'ready' || result === 'manualUrl'
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
    if (!state.urlBlock || state.manualUrl || composing.current) return
    const result = syncVideoUrls(state, input.draft, { multiple: true, label: t('guide.urls') })
    if (result.status === 'manualUrl') {
      store.set(sessionId, result.state)
      setNotice('manualUrl')
    }
  }, [input.draft, state, sessionId, store, t])

  function choose(card, confirmed = false) {
    if (!current() || input.phase !== 'plain' || !inputActions?.setDraft) { setNotice('unavailable'); return }
    const result = selectStarter(live.current.state, live.current.input.draft,
      { id: card.id, prompt: t(`guide.${card.id}.prompt`) }, confirmed)
    if (result.status === 'confirm') { setPending(card); return }
    setPending(null)
    if (result.status === 'unchanged') { focusEditor(); return }
    try {
      inputActions.setDraft(result.draft)
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
    {selected && <div className="omnimux-starter-materials" data-omnimux-starter-materials="">
      <label htmlFor={urlId}>{t(selected.references === 'many' ? 'guide.urls' : 'guide.url')}</label>
      {selected.references === 'many'
        ? <textarea id={urlId} rows={2} value={state.urlValue} disabled={state.manualUrl}
          placeholder={t('guide.urlsPlaceholder')} aria-invalid={error} aria-describedby={hintId}
          onChange={event => editUrl(event.target.value)} onBlur={sync}
          onCompositionStart={() => { composing.current = true; clearTimeout(timer.current) }}
          onCompositionEnd={() => { composing.current = false; sync() }} />
        : <input id={urlId} type="url" value={state.urlValue} disabled={state.manualUrl}
          placeholder={t('guide.urlPlaceholder')} aria-invalid={error} aria-describedby={hintId}
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
      {pending && <div className="omnimux-starter-confirm" role="group" aria-label={t('guide.replaceQuestion')}>
        <p>{t('guide.replaceQuestion')}</p>
        <button type="button" onClick={() => choose(pending, true)}>{t('guide.replaceDraft')}</button>
        <button type="button" onClick={() => { setPending(null); focusEditor() }}>{t('guide.keepDraft')}</button>
      </div>}
      <div className="omnimux-starter-groups">
        {STARTER_GROUPS.map(group => <section key={group} className="omnimux-starter-group" aria-label={t(`guide.${group}`)}>
          <h2>{t(`guide.${group}`)}</h2>
          <div className="omnimux-starter-cards">
            {STARTERS.filter(card => card.group === group).map(card => <button key={card.id} type="button"
              data-starter-id={card.id} aria-pressed={state.selectedId === card.id} onClick={() => choose(card)}>
              <StarterIcon group={group} />
              <span><strong>{t(`guide.${card.id}.title`)}</strong><small>{t(`guide.${card.id}.description`)}</small></span>
            </button>)}
          </div>
        </section>)}
      </div>
    </section>
  </>
}
