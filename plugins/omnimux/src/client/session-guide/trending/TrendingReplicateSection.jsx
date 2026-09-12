import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TrendingFilterBar } from './TrendingFilterBar.jsx'
import { TrendingVideoCard } from './TrendingVideoCard.jsx'
import { buildClonePrompt, defaultTrendingFilters, selectTrendingVideos } from './trending-data.js'

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

/**
 * 「Trending Videos, Ready to Replicate」爆款对标与一键复刻板块。
 *
 * 承载：标题 + 复合筛选工具栏 + 响应式 9:16 卡片矩阵。
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
  const sectionRef = useRef(null)
  // 生效过的宿主根节点。卸载清理必须用它，而不是已被 React 解绑的 DOM ref。
  const dockHostRef = useRef(null)

  const items = useMemo(() => selectTrendingVideos(filters), [filters])

  const patchFilters = (patch) => setFilters((prev) => ({ ...prev, ...patch }))
  const resetFilters = () => setFilters(defaultTrendingFilters())

  useLayoutEffect(() => {
    const root = sectionRef.current?.closest?.('[data-phase]')
    if (!root) return undefined
    dockHostRef.current = root

    // 停靠几何取自输入框所在的 Hero 栏：它始终留在文档流里，
    // 即使输入框已经脱离流也保持原始的 left/width，缩放窗口时仍然算得准。
    const writeGeometry = () => {
      const card = root.querySelector?.('[data-composer-card]')
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

    // 输入框脱离文档流会让下方内容整体上移，整页跟着跳一下。
    // 在同一帧内量出板块位移并补偿滚动，用户看不到版面跳动。
    const scroller = root.querySelector?.(SCROLLER_SELECTOR) || null
    const before = sectionRef.current?.getBoundingClientRect?.().top

    if (dockedItem) {
      writeGeometry()
      root.setAttribute(DOCK_OPEN_ATTR, '')
    } else {
      root.removeAttribute(DOCK_OPEN_ATTR)
    }

    const after = sectionRef.current?.getBoundingClientRect?.().top
    if (scroller && Number.isFinite(before) && Number.isFinite(after) && after !== before) {
      scroller.scrollTop += after - before
    }

    if (!dockedItem) return undefined

    // 窗口缩放与会话列变化都要重新算停靠几何
    const observer = typeof window.ResizeObserver === 'function'
      ? new window.ResizeObserver(writeGeometry)
      : null
    observer?.observe(root)
    const card = root.querySelector?.('[data-composer-card]')
    if (card) observer?.observe(card)
    window.addEventListener('resize', writeGeometry)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', writeGeometry)
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
  }, [])

  /**
   * 点击复刻：把这一条样本的克隆指令灌进原生输入框，并把原生输入框停靠到视口底部。
   * 再点同一张卡片即归还输入框——开合不依赖任何自绘控件。
   */
  const handleRecreate = (item) => {
    if (dockedItem?.id === item.id) {
      setDockedItem(null)
      return
    }
    setDockedItem(item)
    onApplyPrompt?.(buildClonePrompt(item), item)
  }

  return (
    <section
      ref={sectionRef}
      className="omnimux-trending"
      data-omnimux-trending=""
      aria-label={t('trending.title')}
    >
      <header className="omnimux-trending-head">
        <h2 className="omnimux-trending-title">
          {t('trending.title')}
          <span className="omnimux-trending-sample-badge" title={t('trending.sample.hint')}>
            {t('trending.sample.badge')}
          </span>
        </h2>
        <p className="omnimux-trending-subtitle">{t('trending.subtitle')}</p>
      </header>

      <TrendingFilterBar
        filters={filters}
        t={t}
        onChange={patchFilters}
        onReset={resetFilters}
      />

      {items.length > 0 ? (
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
      ) : (
        <div className="omnimux-trending-empty">
          <p>{t('trending.empty')}</p>
          <button /* exempt-ui01: 空态复位属于轻量文本动作，非标准控件位 */
            type="button"
            className="omnimux-trending-reset"
            onClick={resetFilters}
          >
            {t('trending.filter.reset')}
          </button>
        </div>
      )}

      {dockedItem ? (
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
