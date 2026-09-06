import React from 'react'

export function Button({ children, leadingIcon, loading, ...props }) {
  return <button type="button" {...props}>{leadingIcon}{children}</button>
}

export function IconButton({ children, ...props }) {
  return <button type="button" {...props}>{children}</button>
}

export function ModalDialog({ open, title, children, onClose }) {
  if (!open) return null
  return <div role="dialog" aria-label={title}>{children}<button type="button" onClick={onClose}>Close</button></div>
}

export function ConfirmModal({ open, title, children, confirmLabel, cancelLabel, confirmLoading, onConfirm, onClose }) {
  if (!open) return null
  return (
    <div role="dialog" aria-label={title}>
      <h2>{title}</h2>
      {children}
      <button type="button" disabled={confirmLoading} onClick={onClose}>{cancelLabel}</button>
      <button type="button" disabled={confirmLoading} onClick={onConfirm}>{confirmLabel}</button>
    </div>
  )
}

export function Menu({ open, items, onSelect }) {
  if (!open) return null
  return (
    <div role="menu">
      {items.map((item) => (
        <button key={item.id} type="button" role="menuitem" onClick={() => onSelect(item.id)}>{item.label}</button>
      ))}
    </div>
  )
}

export function IconEllipsisOutline16() { return <svg aria-hidden="true" /> }
export function IconPlusOutline16() { return <svg aria-hidden="true" /> }
export function IconChevronLeftOutline14() { return <svg aria-hidden="true" /> }
export function IconRefreshOutline16() { return <svg aria-hidden="true" /> }
