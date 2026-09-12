import React, { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { STARTERS, STARTER_GROUPS, POPULAR_STARTERS } from './catalog.js'
import { isBlankConversation, selectStarter } from './state.js'
import { StarterIcon } from './StarterIcon.jsx'
import { PopularCardCover } from './PopularCardCover.jsx'
import { MarketingInsightModal } from './MarketingInsightModal.jsx'
import { UrlToVideoModal } from './UrlToVideoModal.jsx'
import { RecreateViralAdsModal } from './RecreateViralAdsModal.jsx'
import { BulkCreateAdsModal } from './BulkCreateAdsModal.jsx'
import { CreativePresetsModal } from '../presets/CreativePresetsModal.jsx'
import { TrendingReplicateSection } from './trending/TrendingReplicateSection.jsx'

function copyText(text) {
  const clip = typeof navigator !== 'undefined' ? navigator?.clipboard : null
  if (clip?.writeText) {
    clip.writeText(text).catch(() => {})
  }
}

function StarterCardButton({ card, selectedId, t, onChoose }) {
  return (
    <button key={card.id} type="button" data-starter-id={card.id} aria-pressed={selectedId === card.id} onClick={() => onChoose(card)} /* exempt-ui01: session starter card button */>
      <span className="omnimux-starter-icon">
        <StarterIcon icon={card.icon} />
      </span>
      <span className="omnimux-starter-label">{t(`guide.${card.id}.title`)}</span>
    </button>
  )
}

function StarterGroupSection({ group, starters, selectedId, t, onChoose }) {
  const matched = starters.filter((card) => card.group === group)
  return (
    <section className="omnimux-starter-group" data-starter-group={group} aria-label={t(`guide.${group}`)}>
      <h2>{t(`guide.${group}`)}</h2>
      <div className="omnimux-starter-cards">
        {matched.map((card) => (
          <StarterCardButton key={card.id} card={card} selectedId={selectedId} t={t} onChoose={onChoose} />
        ))}
      </div>
    </section>
  )
}

function StarterGroupList({ groups, starters, selectedId, t, onChoose }) {
  return (
    <div className="omnimux-starter-groups">
      {groups.map((group) => (
        <StarterGroupSection
          key={group}
          group={group}
          starters={starters}
          selectedId={selectedId}
          t={t}
          onChoose={onChoose}
        />
      ))}
    </div>
  )
}

function PopularStarterCard({ starter, t, onCardClick }) {
  return (
    <button key={starter.id} type="button" className="omnimux-popular-card" data-popular-starter-id={starter.id} onClick={() => onCardClick(starter)} /* exempt-ui01: popular starter card button */>
      <div className="omnimux-popular-cover">
        <PopularCardCover id={starter.id} />
      </div>
      <div className="omnimux-popular-footer">
        <span className="omnimux-popular-card-title">{t(`guide.popular.${starter.id}.title`)}</span>
        {starter.type === 'placeholder' && (
          <span className="omnimux-popular-tag">Coming</span>
        )}
      </div>
    </button>
  )
}

function PopularStarterGrid({ popularStarters, t, onCardClick }) {
  return (
    <section className="omnimux-popular-section" aria-label={t('guide.popular.title')}>
      <h2 className="omnimux-popular-title">{t('guide.popular.title')}</h2>
      <div className="omnimux-popular-grid">
        {popularStarters.map((starter) => (
          <PopularStarterCard key={starter.id} starter={starter} t={t} onCardClick={onCardClick} />
        ))}
      </div>
    </section>
  )
}

/** The owner hooks address the rendered session, including its first draft. */
export function SessionGuide(props) {
  const session = props.useSession((value) => value)
  const hasTargets = props.useConversation((value) => value.activeTargets.size > 0)
  const panelOpen = useSyncExternalStore(
    props.workbench.subscribe,
    () => {
      const snapshot = props.workbench.getSnapshot()
      return snapshot?.sessionId === props.sessionId && snapshot.state.panelOpen === true
    },
    () => false
  )
  if (panelOpen || !isBlankConversation(session, hasTargets)) return null
  return <BlankSessionGuide {...props} key={props.sessionId} />
}

function BlankSessionGuide({
  sessionId,
  useInput,
  inputActions,
  store,
  t,
  getCurrentSessionId,
  attachmentDrafts,
}) {
  const input = useInput((value) => value)
  const state = useSyncExternalStore(
    store.subscribe,
    () => store.get(sessionId),
    () => store.get(sessionId)
  )
  const [notice, setNotice] = useState(null)
  const [toastText, setToastText] = useState(null)
  const toastTimer = useRef(null)
  const [isInsightModalOpen, setIsInsightModalOpen] = useState(false)
  const [isUrlToVideoOpen, setIsUrlToVideoOpen] = useState(false)
  const [isRecreateModalOpen, setIsRecreateModalOpen] = useState(false)
  const [isBulkCreateAdsOpen, setIsBulkCreateAdsOpen] = useState(false)
  const [isCreativePresetsOpen, setIsCreativePresetsOpen] = useState(false)
  const guideRef = useRef(null)
  const live = useRef(null)
  const mounted = useRef(true)
  live.current = { input, state }

  const isSessionActive = () => {
    if (!mounted.current) return false
    if (!sessionId || sessionId === 'default') return false
    return getCurrentSessionId() === sessionId
  }

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
      clearTimeout(toastTimer.current)
    }
  }, [])

  function showToast(text) {
    setToastText(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => {
      if (mounted.current) setToastText(null)
    }, 2200)
  }

  function choose(card) {
    if (!isSessionActive() || input.phase !== 'plain' || !inputActions?.setDraft) {
      setNotice('unavailable')
      return
    }
    const result = selectStarter(live.current.state, live.current.input.draft, {
      id: card.id,
      prompt: t(`guide.${card.id}.prompt`),
    })
    if (result.status === 'unchanged') {
      focusEditor()
      return
    }
    try {
      inputActions.setDraft(result.draft)
      attachmentDrafts?.delete(sessionId)
      live.current = { ...live.current, state: result.state, input: { ...input, draft: result.draft } }
      store.set(sessionId, result.state)
      setNotice(null)
      focusEditor()
    } catch {
      setNotice('unavailable')
    }
  }

  function handlePopularClick(starter) {
    if (starter.id === 'marketing-insight') {
      setIsInsightModalOpen(true)
      return
    }
    if (starter.id === 'url-to-video') {
      setIsUrlToVideoOpen(true)
      return
    }
    if (starter.id === 'recreate-viral-ads') {
      setIsRecreateModalOpen(true)
      return
    }
    if (starter.id === 'bulk-create-ads') {
      setIsBulkCreateAdsOpen(true)
      return
    }
    if (starter.id === 'creative-presets') {
      setIsCreativePresetsOpen(true)
      return
    }
    showToast(t('guide.popular.placeholder-notice'))
  }

  function handleSubmitDraft(prompt) {
    setIsInsightModalOpen(false)
    setIsUrlToVideoOpen(false)
    setIsRecreateModalOpen(false)
    setIsBulkCreateAdsOpen(false)
    setIsCreativePresetsOpen(false)
    if (!isSessionActive() || !inputActions?.setDraft) {
      setNotice('unavailable')
      return
    }
    try {
      inputActions.setDraft(prompt)
      attachmentDrafts?.delete(sessionId)
      live.current = { ...live.current, input: { ...input, draft: prompt } }
      copyText(prompt)
      showToast(t('guide.insight.copied'))
      focusEditor()
    } catch {
      setNotice('unavailable')
    }
  }

  /**
   * 爆款对标吸底输入框提交：把复刻指令交回会话输入框所有权方。
   * 与上方模态框同源语义——只预填、不代发，用户保有最终发送权。
   */
  function handleTrendingApply(prompt) {
    if (!isSessionActive() || !inputActions?.setDraft) {
      setNotice('unavailable')
      return
    }
    try {
      inputActions.setDraft(prompt)
      attachmentDrafts?.delete(sessionId)
      live.current = { ...live.current, input: { ...input, draft: prompt } }
      setNotice(null)
      showToast(t('trending.applied'))
      focusEditor()
    } catch {
      setNotice('unavailable')
    }
  }

  return (
    <section
      ref={guideRef}
      className="omnimux-starter-guide"
      data-omnimux-starter-guide=""
      data-session-id={sessionId}
      aria-label={t('guide.title')}
    >
      {notice && (
        <div className="omnimux-starter-notice" role="status">
          {t(`guide.${notice}`)}
          {notice === 'unavailable' && (
            <button type="button" onClick={() => { setNotice(null); focusEditor() }} /* exempt-ui01: session starter button */>
              {t('guide.retry')}
            </button>
          )}
        </div>
      )}

      {/* Top 10 quick starters */}
      <StarterGroupList
        groups={STARTER_GROUPS}
        starters={STARTERS}
        selectedId={state.selectedId}
        t={t}
        onChoose={choose}
      />

      {/* Popular Ways to Get Started (4 Featured Cards) */}
      <PopularStarterGrid
        popularStarters={POPULAR_STARTERS}
        t={t}
        onCardClick={handlePopularClick}
      />

      {/* Trending Videos, Ready to Replicate */}
      <TrendingReplicateSection t={t} onApplyPrompt={handleTrendingApply} />

      {/* Marketing Insight Modal */}
      <MarketingInsightModal
        isOpen={isInsightModalOpen}
        onClose={() => setIsInsightModalOpen(false)}
        t={t}
        onSubmitDraft={handleSubmitDraft}
      />

      {/* URL to Video Modal */}
      <UrlToVideoModal
        isOpen={isUrlToVideoOpen}
        onClose={() => setIsUrlToVideoOpen(false)}
        t={t}
        onSubmitDraft={handleSubmitDraft}
      />

      {/* Recreate Viral Ads Modal */}
      <RecreateViralAdsModal
        isOpen={isRecreateModalOpen}
        onClose={() => setIsRecreateModalOpen(false)}
        t={t}
        onSubmitDraft={handleSubmitDraft}
      />

      {/* Bulk Create Ads Modal */}
      <BulkCreateAdsModal
        isOpen={isBulkCreateAdsOpen}
        onClose={() => setIsBulkCreateAdsOpen(false)}
        t={t}
        onSubmitDraft={handleSubmitDraft}
      />

      {/* Creative Presets Modal */}
      <CreativePresetsModal
        isOpen={isCreativePresetsOpen}
        onClose={() => setIsCreativePresetsOpen(false)}
        t={t}
        onSubmitDraft={handleSubmitDraft}
      />

      {/* Centered Toast Feedback */}
      {toastText && (
        <div className="omnimux-toast-pill" role="status">
          <div className="omnimux-toast-icon">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <span>{toastText}</span>
        </div>
      )}
    </section>
  )
}
