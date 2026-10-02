import { forwardRef, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import type { StageBox, StageStore } from './createStageStore.ts'
import { cssClass } from '../internal/cssClass.ts'
import { cx } from '../internal/cx.ts'
import css from './StageContainer.module.css'

export interface StageContainerProps extends HTMLAttributes<HTMLDivElement> {
  stageStore: StageStore
  title?: string
  children: ReactNode
}

const CONTAINER_CLASS = cssClass(css.stageContainer, 'stageContainer')

/**
 * Standard Stage Container for first-level product pages.
 * Handles --stage-* CSS variable synchronization, keepalive lazy-mounting,
 * and ResizeObserver layout tracking.
 */
export const StageContainer = forwardRef<HTMLDivElement, StageContainerProps>(function StageContainer(
  { stageStore, title, className, style, children, ...rest },
  ref,
) {
  const open = useSyncExternalStore(
    stageStore ? (onStoreChange) => stageStore.subscribe(onStoreChange) : () => () => {},
    stageStore ? () => stageStore.getSnapshot() : () => false,
  )

  const [everOpened, setEverOpened] = useState(false)
  const [box, setBox] = useState<StageBox>(() =>
    stageStore ? stageStore.readBox() : { top: 0, left: 0, width: 0, height: 0 },
  )

  if (open && !everOpened) {
    setEverOpened(true)
  }

  useLayoutEffect(() => {
    if (!open || !stageStore) return undefined

    const update = () => {
      setBox(stageStore.readBox())
    }
    update()

    const scroll = typeof document !== 'undefined' ? document.querySelector('[data-conversation-scroll]') : null
    const target =
      scroll instanceof HTMLElement
        ? scroll
        : typeof document !== 'undefined'
          ? document.querySelector('[data-slot="conversation"]')?.parentElement
          : null

    const observer = typeof ResizeObserver === 'function' && target ? new ResizeObserver(update) : null
    if (target && observer) {
      observer.observe(target)
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', update)
    }

    return () => {
      observer?.disconnect()
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', update)
      }
    }
  }, [open, stageStore])

  if (!stageStore || !everOpened) {
    return null
  }

  const customStyle: CSSProperties = {
    ...style,
    display: open ? (style?.display !== 'none' ? style?.display : undefined) : 'none',
    ['--stage-top' as string]: `${box.top}px`,
    ['--stage-left' as string]: `${box.left}px`,
    ['--stage-width' as string]: `${box.width}px`,
    ['--stage-height' as string]: `${box.height}px`,
  }

  return (
    <div
      {...rest}
      ref={ref}
      role="region"
      aria-label={title}
      aria-hidden={open ? undefined : true}
      data-visible={open ? 'true' : 'false'}
      className={cx(CONTAINER_CLASS, className)}
      style={customStyle}
    >
      {children}
    </div>
  )
})
