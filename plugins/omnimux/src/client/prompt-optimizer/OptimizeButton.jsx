import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { focusComposerEditor, readDraft, writeDraft } from '../composer-quick-shortcuts/dom.js'
import { QuickWriteNotice, useQuickWriteNotice } from '../composer-quick-shortcuts/notice.jsx'
import {
  getPromptOptimizerConfigured,
  runPromptOptimize,
  subscribePromptOptimizerConfigured,
} from './optimize-bridge.js'
import { acquirePromptOptimizerStyles } from './styles.js'

/**
 * 会话输入框右侧的「优化提示词」图标按钮（conversation.input.right）。
 *
 * 交互已冻结：点击 → spinner → 直接把优化结果写回输入框，无预览、无徽标。
 * 状态机：disabled（草稿为空或未配置）→ idle → running（禁重入）→ idle。
 * 唯一错误出口是既有轻提示组件 QuickWriteNotice；文案全部走字典
 * `promptOptimize.*`（逐字锁定的白名单文案），按钮本体零可见文字。
 *
 * `input.*` 槽位注入的 props 自带 `useInput`（host 原生草稿订阅），
 * 有它时空态跟随草稿实时置灰；没有时退回 `readDraft()` 快照。
 */

const SPARKLES_PATHS = [
  'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
  'M20 2v4',
  'M22 4h-4',
]

function SparklesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {SPARKLES_PATHS.map((d) => <path key={d} d={d} />)}
      <circle cx="4" cy="20" r="2" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg className="omx-optimize-spinner" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

/** 字典缺键 / 解析器回键名时回兜底文案（与 notice.jsx 同口径）。 */
function resolveCopy(t, key, fallback) {
  const resolved = typeof t === 'function' ? t(key) : ''
  return typeof resolved === 'string' && resolved && resolved !== key ? resolved : fallback
}

/**
 * 宿主草稿订阅缺位时的兜底：input.* 槽位没注入 useInput 时，
 * `readDraft()` 只是挂载瞬间的快照——之后打字不再触发组件重渲染，
 * 空草稿判定永久为真，按钮看上去永远不可点。这里订阅编辑器
 * input 事件与草稿回写事件，让置灰判定跟随真实输入框。
 */
function useDomDraft() {
  const [draft, setDraft] = useState(() => readDraft())
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const refresh = () => setDraft(readDraft())
    document.addEventListener('input', refresh, true)
    document.addEventListener('omnimux:composer:set-draft', refresh, true)
    refresh()
    return () => {
      document.removeEventListener('input', refresh, true)
      document.removeEventListener('omnimux:composer:set-draft', refresh, true)
    }
  }, [])
  return draft
}

export function OptimizeButton(props) {
  const { t } = props || {}
  // host 原生草稿订阅（input.* 槽位注入）；缺省时退回 DOM 草稿订阅。
  const hasInputHook = typeof props?.useInput === 'function'
  const input = hasInputHook ? props.useInput((value) => value) : null
  const domDraft = useDomDraft()
  const configured = useSyncExternalStore(
    subscribePromptOptimizerConfigured,
    getPromptOptimizerConfigured,
    getPromptOptimizerConfigured,
  )
  const [running, setRunning] = useState(false)
  const inFlight = useRef(false)
  useEffect(() => acquirePromptOptimizerStyles(), [])
  const { visible: noticeVisible, notify: notifyFailed, dismiss: dismissNotice } = useQuickWriteNotice()

  const draft = typeof input?.draft === 'string' ? input.draft : domDraft
  const emptyDraft = !draft || draft.trim() === ''
  const disabled = running || emptyDraft || !configured

  // tooltip 白名单：仅「可用态」与「未配置禁用态」各一行；空草稿禁用态不渲染 title。
  const title = !configured
    ? resolveCopy(t, 'promptOptimize.noKey', '配置 API Key 后可用')
    : (emptyDraft ? undefined : resolveCopy(t, 'promptOptimize.tooltip', '优化提示词'))

  const handleClick = useCallback(() => {
    if (inFlight.current) return
    inFlight.current = true
    setRunning(true)
    void runPromptOptimize({ readDraft, writeDraft, focusComposerEditor }).then((outcome) => {
      inFlight.current = false
      setRunning(false)
      if (outcome === 'applied') dismissNotice()
      else if (outcome === 'failed') notifyFailed()
    })
  }, [notifyFailed, dismissNotice])

  return (
    <>
      {/* disabled 按钮不派发任何事件，title 必须放在外层 span 上，
          否则「配置 API Key 后可用」在悬停时永远不可见。 */}
      <span className="omx-optimize-seat" title={title}>
        <button /* exempt-ui01: conversation.input.right 列表槽位只渲染一枚图标按钮 */
          type="button"
          className="omx-optimize-btn"
          aria-label={resolveCopy(t, 'promptOptimize.tooltip', '优化提示词')}
          title={title}
          disabled={disabled}
          aria-busy={running || undefined}
          data-state={running ? 'running' : 'idle'}
          onClick={handleClick}
        >
          {running ? <SpinnerIcon /> : <SparklesIcon />}
        </button>
      </span>
      {noticeVisible && typeof document !== 'undefined' && createPortal(
        <div className="omx-optimize-notice-float">
          <QuickWriteNotice visible={noticeVisible} t={t}
            messageKey="promptOptimize.failed" fallback="优化失败，请重试" />
        </div>,
        document.body,
      )}
    </>
  )
}

export default OptimizeButton
