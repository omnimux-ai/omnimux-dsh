import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { STARTERS, STARTER_GROUPS, POPULAR_STARTERS, MARKETING_INSIGHT_ITEMS } from './catalog.js'
import { isBlankConversation, selectStarter } from './state.js'

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

function PopularCardCover({ id }) {
  if (id === 'marketing-insight') {
    return (
      <svg viewBox="0 0 240 135" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="240" height="135" className="cover-bg-mesh" />
        {/* Computer Screen */}
        <rect x="45" y="20" width="150" height="85" rx="6" className="cover-screen" strokeWidth="1.5" />
        <rect x="52" y="27" width="136" height="62" rx="3" className="cover-display" />
        {/* Screen Content: Mindmap & Title */}
        <rect x="75" y="38" width="90" height="18" rx="4" className="cover-brand-badge" />
        <text x="120" y="50" className="cover-text-white" fontSize="9" fontWeight="700" textAnchor="middle">MARKETING INSIGHT</text>
        {/* Nodes */}
        <circle cx="68" cy="70" r="7" className="cover-node-purple" strokeWidth="1" />
        <text x="68" y="73" className="cover-text-muted" fontSize="9" textAnchor="middle">Market</text>
        <circle cx="120" cy="74" r="8" className="cover-node-pink" strokeWidth="1" />
        <text x="120" y="77" className="cover-text-muted" fontSize="9" textAnchor="middle">Audience</text>
        <circle cx="172" cy="70" r="7" className="cover-node-blue" strokeWidth="1" />
        <text x="172" y="73" className="cover-text-muted" fontSize="9" textAnchor="middle">ROAS</text>
        {/* Connecting lines */}
        <path d="M75 68 L95 56 M120 66 L120 56 M165 68 L145 56" className="cover-line" strokeWidth="0.8" strokeDasharray="2 2" />
        {/* Stand */}
        <path d="M110 105 L130 105 L125 116 L115 116 Z" className="cover-stand" />
        <rect x="95" y="116" width="50" height="3" rx="1.5" className="cover-stand-base" />
      </svg>
    )
  }
  if (id === 'url-to-video') {
    return (
      <svg viewBox="0 0 240 135" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="240" height="135" className="cover-bg-alt" />
        <circle cx="120" cy="55" r="32" className="cover-circle-halo" />
        {/* URL Input Bar */}
        <rect x="30" y="85" width="180" height="28" rx="14" className="cover-url-bar" strokeWidth="1.2" />
        <circle cx="45" cy="99" r="6" className="cover-url-icon" strokeWidth="1.2" />
        <path d="M41 99 H49 M45 95 V103" className="cover-url-icon" strokeWidth="1" />
        <text x="58" y="102" className="cover-text-muted" fontSize="9">https://example.com/product...</text>
        <circle cx="196" cy="99" r="9" className="cover-circle-btn" />
        <path d="M194 96 L198 99 L194 102" className="cover-text-white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (id === 'recreate-viral-ads') {
    return (
      <svg viewBox="0 0 240 135" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="240" height="135" className="cover-bg-alt" />
        {/* Laptop & Viral Banner */}
        <rect x="50" y="32" width="140" height="70" rx="6" className="cover-screen" strokeWidth="1" />
        <rect x="58" y="38" width="124" height="50" rx="3" className="cover-display" />
        {/* Badge */}
        <rect x="68" y="48" width="104" height="20" rx="4" className="cover-brand-badge" strokeWidth="1" />
        <text x="120" y="62" className="cover-text-white" fontSize="9" fontWeight="700" textAnchor="middle">RECREATE VIRAL ADS</text>
        <polygon points="116,74 126,80 116,86" className="cover-play-triangle" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 240 135" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="240" height="135" className="cover-bg-mesh" />
      {/* Multi-ratio ad grid */}
      <rect x="40" y="24" width="48" height="68" rx="4" className="cover-grid-card" strokeWidth="1" />
      <rect x="94" y="24" width="52" height="42" rx="4" className="cover-grid-card" strokeWidth="1" />
      <rect x="152" y="24" width="48" height="68" rx="4" className="cover-grid-card" strokeWidth="1" />
      <rect x="94" y="72" width="52" height="20" rx="4" className="cover-brand-badge" strokeWidth="1" />
      <text x="120" y="85" className="cover-text-muted" fontSize="9" fontWeight="600" textAnchor="middle">Batch Ads</text>
    </svg>
  )
}

/** 营销洞察全功能模态框 */
function MarketingInsightModal({ isOpen, onClose, t, onSubmitDraft }) {
  const [selectedItem, setSelectedItem] = useState(MARKETING_INSIGHT_ITEMS[0].id)
  const [promptValue, setPromptValue] = useState('')

  useEffect(() => {
    if (!isOpen) return
    const item = MARKETING_INSIGHT_ITEMS.find(it => it.id === selectedItem) || MARKETING_INSIGHT_ITEMS[0]
    const localizedPrompt = t(`guide.insight.${item.id}.prompt`) || item.prompt
    setPromptValue(localizedPrompt)
  }, [isOpen, selectedItem, t])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  function handleSelect(id) {
    setSelectedItem(id)
    const item = MARKETING_INSIGHT_ITEMS.find(it => it.id === id)
    if (item) {
      const localizedPrompt = t(`guide.insight.${item.id}.prompt`) || item.prompt
      setPromptValue(localizedPrompt)
    }
  }

  function handleSubmit() {
    if (promptValue.trim()) {
      onSubmitDraft(promptValue)
    }
  }

  return (
    <div className="omnimux-insight-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('guide.insight.modal.title')}>
      <div className="omnimux-insight-modal" onClick={e => e.stopPropagation()}>
        {/* Close button */}
        <button type="button" className="omnimux-insight-close" onClick={onClose} aria-label="Close" /* exempt-ui01: modal close icon button */>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Modal Header */}
        <header className="omnimux-insight-header">
          <h1>{t('guide.insight.modal.title')}</h1>
          <p>{t('guide.insight.modal.subtitle')}</p>
        </header>

        {/* Modal Body: Left and Right */}
        <div className="omnimux-insight-body">
          {/* Left: Suggested for you */}
          <section className="omnimux-insight-left" aria-label={t('guide.insight.suggested')}>
            <div className="omnimux-insight-left-top">
              <h2>{t('guide.insight.suggested')}</h2>
              <button type="button" className="omnimux-insight-refresh" aria-label="Refresh items" /* exempt-ui01: refresh items button */>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21h5v-5" />
                </svg>
              </button>
            </div>

            <div className="omnimux-insight-grid" role="tablist">
              {MARKETING_INSIGHT_ITEMS.map(item => (
                <button key={item.id} type="button" role="tab" className="omnimux-insight-item" data-insight-id={item.id} aria-selected={selectedItem === item.id} onClick={() => handleSelect(item.id)} /* exempt-ui01: insight item selection button */>
                  <div className="omnimux-insight-item-header">
                    <StarterIcon icon={item.icon} />
                    <span className="omnimux-insight-arrow">↗</span>
                  </div>
                  <span className="omnimux-insight-item-title">{t(`guide.insight.${item.id}.title`)}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Right: What would you like to explore? */}
          <section className="omnimux-insight-right" aria-label={t('guide.insight.explore.title')}>
            <h2>{t('guide.insight.explore.title')}</h2>
            <div className="omnimux-insight-textarea-box">
              <textarea
                className="omnimux-insight-textarea"
                value={promptValue}
                onChange={e => setPromptValue(e.target.value)}
                placeholder="Prompt context..."
                aria-label={t('guide.insight.explore.title')}
              />
            </div>
            <div className="omnimux-insight-actions">
              <button type="button" className="omnimux-insight-submit" onClick={handleSubmit} /* exempt-ui01: start insight submit button */>
                <span>{t('guide.insight.start-btn')}</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

/** The owner hooks address the rendered session, including its first draft. */
export function SessionGuide(props) {
  const session = props.useSession(value => value)
  const hasTargets = props.useConversation(value => value.activeTargets.size > 0)
  const panelOpen = useSyncExternalStore(props.workbench.subscribe, () => {
    const snapshot = props.workbench.getSnapshot()
    return snapshot?.sessionId === props.sessionId && snapshot.state.panelOpen === true
  }, () => false)
  if (panelOpen || !isBlankConversation(session, hasTargets)) return null
  return <BlankSessionGuide {...props} key={props.sessionId} />
}

function BlankSessionGuide({ sessionId, useInput, inputActions, store, t, getCurrentSessionId, attachmentDrafts }) {
  const input = useInput(value => value)
  const state = useSyncExternalStore(store.subscribe, () => store.get(sessionId), () => store.get(sessionId))
  const [notice, setNotice] = useState(null)
  const [toastText, setToastText] = useState(null)
  const [isInsightModalOpen, setIsInsightModalOpen] = useState(false)
  const guideRef = useRef(null)
  const live = useRef(null)
  const mounted = useRef(true)
  live.current = { input, state }

  const current = () => mounted.current && sessionId && sessionId !== 'default'
    && getCurrentSessionId() === sessionId

  function focusEditor() {
    const root = guideRef.current?.closest('[data-omnimux-starter-host]')
    root?.querySelector('[data-composer-input="true"]')?.focus()
  }

  useLayoutEffect(() => {
    mounted.current = true
    const root = guideRef.current?.closest('[data-phase]')
    root?.setAttribute('data-omnimux-starter-host', '')
    return () => {
      mounted.current = false
      root?.removeAttribute('data-omnimux-starter-host')
    }
  }, [])

  function showToast(text) {
    setToastText(text)
    setTimeout(() => {
      if (mounted.current) setToastText(null)
    }, 2200)
  }

  function choose(card) {
    if (!current() || input.phase !== 'plain' || !inputActions?.setDraft) { setNotice('unavailable'); return }
    const result = selectStarter(live.current.state, live.current.input.draft,
      { id: card.id, prompt: t(`guide.${card.id}.prompt`) })
    if (result.status === 'unchanged') { focusEditor(); return }
    try {
      inputActions.setDraft(result.draft)
      attachmentDrafts?.delete(sessionId)
      live.current = { ...live.current, state: result.state, input: { ...input, draft: result.draft } }
      store.set(sessionId, result.state)
      setNotice(null)
      focusEditor()
    } catch { setNotice('unavailable') }
  }

  function handlePopularClick(starter) {
    if (starter.type === 'modal' && starter.id === 'marketing-insight') {
      setIsInsightModalOpen(true)
      return
    }
    showToast(t('guide.popular.placeholder-notice'))
  }

  function handleSubmitInsight(prompt) {
    setIsInsightModalOpen(false)
    if (!current() || !inputActions?.setDraft) {
      setNotice('unavailable')
      return
    }
    try {
      inputActions.setDraft(prompt)
      attachmentDrafts?.delete(sessionId)
      live.current = { ...live.current, input: { ...input, draft: prompt } }
      try {
        if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
          navigator.clipboard.writeText(prompt).catch(() => {})
        }
      } catch { /* clipboard optional */ }
      showToast(t('guide.insight.copied'))
      focusEditor()
    } catch {
      setNotice('unavailable')
    }
  }

  return (
    <section ref={guideRef} className="omnimux-starter-guide" data-omnimux-starter-guide="" data-session-id={sessionId} aria-label={t('guide.title')}>
      {notice && <div className="omnimux-starter-notice" role="status">{t(`guide.${notice}`)}
        {notice === 'unavailable' && <button type="button" onClick={() => { setNotice(null); focusEditor() }}>{t('guide.retry')}</button> /* exempt-ui01: session starter button */}
      </div>}

      {/* Top 10 quick starters */}
      <div className="omnimux-starter-groups">
        {STARTER_GROUPS.map(group => <section key={group} className="omnimux-starter-group" data-starter-group={group} aria-label={t(`guide.${group}`)}>
          <h2>{t(`guide.${group}`)}</h2>
          <div className="omnimux-starter-cards">
            {STARTERS.filter(card => card.group === group).map(card => <button key={card.id} type="button" /* exempt-ui01: session starter card button */
              data-starter-id={card.id} aria-pressed={state.selectedId === card.id} onClick={() => choose(card)}>
              <span className="omnimux-starter-icon"><StarterIcon icon={card.icon} /></span>
              <span className="omnimux-starter-label">{t(`guide.${card.id}.title`)}</span>
            </button>)}
          </div>
        </section>)}
      </div>

      {/* Popular Ways to Get Started (4 Featured Cards) */}
      <section className="omnimux-popular-section" aria-label={t('guide.popular.title')}>
        <h2 className="omnimux-popular-title">{t('guide.popular.title')}</h2>
        <div className="omnimux-popular-grid">
          {POPULAR_STARTERS.map(starter => (
            <button key={starter.id} type="button" className="omnimux-popular-card" data-popular-starter-id={starter.id} onClick={() => handlePopularClick(starter)} /* exempt-ui01: popular starter card button */>
              <div className="omnimux-popular-cover">
                <PopularCardCover id={starter.id} />
              </div>
              <div className="omnimux-popular-footer">
                <span>{t(`guide.popular.${starter.id}.title`)}</span>
                {starter.type === 'placeholder' && (
                  <span className="omnimux-popular-tag">Coming</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Marketing Insight Modal */}
      <MarketingInsightModal
        isOpen={isInsightModalOpen}
        onClose={() => setIsInsightModalOpen(false)}
        t={t}
        onSubmitDraft={handleSubmitInsight}
      />

      {/* Centered Toast Feedback */}
      {toastText && (
        <div className="omnimux-toast-pill" role="status">
          <div className="omnimux-toast-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <span>{toastText}</span>
        </div>
      )}
    </section>
  )
}
