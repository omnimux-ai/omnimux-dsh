import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DockedComposer } from './DockedComposer.jsx'
import { TrendingFilterBar } from './TrendingFilterBar.jsx'
import { TrendingVideoCard } from './TrendingVideoCard.jsx'
import { defaultTrendingFilters, selectTrendingVideos } from './trending-data.js'

/** 宿主上标记「吸底输入框接管中」，用于顶部 Hero 输入框让位。 */
export const DOCK_OPEN_ATTR = 'data-omnimux-dock-open'

/**
 * 「Trending Videos, Ready to Replicate」爆款对标与一键复刻板块。
 *
 * 承载：标题 + 复合筛选工具栏 + 响应式 9:16 卡片矩阵 + 吸底浮动输入框。
 * 复刻意图的最终落地由 `onApplyPrompt` 交回会话输入框所有权方处理。
 *
 * @param {{
 *   t: (key: string, fallback?: string) => string,
 *   onApplyPrompt: (prompt: string, item: object) => void,
 *   modelLabel?: string,
 * }} props
 */
export function TrendingReplicateSection({ t, onApplyPrompt, modelLabel }) {
  const [filters, setFilters] = useState(defaultTrendingFilters)
  const [dockedItem, setDockedItem] = useState(null)
  const sectionRef = useRef(null)

  const items = useMemo(() => selectTrendingVideos(filters), [filters])

  const patchFilters = (patch) => setFilters((prev) => ({ ...prev, ...patch }))
  const resetFilters = () => setFilters(defaultTrendingFilters())

  // 吸底输入框接管期间，让顶部 Hero 输入框让位，形成「输入框迁移到底部」的观感
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return undefined
    const root = sectionRef.current?.closest?.('[data-phase]')
    if (!root) return undefined
    if (dockedItem) root.setAttribute(DOCK_OPEN_ATTR, '')
    else root.removeAttribute(DOCK_OPEN_ATTR)
    return () => root.removeAttribute(DOCK_OPEN_ATTR)
  }, [dockedItem])

  // 宿主卸载即释放接管标记，避免残留导致输入框永久隐藏
  useEffect(() => () => {
    if (typeof document === 'undefined') return
    const root = sectionRef.current?.closest?.('[data-phase]')
    root?.removeAttribute(DOCK_OPEN_ATTR)
  }, [])

  const handleSubmit = (prompt, item) => {
    setDockedItem(null)
    onApplyPrompt?.(prompt, item)
  }

  // 始终保留最后一次点击的样本，作为底部输入框的唯一内容源
  const handleRecreate = (item) => setDockedItem(item)

  return (
    <section
      ref={sectionRef}
      className="omnimux-trending"
      data-omnimux-trending=""
      aria-label={t('trending.title')}
    >
      <header className="omnimux-trending-head">
        <h2 className="omnimux-trending-title">{t('trending.title')}</h2>
        <p className="omnimux-trending-subtitle">{t('trending.subtitle')}</p>
      </header>

      <TrendingFilterBar
        filters={filters}
        t={t}
        onChange={patchFilters}
        onReset={resetFilters}
        total={items.length}
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
        <DockedComposer
          item={dockedItem}
          t={t}
          modelLabel={modelLabel}
          onSubmit={handleSubmit}
          onCancel={() => setDockedItem(null)}
        />
      ) : null}
    </section>
  )
}
