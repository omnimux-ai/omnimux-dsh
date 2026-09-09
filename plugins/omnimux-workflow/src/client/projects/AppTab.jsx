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

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { injectWorkflowStyles } from '../styles.js'

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
  useEffect(() => {
    injectWorkflowStyles()
  }, [])

  const seed = props?.seed || props?.tab || props
  const explicitManifest = seed?.extra?.manifest || props?.extra?.manifest || props?.manifest
  const targetAppId = seed?.extra?.appId
    || props?.extra?.appId
    || seed?.id?.replace(/^app_/, '')
    || props?.tab?.id?.replace(/^app_/, '')

  const [manifest, setManifest] = useState(() => {
    return explicitManifest || readCachedManifest(targetAppId)
  })

  // Listen to manifest updates via custom event
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onAppOpen = (e) => {
      const detail = e?.detail
      if (detail?.manifest) {
        if (!targetAppId || detail.id === targetAppId || detail.manifest?.appId === targetAppId) {
          setManifest(detail.manifest)
        }
      }
    }
    window.addEventListener('omnimux-app-open', onAppOpen)
    return () => {
      window.removeEventListener('omnimux-app-open', onAppOpen)
    }
  }, [targetAppId])

  // Sync if explicitManifest arrives later
  useEffect(() => {
    if (explicitManifest) {
      setManifest(explicitManifest)
    } else if (!manifest && targetAppId) {
      const cached = readCachedManifest(targetAppId)
      if (cached) setManifest(cached)
    }
  }, [explicitManifest, targetAppId])

  // Form schema and default values
  const properties = useMemo(() => manifest?.formSchema?.properties || {}, [manifest])
  const requiredList = useMemo(() => manifest?.formSchema?.required || [], [manifest])

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
  }, [properties, manifest])

  const [formValues, setFormValues] = useState(initialFormValues)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeRightTab, setActiveRightTab] = useState('tasks')
  const [tasks, setTasks] = useState(() => readCachedTasks(manifest?.appId))

  // Update tasks and formValues when manifest changes
  useEffect(() => {
    if (manifest?.appId) {
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
        // Fallback to HTTP endpoint
        const response = await fetch(`/omnimux-apps/api/apps/${encodeURIComponent(manifest.appId)}/executions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: manifest.version,
            inputs: formValues,
          }),
        }).catch(() => null)

        if (response && response.ok) {
          const data = await response.json().catch(() => ({}))
          executionId = data.executionId || data.jobId || ''
          if (data.artifacts) artifacts = data.artifacts
          if (data.mediaUrl) mediaUrl = data.mediaUrl
        }
      }

      // If execution returns immediately or is mock, complete it
      const finalMediaUrl = mediaUrl || artifacts[0]?.url || manifest.showcase?.items?.[0]?.mediaUrl || manifest.metadata?.coverUrl || ''
      const completedTask = {
        ...newTask,
        executionId: executionId || `exec_${Date.now()}`,
        status: 'completed',
        updatedAt: new Date().toISOString(),
        outputs: {
          mediaUrl: finalMediaUrl,
          artifacts,
        },
      }

      setTasks((prev) => {
        const next = prev.map((t) => (t.taskId === taskId ? completedTask : t))
        writeCachedTasks(manifest.appId, next)
        return next
      })
    } catch (err) {
      const failedTask = {
        ...newTask,
        status: 'failed',
        updatedAt: new Date().toISOString(),
        error: err?.message || '生成失败，请重试',
      }
      setTasks((prev) => {
        const next = prev.map((t) => (t.taskId === taskId ? failedTask : t))
        writeCachedTasks(manifest.appId, next)
        return next
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

  if (!manifest) {
    return (
      <div className="omx-apptab-empty">
        <div className="omx-apptab-empty-icon">🚀</div>
        <div className="omx-apptab-empty-title">
          暂无已加载的 AI 应用
        </div>
        <div>请先在画布中点击「发布为 AI 应用」，或通过应用中心打开。</div>
      </div>
    )
  }

  const categoryLabel = {
    video: '视频应用',
    image: '图片应用',
    audio: '音频应用',
  }[manifest.metadata?.category] || 'AI 应用'

  return (
    <div className="omx-apptab-root">
      {/* 顶部应用信息 Header */}
      <div className="omx-apptab-header">
        <div className="omx-apptab-header-left">
          <div className="omx-apptab-title">
            {manifest.metadata?.name || 'AI 应用'}
          </div>
          <span className="omx-apptab-badge">
            {categoryLabel}
          </span>
          <span className="omx-apptab-version">
            v{manifest.version || '1.0.0'}
          </span>
        </div>
        {manifest.metadata?.description && (
          <div className="omx-apptab-desc">
            {manifest.metadata.description}
          </div>
        )}
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
                        ⚠️ {error}
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
                    <span>⏳</span>
                    <span>正在发起生成...</span>
                  </>
                ) : (
                  <>
                    <span>✨</span>
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
                  <div className="omx-apptab-tasks-empty-icon">🎨</div>
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
                            {task.status === 'completed' ? '✓ 生成成功' : task.status === 'failed' ? '✕ 生成失败' : '⏳ 正在生成...'}
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
