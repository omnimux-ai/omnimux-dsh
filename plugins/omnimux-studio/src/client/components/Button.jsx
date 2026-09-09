import React from 'react'

/** Native control styled only by the dependency-owned Studio stylesheet. */
export function Button({ children, className = '', type = 'button', ...props }) {
  return <button {...props} type={type} className={`studio-button ${className}`}>{children}</button> // exempt-ui01 Locked kit has eager global CSS with no disposer; Studio requires dependency-owned scoped styles.
}
