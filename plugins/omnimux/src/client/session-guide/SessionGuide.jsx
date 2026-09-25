import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { STARTERS, STARTER_GROUPS } from './catalog.js'
import { isBlankConversation, selectStarter } from './state.js'
import { StarterIcon } from './StarterIcon.jsx'
import { TrendingReplicateSection } from './trending/TrendingReplicateSection.jsx'
import { ExploreTemplatesSection } from './templates/ExploreTemplatesSection.jsx'
import { LIBRARY_STAGE_PROMPT_EVENT, mergeLibraryPrompt } from '../composer-add/library-stage-model.js'
import { useComposerDocking, ICON_CHEVRON_DOWN } from './useComposerDocking.js'
import { getRightSidebarCollapsedSnapshot, getSplitCompactSnapshot, subscribeSplitCompactLayout } from '../split-compact-layout.js'
import { publishActiveSkill, requestSkillAttach } from '../composer-add/skill-event.ts'

/** 没有 workbench 注入时的空订阅，保持 useSyncExternalStore 的引用稳定。 */
const NOOP_SUBSCRIBE = () => () => {}

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

/** The owner hooks address the rendered session, including its first draft. */
export function SessionGuide(props) {
  const session = props.useSession((value) => value)
  const hasTargets = props.useConversation((value) => value.activeTargets.size > 0)
  // 内存里的 panelOpen 只看全局开关，不再要求 sessionId 相等：右侧打开技能/专家等
  // 全局 Tab 时 sessionId 未必等于本会话，相等判断会把分栏误判成全屏。
  const workbench = props.workbench
  const panelOpen = useSyncExternalStore(
    workbench?.subscribe ?? NOOP_SUBSCRIBE,
    () => workbench?.getSnapshot?.()?.state?.panelOpen === true,
    () => false
  )
  // 但内存 panelOpen 只会被「打开面板」单向写入：官方右栏被点掉后没有观察者把这次
  // 原生折叠写回 workbench state，残留的 panelOpen:true 会把完整引导永久挡在门外
  // （收起右栏后会话列已 1448px、镜像属性也已撤除，界面却只剩一个空输入框）。
  // DOM 一旦确证右栏已折叠就作废这条内存态 —— 内存态不得覆盖 DOM 实测。
  const rightbarCollapsed = useSyncExternalStore(
    subscribeSplitCompactLayout,
    getRightSidebarCollapsedSnapshot,
    () => false
  )
  // 内存状态会被 closePanel() 写成 false 而真实侧栏仍展开，所以再实测一次宿主布局：
  // 右侧侧栏展开 / 会话列被挤窄 / 输入框降到紧凑档，任一命中都只保留简洁对话模式。
  const splitCompact = useSyncExternalStore(
    subscribeSplitCompactLayout,
    getSplitCompactSnapshot,
    () => false
  )
  if (!isBlankConversation(session, hasTargets)) return null
  const effectivePanelOpen = panelOpen && !rightbarCollapsed
  const isCompact = effectivePanelOpen || splitCompact
  return <BlankSessionGuide {...props} isCompact={isCompact} key={props.sessionId} />
}

function BlankSessionGuide({
  sessionId,
  useInput,
  inputActions,
  store,
  t,
  getCurrentSessionId,
  isCompact = false,
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
  const guideRef = useRef(null)
  const live = useRef(null)
  const mounted = useRef(true)
  const applyDraftRef = useRef(null)
  live.current = { input, state }
  const isEn = typeof t === 'function' ? (t('locale') === 'en' || t('guide.locale') === 'en') : false

  const handleUndock = useCallback(() => {
    const store = typeof window !== 'undefined' ? window.__omnimuxAttachments : null
    store?.clear?.(sessionId)
  }, [sessionId])

  const {
    dockedItem,
    placement,
    dock,
    undock,
    isDocked,
  } = useComposerDocking({
    hostRef: guideRef,
    onUndock: handleUndock,
  })

  const isSessionActive = () => {
    if (!mounted.current) return false
    if (!sessionId || sessionId === 'default') return false
    return getCurrentSessionId() === sessionId
  }

  function focusEditor() {
    const root = guideRef.current?.closest('[data-omnimux-starter-host]')
    // 必须 `preventScroll`：否则浏览器原生 focus 会把视口拉回输入框所在的原位，
    // 让刚吸底到视口底部的输入框连同页面一起跳回顶部。
    root?.querySelector('[data-composer-input="true"]')?.focus({ preventScroll: true })
  }

  useEffect(() => {
    const onPrompt = (event) => {
      const detail = event.detail || {}
      if (detail.sessionId && detail.sessionId !== sessionId) return
      const prompt = String(detail.prompt || '')
      if (!prompt) return
      applyDraftRef.current?.(mergeLibraryPrompt(live.current?.input?.draft || '', prompt), {
        toastKey: null,
        restoreNotice: true,
      })
    }
    window.addEventListener(LIBRARY_STAGE_PROMPT_EVENT, onPrompt)
    return () => {
      window.removeEventListener(LIBRARY_STAGE_PROMPT_EVENT, onPrompt)
    }
  }, [sessionId])

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
      live.current = { ...live.current, state: result.state, input: { ...input, draft: result.draft } }
      store.set(sessionId, result.state)
      setNotice(null)
      focusEditor()
    } catch {
      setNotice('unavailable')
    }
  }

  /**
   * 把一段意图写入官方会话输入框（唯一副作用 = setDraft + 聚焦，从不代发）。
   *
   * 探索模板与爆款对标吸底输入框共用本函数，差异只在 toast 文案与
   * `restoreNotice`（用户手动操作时清掉上一轮的「输入框未就绪」提示）。
   * `toastKey` 可缺省：调用方已有更直接的界面证据（如附件缩略图、
   * 技能药丸）时不再叠一层弹窗。
   *
   * @param {string} prompt
   * @param {{ toastKey?: string | null, restoreNotice?: boolean, copy?: boolean }} options
   */
  function applyDraftToComposer(prompt, { toastKey = null, restoreNotice = false, copy = false }) {
    if (!isSessionActive() || !inputActions?.setDraft) {
      setNotice('unavailable')
      return
    }
    try {
      inputActions.setDraft(prompt)
      live.current = { ...live.current, input: { ...input, draft: prompt } }
      if (copy) copyText(prompt)
      if (restoreNotice) setNotice(null)
      if (toastKey) showToast(t(toastKey))
      focusEditor()
    } catch {
      setNotice('unavailable')
    }
  }

  applyDraftRef.current = applyDraftToComposer

  /**
   * 爆款对标吸底输入框提交：把复刻指令交回会话输入框所有权方。
   * 只预填、不代发，用户保有最终发送权。
   * 不弹 toast：复刻对象已挂成附件缩略图、技能药丸也已点亮，
   * 界面本身即是回执，再弹一层提示只会变成视觉干扰。
   */
  function handleTrendingApply(prompt) {
    applyDraftRef.current?.(prompt, { toastKey: null, restoreNotice: true })
  }

  /**
   * 模板/应用类型复刻：如果为 AI 应用，直接直通；如果是常规模板则吸底就位后延迟预填 Prompt（零弹窗、零跳动）
   */
  function handleExploreTemplateApply(payload) {
    if (payload?.appId) {
      return
    }
    if (!payload?.prompt) return
    const docked = dock(payload, () => {
      applyDraftRef.current?.(payload.prompt, {
        toastKey: null,
        restoreNotice: true,
        copy: false,
      })
    })
    if (!docked) {
      // 再次点击同一卡片反悔：清空草稿与附件
      applyDraftRef.current?.('', { toastKey: null, restoreNotice: true })
      const store = typeof window !== 'undefined' ? window.__omnimuxAttachments : null
      store?.clear?.(sessionId)
    }
  }

  /**
   * TikTok 热门复刻：挂载灵感文件附件上下文，吸底就位后延迟预填对标 Prompt（零弹窗、零跳动）
   */
  function handleExploreTrendingApply(payload) {
    if (!payload) return
    const id = payload.id || ''
    const title = payload.title || '热门视频'
    const breakdown = payload.breakdown ? ` · 分镜拆解：${payload.breakdown}` : ''
    const prompt = `请基于灵感文件 #${id}（${title}${breakdown}），为我的产品对标还原其黄金节奏与分镜镜头。`

    const docked = dock(payload, () => {
      applyDraftRef.current?.(prompt, {
        toastKey: null,
        restoreNotice: true,
        copy: false,
      })
    })
    if (!docked) {
      applyDraftRef.current?.('', { toastKey: null, restoreNotice: true })
      const store = typeof window !== 'undefined' ? window.__omnimuxAttachments : null
      store?.clear?.(sessionId)
    }
  }

  /**
   * 选用技能：名称只出现在技能按钮旁的标签上，输入框只预填一句说明请求，
   * 不再写入斜杠指令。再次点击同一张卡片时连同标签一起撤下。
   */
  function handleExploreSkillApply(payload) {
    if (!payload) return
    const rawSlug = payload.skill || payload.slug || payload.item?.skill || payload.item?.slug || (typeof payload.id === 'string' ? payload.id.replace(/^sk-omx-/, '') : '') || ''
    const cleanSlug = rawSlug.replace(/^\/+/, '').trim()
    const displayName = payload.title || payload.item?.title || payload.name || cleanSlug
    const prompt = isEn
      ? 'Please explain the best way to use this skill.'
      : '为我解释下这个技能的最佳使用方式。'

    const docked = dock(payload, () => {
      if (cleanSlug) {
        requestSkillAttach({
          id: payload.id || '',
          slug: cleanSlug,
          skill: cleanSlug,
          name: displayName,
          title: displayName,
        })
      }
      applyDraftRef.current?.(prompt, {
        toastKey: null,
        restoreNotice: true,
        copy: false,
      })
    })
    if (!docked) {
      publishActiveSkill(null)
      applyDraftRef.current?.('', { toastKey: null, restoreNotice: true })
      const store = typeof window !== 'undefined' ? window.__omnimuxAttachments : null
      store?.clear?.(sessionId)
    }
  }

  return (
    <section
      ref={guideRef}
      className={`omnimux-starter-guide${isCompact ? ' is-compact' : ''}`}
      data-omnimux-starter-guide=""
      data-compact={isCompact ? 'true' : undefined}
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

      {/* 仅在非紧凑态（全宽大屏）下渲染下方卡片流；分栏紧凑态下只保留简洁对话模式 */}
      {!isCompact && (
        <>
          {/* 探索模板核心专区（内含 Skills 与各分类单行货架） */}
          <ExploreTemplatesSection
            onApplyTemplate={handleExploreTemplateApply}
            onApplyTrending={handleExploreTrendingApply}
            onApplySkill={handleExploreSkillApply}
            t={t}
          />

          {/* 兼容测试契约保留 */}
          <div style={{ display: 'none' }}>
            <TrendingReplicateSection t={t} onApplyPrompt={handleTrendingApply} sessionId={sessionId} />
          </div>
        </>
      )}

      {/* 吸底时浮现的收起/归还按钮 */}
      {isDocked && (
        <button /* exempt-ui01: 归还原生输入框属于轻量文本动作，非标准控件位 */
          type="button"
          className="omnimux-trending-undock"
          onClick={undock}
          aria-label={typeof t === 'function' ? (t('trending.undock') || '收起输入框') : '收起输入框'}
        >
          <span className="omnimux-trending-undock-icon" aria-hidden="true">
            {ICON_CHEVRON_DOWN}
          </span>
          {typeof t === 'function' ? (t('trending.undock') || '收起输入框') : '收起输入框'}
        </button>
      )}

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
