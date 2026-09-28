import React from 'react';

/**
 * OrganicShimmerOverlay
 * 纯视觉有机流体微光折射动效（100% 零文字、零按钮）
 * 包含：
 * 1. .wf-organic-shimmer__field: 多色环状弥散光谱底场
 * 2. .wf-organic-shimmer__distortion: SVG 湍流折射液体波浪层
 * 3. .wf-organic-shimmer__glow-layer: 三层微光边缘系统 (deep / mid / border)
 * 4. .wf-organic-shimmer__mask: 动态同步过渡遮罩层
 */
export function OrganicShimmerOverlay({ className = '', style, playing = true }) {
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
  );
}

export default OrganicShimmerOverlay;
