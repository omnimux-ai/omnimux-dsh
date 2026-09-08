import { Component, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import OpenReelApp from './openreel/web/App.tsx'
import { applyOpenReelTheme } from './openreel/web/stores/theme-store.ts'
import { resetOpenReelRouter } from './openreel/web/hooks/use-router.ts'
import { useProjectStore } from './openreel/web/stores/project-store.ts'
import { injectClipStyles } from './styles.js'
import { computeHeaderPadLeft, computeStandaloneBox, readHostSidebarInset } from './stage-box.js'
import { useCanvasIngestion } from './hooks/useCanvasIngestion.ts'
import { notifyCanvasSave, notifyCanvasClose } from './CanvasBridge.js'
import { findCanvasHost } from './findCanvasHost.js'
import './openreel/web/index.css'
import './theme/dsw-map.css'

class ClipErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[omnimux-clip] render error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: 'var(--dsw-alias-label-primary, #ffffff)', background: 'var(--dsw-alias-bg-base, #111113)', height: '100%', boxSizing: 'border-box' }} /* exempt-ui02: 错误边界兜底容器 */>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: 'var(--dsw-alias-label-danger)' }} /* exempt-ui02: 错误标题 */>剪辑器加载遇到异常</h3>
          <pre style={{ fontSize: 12, padding: 12, borderRadius: 6, background: 'var(--dsw-alias-bg-mask-1)', overflow: 'auto', whiteSpace: 'pre-wrap' }} /* exempt-ui02: 错误调用栈代码块 */>
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>
          <button /* exempt-ui01: 错误边界重试按钮 */
            type="button"
            style={{ marginTop: 12, padding: '8px 16px', background: 'var(--dsw-alias-accent-primary)', color: 'var(--dsw-alias-on-accent, #fff)', border: 'none', borderRadius: 8, cursor: 'pointer' }} /* exempt-ui02 */
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            重试加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * OmniMux Clip first-level stage page on the shell.overlay seat.
 * After first open, keep the subtree with display:none — never `if (!open) return null`.
 * Supports both standalone mode (from sidebar) and canvas mode (from workflow node).
 *
 * In canvas mode (`session.source === 'canvas'`), the editor is portaled into the
 * visible `[data-omnimux-canvas-tab]` host and laid out with `position:absolute; inset:0`.
 * It must not guess overlay coordinates or occupy the conversation column.
 *
 * @param {{
 *   t: (key: string) => string,
 *   stage: {
 *     getSnapshot: () => boolean,
 *     getSessionSnapshot: () => any,
 *     subscribe: Function,
 *     set: Function,
 *     readBox: Function
 *   },
 * }} props
 */
export function ClipStage({ t, stage }) {
  useEffect(() => {
    injectClipStyles()
    applyOpenReelTheme(true)
  }, [])

  const open = useSyncExternalStore(
    stage ? (cb) => stage.subscribe(cb) : () => () => {},
    stage ? () => stage.getSnapshot() : () => false,
  )
  const session = useSyncExternalStore(
    stage ? (cb) => stage.subscribe(cb) : () => () => {},
    stage ? () => stage.getSessionSnapshot() : () => null,
  )

  const isCanvasMode = session?.source === 'canvas'

  const [everOpened, setEverOpened] = useState(false)
  const [canvasHost, setCanvasHost] = useState(null)
  const [box, setBox] = useState(() => {
    if (typeof window !== 'undefined') {
      return {
        top: 0,
        left: 56,
        width: Math.max(320, window.innerWidth - 56),
        height: Math.max(240, window.innerHeight),
      }
    }
    return { top: 0, left: 0, width: 0, height: 0 }
  })
  const [saveStatus, setSaveStatus] = useState('')

  useEffect(() => {
    if (open) setEverOpened(true)
  }, [open])

  // Ingest upstream inputs if opened from canvas
  useCanvasIngestion(session)

  // 路由同步重置到 editor
  useEffect(() => {
    if (open && isCanvasMode) {
      try {
        resetOpenReelRouter({ route: 'editor', params: {} })
      } catch (err) {
        console.warn('[omnimux-clip] resetOpenReelRouter failed:', err)
      }
    }
  }, [open, isCanvasMode])

  useLayoutEffect(() => {
    if (!open) return undefined

    const update = () => {
      if (session?.source === 'canvas') {
        const host = findCanvasHost()
        setCanvasHost(host)
        return
      }
      setCanvasHost(null)

      const read = stage?.readBox?.()
      const usableRead = read && read.width >= 50 && read.height >= 50 ? read : null
      setBox(computeStandaloneBox(
        usableRead,
        { width: window.innerWidth, height: window.innerHeight },
        readHostSidebarInset(document),
      ))
    }

    update()

    let retryTimer = 0
    if (session?.source === 'canvas' && !findCanvasHost()) {
      let attempts = 0
      const retry = () => {
        attempts += 1
        update()
        if (!findCanvasHost() && attempts < 40) {
          retryTimer = window.setTimeout(retry, 50)
        }
      }
      retryTimer = window.setTimeout(retry, 50)
    }

    const targets = [
      document.querySelector('[data-omnimux-canvas-tab]'),
      document.querySelector('.omnimux-workflow-canvas-tab'),
      document.querySelector('[data-conversation-scroll]'),
      document.querySelector('[data-slot="conversation"]')?.parentElement,
      document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]'),
    ].filter((el) => el instanceof HTMLElement)

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null
    for (const target of targets) {
      observer?.observe(target)
    }

    window.addEventListener('resize', update)
    return () => {
      if (retryTimer) window.clearTimeout(retryTimer)
      observer?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [open, stage, session])

  if (!stage) return null
  if (!open && !everOpened) return null

  const handleSaveDraft = () => {
    if (session?.nodeId) {
      notifyCanvasSave({
        nodeId: session.nodeId,
        projectId: session.projectId,
      })
      setSaveStatus(t ? t('tab.savedToNode') : '已保存至节点')
      setTimeout(() => setSaveStatus(''), 2000)
    }
  }

  const handleClose = () => {
    if (isCanvasMode && session?.nodeId) {
      notifyCanvasClose({ nodeId: session.nodeId })
    }
    stage.set(false)
  }

  const isMac = typeof navigator !== 'undefined' && /Macintosh|Mac OS X/i.test(navigator.userAgent)
  const headerPadLeft = computeHeaderPadLeft({ isCanvasMode, boxLeft: box.left, isMac })
  const portalTarget = isCanvasMode ? canvasHost : null

  const stageNode = (
    <div
      role="region"
      aria-label={t ? t('tab.title') : '视频剪辑'}
      aria-hidden={open ? undefined : 'true'}
      className="omnimux-clip-stage"
      data-visible={open ? 'true' : 'false'}
      data-clip-mode={isCanvasMode ? 'canvas' : 'standalone'}
      style={isCanvasMode ? {
        display: open ? undefined : 'none',
        '--clip-header-pad-left': `${headerPadLeft}px`,
      } : {
        display: open ? undefined : 'none',
        '--stage-top': `${box.top}px`,
        '--stage-left': `${box.left}px`,
        '--stage-width': `${box.width}px`,
        '--stage-height': `${box.height}px`,
        '--clip-header-pad-left': `${headerPadLeft}px`,
      }}
    >
      <div className="omnimux-clip-stage-header">
        <div className="omnimux-clip-stage-actions">
          <button /* exempt-ui01: 剪辑器关闭按钮 */
            type="button"
            className="omnimux-clip-stage-close-btn"
            aria-label="Close"
            onClick={handleClose}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="omnimux-clip-stage-body openreel-studio-root dark" data-theme="dark">
        <ClipErrorBoundary>
          <OpenReelApp />
        </ClipErrorBoundary>
      </div>
    </div>
  )

  if (isCanvasMode) {
    if (!portalTarget) return null
    return createPortal(stageNode, portalTarget)
  }
  return stageNode
}

export default ClipStage
