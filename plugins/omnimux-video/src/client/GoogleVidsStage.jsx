import React, { useState, useEffect, useLayoutEffect } from 'react'
import { readVidsCenterBox } from './vids-stage-box.js'
import { useVeoTaskFeed } from './useVeoTaskFeed.js'

const STAGE_STYLES_ID = 'omnimux-vids-stage-styles'
const STAGE_STYLES = `
.omnimux-vids-stage {
  position: fixed;
  z-index: 200;
  top: var(--stage-top, 0px);
  left: var(--stage-left, 56px);
  width: var(--stage-width, 320px);
  height: var(--stage-height, 240px);
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  box-sizing: border-box;
  overflow: hidden;
  pointer-events: auto;
}
.gvids-header {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 12px 20px;
  box-sizing: content-box;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base);
  flex-shrink: 0;
  gap: 10px;
}
.gvids-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
}
.gvids-close-btn:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.gvids-title-cluster {
  display: flex;
  align-items: center;
  gap: 8px;
}
.gvids-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  line-height: 20px;
}
.gvids-badge {
  font-size: 12px;
  line-height: 16px;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 4px;
  color: var(--dsw-alias-label-secondary);
  font-weight: 400;
}
.gvids-wizard-btn {
  margin-left: auto;
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  cursor: pointer;
}
.gvids-wizard-btn:hover {
  background: var(--dsw-alias-bg-layer-2);
}
.gvids-banner-gate {
  overflow: hidden;
  transition: max-height 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
  background: var(--dsw-alias-bg-layer-2);
  border-bottom: 1px solid var(--dsw-alias-state-warning-primary);
  flex-shrink: 0;
}
.gvids-banner-gate[data-ready="true"] {
  max-height: 0;
  opacity: 0;
  border-bottom: none;
}
.gvids-banner-gate[data-ready="false"] {
  max-height: 52px;
  opacity: 1;
}
.gvids-banner-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  font-size: 13px;
  color: var(--dsw-alias-state-warning-primary);
}
.gvids-banner-create-btn {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-label-primary-inverted, var(--dsw-alias-bg-base));
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}
.gvids-wizard-panel {
  padding: 12px 16px;
  background: var(--dsw-alias-bg-elevated);
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.gvids-wizard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.gvids-wizard-title {
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.gvids-wizard-steps {
  display: flex;
  gap: 16px;
}
.gvids-feed {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.gvids-feed-header {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
}
.gvids-card {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  overflow: hidden;
  background: var(--dsw-alias-bg-base);
}
.gvids-generating-box {
  padding: 16px 20px;
  background: var(--dsw-alias-bg-layer-2);
}
.gvids-generating-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.gvids-generating-percent {
  font-size: 20px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.gvids-cancel-btn {
  background: transparent;
  border: none;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  cursor: pointer;
}
.gvids-cancel-btn:hover {
  color: var(--dsw-alias-label-primary);
}
.gvids-generating-status {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  margin-top: 6px;
}
.gvids-progress-bar-bg {
  height: 4px;
  background: var(--dsw-alias-bg-layer-3);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 12px;
}
.gvids-progress-bar-fill {
  height: 100%;
  background: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));
  transition: width 0.3s ease;
}
.gvids-preview-wrap {
  position: relative;
  aspect-ratio: 16 / 9;
  background: var(--dsw-alias-bg-layer-1);
}
.gvids-preview-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.gvids-spec-tag {
  position: absolute;
  right: 10px;
  bottom: 10px;
  background: var(--dsw-alias-bg-mask-1);
  color: var(--dsw-alias-label-primary-inverted, var(--dsw-alias-label-primary));
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  backdrop-filter: blur(4px);
}
.gvids-actions-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--dsw-alias-bg-layer-1);
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.gvids-actions-left {
  display: flex;
  gap: 6px;
}
.gvids-action-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  color: var(--dsw-alias-label-primary);
}
.gvids-action-btn:hover {
  background: var(--dsw-alias-bg-layer-2);
}
.gvids-action-btn-insert {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));
  border: 1px solid var(--dsw-alias-border-l2);
  font-weight: 600;
}
.gvids-action-btn-insert:hover {
  background: var(--dsw-alias-border-l2);
}
.gvids-action-btn:disabled {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}
.gvids-action-btn-remove {
  background: transparent;
  border: none;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  cursor: pointer;
  padding: 0 8px;
  height: 28px;
}
.gvids-drawer {
  border-top: 1px solid var(--dsw-alias-border-l1);
  padding: 14px 20px;
  background: var(--dsw-alias-bg-base);
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}
.gvids-segmented-control {
  display: flex;
  background: var(--dsw-alias-bg-layer-2);
  padding: 2px;
  border-radius: 20px;
  width: fit-content;
  gap: 2px;
}
.gvids-segment-tab {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  padding: 4px 14px;
  border-radius: 16px;
  font-size: 12px;
  cursor: pointer;
  font-weight: 500;
}
.gvids-segment-tab[data-active="true"] {
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));
  font-weight: 600;
}
.gvids-input-area {
  width: 100%;
  min-height: 64px;
  max-height: 120px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  padding: 8px 12px;
  font-size: 13px;
  line-height: 20px;
  resize: none;
  outline: none;
  box-sizing: border-box;
}
.gvids-input-area:disabled {
  background: var(--dsw-alias-bg-layer-2);
  cursor: not-allowed;
  color: var(--dsw-alias-label-tertiary);
}
.gvids-drawer-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.gvids-param-capsule {
  background: var(--dsw-alias-bg-layer-2);
  border-radius: 16px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l1);
}
.gvids-submit-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));
  color: var(--dsw-alias-label-primary-inverted, var(--dsw-alias-label-primary));
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}
.gvids-submit-btn:disabled {
  background: var(--dsw-alias-bg-layer-3);
  cursor: not-allowed;
  color: var(--dsw-alias-label-tertiary);
}
`

function injectGoogleVidsStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STAGE_STYLES_ID)) return
  const style = document.createElement('style')
  style.id = STAGE_STYLES_ID
  style.textContent = STAGE_STYLES
  document.head.append(style)
}

/**
 * Google Vids 中间栏主舞台组件 (shell.overlay)
 * 严格遵循《Google Vids 中间栏主舞台与视频剪辑同屏 PRD 原型与 UI 元素白名单 Spec》
 * 100% 逐字对照 Spec 第 3 节白名单与文案字典，严禁自由发挥与装饰 Emoji。
 */
export function GoogleVidsStage(props) {
  const [everOpened, setEverOpened] = useState(false)
  const open = typeof props?.visible === 'boolean' ? props.visible : true
  const [box, setBox] = useState(() => (
    typeof document !== 'undefined' ? readVidsCenterBox() : { top: 0, left: 56, width: 320, height: 240 }
  ))

  useEffect(() => {
    if (open) setEverOpened(true)
  }, [open])

  useEffect(() => {
    injectGoogleVidsStyles()
  }, [])

  // Host shell.overlay sits on frame-level .dshDesktopOverlay (full frame).
  // Measure the live conversation column and clamp to the right panel edge so
  // Vids stays a true center-column surface while left/right rails remain usable.
  useLayoutEffect(() => {
    if (!open) return undefined
    const update = () => { setBox(readVidsCenterBox()) }
    update()
    // Clip open / split settle after claim; remeasure a few frames later.
    const timers = [50, 150, 400, 800].map((ms) => window.setTimeout(update, ms))
    const targets = [
      document.querySelector('[data-conversation-scroll]'),
      document.querySelector('[data-slot="conversation"]')?.parentElement,
      document.querySelector('[class*="centerCol"]'),
      document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]'),
      document.querySelector('[data-sidebar-right-panel]'),
      document.querySelector('[data-dsh-panel-host]'),
      document.querySelector('.dshDesktopFrame, [class*="frame"]'),
    ].filter((el) => el instanceof HTMLElement)
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null
    for (const target of targets) observer?.observe(target)
    window.addEventListener('resize', update)
    const onStage = () => update()
    window.addEventListener('dsh-product-stage', onStage)
    // Left/right rail toggles often keep the frame box size unchanged, so
    // ResizeObserver on the frame is silent. Capture UI gestures + poll.
    const onGesture = () => {
      update()
      window.setTimeout(update, 50)
      window.setTimeout(update, 200)
    }
    document.addEventListener('click', onGesture, true)
    document.addEventListener('pointerup', onGesture, true)
    const poll = window.setInterval(update, 250)
    const mo = typeof MutationObserver === 'function'
      ? new MutationObserver(update)
      : null
    mo?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        'data-omnimux-left-collapsed',
        'data-omnimux-conversation-collapsed',
        'data-dsh-product-stage',
        'class',
        'style',
      ],
    })
    const frame = document.querySelector('.dshDesktopFrame, [class*="frame"]')
    if (frame instanceof HTMLElement) {
      mo?.observe(frame, {
        attributes: true,
        subtree: true,
        attributeFilter: [
          'data-sidebar-collapsed',
          'data-rightbar-collapsed',
          'data-sidebar-right-panel',
          'data-sidebar-right-open',
          'class',
          'style',
        ],
      })
    }
    return () => {
      for (const id of timers) window.clearTimeout(id)
      window.clearInterval(poll)
      observer?.disconnect()
      mo?.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('dsh-product-stage', onStage)
      document.removeEventListener('click', onGesture, true)
      document.removeEventListener('pointerup', onGesture, true)
    }
  }, [open])

  // 剪辑工程就绪感知
  const [isEditorReady, setIsEditorReady] = useState(() => {
    if (typeof props?.isEditorReady === 'boolean') return props.isEditorReady
    if (typeof window !== 'undefined' && window.__omnimuxClipStatus) {
      return Boolean(window.__omnimuxClipStatus.isEditorReady)
    }
    return false
  })

  // 向导就绪面板状态
  const [onboardingOpen, setOnboardingOpen] = useState(false)

  // 模式 Tab：'create' | 'modify' | 'animate' | 'extend'
  const [currentMode, setCurrentMode] = useState('create')
  const [promptText, setPromptText] = useState('')
  const [attachedAsset, setAttachedAsset] = useState(null)
  const [insertedFeedbackId, setInsertedFeedbackId] = useState(null)

  const {
    tasks,
    setTasks,
    submitTask: handleSubmitTask,
    removeTask: handleRemoveTask,
    clearPollTimer,
    pollTimersRef,
  } = useVeoTaskFeed({
    isEditorReady,
    promptText,
    setPromptText,
    currentMode,
  })

  // 监听剪辑器状态广播（生成 timer 清理由 useVeoTaskFeed 负责）
  useEffect(() => {
    const handleStatus = (event) => {
      const detail = event?.detail
      if (detail && typeof detail.isEditorReady === 'boolean') {
        setIsEditorReady(detail.isEditorReady)
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('omnimux-clip:editor-status', handleStatus)
      window.dispatchEvent(new CustomEvent('omnimux-clip:request-status'))
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('omnimux-clip:editor-status', handleStatus)
      }
    }
  }, [])

  // 退出主舞台
  const handleCloseStage = () => {
    if (typeof window !== 'undefined') {
      try {
        if (window.__omnimuxStage && typeof window.__omnimuxStage.release === 'function') {
          window.__omnimuxStage.release('omnimux-vids')
        }
      } catch {}
      try {
        if (document.documentElement?.dataset?.dshProductStage === 'omnimux-vids') {
          delete document.documentElement.dataset.dshProductStage
        }
      } catch {}
      window.dispatchEvent(new CustomEvent('dsh-product-stage', { detail: { id: '' } }))
    }
    props?.onClose?.()
  }

  // 触发新建工程
  const handleCreateProject = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('omnimux-clip:new-project', { detail: { title: '未命名剪辑' } }))
    }
    if (typeof props?.onOpenProject === 'function') {
      props.onOpenProject()
    }
  }

  // 切换模式
  const handleSwitchMode = (mode, asset = null) => {
    setCurrentMode(mode)
    setAttachedAsset(asset)
  }

  // 触发升频（本地假进度；本单不拆 timer 表，仍复用 pollTimersRef，见 #2746）
  const handleUpscale = (taskId) => {
    clearPollTimer(taskId)
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: 'generating', progress: 12, isUpscaling: true } : t
      )
    )
    let p = 12
    const timer = setInterval(() => {
      p += 25
      if (p >= 100) {
        clearInterval(timer)
        pollTimersRef.current.delete(taskId)
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, status: 'completed', isUpscaled: true, resolution: '1080p', isUpscaling: false }
              : t
          )
        )
      } else {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, progress: p } : t))
        )
      }
    }, 350)
    pollTimersRef.current.set(taskId, timer)
  }

  // 插入到时间轴 (向右侧 Clip 追加)
  const handleInsertToTimeline = (task) => {
    const payload = {
      url: task.videoUrl,
      videoUrl: task.videoUrl,
      title: task.title,
      duration: task.durationSec,
      durationSec: task.durationSec,
      resolution: task.resolution,
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('omnimux-clip:insert', { detail: payload }))
      window.dispatchEvent(new CustomEvent('omnimux:clip:insert-clip', { detail: payload }))
    }

    if (typeof props?.onInsertToTimeline === 'function') {
      props.onInsertToTimeline(task)
    }

    setInsertedFeedbackId(task.id)
    setTimeout(() => {
      setInsertedFeedbackId((cur) => (cur === task.id ? null : cur))
    }, 1500)
  }

  // 动态占位符
  const getPlaceholder = () => {
    if (!isEditorReady) return '请先在右侧创建或打开剪辑工程...'
    switch (currentMode) {
      case 'create':
        return '描述您想生成的视频画面与动作...'
      case 'modify':
        return '描述需要对当前视频进行的调整（如光影或服装风格）...'
      case 'animate':
        return '描述图像素材中应展现的动作与运镜细节...'
      case 'extend':
        return '描述当前视频结尾后续发生的情节发展...'
      default:
        return '描述您想生成的视频画面与动作...'
    }
  }

  if (!open && !everOpened) return null

  return (
    <div
      className="omnimux-vids-stage"
      data-visible={open ? 'true' : 'false'}
      style={{
        display: open ? undefined : 'none',
        '--stage-top': `${box.top}px`,
        '--stage-left': `${box.left}px`,
        '--stage-width': `${box.width}px`,
        '--stage-height': `${box.height}px`,
      }}
    >
      {/* 3.1 顶部 Header */}
      <header className="gvids-header">
        {/* 关闭按钮 */}
        <button // exempt-ui01 Google Vids 舞台专属按钮
          type="button"
          onClick={handleCloseStage}
          aria-label="关闭"
          className="gvids-close-btn"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* 标题与微标 */}
        <div className="gvids-title-cluster">
          <span className="gvids-title">
            Google Vids
          </span>
          <span className="gvids-badge">
            内测版
          </span>
        </div>

        {/* 右侧向导按钮 */}
        <button // exempt-ui01 Google Vids 舞台专属按钮
          type="button"
          onClick={() => setOnboardingOpen((v) => !v)}
          className="gvids-wizard-btn"
        >
          向导
        </button>
      </header>

      {/* 3.1 门禁警告条（未就绪时呈现，就绪后 300ms 平滑淡出收缩） */}
      <div
        className="gvids-banner-gate"
        data-ready={isEditorReady ? 'true' : 'false'}
      >
        <div className="gvids-banner-inner">
          <span>请在右侧创建或打开剪辑工程</span>
          <button // exempt-ui01 Google Vids 舞台专属按钮
            type="button"
            onClick={handleCreateProject}
            className="gvids-banner-create-btn"
          >
            新建工程
          </button>
        </div>
      </div>

      {/* 向导浮层抽屉 */}
      {onboardingOpen && (
        <div className="gvids-wizard-panel">
          <div className="gvids-wizard-header">
            <span className="gvids-wizard-title">环境就绪向导</span>
            <button // exempt-ui01 Google Vids 舞台专属按钮
              type="button"
              onClick={() => setOnboardingOpen(false)}
              className="gvids-close-btn"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="gvids-wizard-steps">
            <span>驱动引擎: 就绪</span>
            <span>浏览器安全桥接: 就绪</span>
            <span>账号登录态: 就绪</span>
            <span>剪辑工程: {isEditorReady ? '已就绪' : '未就绪'}</span>
          </div>
        </div>
      )}

      {/* 3.2 生成记录流 */}
      <div className="gvids-feed">
        <div className="gvids-feed-header">
          {`生成记录 (${tasks.length})`}
        </div>

        {tasks.map((task) => (
          <div key={task.id} className="gvids-card">
            {task.status === 'generating' ? (
              <div className="gvids-generating-box">
                <div className="gvids-generating-top">
                  <div className="gvids-generating-percent">
                    {`${task.progress || 0}%`}
                  </div>
                  <button // exempt-ui01 Google Vids 舞台专属按钮
                    type="button"
                    onClick={() => handleRemoveTask(task.id)}
                    className="gvids-cancel-btn"
                  >
                    取消
                  </button>
                </div>
                <div className="gvids-generating-status">
                  {task.isUpscaling
                    ? '正在升频画质...'
                    : (task.message || '正在生成视频...')}
                </div>
                <div className="gvids-progress-bar-bg">
                  <div
                    className="gvids-progress-bar-fill"
                    style={{ width: `${task.progress || 0}%` }}
                  />
                </div>
              </div>
            ) : task.status === 'failed' ? (
              <div className="gvids-generating-box">
                <div className="gvids-generating-top">
                  <div className="gvids-generating-percent">失败</div>
                  <button // exempt-ui01 Google Vids 舞台专属按钮
                    type="button"
                    onClick={() => handleRemoveTask(task.id)}
                    className="gvids-cancel-btn"
                  >
                    移除
                  </button>
                </div>
                <div className="gvids-generating-status">
                  {task.message || task.error || '生成失败，请微调提示词后重试'}
                </div>
              </div>
            ) : (
              <div>
                {/* 视频画面预览 */}
                <div className="gvids-preview-wrap">
                  <video
                    src={task.videoUrl}
                    loop
                    muted
                    autoPlay
                    playsInline
                    className="gvids-preview-video"
                  />
                  {/* 规格微标 */}
                  <div className="gvids-spec-tag">
                    {task.isUpscaled
                      ? `${task.resolution} · ${task.durationSec}s · 已升频`
                      : `${task.resolution} · ${task.durationSec}s`}
                  </div>
                </div>

                {/* 操作栏 */}
                <div className="gvids-actions-bar">
                  <div className="gvids-actions-left">
                    {/* 核心动作：→ 插入 */}
                    <button // exempt-ui01 Google Vids 舞台专属按钮
                      type="button"
                      onClick={() => handleInsertToTimeline(task)}
                      className="gvids-action-btn gvids-action-btn-insert"
                    >
                      {insertedFeedbackId === task.id ? '已插入' : '→ 插入'}
                    </button>
                    {/* 延续 */}
                    <button // exempt-ui01 Google Vids 舞台专属按钮
                      type="button"
                      onClick={() => handleSwitchMode('extend', task.videoUrl)}
                      className="gvids-action-btn"
                    >
                      延续
                    </button>
                    {/* 修改 */}
                    <button // exempt-ui01 Google Vids 舞台专属按钮
                      type="button"
                      onClick={() => handleSwitchMode('modify', task.videoUrl)}
                      className="gvids-action-btn"
                    >
                      修改
                    </button>
                    {/* 升频 */}
                    <button // exempt-ui01 Google Vids 舞台专属按钮
                      type="button"
                      disabled={task.isUpscaled}
                      onClick={() => handleUpscale(task.id)}
                      className="gvids-action-btn"
                    >
                      升频
                    </button>
                  </div>
                  {/* 破坏性：移除 */}
                  <button // exempt-ui01 Google Vids 舞台专属按钮
                    type="button"
                    onClick={() => handleRemoveTask(task.id)}
                    className="gvids-action-btn-remove"
                  >
                    移除
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 3.3 底部创作抽屉与参数区 */}
      <div className="gvids-drawer">
        {/* 模式分段控制器（纯 2 字名词） */}
        <div className="gvids-segmented-control">
          {[
            { id: 'create', label: '创建' },
            { id: 'modify', label: '修改' },
            { id: 'animate', label: '动画' },
            { id: 'extend', label: '扩展' },
          ].map((tab) => (
            <button // exempt-ui01 Google Vids 舞台专属按钮
              key={tab.id}
              type="button"
              data-active={currentMode === tab.id ? 'true' : 'false'}
              onClick={() => handleSwitchMode(tab.id)}
              className="gvids-segment-tab"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 提示词输入框 */}
        <textarea
          disabled={!isEditorReady}
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder={getPlaceholder()}
          rows={3}
          className="gvids-input-area"
        />

        {/* 底部参数与生成按键 */}
        <div className="gvids-drawer-bottom">
          {/* 客观规格胶囊 */}
          <div className="gvids-param-capsule">
            720p · 16:9 · 10s
          </div>

          {/* 生成动作键 (纯向上箭头矢量 SVG) */}
          <button // exempt-ui01 Google Vids 舞台专属按钮
            type="button"
            disabled={!isEditorReady || !promptText.trim()}
            onClick={handleSubmitTask}
            aria-label="生成视频"
            className="gvids-submit-btn"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 12V4M4 8l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default GoogleVidsStage
