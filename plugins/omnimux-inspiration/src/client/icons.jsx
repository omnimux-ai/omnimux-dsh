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
