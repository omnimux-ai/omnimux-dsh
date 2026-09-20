/**
 * plugins/omnimux-workflow/src/client/projects/AppTab.jsx
 *
 * Dedicated AI Application Tab for dsh-better-sidebar.
 * Structure:
 * - Left (448px outer, 398px inner): Dynamic Form Panel with 40px inputs, 80px textareas, 44px Ink CTA "立即生成".
 * - Right: Task outputs & Showcase management with real media playback and state tracking.
 *
 * Authority: docs/contracts/ai-app-ui-spec.md & docs/contracts/workflow-app-boundary.md
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { injectWorkflowStyles } from '../styles.js'
import {
  appIdFromTabId,
  forgetOpenAppTab,
  registerOpenAppTab,
  isAppOwnedByUser,
  createProjectForkFromManifest,
  resolveAppEditTarget,
  resolveOwningProject,
  toPublishedAppEntry,
} from './appLibrary.js'
import { listProjects } from '../api.js'
import { activateProjectCanvas, getBetterSidebar } from './projectCanvas.js'

const EMPTY_PROPS = Object.freeze({})
const EMPTY_REQUIRED = Object.freeze([])

function IconCheck({ size = 12, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  )
}

function IconClose({ size = 12, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

function IconSpinner({ size = 12, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`omx-apptab-spin ${className}`} aria-hidden="true">
      <path d="M8 2a6 6 0 1 0 6 6" />
    </svg>
  )
}

function IconAlert({ size = 14, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M8 2.5l5.5 10.5H2.5L8 2.5zM8 6.5v3.5M8 12v.5" />
    </svg>
  )
}

function IconSparkle({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
    </svg>
  )
}

function IconRocket({ size = 36, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6.05 11a22.35 22.35 0 0 1-3.95 2zM9 9l3 3M15 9l-3 3" />
    </svg>
  )
}

function IconPalette({ size = 32, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.21-.64-1.67-.39-.45-.61-1.02-.61-1.64 0-1.38 1.12-2.5 2.5-2.5H17c2.76 0 5-2.24 5-5 0-4.42-4.03-8.69-10-8.69z" />
    </svg>
  )
}

/**
 * Reads manifest from localStorage cache by appId or gets the newest manifest.
 * @param {string} [appId]
 * @returns {object|null}
 */
export function readCachedManifest(appId) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage?.getItem('omnimux_apps_manifests')
    if (!raw) return null
    const map = JSON.parse(raw)
    if (appId && map[appId]) return map[appId]
    const values = Object.values(map)
    if (values.length > 0) {
      return values.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0]
    }
  } catch {
    return null
  }
  return null
}

/**
 * Reads tasks from localStorage for given appId.
 * @param {string} appId
 * @returns {Array<object>}
 */
export function readCachedTasks(appId) {
  if (typeof window === 'undefined' || !appId) return []
  try {
    const raw = window.localStorage?.getItem(`omnimux_apps_tasks_${appId}`)
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/**
 * Writes tasks to localStorage for given appId.
 * @param {string} appId
 * @param {Array<object>} tasks
 */
export function writeCachedTasks(appId, tasks) {
  if (typeof window === 'undefined' || !appId) return
  try {
    window.localStorage?.setItem(`omnimux_apps_tasks_${appId}`, JSON.stringify(tasks))
  } catch {
    // ignore
  }
}

/**
 * AppTab component for better-sidebar.
 * @param {object} props
 */
export function AppTab(props) {
  const t = typeof props?.t === 'function' ? props.t : (k) => k
  useEffect(() => {
    injectWorkflowStyles()
  }, [])

  const seed = props?.seed || props?.tab || props
  const tabId = typeof seed?.id === 'string' ? seed.id : ''
  const explicitManifest = seed?.extra?.manifest || props?.extra?.manifest || props?.manifest
  // 标签页 id 里绑定的应用：只有插件自有面板布局才是 `app_<appId>`。
  const tabBoundAppId = appIdFromTabId(seed?.id)
  // 应用身份：宿主原生 surface 会丢掉 seed.id 与 extra，只把 `meta` 转给标签页，
  // 所以 meta.appId 是那条布局下唯一的身份通道。
  const seedAppId = (typeof seed?.meta?.appId === 'string' && seed.meta.appId)
    || (typeof props?.meta?.appId === 'string' && props.meta.appId)
    || tabBoundAppId

  const [appId, setAppId] = useState(seedAppId)
  const [manifest, setManifest] = useState(() => {
    return explicitManifest || readCachedManifest(seedAppId)
  })

  // 标签页重挂载（宿主按新导航参数重建记录）时同步应用身份。
  useEffect(() => {
    if (!seedAppId) return
    setAppId((prev) => (prev === seedAppId ? prev : seedAppId))
  }, [seedAppId])

  // 应用标签页打开事件：宿主对同一个 kind 只保留一个标签页，重复打开是
  // 「聚焦已存在 + 刷新导航参数」——记录表在已存在时不会重写 meta，所以
  // 标签页还挂着的时候必须靠这条事件换到被点应用。
  // 自有面板布局里每个应用各自一个标签页，那种布局只认领自己绑定的应用。
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onAppOpen = (e) => {
      const detail = e?.detail
      const nextId = typeof detail?.appId === 'string' ? detail.appId : ''
      if (!nextId) return
      if (tabBoundAppId && tabBoundAppId !== nextId) return
      setAppId(nextId)
      const next = detail?.manifest || readCachedManifest(nextId)
      if (next) setManifest(next)
    }
    window.addEventListener('omnimux-app-open', onAppOpen)
    return () => {
      window.removeEventListener('omnimux-app-open', onAppOpen)
    }
  }, [tabBoundAppId])

  // 应用身份变化（或显式 manifest 后到）时同步面板内容。
  useEffect(() => {
    if (explicitManifest) {
      setManifest((prev) => {
        if (!prev) return explicitManifest
        if (prev === explicitManifest) return prev
        if (prev.appId === explicitManifest.appId && prev.version === explicitManifest.version && prev.updatedAt === explicitManifest.updatedAt) {
          return prev
        }
        return explicitManifest
      })
      return
    }
    if (!appId) return
    const cached = readCachedManifest(appId)
    if (!cached) return
    setManifest((prev) => (
      prev && prev.appId === cached.appId && prev.version === cached.version && prev.updatedAt === cached.updatedAt
        ? prev
        : cached
    ))
  }, [explicitManifest, appId])

  // 把 chip 标题改成应用名：宿主记录表首次铸造时不通知订阅者，不主动改名的话
  // 标签页会一直停在描述符兜底名「AI 应用」（宿主文档化的自改名路径就是 updateTab）。
  const manifestName = manifest?.metadata?.name
  useEffect(() => {
    if (!tabId || !manifestName) return
    const service = getBetterSidebar(props?.ctx)
    if (!service || typeof service.updateTab !== 'function') return
    service.updateTab(tabId, { title: manifestName, meta: { appId } })
  }, [tabId, appId, manifestName, props?.ctx])

  // 登记「哪个标签页正开着哪个应用」：宿主给的标签页 id 只有这里读得到，
  // 删除应用时按它关闭。卸载时**不**注销——删除操作发生时应用标签页通常正在
  // 后台（库页在前台），注销会让关闭动作丢掉目标。
  useEffect(() => {
    if (!tabId) return
    registerOpenAppTab(tabId, appId)
  }, [tabId, appId])

  // Form schema and default values
  const properties = useMemo(() => manifest?.formSchema?.properties || EMPTY_PROPS, [manifest?.formSchema?.properties])
  const requiredList = useMemo(() => manifest?.formSchema?.required || EMPTY_REQUIRED, [manifest?.formSchema?.required])

  const initialFormValues = useMemo(() => {
    const vals = {}
    for (const [key, prop] of Object.entries(properties)) {
      if (manifest?.demoSnapshot?.[key] !== undefined) {
        vals[key] = manifest.demoSnapshot[key]
      } else if (prop.default !== undefined) {
        vals[key] = prop.default
      } else if (manifest?.fieldMappings?.[key]?.defaultValue !== undefined) {
        vals[key] = manifest.fieldMappings[key].defaultValue
      } else if (prop.type === 'boolean') {
        vals[key] = false
      } else if (prop.type === 'number' || prop.type === 'integer') {
        vals[key] = prop.minimum ?? 0
      } else {
        vals[key] = ''
      }
    }
    return vals
  }, [properties, manifest?.demoSnapshot, manifest?.fieldMappings])

  const [formValues, setFormValues] = useState(initialFormValues)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeRightTab, setActiveRightTab] = useState('tasks')
  const [tasks, setTasks] = useState(() => readCachedTasks(manifest?.appId))
  const loadedAppIdRef = useRef(null)

  // Update tasks and formValues when manifest changes
  useEffect(() => {
    if (manifest?.appId && loadedAppIdRef.current !== manifest.appId) {
      loadedAppIdRef.current = manifest.appId
      setTasks(readCachedTasks(manifest.appId))
      setFormValues(initialFormValues)
      setErrors({})
    }
  }, [manifest?.appId, initialFormValues])

  const handleFieldChange = useCallback((key, val) => {
    setFormValues((prev) => ({ ...prev, [key]: val }))
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  // Execute generation
  const handleGenerate = useCallback(async (e) => {
    if (e) e.preventDefault()
    if (isSubmitting || !manifest) return

    // Validate required fields
    const newErrors = {}
    for (const reqKey of requiredList) {
      const val = formValues[reqKey]
      if (val === undefined || val === null || val === '') {
        newErrors[reqKey] = '此项为必填项'
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setIsSubmitting(true)
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const now = new Date().toISOString()
    const newTask = {
      taskId,
      appId: manifest.appId,
      status: 'running',
      createdAt: now,
      updatedAt: now,
      inputs: { ...formValues },
    }

    const updatedTasks = [newTask, ...tasks]
    setTasks(updatedTasks)
    writeCachedTasks(manifest.appId, updatedTasks)
    setActiveRightTab('tasks')

    const markTaskTerminal = (tId, status, extra = {}) => {
      setTasks((prev) => {
        const next = prev.map((t) => {
          if (t.taskId !== tId) return t
          return {
            ...t,
            status,
            updatedAt: new Date().toISOString(),
            ...extra,
          }
        })
        writeCachedTasks(manifest.appId, next)
        return next
      })
    }

    try {
      let executionId = ''
      let artifacts = []
      let mediaUrl = ''

      const win = typeof window !== 'undefined' ? window : null
      if (win && typeof win.__OMNIMUX_APPS_EXECUTE__ === 'function') {
        const res = await win.__OMNIMUX_APPS_EXECUTE__(manifest, formValues)
        executionId = res.executionId || res.jobId || ''
        if (res.artifacts) artifacts = res.artifacts
        if (res.mediaUrl) mediaUrl = res.mediaUrl
      } else {
        // HTTP endpoint
        const response = await fetch(`/omnimux-apps/api/apps/${encodeURIComponent(manifest.appId)}/executions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: manifest.version,
            inputs: formValues,
            manifest,
          }),
        }).catch(() => null)

        if (!response || !response.ok) {
          const errData = await response?.json?.().catch(() => ({}))
          throw new Error(errData?.message || `生成任务启动失败 (HTTP ${response?.status || '503'})`)
        }

        const data = await response.json().catch(() => ({}))
        executionId = data.executionId || data.jobId || ''
        if (data.artifacts) artifacts = data.artifacts
        if (data.mediaUrl) mediaUrl = data.mediaUrl
      }

      if (executionId) {
        setTasks((prev) => {
          const next = prev.map((t) => (t.taskId === taskId ? { ...t, executionId } : t))
          writeCachedTasks(manifest.appId, next)
          return next
        })
      }

      const instantMediaUrl = mediaUrl || (Array.isArray(artifacts) && artifacts[0]?.url)
      if (instantMediaUrl) {
        markTaskTerminal(taskId, 'completed', {
          outputs: { mediaUrl: instantMediaUrl, artifacts },
        })
        return
      }

      if (executionId) {
        const pollInterval = 1000
        const maxAttempts = 120
        let attempts = 0

        const pollStatus = async () => {
          attempts++
          try {
            let statusResult = null
            if (win && typeof win.__OMNIMUX_APPS_POLL__ === 'function') {
              statusResult = await win.__OMNIMUX_APPS_POLL__(executionId)
            } else {
              const res = await fetch(
                `/omnimux-apps/api/apps/${encodeURIComponent(manifest.appId)}/executions/${encodeURIComponent(executionId)}`,
              ).catch(() => null)
              if (res && res.ok) {
                statusResult = await res.json().catch(() => null)
              }
            }

            if (!statusResult) {
              if (attempts < maxAttempts) {
                setTimeout(pollStatus, pollInterval)
              } else {
                markTaskTerminal(taskId, 'failed', { error: '轮询对账超时' })
              }
              return
            }

            const currentStatus = String(statusResult.status || '').toUpperCase()
            if (currentStatus === 'COMPLETED') {
              const finalMediaUrl =
                statusResult.mediaUrl ||
                statusResult.artifacts?.[0]?.url ||
                statusResult.outputs?.mediaUrl ||
                ''
              markTaskTerminal(taskId, 'completed', {
                outputs: {
                  mediaUrl: finalMediaUrl,
                  artifacts: statusResult.artifacts || [],
                },
              })
            } else if (currentStatus === 'FAILED' || currentStatus === 'CANCELED') {
              markTaskTerminal(taskId, 'failed', {
                error: statusResult.error || '任务执行中断或失败',
              })
            } else {
              if (attempts < maxAttempts) {
                setTimeout(pollStatus, pollInterval)
              } else {
                markTaskTerminal(taskId, 'failed', { error: '任务执行超时，请稍后刷新查看' })
              }
            }
          } catch (pollErr) {
            if (attempts < maxAttempts) {
              setTimeout(pollStatus, pollInterval)
            } else {
              markTaskTerminal(taskId, 'failed', { error: '网络轮询异常中断' })
            }
          }
        }

        setTimeout(pollStatus, 500)
      } else {
        markTaskTerminal(taskId, 'failed', { error: '未返回有效的任务执行标识' })
      }
    } catch (err) {
      markTaskTerminal(taskId, 'failed', {
        error: err?.message || '生成失败，请重试',
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [isSubmitting, manifest, requiredList, formValues, tasks])

  // Apply demo snapshot
  const handleApplyDemo = useCallback((snapshot) => {
    if (!snapshot) return
    setFormValues((prev) => ({ ...prev, ...snapshot }))
    setErrors({})
  }, [])

  const [isEditing, setIsEditing] = useState(false)
  const [editNotice, setEditNotice] = useState(null)

  // 点击「编辑应用」：根据应用归属自适应分诊
  // 同一个用户的应用直接打开所属项目画布定位工作流组；不同用户/官方应用则创建副本工程并跳转
  const handleEditApp = useCallback(async () => {
    if (!manifest || isEditing) return
    setIsEditing(true)
    setEditNotice({ type: 'info', text: '正在检查应用源工程...' })

    try {
      const projectsRes = await listProjects().catch(() => ({ ok: false }))
      const projects = (projectsRes.ok && Array.isArray(projectsRes.body?.projects))
        ? projectsRes.body.projects
        : []

      const isOwner = isAppOwnedByUser(manifest, projects)

      if (isOwner) {
        // 1. 同一个用户的应用：直接跳转定位到原工程画布
        const target = resolveAppEditTarget(toPublishedAppEntry(manifest) || {
          projectId: manifest.workflowBinding?.projectId,
          workspaceId: manifest.workflowBinding?.workspaceId,
          groupId: manifest.workflowBinding?.sourceGroupId,
        })
        const project = resolveOwningProject(projects, target)
        const canvasWorkspaceId = target.workspaceId || project?.canvasWorkspaceIds?.[0]

        if (canvasWorkspaceId && typeof localStorage !== 'undefined') {
          localStorage.setItem('omnimux:latest-active-canvas', canvasWorkspaceId)
        }
        if (canvasWorkspaceId && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('omnimux:active-canvas-changed', {
            detail: { workspaceId: canvasWorkspaceId },
          }))
        }

        const opened = await activateProjectCanvas(
          { betterSidebar: getBetterSidebar(props?.ctx) },
          { sessionId: project?.sessionId, focusGroupId: target.groupId },
        )
        if (opened) {
          setEditNotice({ type: 'success', text: '已进入应用源画布，可直接编辑与调试。' })
        } else {
          setEditNotice({ type: 'error', text: '打开画布失败，请重试。' })
        }
      } else {
        // 2. 不同用户的应用：创建副本工程，并将工作流节点包装为工作流组
        setEditNotice({ type: 'info', text: '正在为此应用生成独立工程副本...' })
        const { project, workspaceId, groupId } = await createProjectForkFromManifest(manifest)

        if (workspaceId && typeof localStorage !== 'undefined') {
          localStorage.setItem('omnimux:latest-active-canvas', workspaceId)
        }
        if (workspaceId && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('omnimux:active-canvas-changed', {
            detail: { workspaceId },
          }))
        }

        const opened = await activateProjectCanvas(
          { betterSidebar: getBetterSidebar(props?.ctx) },
          { sessionId: project?.sessionId, focusGroupId: groupId },
        )
        if (opened) {
          setEditNotice({
            type: 'success',
            text: `已为你创建「${manifest.metadata?.name || '应用'}」的副本工程，编辑后可随时重新打包发布。`,
          })
        } else {
          setEditNotice({ type: 'error', text: '副本已创建，打开画布失败，请在项目库查看。' })
        }
      }
    } catch (err) {
      setEditNotice({ type: 'error', text: err?.message || '操作失败，请重试。' })
    } finally {
      setIsEditing(false)
      setTimeout(() => setEditNotice(null), 3500)
    }
  }, [manifest, isEditing, props?.ctx])

  if (!manifest) {
    return (
      <div className="omx-apptab-empty">
        <div className="omx-apptab-empty-icon">
          <IconRocket size={36} />
        </div>
        <div className="omx-apptab-empty-title">
          {(props?.t?.('projects.appEmptyLoaded') && props.t('projects.appEmptyLoaded') !== 'projects.appEmptyLoaded') ? props.t('projects.appEmptyLoaded') : '暂无已加载的 AI 应用'}
        </div>
        <div>{(props?.t?.('projects.appEmptyLoadedHint') && props.t('projects.appEmptyLoadedHint') !== 'projects.appEmptyLoadedHint') ? props.t('projects.appEmptyLoadedHint') : '请先在创作画布中点击「发布为 AI 应用」，或通过应用中心打开。'}</div>
      </div>
    )
  }

  const categoryLabel = {
    video: (props?.t?.('projects.appCategoryVideo') && props.t('projects.appCategoryVideo') !== 'projects.appCategoryVideo') ? props.t('projects.appCategoryVideo') : '视频应用',
    image: (props?.t?.('projects.appCategoryImage') && props.t('projects.appCategoryImage') !== 'projects.appCategoryImage') ? props.t('projects.appCategoryImage') : '图片应用',
    audio: (props?.t?.('projects.appCategoryAudio') && props.t('projects.appCategoryAudio') !== 'projects.appCategoryAudio') ? props.t('projects.appCategoryAudio') : '音频应用',
  }[manifest.metadata?.category] || ((props?.t?.('projects.appCategoryUnknown') && props.t('projects.appCategoryUnknown') !== 'projects.appCategoryUnknown') ? props.t('projects.appCategoryUnknown') : 'AI 应用')

  return (
    <div className="omx-apptab-root">
      {/* 顶部应用信息 Header */}
      <div className="omx-apptab-header">
        <div className="omx-apptab-header-left">
          <div className="omx-apptab-title">
            {manifest.metadata?.name || ((props?.t?.('projects.appCategoryUnknown') && props.t('projects.appCategoryUnknown') !== 'projects.appCategoryUnknown') ? props.t('projects.appCategoryUnknown') : 'AI 应用')}
          </div>
          <span className="omx-apptab-badge">
            {categoryLabel}
          </span>
          <span className="omx-apptab-version">
            v{manifest.version || '1.0.0'}
          </span>
          {manifest.metadata?.description && (
            <div className="omx-apptab-desc" title={manifest.metadata.description}>
              {manifest.metadata.description}
            </div>
          )}
        </div>
        <div className="omx-apptab-header-right">
          {editNotice && (
            <span className={`omx-apptab-notice omx-apptab-notice--${editNotice.type}`}>
              {editNotice.text}
            </span>
          )}
          <button // exempt-ui01 ai-app-ui-spec 右上角编辑应用按钮
            type="button"
            className="omx-apptab-edit-btn"
            onClick={handleEditApp}
            disabled={isEditing}
            title="编辑应用画布与工作流"
          >
            <svg
              className="omx-apptab-edit-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            <span>{isEditing ? '处理中...' : '编辑应用'}</span>
          </button>
        </div>
      </div>

      {/* 工作台核心双栏分区卡片 */}
      <div className="omx-apptab-body">
        {/* 左侧动态表单面板：规范外宽 448px，左右内边距各 24px，内可用宽 398px */}
        <div className="omx-apptab-form-panel">
          <form className="omx-apptab-form" onSubmit={handleGenerate}>
            <div className="omx-apptab-form-fields">
              {Object.entries(properties).map(([key, prop]) => {
                const isRequired = requiredList.includes(key)
                const error = errors[key]
                const val = formValues[key] ?? ''
                const title = prop.title || manifest.fieldMappings?.[key]?.fieldTitle || key
                const desc = prop.description || manifest.fieldMappings?.[key]?.fieldDescription

                return (
                  <div key={key} className="omx-apptab-field-group">
                    <div className="omx-apptab-label-row">
                      <label className="omx-apptab-label">
                        {title}
                        {isRequired && (
                          <span className="omx-apptab-required">*</span>
                        )}
                      </label>
                      {desc && (
                        <span className="omx-apptab-hint">
                          {desc}
                        </span>
                      )}
                    </div>

                    {/* 控件渲染根据属性定义 */}
                    {Array.isArray(prop.enum) && prop.enum.length > 0 ? (
                      <select // exempt-ui01 ai-app-ui-spec 动态应用表单下拉选择器
                        className={`omx-apptab-select ${error ? 'is-error' : ''}`}
                        value={val}
                        onChange={(e) => handleFieldChange(key, e.target.value)}
                      >
                        {prop.enum.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : prop.type === 'boolean' ? (
                      <label className="omx-apptab-checkbox-label">
                        <input
                          type="checkbox"
                          className="omx-apptab-checkbox"
                          checked={Boolean(val)}
                          onChange={(e) => handleFieldChange(key, e.target.checked)}
                        />
                        <span>启用 {title}</span>
                      </label>
                    ) : prop.type === 'number' || prop.type === 'integer' ? (
                      <input
                        type="number"
                        className={`omx-apptab-input ${error ? 'is-error' : ''}`}
                        value={val}
                        min={prop.minimum}
                        max={prop.maximum}
                        step={prop.type === 'integer' ? 1 : 'any'}
                        onChange={(e) => handleFieldChange(key, e.target.value === '' ? '' : Number(e.target.value))}
                      />
                    ) : (key.toLowerCase().includes('prompt') || prop.title?.includes('提示') || prop.maxLength > 100) ? (
                      <textarea
                        className={`omx-apptab-textarea ${error ? 'is-error' : ''}`}
                        value={val}
                        rows={3}
                        placeholder={prop.description || `请输入${title}...`}
                        onChange={(e) => handleFieldChange(key, e.target.value)}
                      />
                    ) : (
                      <input
                        type="text"
                        className={`omx-apptab-input ${error ? 'is-error' : ''}`}
                        value={val}
                        placeholder={prop.description || `请输入${title}...`}
                        onChange={(e) => handleFieldChange(key, e.target.value)}
                      />
                    )}

                    {error && (
                      <div className="omx-apptab-error-text">
                        <IconAlert size={14} />
                        <span>{error}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 44px 主按钮：“立即生成” */}
            <div className="omx-apptab-cta-wrap">
              <button // exempt-ui01 ai-app-ui-spec 44px 独立应用主 CTA 按钮
                type="submit"
                disabled={isSubmitting}
                className="omx-apptab-cta-btn"
              >
                {isSubmitting ? (
                  <>
                    <IconSpinner size={16} />
                    <span>正在发起生成...</span>
                  </>
                ) : (
                  <>
                    <IconSparkle size={16} />
                    <span>立即生成</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* 右侧工作台：任务输出与示例展示 */}
        <div className="omx-apptab-output-panel">
          {/* 右侧 Compact Tabs */}
          <div className="omx-apptab-right-tabs">
            <button // exempt-ui01 ai-app-ui-spec 28px compact tabs
              type="button"
              className={`omx-apptab-tab-pill ${activeRightTab === 'tasks' ? 'is-active' : ''}`}
              onClick={() => setActiveRightTab('tasks')}
            >
              任务记录 ({tasks.length})
            </button>
            <button // exempt-ui01 ai-app-ui-spec 28px compact tabs
              type="button"
              className={`omx-apptab-tab-pill ${activeRightTab === 'showcase' ? 'is-active' : ''}`}
              onClick={() => setActiveRightTab('showcase')}
            >
              示例演示 ({manifest.showcase?.items?.length || 0})
            </button>
          </div>

          {/* 右侧主体内容 */}
          <div className="omx-apptab-output-content">
            {activeRightTab === 'tasks' ? (
              tasks.length === 0 ? (
                <div className="omx-apptab-tasks-empty">
                  <div className="omx-apptab-tasks-empty-icon">
                    <IconPalette size={32} />
                  </div>
                  <div className="omx-apptab-tasks-empty-title">
                    暂无生成记录
                  </div>
                  <div className="omx-apptab-tasks-empty-desc">
                    在左侧填写配置参数后，点击「立即生成」即可发起真实 AI 生成任务，并在此查看最终产物。
                  </div>
                </div>
              ) : (
                <div className="omx-apptab-tasks-list">
                  {tasks.map((task) => (
                    <div
                      key={task.taskId}
                      className="omx-apptab-task-card"
                    >
                      <div className="omx-apptab-task-header">
                        <div className="omx-apptab-task-meta">
                          <span className={`omx-apptab-status-badge ${task.status === 'completed' ? 'is-completed' : task.status === 'failed' ? 'is-failed' : ''}`}>
                            {task.status === 'completed' ? (
                              <>
                                <IconCheck size={12} />
                                <span>生成成功</span>
                              </>
                            ) : task.status === 'failed' ? (
                              <>
                                <IconClose size={12} />
                                <span>生成失败</span>
                              </>
                            ) : (
                              <>
                                <IconSpinner size={12} />
                                <span>正在生成...</span>
                              </>
                            )}
                          </span>
                          <span className="omx-apptab-task-time">
                            {new Date(task.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <span className="omx-apptab-task-id">
                          {task.taskId}
                        </span>
                      </div>

                      {/* 产物展示 */}
                      {task.status === 'completed' && task.outputs?.mediaUrl && (
                        <div className="omx-apptab-media-box">
                          {manifest.metadata?.category === 'video' || task.outputs.mediaUrl.endsWith('.mp4') ? (
                            <video
                              controls
                              src={task.outputs.mediaUrl}
                              className="omx-apptab-media-video"
                            />
                          ) : manifest.metadata?.category === 'audio' || task.outputs.mediaUrl.endsWith('.mp3') ? (
                            <div className="omx-apptab-media-audio">
                              <audio controls src={task.outputs.mediaUrl} />
                            </div>
                          ) : (
                            <img
                              src={task.outputs.mediaUrl}
                              alt="Generated"
                              className="omx-apptab-media-img"
                            />
                          )}
                        </div>
                      )}

                      {task.status === 'failed' && (
                        <div className="omx-apptab-error-box">
                          {task.error || '执行异常中断'}
                        </div>
                      )}

                      {/* 输入参数摘要 */}
                      <div className="omx-apptab-inputs-summary">
                        {Object.entries(task.inputs || {}).map(([k, v]) => (
                          <span key={k}>
                            <strong>{properties[k]?.title || k}:</strong> {String(v)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              /* 示例演示 Tab */
              <div className="omx-apptab-showcase-list">
                {(!manifest.showcase?.items || manifest.showcase.items.length === 0) ? (
                  <div className="omx-apptab-showcase-empty">
                    发布者暂未配置示例演示
                  </div>
                ) : (
                  manifest.showcase.items.map((item) => (
                    <div
                      key={item.id}
                      className="omx-apptab-showcase-card"
                    >
                      <div className="omx-apptab-showcase-header">
                        <div className="omx-apptab-showcase-title">{item.title}</div>
                        {manifest.demoSnapshot && (
                          <button // exempt-ui01 ai-app-ui-spec 示例参数填充按钮
                            type="button"
                            className="omx-apptab-showcase-btn"
                            onClick={() => handleApplyDemo(manifest.demoSnapshot)}
                          >
                            填入此示例参数
                          </button>
                        )}
                      </div>

                      {item.mediaUrl && (
                        <div className="omx-apptab-showcase-media">
                          {item.mediaType === 'video' ? (
                            <video
                              controls
                              poster={item.posterUrl}
                              src={item.mediaUrl}
                              className="omx-apptab-media-video"
                            />
                          ) : item.mediaType === 'audio' ? (
                            <div className="omx-apptab-media-audio">
                              <audio controls src={item.mediaUrl} />
                            </div>
                          ) : (
                            <img
                              src={item.mediaUrl}
                              alt={item.title}
                              className="omx-apptab-media-img"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
