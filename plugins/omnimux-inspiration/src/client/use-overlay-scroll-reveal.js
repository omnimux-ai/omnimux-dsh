import { useEffect, useRef } from 'react'

/** 停滚后滑块收回的等待时长。 */
export const OVERLAY_SCROLL_REVEAL_MS = 800

/**
 * 给滚动容器挂上「滑动时显示滑块、停住后收回」。
 * 返回要绑到容器上的 className 与 onScroll。
 */
export function useOverlayScrollReveal(className = '') {
  const timerRef = useRef(null)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const onScroll = (event) => {
    const el = event.currentTarget
    el.classList.add('is-scrolling')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      el.classList.remove('is-scrolling')
    }, OVERLAY_SCROLL_REVEAL_MS)
  }

  const merged = ['omnimux-inspiration-overlay-scroll', className].filter(Boolean).join(' ')
  return { className: merged, onScroll }
}
