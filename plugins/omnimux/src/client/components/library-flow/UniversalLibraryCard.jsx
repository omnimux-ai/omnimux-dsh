import React, { useEffect } from 'react'
import { AssetPickerCard, ensureAssetCardStyles } from '../asset-picker/AssetPickerCard.jsx'
import { ProductPickerCard, ensureProductCardStyles } from '../product-picker/ProductPickerCard.jsx'
import { InspirationPickerCard, ensureInspirationCardStyles } from '../inspiration-picker/InspirationPickerCard.jsx'
import { TrendingVideoCard } from '../../session-guide/trending/TrendingVideoCard.jsx'

/**
 * 通用卡片分发器 (UniversalLibraryCard)
 *
 * 统一收敛来自新会话、素材挑选弹窗与右侧侧边栏的所有卡片形态：
 * - lane === 'trending'    -> TrendingVideoCard (爆款对标视频)
 * - lane === 'inspiration' -> InspirationPickerCard (灵感素材)
 * - lane === 'assets'      -> AssetPickerCard (资产中心)
 * - lane === 'products'    -> ProductPickerCard (商品库)
 * - 兜底回落 -> InspirationPickerCard
 */
export function UniversalLibraryCard({
  card,
  t = (key, fallback) => fallback || key,
  isSelected = false,
  onPick,
  onAttach,
}) {
  useEffect(() => {
    ensureAssetCardStyles()
    ensureProductCardStyles()
    ensureInspirationCardStyles()
  }, [])

  if (!card) return null

  const lane = card.lane || card.raw?.lane || 'inspiration'
  const handleAction = () => {
    if (typeof onPick === 'function') {
      onPick(card)
    } else if (typeof onAttach === 'function') {
      onAttach(card)
    }
  }

  // 1. 资产库卡片
  if (lane === 'assets') {
    const asset = card.raw || card
    return (
      <AssetPickerCard
        asset={asset}
        typeLabel=""
        alreadyLabel=""
        missingLabel=""
        selected={isSelected}
        onToggle={handleAction}
      />
    )
  }

  // 2. 商品库卡片
  if (lane === 'products') {
    const product = { ...(card.raw || {}), ...card }
    return (
      <ProductPickerCard
        product={product}
        typeLabel=""
        selected={isSelected}
        onSelect={handleAction}
      />
    )
  }

  // 3. 爆款趋势短视频卡片
  if (lane === 'trending' || card.trending) {
    const trendingItem = card.trending || card.raw || card
    return (
      <TrendingVideoCard
        item={trendingItem}
        t={t}
        active={isSelected}
        onRecreate={handleAction}
      />
    )
  }

  // 4. 灵感库与默认回退卡片
  const raw = card.raw || {}
  const previewUrl = (
    card.previewUrl ||
    card.thumbnailUrl ||
    raw.previewUrl ||
    raw.coverUrl ||
    raw.cover ||
    raw.poster ||
    ''
  )

  const inspirationItem = {
    ...raw,
    ...card,
    previewUrl,
  }

  return (
    <InspirationPickerCard
      item={inspirationItem}
      alreadyLabel=""
      selected={isSelected}
      onToggle={handleAction}
    />
  )
}
