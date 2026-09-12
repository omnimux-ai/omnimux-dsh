import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TrendingFilterBar } from './TrendingFilterBar.jsx'
import { TrendingVideoCard } from './TrendingVideoCard.jsx'
import { buildClonePrompt, defaultTrendingFilters, selectTrendingVideos } from './trending-data.js'
import { SkillsPanel } from '../skills/SkillsPanel.jsx'
import { buildSkillPrompt } from '../skills/featured-skills-data.js'
import {
  EMPTY_CAPABILITIES,
  TRENDING_SOURCE_STATUS,
  loadTrendingItems,
  mergeCapabilities,
} from './trending-source.js'

/** 宿主上标记「原生输入框已停靠到会话视口底部」。 */
export const DOCK_OPEN_ATTR = 'data-omnimux-dock-open'

/** 停靠后输入框距会话视口底边的距离（px）。 */
const DOCK_BOTTOM = 20

/** 原生输入框在 Hero 中的舒适打字宽度，与宿主 `[data-composer-card]` 的 780px 上限一致。 */
const DOCK_MAX_WIDTH = 780

/** 承载 Hero 的滚动容器；输入框离开 Hero 会抽掉一块高度，用它做滚动补偿。 */
const SCROLLER_SELECTOR = '[class*="scrollBody"]'

const ICON_CHEVRON_DOWN = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
)

/** rAF 在无布局环境（JSDOM / SSR）可能不存在，退化成宏任务即可。 */
const scheduleFrame = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : (fn) => setTimeout(fn, 0)
const cancelFrame = typeof cancelAnimationFrame === 'function'
  ? cancelAnimationFrame
  : (id) => clearTimeout(id)

/**
 * 「Trending Videos, Ready to Replicate」爆款对标与一键复刻板块。
 *
 * 卡片数据来自灵感库真源（`/omnimux/inspiration/local`）：有数据就展示真实对标片，
 * 库为空或灵感社区未就绪就说清楚，**不回落任何编造的样本**。
 * 工具栏只渲染当前数据真的支持的维度（缺类目就没有类目下拉）。
 *
 * 复刻接管**不复制输入框**：点击复刻后把克隆指令写进官方原生输入框，
 * 并把那个原生输入框停靠到会话视口底部（附件、专家、模型、发送全是原生那一套）。
 * 板块只负责给出停靠几何（宿主 CSS 变量）与接管标记，复刻意图的落地仍由
 * `onApplyPrompt` 交回会话输入框所有权方处理——只预填，从不代发。
 *
 * @param {{
 *   t: (key: string, fallback?: string) => string,
 *   onApplyPrompt: (prompt: string, item: object) => void,
 * }} props
 */
export function TrendingReplicateSection({ t, onApplyPrompt }) {
  const [filters, setFilters] = useState(defaultTrendingFilters)
  const [dockedItem, setDockedItem] = useState(null)
  const [sourceItems, setSourceItems] = useState([])
  const [status, setStatus] = useState('loading')
  const [refreshing, setRefreshing] = useState(true)
  // 工具栏能力集是**单调**的：只并入不重算，否则筛选后档位会塌成只剩当前命中项
  const [capabilities, setCapabilities] = useState(EMPTY_CAPABILITIES)
  // 接管意图（dockedItem）与实际摆位（placement）分开：
  // 意图由「复刻」决定，摆位由滚动位置决定——滚回原位就让原生输入框回到流内。
  const [placement, setPlacement] = useState('docked')
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return sessionStorage.getItem('omnimux-guide-tab') || 'trending'
    } catch {
      return 'trending'
    }
  })

  const handleSwitchTab = (tab) => {
    setActiveTab(tab)
    try {
      sessionStorage.setItem('omnimux-guide-tab', tab)
    } catch {}
  }
  const prevDockedItemRef = useRef(null)
  const sectionRef = useRef(null)
  // 生效过的宿主根节点。卸载清理必须用它，而不是已被 React 解绑的 DOM ref。
  const dockHostRef = useRef(null)

  // 地区 / 类目 / 播放量下界交给服务端先过滤再取窗口；互动率门槛与排序在客户端做。
  const serverFilterKey = `${filters.region}|${filters.industry}|${filters.views}`

  useEffect(() => {
    const controller = new AbortController()
    let alive = true
    setRefreshing(true)
    loadTrendingItems({
      filters: { region: filters.region, industry: filters.industry, views: filters.views },
      signal: controller.signal,
    }).then((result) => {
      if (!alive || result.reason === 'aborted') return
      setSourceItems(result.items)
      setStatus(result.status)
      setRefreshing(false)
      if (result.items.length > 0) {
        setCapabilities((previous) => mergeCapabilities(previous, result.items))
      }
    })
    return () => {
      alive = false
      controller.abort()
    }
    // 只在「服务端过滤条件」变化时重取；filters 其余键由客户端处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverFilterKey])

  const { dimensions, regionOptions, industryOptions, viewOptions } = capabilities
  const items = useMemo(() => selectTrendingVideos(filters, sourceItems), [filters, sourceItems])

  // 被接管的卡片一旦不在当前结果里（换地区/换阈值），输入框要归还，
  // 不能让它停在一个屏幕上已经不存在的片子上。
  // 注意：技能卡片不受对标视频筛选影响（带 skill 标记），不得误归还。
  useEffect(() => {
    if (refreshing || !dockedItem) return
    if (!dockedItem.skill && !items.some((item) => item.id === dockedItem.id)) setDockedItem(null)
  }, [items, dockedItem, refreshing])

  const showToolbar = status === TRENDING_SOURCE_STATUS.ready || status === TRENDING_SOURCE_STATUS.filtered
  const showGrid = !refreshing && status !== TRENDING_SOURCE_STATUS.unavailable && items.length > 0
  const showFilteredEmpty = !refreshing && showToolbar && items.length === 0

  const patchFilters = (patch) => setFilters((prev) => ({ ...prev, ...patch }))
  const resetFilters = () => setFilters((prev) => ({ ...defaultTrendingFilters(), sort: prev.sort }))

  useLayoutEffect(() => {
    const root = sectionRef.current?.closest?.('[data-phase]')
    if (!root) return undefined
    dockHostRef.current = root

    const card = root.querySelector?.('[data-composer-card]')

    // 停靠几何取自输入框所在的 Hero 栏：它始终留在文档流里，
    // 即使输入框已经脱离流也保持原始的 left/width，缩放窗口时仍然算得准。
    const writeGeometry = () => {
      const band = card?.parentElement || root
      const rect = band?.getBoundingClientRect?.()
      if (!rect || rect.width <= 0) return
      const width = Math.min(DOCK_MAX_WIDTH, Math.max(0, rect.width - 24))
      const left = rect.left + (rect.width - width) / 2
      root.style.setProperty('--omnimux-dock-left', `${Math.round(left)}px`)
      root.style.setProperty('--omnimux-dock-width', `${Math.round(width)}px`)
      root.style.setProperty('--omnimux-dock-bottom', `${DOCK_BOTTOM}px`)
      const height = card?.getBoundingClientRect?.().height
      if (height) root.style.setProperty('--omnimux-dock-card-height', `${Math.round(height)}px`)
    }

    // FLIP 测量变更前：在变更任何属性与类名前，同步测量当前视觉绝对位置
    const from = card?.getBoundingClientRect?.()

    const scroller = root.querySelector?.(SCROLLER_SELECTOR) || null
    const before = sectionRef.current?.getBoundingClientRect?.().top

    const shouldDock = Boolean(dockedItem && placement === 'docked')
    const currentlyDocked = root.hasAttribute(DOCK_OPEN_ATTR)

    if (shouldDock) {
      writeGeometry()
      root.setAttribute(DOCK_OPEN_ATTR, '')
    } else {
      root.removeAttribute(DOCK_OPEN_ATTR)
    }

    const after = sectionRef.current?.getBoundingClientRect?.().top
    const intentChanged = prevDockedItemRef.current !== dockedItem
    prevDockedItemRef.current = dockedItem

    // 注意：滚动补偿仅在用户主动点击复刻/收起意图变更时发生，滚动中触发的 placement 切换绝不能做补偿，否则会死循环抖动。
    if (intentChanged && scroller && Number.isFinite(before) && Number.isFinite(after) && after !== before) {
      scroller.scrollTop += after - before
    }

    // FLIP 过渡：若吸底属性发生切换且前后具备有效布局，执行丝滑位移与透明度过渡
    let cancelAnim = null
    if (currentlyDocked !== shouldDock && card && from && from.width > 0 && from.height > 0) {
      const to = card.getBoundingClientRect?.()
      if (to && to.width > 0 && to.height > 0) {
        const dx = Math.round(from.left - to.left)
        const dy = Math.round(from.top - to.top)
        if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) {
          card.style.transition = 'none'
          card.style.transform = `translate(${dx}px, ${dy}px)`
          card.style.opacity = '0.85'
          const raf = scheduleFrame(() => {
            card.style.transition = 'transform 200ms cubic-bezier(0.2,0.9,0.3,1), opacity 160ms ease-out'
            card.style.transform = ''
            card.style.opacity = ''
          })
          const timer = setTimeout(() => {
            if (card) card.style.transition = ''
          }, 240)
          cancelAnim = () => {
            cancelFrame(raf)
            clearTimeout(timer)
            if (card) {
              card.style.transition = ''
              card.style.transform = ''
              card.style.opacity = ''
            }
          }
        }
      }
    }

    if (!dockedItem) {
      return () => {
        cancelAnim?.()
      }
    }

    // 窗口缩放与会话列变化都要重新算停靠几何
    const observer = typeof window.ResizeObserver === 'function'
      ? new window.ResizeObserver(writeGeometry)
      : null
    observer?.observe(root)
    if (card) observer?.observe(card)
    window.addEventListener('resize', writeGeometry)
    return () => {
      cancelAnim?.()
      observer?.disconnect()
      window.removeEventListener('resize', writeGeometry)
    }
  }, [dockedItem, placement])

  // 滚回原位就把输入框放回流内、滑开再吸回来；两个阈值分开做迟滞，避免边界反复横跳。
  useEffect(() => {
    if (!dockedItem) return undefined
    const root = dockHostRef.current
    const scroller = root?.querySelector?.(SCROLLER_SELECTOR) || null
    let frame = 0

    const evaluate = () => {
      frame = 0
      const card = root?.querySelector?.('[data-composer-card]')
      const band = card?.parentElement
      if (!band) return
      const rect = band.getBoundingClientRect?.()
      // 没有布局信息（JSDOM / 尚未挂载）时不猜，保持吸底
      if (!rect || (rect.width <= 0 && rect.height <= 0)) return
      const viewportH = window.innerHeight || document.documentElement?.clientHeight || 0
      const visible = rect.bottom > 0 && rect.top < viewportH
      setPlacement((prev) => {
        if (prev === 'docked') return visible ? 'inline' : prev
        // 离开视口 24px 以上才切回吸底
        return (rect.top > viewportH + 24 || rect.bottom < -24) ? 'docked' : prev
      })
    }

    const onScroll = () => {
      if (frame) return
      frame = scheduleFrame(evaluate)
    }

    evaluate()
    const target = scroller || window
    target.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) cancelFrame(frame)
      target.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [dockedItem])

  // 宿主卸载即归还输入框，避免残留标记把它永久停在底部
  useEffect(() => () => {
    const root = dockHostRef.current
    if (!root) return
    root.removeAttribute(DOCK_OPEN_ATTR)
    root.style.removeProperty('--omnimux-dock-left')
    root.style.removeProperty('--omnimux-dock-width')
    root.style.removeProperty('--omnimux-dock-bottom')
    root.style.removeProperty('--omnimux-dock-card-height')
    // FLIP 过渡写下的内联样式也要清掉，别把控件永久留在过渡态
    const card = root.querySelector?.('[data-composer-card]')
    if (card) {
      card.style.transform = ''
      card.style.transition = ''
      card.style.opacity = ''
    }
  }, [])

  /**
   * 点击复刻：把这一条对标片的克隆指令灌进原生输入框，并把原生输入框停靠到视口底部。
   * 再点同一张卡片即归还输入框——开合不依赖任何自绘控件。
   */
  const handleRecreate = (item) => {
    if (dockedItem?.id === item.id) {
      setDockedItem(null)
      return
    }
    const root = dockHostRef.current || sectionRef.current?.closest?.('[data-phase]')
    const card = root?.querySelector?.('[data-composer-card]')
    const band = card?.parentElement
    const rect = band?.getBoundingClientRect?.()
    const viewportH = window.innerHeight || document.documentElement?.clientHeight || 0
    if (rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < viewportH) {
      setPlacement('inline')
    } else {
      setPlacement('docked')
    }
    setDockedItem(item)
    onApplyPrompt?.(buildClonePrompt(item), item)
  }

  const handleSelectSkill = (skill) => {
    if (dockedItem?.id === skill.id) {
      setDockedItem(null)
      return
    }
    const root = dockHostRef.current || sectionRef.current?.closest?.('[data-phase]')
    const card = root?.querySelector?.('[data-composer-card]')
    const band = card?.parentElement
    const rect = band?.getBoundingClientRect?.()
    const viewportH = window.innerHeight || document.documentElement?.clientHeight || 0
    if (rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < viewportH) {
      setPlacement('inline')
    } else {
      setPlacement('docked')
    }
    setDockedItem(skill)
    onApplyPrompt?.(buildSkillPrompt(skill), skill)
  }

  return (
    <section
      ref={sectionRef}
      className="omnimux-trending"
      data-omnimux-trending=""
      data-omnimux-trending-source={status}
      aria-label={t('trending.title')}
    >
      <header className="omnimux-trending-head">
        <div className="omnimux-guide-tabs" role="tablist" aria-label={t('guide.tabs.label', '创作发现')}>
          <button /* exempt-ui01: session-guide 导航双 Tab */
            type="button"
            role="tab"
            id="tab-trending"
            aria-selected={activeTab === 'trending'}
            aria-controls="tabpanel-trending"
            className={`omnimux-guide-tab${activeTab === 'trending' ? ' is-active' : ''}`}
            onClick={() => handleSwitchTab('trending')}
          >
            {t('guide.tab.trending')}
            {status === TRENDING_SOURCE_STATUS.ready && activeTab === 'trending' ? (
              <span className="omnimux-trending-source-badge" title={t('trending.source.hint')}>
                {t('trending.source.badge')}
              </span>
            ) : null}
          </button>
          <button /* exempt-ui01: session-guide 导航双 Tab */
            type="button"
            role="tab"
            id="tab-skills"
            aria-selected={activeTab === 'skills'}
            aria-controls="tabpanel-skills"
            className={`omnimux-guide-tab${activeTab === 'skills' ? ' is-active' : ''}`}
            onClick={() => handleSwitchTab('skills')}
          >
            {t('guide.tab.skills')}
            {activeTab === 'skills' ? (
              <span className="omnimux-trending-source-badge">
                {t('skills.source.badge')}
              </span>
            ) : null}
          </button>
        </div>
        <p className="omnimux-trending-subtitle">
          {activeTab === 'skills' ? t('skills.subtitle') : t('trending.subtitle')}
        </p>
      </header>

      {activeTab === 'skills' ? (
        <div id="tabpanel-skills" role="tabpanel" aria-labelledby="tab-skills">
          <SkillsPanel
            t={t}
            onSelectSkill={handleSelectSkill}
            activeSkillId={dockedItem?.id}
          />
        </div>
      ) : (
        <div id="tabpanel-trending" role="tabpanel" aria-labelledby="tab-trending">
          {showToolbar ? (
            <TrendingFilterBar
              filters={filters}
              t={t}
              onChange={patchFilters}
              onReset={resetFilters}
              dimensions={dimensions}
              regionOptions={regionOptions}
              industryOptions={industryOptions}
              viewOptions={viewOptions}
            />
          ) : null}

          {showGrid ? (
            <div className="omnimux-trending-grid">
              {items.map((item) => (
                <TrendingVideoCard
                  key={item.id}
                  item={item}
                  t={t}
                  active={dockedItem?.id === item.id}
                  onRecreate={handleRecreate}
                />
              ))}
            </div>
          ) : null}

          {showFilteredEmpty ? (
            <div className="omnimux-trending-empty" data-omnimux-trending-empty="filtered">
              <p>{t('trending.empty')}</p>
              <button /* exempt-ui01: 空态复位属于轻量文本动作，非标准控件位 */
                type="button"
                className="omnimux-trending-reset"
                onClick={resetFilters}
              >
                {t('trending.filter.reset')}
              </button>
            </div>
          ) : null}

          {refreshing ? (
            <div className="omnimux-trending-empty" data-omnimux-trending-empty="loading">
              <p>{t('trending.loading')}</p>
            </div>
          ) : null}

          {status === TRENDING_SOURCE_STATUS.empty ? (
            <div className="omnimux-trending-empty" data-omnimux-trending-empty="library">
              <p>{t('trending.library.empty')}</p>
              <p className="omnimux-trending-empty-hint">{t('trending.library.emptyHint')}</p>
            </div>
          ) : null}

          {status === TRENDING_SOURCE_STATUS.unavailable ? (
            <div className="omnimux-trending-empty" data-omnimux-trending-empty="unavailable">
              <p>{t('trending.library.unavailable')}</p>
              <p className="omnimux-trending-empty-hint">{t('trending.library.unavailableHint')}</p>
            </div>
          ) : null}
        </div>
      )}

      {dockedItem && placement === 'docked' ? (
        <button /* exempt-ui01: 归还原生输入框属于轻量文本动作，非标准控件位 */
          type="button"
          className="omnimux-trending-undock"
          onClick={() => setDockedItem(null)}
        >
          <span className="omnimux-trending-undock-icon" aria-hidden="true">{ICON_CHEVRON_DOWN}</span>
          {t('trending.undock')}
        </button>
      ) : null}
    </section>
  )
}
