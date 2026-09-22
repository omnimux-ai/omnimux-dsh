import React from 'react'
import { QUICK_SHORTCUT_ARROW_ICON } from './catalog.js'

/**
 * 快捷方式的矢量图标：**渲染处只按名字取图**，名字由 `catalog.js` 的条目给出。
 *
 * 为什么写成内联 SVG 组件而不是引入图标库：这四枚图标是产品逐字给定的一小段
 * lucide 路径，按名字查表即可，不为此新增一份运行时依赖；同时与仓库既有做法
 * （`session-guide/StarterIcon.jsx`、`media-viewer/MediaConfigControls.jsx`）一致。
 *
 * 路径与 `viewBox` 逐字照抄给定源，不得增删或改写：改了就是产品事故。
 * 本表是模块内部实现细节，不对外导出；对外只有两个组件。
 */
const ICON_PATHS = Object.freeze({
  film: (
    <>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M7 3v18" />
      <path d="M3 7.5h4" />
      <path d="M3 12h18" />
      <path d="M3 16.5h4" />
      <path d="M17 3v18" />
      <path d="M17 7.5h4" />
      <path d="M17 16.5h4" />
    </>
  ),
  'text-search': (
    <>
      <path d="M21 5H3" />
      <path d="M10 12H3" />
      <path d="M10 19H3" />
      <circle cx="17" cy="15" r="3" />
      <path d="m21 19-1.9-1.9" />
    </>
  ),
  workflow: (
    <>
      <rect width="8" height="8" x="3" y="3" rx="2" />
      <path d="M7 11v4a2 2 0 0 0 2 2h4" />
      <rect width="8" height="8" x="13" y="13" rx="2" />
    </>
  ),
  sparkles: (
    <>
      <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
      <path d="M20 2v4" />
      <path d="M22 4h-4" />
      <circle cx="4" cy="20" r="2" />
    </>
  ),
  'move-up-right': (
    <>
      <path d="M13 5H19V11" />
      <path d="M19 5L5 19" />
    </>
  ),
})

/** 条目图标尺寸（design.md 的 size-3.5）。 */
const ICON_SIZE = 14

/** 行尾箭头尺寸。 */
const ARROW_SIZE = 12

/**
 * 条目图标。名字查不到时**不渲染**（不猜、不留空壳）：条目真源里没有的图标名
 * 属于数据缺陷，宁可少一枚装饰，也不给出一个语义不明的图标。
 * @param {{ name?: string }} props
 */
export function QuickShortcutIcon({ name }) {
  const glyph = name ? ICON_PATHS[name] : null
  if (!glyph) return null
  return (
    <svg
      className="omx-quick-shortcut-icon"
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {glyph}
    </svg>
  )
}

/**
 * 行尾箭头（四条共用）：默认半透明，悬停整条时变实，由样式表控制。
 * 图标名取自真源 `catalog.js` 的常量，**不在本文件重复一个字面量**：
 * 否则改真源不会改界面，测试也不会红。
 */
export function QuickShortcutArrow() {
  return (
    <svg
      className="omx-quick-shortcut-arrow"
      width={ARROW_SIZE}
      height={ARROW_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[QUICK_SHORTCUT_ARROW_ICON]}
    </svg>
  )
}
