/**
 * CanvasBridge — host React 18 shell that mounts the React 19 canvas island.
 *
 * ★ HARD RULE (docs/ARCHITECTURE.md): the two React trees NEVER exchange
 * React elements, refs, context, or component types. This bridge passes
 * ONLY a DOM container + plain-data props + plain callbacks to the island's
 * mountCanvas(el, props) API. The island bundles its own React 19.2.8 and
 * creates its own root — dual-React coexistence in one document is safe
 * because hooks/fiber/dispatcher state is module-private per React copy.
 *
 * Loading: the island bundle is lazy — first open fetches the build
 * manifest (canvas.js content hash), injects one <script> tag
 * (/omnimux-workflow/canvas.js?v=<hash>), then mounts. The script is
 * injected at most once per hash per document.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from 'dsh-ui-kit'
import { fetchCanvasHash } from './api.js'
import { injectWorkflowStyles } from './styles.js'

const CANVAS_GLOBAL = '__omnimuxWorkflowCanvas'
const SCRIPT_ID = 'omnimux-workflow-canvas-island'

// Detached parents cannot await React cleanup. Keep failed children reachable outside React.
const retainedCanvasLifetimes = new Set()

const usesConfirmedLifecycle = api => ['registerDirectorCloseGuard', 'prepareDirectorClose', 'closeActiveCanvas', 'settleCanvas', 'getCanvasState']
  .some(name => typeof api[name] === 'function')

async function confirmCanvasOperation(api, element, operation, mounted, props) {
  const receipt = operation()
  const confirmed = await receipt
  if (confirmed === true) return true
  if (confirmed !== undefined || receipt !== undefined) return false
  if (!usesConfirmedLifecycle(api)) return true
  if (typeof api.settleCanvas === 'function' && await api.settleCanvas(element) !== true) return false
  if (typeof api.getCanvasState !== 'function') return false
  const state = api.getCanvasState(element)
  return state?.mounted === mounted && (!mounted || state.workspaceId === props?.workspaceId)
}

export function createCanvasBridgeLifecycle(onError = () => {}) {
  let owner = null
  let stopped = false
  let tail = Promise.resolve()
  const serialize = action => {
    const pending = tail.then(action)
    tail = pending.catch(() => undefined)
    return pending
  }
  const closeOwner = async () => {
    if (!owner) return true
    const current = owner
    try {
      if (!await confirmCanvasOperation(current.api, current.element, () => current.api.unmountCanvas(current.element), false)) {
        retainedCanvasLifetimes.add(lifecycle)
        onError(new Error('导演台修改未保存，原画布已保留，请重试关闭'))
        return false
      }
      if (owner === current) owner = null
      retainedCanvasLifetimes.delete(lifecycle)
      return true
    } catch (error) {
      retainedCanvasLifetimes.add(lifecycle)
      onError(error)
      return false
    }
  }
  const lifecycle = {
    mount: (api, element, props) => serialize(async () => {
      if (stopped) return false
      if (owner?.api === api && owner.element === element) {
        return confirmCanvasOperation(owner.api, element, () => owner.api.updateCanvas(element, props), true, props)
      }
      if (owner && !await closeOwner()) return false
      owner = { api, element }
      try {
        const confirmed = await confirmCanvasOperation(api, element, () => api.mountCanvas(element, props), true, props)
        if (!confirmed) { await closeOwner(); return false }
        if (stopped) { await closeOwner(); return false }
        return true
      } catch (error) {
        await closeOwner()
        onError(error)
        return false
      }
    }),
    update: props => serialize(async () => {
      if (stopped) return false
      if (!owner) return true
      return confirmCanvasOperation(owner.api, owner.element, () => owner.api.updateCanvas(owner.element, props), true, props)
    }),
    close: () => serialize(closeOwner),
    cleanup: () => {
      stopped = true
      return serialize(closeOwner)
    },
  }
  return lifecycle
}

/** Explicit recovery retry; no polling, hidden DOM, or global mutable state. */
export async function retryRetainedCanvasCleanup() {
  const results = await Promise.all([...retainedCanvasLifetimes].map(lifetime => lifetime.cleanup()))
  return results.every(result => result === true)
}

/**
 * Inject the island script once; resolves when the global API is ready.
 * @param {string} hash
 * @returns {Promise<void>}
 */
async function ensureCanvasScript(hash) {
  const expectedSrc = `/omnimux-workflow/canvas.js?v=${encodeURIComponent(hash)}`
  const existing = document.getElementById(SCRIPT_ID)
  if (existing instanceof HTMLScriptElement && existing.getAttribute('src') !== expectedSrc) {
    const previousApi = window[CANVAS_GLOBAL]
    if (previousApi && (typeof previousApi.closeActiveCanvas !== 'function' || await previousApi.closeActiveCanvas() !== true)) {
      throw new Error('原画布尚未确认保存，不能替换画布版本')
    }
    if (!await retryRetainedCanvasCleanup()) throw new Error('原导演台关闭未完成，保留原版本')
    existing.remove()
    if (typeof window !== 'undefined') {
      try {
        delete window[CANVAS_GLOBAL]
      } catch {
        window[CANVAS_GLOBAL] = undefined
      }
    }
  }
  const current = document.getElementById(SCRIPT_ID)
  if (typeof window !== 'undefined' && window[CANVAS_GLOBAL] && typeof window[CANVAS_GLOBAL].mountCanvas === 'function') {
    if (current instanceof HTMLScriptElement && current.getAttribute('src') === expectedSrc) {
      return Promise.resolve()
    }
  }
  if (current instanceof HTMLScriptElement && current.dataset.loaded === '1' && current.getAttribute('src') === expectedSrc) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    let script = document.getElementById(SCRIPT_ID)
    if (!(script instanceof HTMLScriptElement)) {
      script = document.createElement('script')
      script.id = SCRIPT_ID
    } else {
      if (script.dataset.loaded === 'error') {
        script.remove()
        script = document.createElement('script')
        script.id = SCRIPT_ID
      } else if (script.getAttribute('src') === expectedSrc) {
        // A previous injection is still in flight: piggyback on its events.
        script.addEventListener('load', () => resolve(), { once: true })
        script.addEventListener('error', () => reject(new Error('canvas island script failed')), { once: true })
        return
      } else {
        script.remove()
        script = document.createElement('script')
        script.id = SCRIPT_ID
      }
    }
    script.src = expectedSrc
    script.dataset.hash = hash
    script.async = true
    script.addEventListener('load', () => {
      script.dataset.loaded = '1'
      resolve()
    }, { once: true })
    script.addEventListener('error', () => {
      script.dataset.loaded = 'error'
      reject(new Error('canvas island script failed'))
    }, { once: true })
    document.head.append(script)
  })
}

/**
 * @param {{
 *   onClose: () => void,
 *   t: (key: string) => string,
 *   locale?: string,
 *   workspaceId?: string,
 *   focusGroupId?: string,
 * }} props
 */
export function CanvasBridge({ onClose, t, locale, workspaceId, focusGroupId }) {
  useEffect(() => { injectWorkflowStyles() }, [])
  const containerRef = useRef(null)
  const lifetimeRef = useRef(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  // 最新 props 快照：load 完成挂载与 locale/onClose/workspaceId/focusGroupId live
  // 切换共用（island 边界纯数据 + 回调，一律走 mountCanvas/updateCanvas，
  // 禁止因回调换引用卸岛）。
  const propsRef = useRef({ onClose, locale, workspaceId, focusGroupId })
  propsRef.current = { onClose, locale, workspaceId, focusGroupId }

  // mount 只跑一次。onClose / locale 身份变化不得重跑 load，否则宿主每次
  // 重渲（点选节点、侧栏同步）都会 unmount→mount，岛闪白、选中丢、拖不动。
  const load = useCallback(async () => {
    const lifetime = lifetimeRef.current
    if (!lifetime) return
    setStatus('loading')
    try {
      const hash = (await fetchCanvasHash()) ?? String(Date.now())
      if (lifetimeRef.current !== lifetime) return
      await ensureCanvasScript(hash)
      if (lifetimeRef.current !== lifetime) return
      const api = window[CANVAS_GLOBAL]
      if (!api || typeof api.mountCanvas !== 'function') {
        throw new Error('canvas island global missing')
      }
      const el = containerRef.current
      if (el) {
        const confirmed = await lifetime.mount(api, el, {
          ...propsRef.current,
          onClose: () => propsRef.current.onClose?.(),
          onError: error => lifetime.reportError(error),
        })
        if (lifetimeRef.current !== lifetime) return
        setStatus(confirmed ? 'ready' : 'error')
      }
    } catch {
      if (lifetimeRef.current === lifetime) setStatus('error')
    }
  }, [])

  useEffect(() => {
    const reportError = error => {
      console.error('画布关闭未完成，保留原编辑引用', error)
      if (lifetimeRef.current === lifetime) setStatus('error')
    }
    const lifetime = createCanvasBridgeLifecycle(reportError)
    lifetime.reportError = reportError
    lifetimeRef.current = lifetime
    void load()
    return () => {
      if (lifetimeRef.current === lifetime) lifetimeRef.current = null
      void lifetime.cleanup()
    }
  }, [load])

  // W4 T4.1：宿主切语言 / 关闭回调换人 / 切换会话与画布 / 卡片「编辑」定位目标变化
  // → island updateCanvas 同 root 重 render（不可 unmount/remount，会丢画布状态）。
  useEffect(() => {
    const lifetime = lifetimeRef.current
    if (lifetime) {
      void lifetime.update({
        ...propsRef.current,
        onClose: () => propsRef.current.onClose?.(),
        onError: error => lifetime.reportError(error),
      }).then(confirmed => {
        if (lifetimeRef.current === lifetime && !confirmed) setStatus('error')
      }).catch(error => lifetime.reportError(error))
    }
  }, [locale, onClose, workspaceId, focusGroupId])

  return (
    <div className="omnimux-workflow-canvas-host">
      <div ref={containerRef} className="omnimux-workflow-canvas-root" />
      {status === 'loading' ? (
        <div className="omnimux-workflow-canvas-status">
          {t('canvas.loading')}
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="omnimux-workflow-canvas-status">
          <span>{t('canvas.loadFailed')}</span>
          <Button variant="outline" size="sm" onClick={() => { void load() }}>
            {t('canvas.retry')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
