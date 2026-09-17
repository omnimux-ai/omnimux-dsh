import React from 'react'

/**
 * Transitions.dev Pro 级别有机流体微光折射动效组件
 * 复用创作画布核心流光折射体系：
 * 1. 多色环状光谱背景场（多彩弥散底光）
 * 2. SVG 湍流折射液体波浪层（4000ms 匀速往返平移，有机液体流动）
 * 3. 外圈边缘发光多层系统（深层、中层、1px 彩色轮廓发光边框）
 * 4. 动态同步线性过渡遮罩层
 */
export function OrganicShimmerOverlay({ className = '', style = {}, playing = true }) {
  return (
    <div
      className={`wf-organic-shimmer ${className}`}
      style={style}
      data-playing={playing ? 'true' : 'false'}
      aria-hidden="true"
    >
      <div className="wf-organic-shimmer__canvas" aria-hidden="true">
        {/* 1. 多色环状光谱背景场（多彩弥散底光） */}
        <div className="wf-organic-shimmer__field" />

        {/* 2. SVG 湍流折射液体波浪层（核心有机流动效果） */}
        <div className="wf-organic-shimmer__distortion" />

        {/* 3. 外圈边缘发光多层系统 */}
        <div className="wf-organic-shimmer__glow-layer">
          <div className="wf-organic-shimmer__glow-wrap">
            <div className="wf-organic-shimmer__glow-deep" />
            <div className="wf-organic-shimmer__glow-mid" />
            <div className="wf-organic-shimmer__glow-border" />
          </div>
        </div>

        {/* 4. 动态同步线性过渡遮罩层（与背景色融合） */}
        <div className="wf-organic-shimmer__mask" />
      </div>
    </div>
  )
}

export default OrganicShimmerOverlay
