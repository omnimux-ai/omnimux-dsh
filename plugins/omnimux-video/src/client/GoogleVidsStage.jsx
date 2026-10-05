import React, { useState, useEffect, useRef } from 'react'
import {
  VIDS_MODES,
  VEO_TASK_SPEC,
  formatVidsParamSummary,
  resolveVidsMode,
} from '../shared/veoTaskSpec.js'
import { useVeoTaskFeed } from './useVeoTaskFeed.js'
import {
  defaultVidsParams,
  inheritVidsParams,
  modeAfterSourcePick,
  vidsAspectOptions,
  vidsAttachmentSlots,
  vidsInsertPayload,
  vidsRecreateRequest,
  vidsResolutionOptions,
  vidsSecondsOptions,
  vidsSourceClip,
  vidsSourceHint,
  vidsSubmitState,
} from './vids-mode-ui.js'

const STAGE_STYLES_ID = 'omnimux-vids-stage-styles'
const STAGE_STYLES = `
.omnimux-vids-stage {
  position: relative !important;
  width: 100% !important;
  height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
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
  height: 180px;
  background: var(--dsw-alias-bg-layer-1);
}
.gvids-preview-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.gvids-card-title {
  padding: 10px 14px 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  align-items: center;
  flex-wrap: wrap;
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
.gvids-action-reason {
  font-size: 12px;
  color: var(--dsw-alias-state-warning-primary);
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
.gvids-mode-strip {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  line-height: 16px;
}
.gvids-mode-title {
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.gvids-mode-hint {
  color: var(--dsw-alias-label-secondary);
}
.gvids-attach-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.gvids-attach-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.gvids-attach-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}
.gvids-attach-btn:hover {
  background: var(--dsw-alias-bg-layer-2);
}
.gvids-attach-btn:disabled {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}
.gvids-file-input {
  display: none;
}
.gvids-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 220px;
  height: 24px;
  padding: 0 4px 0 8px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
}
.gvids-chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gvids-chip-remove {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 0 4px;
}
.gvids-chip-remove:hover {
  color: var(--dsw-alias-state-error-primary);
}
.gvids-attach-hint {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.gvids-clip-picker {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 132px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}
.gvids-clip-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.gvids-clip-option:hover {
  background: var(--dsw-alias-bg-layer-2);
}
.gvids-clip-option-meta {
  flex-shrink: 0;
  color: var(--dsw-alias-label-secondary);
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
.gvids-params {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.gvids-param-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.gvids-param-select {
  height: 28px;
  padding: 0 6px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  cursor: pointer;
}
.gvids-param-capsule {
  background: var(--dsw-alias-bg-layer-2);
  border-radius: 16px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l1);
}
.gvids-drawer-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.gvids-submit-reason {
  font-size: 12px;
  color: var(--dsw-alias-state-warning-primary);
}
.gvids-submit-btn {
  height: 32px;
  padding: 0 12px;
  border-radius: 16px;
  background: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));
  color: var(--dsw-alias-label-primary-inverted, var(--dsw-alias-label-primary));
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}
.gvids-submit-btn:disabled {
  background: var(--dsw-alias-bg-layer-3);
  cursor: not-allowed;
  color: var(--dsw-alias-label-tertiary);
}
`

const SECONDS_OPTIONS = vidsSecondsOptions()
const RESOLUTION_OPTIONS = vidsResolutionOptions()
const ASPECT_OPTIONS = vidsAspectOptions()

function injectGoogleVidsStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STAGE_STYLES_ID)) return
  const style = document.createElement('style')
  style.id = STAGE_STYLES_ID
  style.textContent = STAGE_STYLES
  document.head.append(style)
}

/**
 * 释放本地图片的 object URL（真实上传链路不在本票范围，请求里携带的就是这个地址）。
 * @param {{ url?: string } | null | undefined} asset
 */
function releaseObjectUrl(asset) {
  if (!asset?.url) return
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
  URL.revokeObjectURL(asset.url)
}

/**
 * Google Vids 中间栏主舞台组件 (shell.overlay)
 * 四生成模式（创建 / 动画 / 修改 / 延续）1:1 交互：模式条、模式附件行、源片段选择、
 * 参数控件与结果动作行全部从 shared 契约派生（Issue #3181）。
 */
export function GoogleVidsStage(props) {
  const [everOpened, setEverOpened] = useState(false)
  const open = typeof props?.visible === 'boolean' ? props.visible : true

  useEffect(() => {
    if (open) {
      setEverOpened(true)
      if (typeof document !== 'undefined' && document.documentElement?.hasAttribute('data-omnimux-conversation-collapsed')) {
        document.documentElement.removeAttribute('data-omnimux-conversation-collapsed')
      }
    }
  }, [open])

  useEffect(() => {
    injectGoogleVidsStyles()
  }, [])

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

  // 创作状态
  const [currentMode, setCurrentMode] = useState(VEO_TASK_SPEC.defaultMode)
  const [promptText, setPromptText] = useState('')
  // 图片素材按模式各存一份：切模式不丢用户已选图片，也不会把当前模式不可见的图片塞进请求
  const [modeImages, setModeImages] = useState({})
  const [sourceClip, setSourceClip] = useState(null)
  const [params, setParams] = useState(defaultVidsParams)
  const [clipPickerOpen, setClipPickerOpen] = useState(false)
  const [insertedFeedbackId, setInsertedFeedbackId] = useState(null)
  const [cardNotice, setCardNotice] = useState(null)
  const [composerNotice, setComposerNotice] = useState('')
  // 预览加载失败的任务：显示中性占位，避免渲染成一块空白黑框
  const [failedPreviews, setFailedPreviews] = useState(() => new Set())

  const modeImagesRef = useRef(modeImages)
  useEffect(() => {
    modeImagesRef.current = modeImages
  }, [modeImages])

  const activeMode = resolveVidsMode(currentMode)
  const attachmentSlots = vidsAttachmentSlots(currentMode)
  const activeImage = modeImages[currentMode] || null
  const acceptsImage = attachmentSlots.some((slot) => slot.id === 'image')

  // 只把当前模式真正接受的输入交给请求构造：create 不带图/视频，extend 不带图
  const modeInputs = {
    imageUrl: acceptsImage && activeImage ? activeImage.url : '',
    videoId: activeMode.requiresVideo && sourceClip ? sourceClip.videoId : '',
  }

  const {
    tasks,
    submitTask,
    submitRequest,
    removeTask: removeFeedTask,
  } = useVeoTaskFeed({
    isEditorReady,
    promptText,
    setPromptText,
    currentMode,
    modeInputs,
    params,
  })

  const submission = vidsSubmitState({
    mode: currentMode,
    prompt: promptText,
    imageUrl: modeInputs.imageUrl,
    videoId: modeInputs.videoId,
    params,
  })
  const sourceHint = vidsSourceHint(currentMode, Boolean(sourceClip))
  const completedTasks = tasks.filter((task) => task.status === 'completed')

  // 监听剪辑器状态广播
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

  // 卸载时释放本地图片地址
  useEffect(() => () => {
    Object.values(modeImagesRef.current).forEach((asset) => releaseObjectUrl(asset))
  }, [])

  // 退出主舞台
  const handleCloseStage = () => {
    if (typeof window !== 'undefined') {
      try {
        let layout = props?.layout || window.__omnimuxWorkbench?.layout || window.__omnimuxLayout
        if (!layout && typeof document !== 'undefined') {
          const frame = document.querySelector('.dshDesktopFrame')
          const key = frame && Object.keys(frame).find((k) => k.startsWith('__reactFiber'))
          let node = key ? frame[key] : null
          while (node) {
            if (typeof node.memoizedProps?.layout?.selectPanel === 'function') {
              layout = node.memoizedProps.layout
              break
            }
            node = node.return
          }
        }
        if (typeof layout?.selectPanel === 'function') {
          layout.selectPanel(null)
        }
      } catch {}
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

  // 切换模式（已选源片段与已选图片都保留，切回来自动复现）
  const handleSwitchMode = (modeId) => {
    setCurrentMode(modeId)
    setClipPickerOpen(false)
  }

  // 选择本地图片：object URL 即请求里的 imageUrl
  const handleImagePicked = (event) => {
    const file = event?.target?.files?.[0]
    if (event?.target) event.target.value = ''
    if (!file) return
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      setComposerNotice('当前环境不支持本地图片地址')
      return
    }
    const modeId = currentMode
    setComposerNotice('')
    releaseObjectUrl(modeImagesRef.current[modeId])
    setModeImages((prev) => ({
      ...prev,
      [modeId]: { url: URL.createObjectURL(file), name: file.name || '图片' },
    }))
  }

  const handleRemoveImage = () => {
    const modeId = currentMode
    releaseObjectUrl(modeImagesRef.current[modeId])
    setModeImages((prev) => {
      const next = { ...prev }
      delete next[modeId]
      return next
    })
  }

  // 选中源片段：写入 videoId 并继承其参数（可覆盖）
  const handleSelectSource = (task) => {
    const clip = vidsSourceClip(task)
    if (!clip) return
    setSourceClip(clip)
    setParams((prev) => inheritVidsParams(task, prev))
    setClipPickerOpen(false)
  }

  // 结果卡片「设为源片段」：当前模式已需要源片段就保持，否则切到延续
  const handlePickSource = (task) => {
    handleSelectSource(task)
    setCurrentMode((mode) => modeAfterSourcePick(mode))
  }

  // 结果卡片「延续」「修改」：选中源片段并切到对应模式
  const handleSwitchModeWithSource = (modeId, task) => {
    handleSelectSource(task)
    setCurrentMode(modeId)
  }

  const handleRemoveSource = () => {
    setSourceClip(null)
    setClipPickerOpen(false)
  }

  // 插入到时间轴（向右侧 Clip 追加）
  const handleInsertToTimeline = (task) => {
    if (!isEditorReady) {
      setCardNotice({ taskId: task.id, text: '剪辑器未就绪，请先在右侧创建或打开剪辑工程' })
      return
    }
    const payload = vidsInsertPayload(task)

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('omnimux-clip:insert', { detail: payload }))
      window.dispatchEvent(new CustomEvent('omnimux:clip:insert-clip', { detail: payload }))
    }

    if (typeof props?.onInsertToTimeline === 'function') {
      props.onInsertToTimeline(task)
    }

    setCardNotice(null)
    setInsertedFeedbackId(task.id)
    setTimeout(() => {
      setInsertedFeedbackId((cur) => (cur === task.id ? null : cur))
    }, 1500)
  }

  // 重新创建：复用任务留存的原请求重提交
  const handleRecreate = async (task) => {
    if (!isEditorReady) {
      setCardNotice({ taskId: task.id, text: VEO_TASK_SPEC.editorGatePlaceholder })
      return
    }
    const rebuilt = vidsRecreateRequest(task)
    if (!rebuilt.ok) {
      setCardNotice({ taskId: task.id, text: rebuilt.reason })
      return
    }
    setCardNotice(null)
    await submitRequest(rebuilt.request)
  }

  // 改提示词：把该任务的提示词回填输入区
  const handleEditPrompt = (task) => {
    const text = typeof task.prompt === 'string' && task.prompt.trim()
      ? task.prompt.trim()
      : (typeof task.title === 'string' ? task.title.trim() : '')
    if (!text) {
      setCardNotice({ taskId: task.id, text: '该任务没有可回填的提示词' })
      return
    }
    setPromptText(text)
    setCardNotice(null)
  }

  const handleRemoveTask = (taskId) => {
    removeFeedTask(taskId)
  }

  // 动态占位符（文案字典在 shared 契约）
  const getPlaceholder = () => {
    if (!isEditorReady) return VEO_TASK_SPEC.editorGatePlaceholder
    return activeMode.placeholder
  }

  if (!open && !everOpened) return null

  const content = (
    <div
      className="omnimux-vids-stage"
      data-visible={open ? 'true' : 'false'}
      style={{
        display: open ? undefined : 'none',
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
                    data-vids-action="remove"
                    onClick={() => handleRemoveTask(task.id)}
                    className="gvids-cancel-btn"
                  >
                    取消
                  </button>
                </div>
                <div className="gvids-generating-status">
                  {task.message || '正在生成视频...'}
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
                {/* 记录标题：生成记录必须可辨认 */}
                {(task.title || task.prompt) && (
                  <div className="gvids-card-title" data-vids-card-title>
                    {task.title || task.prompt}
                  </div>
                )}
                {/* 视频画面预览 */}
                <div className="gvids-preview-wrap">
                  {failedPreviews.has(task.id) ? (
                    <div className="gvids-preview-fallback" data-vids-preview-fallback>
                      预览不可用
                    </div>
                  ) : (
                    <video
                      src={task.videoUrl}
                      loop
                      muted
                      autoPlay
                      playsInline
                      onError={() => setFailedPreviews((prev) => new Set(prev).add(task.id))}
                      className="gvids-preview-video"
                    />
                  )}
                  {/* 规格微标 */}
                  <div className="gvids-spec-tag">
                    {`${task.resolution} · ${task.durationSec}s`}
                  </div>
                </div>

                {/* 操作栏 */}
                <div className="gvids-actions-bar">
                  <div className="gvids-actions-left">
                    {/* 核心动作：插入 */}
                    <button // exempt-ui01 Google Vids 舞台专属按钮
                      type="button"
                      data-vids-action="insert"
                      onClick={() => handleInsertToTimeline(task)}
                      className="gvids-action-btn gvids-action-btn-insert"
                    >
                      {insertedFeedbackId === task.id ? '已插入' : '插入'}
                    </button>
                    {/* 重新创建：同请求重提交 */}
                    <button // exempt-ui01 Google Vids 舞台专属按钮
                      type="button"
                      data-vids-action="recreate"
                      onClick={() => handleRecreate(task)}
                      className="gvids-action-btn"
                    >
                      重新创建
                    </button>
                    {/* 改提示词：回填输入区 */}
                    <button // exempt-ui01 Google Vids 舞台专属按钮
                      type="button"
                      data-vids-action="edit-prompt"
                      onClick={() => handleEditPrompt(task)}
                      className="gvids-action-btn"
                    >
                      改提示词
                    </button>
                    {/* 设为源片段 */}
                    <button // exempt-ui01 Google Vids 舞台专属按钮
                      type="button"
                      data-vids-action="set-source"
                      onClick={() => handlePickSource(task)}
                      className="gvids-action-btn"
                    >
                      设为源片段
                    </button>
                    {/* 延续 */}
                    <button // exempt-ui01 Google Vids 舞台专属按钮
                      type="button"
                      data-vids-action="extend"
                      onClick={() => handleSwitchModeWithSource('extend', task)}
                      className="gvids-action-btn"
                    >
                      延续
                    </button>
                    {/* 修改 */}
                    <button // exempt-ui01 Google Vids 舞台专属按钮
                      type="button"
                      data-vids-action="modify"
                      onClick={() => handleSwitchModeWithSource('modify', task)}
                      className="gvids-action-btn"
                    >
                      修改
                    </button>
                    {cardNotice && cardNotice.taskId === task.id && (
                      <span className="gvids-action-reason" data-vids-action-reason>{cardNotice.text}</span>
                    )}
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
        {/* 模式分段控制器（标签来自 VIDS_MODES） */}
        <div className="gvids-segmented-control">
          {VIDS_MODES.map((tab) => (
            <button // exempt-ui01 Google Vids 舞台专属按钮
              key={tab.id}
              type="button"
              data-vids-mode={tab.id}
              data-active={currentMode === tab.id ? 'true' : 'false'}
              onClick={() => handleSwitchMode(tab.id)}
              className="gvids-segment-tab"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 当前模式说明条 */}
        <div className="gvids-mode-strip">
          <span className="gvids-mode-title">{activeMode.title}</span>
          <span className="gvids-mode-hint" data-vids-mode-hint>{activeMode.hint}</span>
        </div>

        {/* 模式附件行（槽位来自契约：动画=图片，修改=源片段+替换图，延续=源片段） */}
        {attachmentSlots.length > 0 && (
          <div className="gvids-attach-row">
            {attachmentSlots.map((slot) => {
              // QA 契约钩子：源片段槽 = video；图片槽在修改模式是替换图，其余是必需图。
              const attachKind = slot.id === 'source'
                ? 'video'
                : (activeMode.id === 'modify' ? 'replacement-image' : 'image')
              return (
              <span key={slot.id} className="gvids-attach-item">
                {slot.id === 'image' ? (
                  <label className="gvids-attach-btn" data-vids-attach={attachKind}>
                    {slot.label}
                    <input // exempt-ui01 文件选择器由 label 触发
                      type="file"
                      accept={slot.accept}
                      onChange={handleImagePicked}
                      className="gvids-file-input"
                    />
                  </label>
                ) : (
                  <button // exempt-ui01 Google Vids 舞台专属按钮
                    type="button"
                    data-vids-attach={attachKind}
                    disabled={completedTasks.length === 0}
                    onClick={() => setClipPickerOpen((v) => !v)}
                    className="gvids-attach-btn"
                  >
                    {slot.label}
                  </button>
                )}
                {slot.id === 'image' && activeImage && (
                  <span className="gvids-chip" data-vids-asset={attachKind}>
                    <span className="gvids-chip-name">{activeImage.name}</span>
                    <button // exempt-ui01 Google Vids 舞台专属按钮
                      type="button"
                      data-vids-asset-remove
                      onClick={handleRemoveImage}
                      className="gvids-chip-remove"
                    >
                      移除
                    </button>
                  </span>
                )}
                {slot.id === 'source' && sourceClip && (
                  <span className="gvids-chip" data-vids-asset={attachKind}>
                    <span className="gvids-chip-name">{sourceClip.title || sourceClip.videoId}</span>
                    <button // exempt-ui01 Google Vids 舞台专属按钮
                      type="button"
                      data-vids-asset-remove
                      onClick={handleRemoveSource}
                      className="gvids-chip-remove"
                    >
                      移除
                    </button>
                  </span>
                )}
              </span>
              )
            })}
            {sourceHint && (
              <span className="gvids-attach-hint">{sourceHint}</span>
            )}
          </div>
        )}

        {/* 源片段选择器：已完成的结果片段 */}
        {clipPickerOpen && (
          <div className="gvids-clip-picker">
            {completedTasks.map((task) => (
              <button // exempt-ui01 Google Vids 舞台专属按钮
                key={task.id}
                type="button"
                onClick={() => handleSelectSource(task)}
                className="gvids-clip-option"
              >
                <span className="gvids-clip-option-title">{task.title}</span>
                <span className="gvids-clip-option-meta">{`${task.resolution} · ${task.durationSec}s`}</span>
              </button>
            ))}
          </div>
        )}

        {/* 创作区提示（本地图片地址不可用等） */}
        {composerNotice && (
          <span className="gvids-action-reason">{composerNotice}</span>
        )}

        {/* 提示词输入框 */}
        <textarea
          disabled={!isEditorReady}
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder={getPlaceholder()}
          rows={3}
          className="gvids-input-area"
        />

        {/* 参数控件行（取值域真源：VIDS_PARAM_SPEC） */}
        <div className="gvids-params">
          <label className="gvids-param-field">
            <span>时长</span>
            <select // exempt-ui01 Google Vids 舞台专属控件
              data-vids-param="seconds"
              value={params.seconds}
              onChange={(e) => setParams((prev) => ({ ...prev, seconds: Number(e.target.value) }))}
              className="gvids-param-select"
            >
              {SECONDS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="gvids-param-field">
            <span>分辨率</span>
            <select // exempt-ui01 Google Vids 舞台专属控件
              data-vids-param="resolution"
              value={params.resolution}
              onChange={(e) => setParams((prev) => ({ ...prev, resolution: e.target.value }))}
              className="gvids-param-select"
            >
              {RESOLUTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="gvids-param-field">
            <span>画面比例</span>
            <select // exempt-ui01 Google Vids 舞台专属控件
              data-vids-param="aspectRatio"
              value={params.aspectRatio}
              onChange={(e) => setParams((prev) => ({ ...prev, aspectRatio: e.target.value }))}
              className="gvids-param-select"
            >
              {ASPECT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <span className="gvids-param-capsule" data-vids-param-summary>
            {formatVidsParamSummary(params)}
          </span>
        </div>

        {/* 底部提交区：校验失败时禁用并展示可读原因 */}
        <div className="gvids-drawer-bottom">
          {!submission.ok && (
            <span className="gvids-submit-reason" data-vids-submit-reason>{submission.reason}</span>
          )}

          <button // exempt-ui01 Google Vids 舞台专属按钮
            type="button"
            data-vids-submit
            data-submit-label={activeMode.submitLabel}
            disabled={!isEditorReady || !submission.ok}
            onClick={() => submitTask()}
            aria-label={activeMode.submitLabel}
            className="gvids-submit-btn"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 12V4M4 8l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{activeMode.submitLabel}</span>
          </button>
        </div>
      </div>
    </div>
  )

  return content
}

export default GoogleVidsStage
