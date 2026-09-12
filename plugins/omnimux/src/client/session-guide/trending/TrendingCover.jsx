import React from 'react'
import { accentIndex } from './trending-data.js'

/**
 * 爆款对标视频封面（矢量自载）。
 *
 * 参考实现使用远端 CDN 的真实视频封面；此处以自绘矢量场景保证零外链、
 * 零首屏阻塞，并为后续接入真实封面保留 `item.cover` 直通分支。
 *
 * 六个构图原型覆盖样本库全部品类：
 * figure / comparison / macro / before-after / product-hero / unboxing
 */

const ARCHETYPE_SET = new Set([
  'figure',
  'comparison',
  'macro',
  'before-after',
  'product-hero',
  'unboxing',
])

function FigureScene() {
  return (
    <>
      <rect x="0" y="0" width="90" height="160" className="omx-trending-cover-base" />
      <rect x="18" y="0" width="6" height="160" className="omx-trending-cover-slat" />
      <rect x="34" y="0" width="6" height="160" className="omx-trending-cover-slat" />
      <rect x="50" y="0" width="6" height="160" className="omx-trending-cover-slat" />
      <rect x="66" y="0" width="6" height="160" className="omx-trending-cover-slat" />
      <circle cx="45" cy="34" r="13" className="omx-trending-cover-skin" />
      <path d="M24 52 Q45 44 66 52 L70 160 L20 160 Z" className="omx-trending-cover-garment" />
      <path d="M45 52 L45 160" className="omx-trending-cover-seam" />
      <circle cx="45" cy="34" r="13" className="omx-trending-cover-outline" />
    </>
  )
}

function ComparisonScene() {
  return (
    <>
      <rect x="0" y="0" width="90" height="160" className="omx-trending-cover-base" />
      <rect x="6" y="86" width="78" height="30" rx="5" className="omx-trending-cover-layer-1" />
      <rect x="6" y="112" width="78" height="30" rx="5" className="omx-trending-cover-layer-2" />
      <rect x="6" y="60" width="78" height="30" rx="5" className="omx-trending-cover-layer-3" />
      <rect x="6" y="18" width="78" height="18" rx="4" className="omx-trending-cover-tagline" />
      <path d="M14 32 H76" className="omx-trending-cover-scale" />
      <path d="M26 32 V42 M64 32 V42" className="omx-trending-cover-scale" />
    </>
  )
}

function MacroScene() {
  return (
    <>
      <rect x="0" y="0" width="90" height="160" className="omx-trending-cover-base" />
      <circle cx="45" cy="72" r="34" className="omx-trending-cover-ring-outer" />
      <circle cx="45" cy="72" r="22" className="omx-trending-cover-ring-inner" />
      <circle cx="45" cy="72" r="9" className="omx-trending-cover-core" />
      <path d="M45 12 V132" className="omx-trending-cover-axis" />
      <path d="M20 22 V50 M70 22 V50 M20 96 V124 M70 96 V124" className="omx-trending-cover-teeth" />
    </>
  )
}

function BeforeAfterScene() {
  return (
    <>
      <rect x="0" y="0" width="90" height="160" className="omx-trending-cover-base" />
      <path d="M0 160 L90 26 L90 160 Z" className="omx-trending-cover-after" />
      <path d="M0 0 L0 160 L44 160 Z" className="omx-trending-cover-before" />
      <path d="M0 160 L90 26" className="omx-trending-cover-divider" />
      <circle cx="45" cy="82" r="8" className="omx-trending-cover-handle" />
      <path d="M41 79 L44 82 L41 85 M49 79 L46 82 L49 85" className="omx-trending-cover-handle-arrow" />
    </>
  )
}

function ProductHeroScene() {
  return (
    <>
      <rect x="0" y="0" width="90" height="160" className="omx-trending-cover-base" />
      <circle cx="45" cy="72" r="30" className="omx-trending-cover-halo" />
      <rect x="33" y="46" width="24" height="56" rx="8" className="omx-trending-cover-product" />
      <rect x="38" y="38" width="14" height="10" rx="3" className="omx-trending-cover-product-cap" />
      <rect x="36" y="72" width="18" height="16" rx="3" className="omx-trending-cover-label" />
      <ellipse cx="45" cy="122" rx="26" ry="4" className="omx-trending-cover-shadow" />
    </>
  )
}

function UnboxingScene() {
  return (
    <>
      <rect x="0" y="0" width="90" height="160" className="omx-trending-cover-base" />
      <path d="M20 74 L45 60 L70 74 L70 124 L20 124 Z" className="omx-trending-cover-box" />
      <path d="M20 74 L45 88 L70 74" className="omx-trending-cover-box-fold" />
      <path d="M45 88 V124" className="omx-trending-cover-box-fold" />
      <circle cx="31" cy="46" r="7" className="omx-trending-cover-item-1" />
      <circle cx="45" cy="38" r="8" className="omx-trending-cover-item-2" />
      <circle cx="59" cy="46" r="7" className="omx-trending-cover-item-3" />
    </>
  )
}

const SCENE_MAP = {
  figure: FigureScene,
  comparison: ComparisonScene,
  macro: MacroScene,
  'before-after': BeforeAfterScene,
  'product-hero': ProductHeroScene,
  unboxing: UnboxingScene,
}

/**
 * @param {{ item: { id: string, title?: string, archetype?: string, cover?: string } }} props
 */
export function TrendingCover({ item }) {
  const cover = typeof item?.cover === 'string' ? item.cover.trim() : ''
  if (cover) {
    return (
      <img
        className="omx-trending-cover-img"
        src={cover}
        alt=""
        loading="lazy"
        decoding="async"
        aria-hidden="true"
      />
    )
  }

  const archetype = ARCHETYPE_SET.has(item?.archetype) ? item.archetype : 'product-hero'
  const Scene = SCENE_MAP[archetype]
  return (
    <svg
      className="omx-trending-cover-svg"
      data-archetype={archetype}
      data-accent={accentIndex(item?.id)}
      viewBox="0 0 90 160"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <Scene />
    </svg>
  )
}
