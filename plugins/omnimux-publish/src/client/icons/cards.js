import React from 'react'

/**
 * 发布卡片专用矢量图标（UI04：禁用 Emoji/字符图标）。
 * 与 RecordsTable 内联图标同源：16/24 栅格、stroke=currentColor、2px 线宽。
 * @param {{ size?: number, className?: string }} props
 */
export function IconImageType({ size = 16, className, ...props } = {}) {
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      className,
      ...props,
    },
    React.createElement('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2, ry: 2 }),
    React.createElement('circle', { cx: 8.5, cy: 8.5, r: 1.5 }),
    React.createElement('polyline', { points: '21 15 16 10 5 21' })
  )
}

/**
 * 视频类型图标（胶片栅格）。
 * @param {{ size?: number, className?: string }} props
 */
export function IconVideoType({ size = 16, className, ...props } = {}) {
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      className,
      ...props,
    },
    React.createElement('rect', { x: 2, y: 2, width: 20, height: 20, rx: 2.18, ry: 2.18 }),
    React.createElement('line', { x1: 7, y1: 2, x2: 7, y2: 22 }),
    React.createElement('line', { x1: 17, y1: 2, x2: 17, y2: 22 }),
    React.createElement('line', { x1: 2, y1: 12, x2: 22, y2: 12 }),
    React.createElement('line', { x1: 2, y1: 7, x2: 7, y2: 7 }),
    React.createElement('line', { x1: 2, y1: 17, x2: 7, y2: 17 }),
    React.createElement('line', { x1: 17, y1: 17, x2: 22, y2: 17 }),
    React.createElement('line', { x1: 17, y1: 7, x2: 22, y2: 7 })
  )
}

/**
 * TikTok 平台角标（音符）。
 * @param {{ size?: number, className?: string }} props
 */
export function IconTikTokMusic({ size = 12, className, ...props } = {}) {
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      className,
      ...props,
    },
    React.createElement('path', { d: 'M9 18V5l12-2v13' }),
    React.createElement('circle', { cx: 6, cy: 18, r: 3 }),
    React.createElement('circle', { cx: 18, cy: 16, r: 3 })
  )
}
