import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { PageHeader } from 'dsh-ui-kit'
import { readConversationBox } from './conversation-box.js'
import { PluginsSection } from './PluginsSection.jsx'
import { injectHubStyles } from './styles.js'

export { readConversationBox } from './conversation-box.js'

/**
 * @param {{
 *   t: (key: string) => string,
 *   apps: { getSnapshot: () => boolean, subscribe: Function, set: Function },
 *   useSessions?: (select: (state: { current?: string }) => unknown) => unknown,
 * }} props
 */
export function AppsStage({ t, apps, useSessions }) {
  useEffect(() => { injectHubStyles() }, [])
  const open = useSyncExternalStore(
    apps ? (onStoreChange) => apps.subscribe(onStoreChange) : () => () => {},
    apps ? () => apps.getSnapshot() : () => false,
  )
  const readSessions = useSessions ?? ((select) => select({}))
  const currentSession = readSessions((state) => state.current)
  const lastSession = useRef(currentSession)
  const [box, setBox] = useState(() => readConversationBox())
  const [everOpened, setEverOpened] = useState(false)

  if (open && !everOpened) setEverOpened(true)

  useLayoutEffect(() => {
    if (!open) return undefined
    const update = () => { setBox(readConversationBox()) }
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
  }, [open])

  useEffect(() => {
    if (open && lastSession.current !== currentSession) apps?.set(false)
    lastSession.current = currentSession
  }, [apps, currentSession, open])

  useEffect(() => {
    if (!open || !apps) return undefined
    const header = document.querySelector('[data-slot="conversation.session.header"]')
    if (!(header instanceof HTMLElement)) return undefined
    const onPointerDown = () => { apps.set(false) }
    header.addEventListener('pointerdown', onPointerDown)
    return () => { header.removeEventListener('pointerdown', onPointerDown) }
  }, [apps, open])

  if (!apps || !everOpened) return null

  return (
    <div
      role="region"
      aria-label={t('plugins.title')}
      aria-hidden={open ? undefined : 'true'}
      className="omnimux-apps-stage"
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
        title={t('plugins.title')}
      />
      <div className="omnimux-apps-stage-body">
        <PluginsSection t={t} />
      </div>
    </div>
  )
}
