import { useLayoutEffect, useRef } from 'react'

/** Native top layer isolates the composer regardless of ancestor stacking contexts. */
export function PreviewModalLayer({ children, onClose, title }) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const previous = document.activeElement
    const overflow = document.documentElement.style.overflow
    const cancel = (event) => {
      event.preventDefault()
      event.stopPropagation()
      closeRef.current?.()
    }
    const containTab = (event) => {
      if (event.key !== 'Tab') return
      const controls = [...dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
        .filter(node => node.tabIndex >= 0 && !node.disabled && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden')
      const first = controls[0]
      const last = controls.at(-1)
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    dialog.addEventListener('keydown', containTab)
    dialog.addEventListener('cancel', cancel)
    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
    } else {
      dialog.setAttribute('open', '')
    }
    document.documentElement.style.overflow = 'hidden'
    return () => {
      dialog.removeEventListener('keydown', containTab)
      dialog.removeEventListener('cancel', cancel)
      if (typeof dialog.close === 'function') {
        dialog.close()
      } else {
        dialog.removeAttribute('open')
      }
      document.documentElement.style.overflow = overflow
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="omnimux-inspiration-preview-layer"
      aria-label={title}
      aria-modal="true"
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </dialog>
  )
}
