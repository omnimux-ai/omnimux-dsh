import React from 'react'
import { UniversalLibraryCard } from '../../../omnimux/src/client/components/library-flow/UniversalLibraryCard.jsx'

/**
 * 极简素材卡片（AssetHubCard）代理
 * 对齐新会话 UniversalLibraryCard 单一真源，彻底废除 16:10 强行裁切
 */
export function AssetHubCard({
  item,
  isSelected = false,
  onAttach,
}) {
  return (
    <UniversalLibraryCard
      card={item}
      isSelected={isSelected}
      onAttach={onAttach}
    />
  )
}
