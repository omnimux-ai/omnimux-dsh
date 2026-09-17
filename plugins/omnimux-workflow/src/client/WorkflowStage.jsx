/**
 * WorkflowStage — first-level workflow canvas page on the shell.overlay seat.
 * Chrome (header + close) renders in the host React 18 tree; the canvas
 * body delegates to CanvasBridge which mounts the React 19 island.
 *
 * 舞台定位走 --stage-* 变量 + [data-visible="false"]；控件消费 dsh-ui-kit。
 */
import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { PageHeader } from 'dsh-ui-kit'
import { CanvasBridge } from './CanvasBridge.jsx'
import { injectWorkflowStyles } from './styles.js'

/**
 * @param {{
 *   t: (key: string) => string,
 *   stage: { getSnapshot: () => boolean, subscribe: Function, set: Function },
 *   locale?: { subscribe: (fn: () => void) => () => void, getLocale: () => { active: string } },
 * }} props
 */
export function WorkflowStage({ t, stage, locale }) {
  useEffect(() => { injectWorkflowStyles() }, [])
  const open = useSyncExternalStore(
    stage ? (onStoreChange) => stage.subscribe(onStoreChange) : () => () => {},
    stage ? () => stage.getSnapshot() : () => false,
  )
  // W4 T4.1：宿主语言 live 订阅（'zh'|'en'），下发给 CanvasBridge → island。
  // locale.subscribe 是 LocaleRuntime 的实例方法（内部读 this.listeners）。
  // useSyncExternalStore 会裸调 subscribe(cb)，直接传 locale.subscribe 会丢 this，
  // 炸成 Cannot read properties of undefined (reading 'listeners')，
  // 进而 shell.overlay 整页变 data-slot-error（侧栏能点、页面白/空）。
  const activeLocale = useSyncExternalStore(
    locale
      ? (onStoreChange) => locale.subscribe(onStoreChange)
      : () => () => {},
    () => (locale ? locale.getLocale().active : 'zh'),
  )
  const [everOpened, setEverOpened] = useState(false)
  const [box, setBox] = useState(() => ({ top: 0, left: 0, width: 0, height: 0 }))
  // 稳定引用：避免父级重渲时 inline 新箭头把 CanvasBridge 挂载 effect 拖下水。
  const handleClose = useCallback(() => { stage.set(false) }, [stage])

  if (open && !everOpened) setEverOpened(true)

  useLayoutEffect(() => {
    if (!open || !stage) return undefined
    const update = () => { setBox(stage.readBox()) }
    update()
    const scroll = document.querySelector('[data-conversation-scroll]')
    const target = scroll instanceof HTMLElement
      ? scroll
      : document.querySelector('[data-slot="conversation"]')?.parentElement
    const observer = typeof ResizeObserver === 'function' && target ? new ResizeObserver(update) : null
    if (target && observer) observer.observe(target)
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [open, stage])

  if (!stage || !everOpened) return null

  return (
    <div
      role="region"
      aria-label={t('stage.title')}
      aria-hidden={open ? undefined : 'true'}
      className="omnimux-workflow-stage"
      data-visible={open ? 'true' : 'false'}
      style={{
        display: open ? undefined : 'none',
        '--stage-top': `${box.top}px`,
        '--stage-left': `${box.left}px`,
        '--stage-width': `${box.width}px`,
        '--stage-height': `${box.height}px`,
      }}
    >
      <PageHeader
        title={t('stage.title')}
      />
      <div className="omnimux-workflow-canvas-body">
        <CanvasBridge onClose={handleClose} t={t} locale={activeLocale} />
      </div>
    </div>
  )
}
