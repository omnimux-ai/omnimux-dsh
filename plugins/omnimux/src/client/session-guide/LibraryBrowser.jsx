import React, { useEffect, useRef, useState } from 'react'
import { AssetPickerCard } from '../components/asset-picker/AssetPickerCard.jsx'
import { ProductPickerCard } from '../components/product-picker/ProductPickerCard.jsx'
import { InspirationPickerCard } from '../components/inspiration-picker/InspirationPickerCard.jsx'
import { ensureAssetCardStyles } from '../components/asset-picker/AssetPickerCard.jsx'
import { ensureProductCardStyles } from '../components/product-picker/ProductPickerCard.jsx'
import { ensureInspirationCardStyles } from '../components/inspiration-picker/InspirationPickerCard.jsx'
import { TrendingVideoCard } from './trending/TrendingVideoCard.jsx'
import {
  LIBRARY_TABS,
  loadLibraryCards,
  tabForKind,
} from '../composer-add/library-stage-model.js'

const EMPTY_TEXT = {
  assets: '资产库还是空的。先去导入素材，再回到这里挑选。',
  inspiration: '本地灵感库还是空的。先去导入作品，再回到这里挑选。',
  products: '产品库还是空的。先去添加产品，再回到这里挑选。',
  trending: '云端暂时没有可对标的爆款。',
  featured: '暂时没有可挑选的素材。',
}

function laneClass(lane) {
  if (lane === 'trending') return 'is-trending'
  if (lane === 'inspiration') return 'is-inspiration'
  return 'is-square'
}

function LibraryCard({ card, t, onPick }) {
  if (card.lane === 'assets') {
    return (
      <AssetPickerCard
        asset={card.raw}
        typeLabel=""
        alreadyLabel=""
        missingLabel=""
        onToggle={() => onPick(card)}
      />
    )
  }
  if (card.lane === 'products') {
    return (
      <ProductPickerCard
        product={card.raw}
        typeLabel=""
        onSelect={() => onPick(card)}
      />
    )
  }
  if (card.lane === 'trending' && card.trending) {
    return (
      <TrendingVideoCard
        item={card.trending}
        t={t}
        onRecreate={() => onPick(card)}
      />
    )
  }
  return (
    <InspirationPickerCard
      item={card.raw}
      alreadyLabel=""
      onToggle={() => onPick(card)}
    />
  )
}

/**
 * 加号选素材的整页。分类钉在上方，卡片铺满中间。
 * 不负责把素材写进输入框，点卡片只把选中项交回去。
 */
export function LibraryBrowser({ model, t }) {
  const tab = model?.tab || tabForKind(model?.kind)
  const [result, setResult] = useState({ cards: [], errors: {}, lanes: [] })
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    ensureAssetCardStyles()
    ensureProductCardStyles()
    ensureInspirationCardStyles()
  }, [])

  const onCloseRef = useRef(model?.onClose)
  onCloseRef.current = model?.onClose

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    let live = true
    setLoading(true)
    loadLibraryCards(tab).then((next) => {
      if (!live) return
      setResult(next)
      setLoading(false)
    }).catch((caught) => {
      if (!live) return
      setResult({
        cards: [],
        errors: { featured: { message: caught instanceof Error ? caught.message : String(caught) } },
        lanes: [],
      })
      setLoading(false)
    })
    return () => { live = false }
  }, [tab, attempt])

  const errors = Object.values(result.errors || {})
  const loginOnly = errors.length > 0 && errors.every((error) => error.code === 'need-login')
  const failure = errors[0]?.message || ''

  return (
    <section className="omnimux-library-stage" data-omnimux-library-stage="" aria-label="挑选素材">
      <div className="omnimux-library-stage-tabs" role="tablist" aria-label="素材分类">
        <button
          type="button"
          className="omnimux-library-stage-back"
          aria-label="返回首页"
          onClick={() => model?.onClose?.()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>返回</span>
        </button>
        {LIBRARY_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`omnimux-library-stage-tab${tab === item.id ? ' is-active' : ''}`}
            onClick={() => model?.onTab?.(item.id)}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className="omnimux-library-stage-close"
          aria-label="关闭素材"
          onClick={() => model?.onClose?.()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {loading ? <p className="omnimux-library-stage-status">正在加载素材…</p> : null}
      {!loading && failure && result.cards.length === 0 ? (
        <div className="omnimux-library-stage-status">
          <p>{loginOnly ? '登录后可查看云端灵感。' : failure}</p>
          {!loginOnly ? (
            <button type="button" className="omnimux-library-stage-retry" onClick={() => setAttempt((value) => value + 1)}>
              重试
            </button>
          ) : null}
        </div>
      ) : null}
      {!loading && !failure && result.cards.length === 0 ? (
        <p className="omnimux-library-stage-status">{EMPTY_TEXT[tab] || EMPTY_TEXT.featured}</p>
      ) : null}

      <div className={`omnimux-library-stage-grid${tab === 'featured' ? ' is-mixed' : ''}`}>
        {result.cards.map((card) => (
          <div
            key={`${card.lane}:${card.id}`}
            className={`omnimux-library-stage-cell ${laneClass(card.lane)}`}
            data-library-lane={card.lane}
          >
            <LibraryCard card={card} t={t} onPick={(picked) => model?.onPick?.(picked)} />
          </div>
        ))}
      </div>
    </section>
  )
}
