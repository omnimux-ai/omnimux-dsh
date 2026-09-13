/**
 * Inline SVG icon set: 14px linear strokes following `currentColor`,
 * aligned with omnimux-assets and omnimux-products design standards.
 */

/**
 * @param {{ size?: number, children: any, className?: string }} props
 */
function Icon({ size = 14, children, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ? `omnimux-inspiration-icon ${className}` : 'omnimux-inspiration-icon'}
    >
      {children}
    </svg>
  )
}

/** @param {{ size?: number, className?: string }} props */
export function PlusIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  )
}

/**
 * 「暂无作品」的空态图标：视频画幅（胶片格）。
 *
 * 空态图标与动作图标同源同栅格（24 栅格、1.8 描边、`currentColor`），只把尺寸
 * 交给调用方 —— 空态按 design.md §5.7 用 48px，动作图标仍是 14px。
 * @param {{ size?: number, className?: string }} props
 */
export function WorksEmptyIcon(props) {
  return (
    <Icon size={48} {...props}>
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
      <path d="M7 2v20" />
      <path d="M17 2v20" />
      <path d="M2 12h20" />
      <path d="M2 7h5" />
      <path d="M2 17h5" />
      <path d="M17 17h5" />
      <path d="M17 7h5" />
    </Icon>
  )
}

/**
 * 「还没有监控账号」的空态图标：账号 + 添加。
 * @param {{ size?: number, className?: string }} props
 */
export function AccountsEmptyIcon(props) {
  return (
    <Icon size={48} {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6" />
      <path d="M22 11h-6" />
    </Icon>
  )
}

/**
 * 「当前筛选下没有作品」的空态图标：放大镜。
 * @param {{ size?: number, className?: string }} props
 */
export function FilterEmptyIcon(props) {
  return (
    <Icon size={48} {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </Icon>
  )
}

/**
 * 空态图标的共享实例：`<EmptyState icon={EMPTY_ICON_WORKS} …>`。
 *
 * 导出的是实例而不是让每个页面各写一遍 JSX —— 同一维度的空态字形只有一份，
 * 换一处即全局一致。
 */
export const EMPTY_ICON_WORKS = <WorksEmptyIcon />
export const EMPTY_ICON_USER = <AccountsEmptyIcon />
export const EMPTY_ICON_SEARCH = <FilterEmptyIcon />
