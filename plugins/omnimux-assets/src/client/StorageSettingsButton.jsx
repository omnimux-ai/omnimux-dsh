import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconSettingsOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconButton } from 'dsh-ui-kit'

/** Keep viewport coordinates outside the workbench's layout containment. */
export function StorageSettingsButton({ label, onClick }) {
  const anchor = useRef(null)
  const bubble = useRef(null)
  const timer = useRef(null)
  const focused = useRef(false)
  const hovered = useRef(false)
  const [visible, setVisible] = useState(false)
  const id = useId()
  const cancelTimer = () => {
    clearTimeout(timer.current)
    timer.current = null
  }
  const hide = () => {
    cancelTimer()
    setVisible(false)
  }

  useEffect(() => {
    const escape = (event) => {
      if (event.key !== 'Escape') return
      clearTimeout(timer.current)
      timer.current = null
      setVisible(false)
    }
    document.addEventListener('keydown', escape)
    return () => {
      clearTimeout(timer.current)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  useLayoutEffect(() => {
    if (!visible) return
    const position = () => {
      if (!anchor.current || !bubble.current) return
      const rect = anchor.current.getBoundingClientRect()
      const tip = bubble.current.getBoundingClientRect()
      const left = Math.max(12, Math.min(rect.left + (rect.width - tip.width) / 2, window.innerWidth - tip.width - 12))
      const top = rect.bottom + 8 + tip.height <= window.innerHeight - 12
        ? rect.bottom + 8
        : Math.max(12, rect.top - tip.height - 8)
      bubble.current.style.setProperty('--assets-tooltip-left', `${left}px`)
      bubble.current.style.setProperty('--assets-tooltip-top', `${top}px`)
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    const observer = new ResizeObserver(position)
    observer.observe(anchor.current)
    observer.observe(bubble.current)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      observer.disconnect()
    }
  }, [visible, label])

  return <>
    <IconButton
      ref={anchor}
      className="omnimux-assets-settings-button"
      variant="ghost"
      aria-label={label}
      aria-describedby={visible ? id : undefined}
      title=""
      onMouseEnter={() => {
        hovered.current = true
        cancelTimer()
        timer.current = setTimeout(() => setVisible(true), 280)
      }}
      onMouseLeave={() => {
        hovered.current = false
        cancelTimer()
        if (!focused.current) setVisible(false)
      }}
      onFocus={() => {
        focused.current = true
        cancelTimer()
        setVisible(true)
      }}
      onBlur={() => {
        focused.current = false
        if (!hovered.current) hide()
      }}
      onClick={(event) => {
        hide()
        onClick(event)
      }}
    >
      <IconSettingsOutline16 />
    </IconButton>
    {visible && createPortal(
      <span ref={bubble} id={id} role="tooltip" className="omnimux-assets-settings-tooltip">{label}</span>,
      anchor.current.ownerDocument.body,
    )}
  </>
}
