import { useCallback, useEffect, useRef, useState } from 'react'
import { createVeoTask, fetchVeoTask } from './veo-api.js'
import { seedVeoTask } from '../shared/veoTaskSeed.js'
import { VEO_TASK_SPEC, buildVidsRequest } from '../shared/veoTaskSpec.js'

const DEMO_TASKS = [
  {
    id: 'task_demo_skincare',
    title: '韩国极简防晒美学成片',
    videoUrl: './media/google_vids_korean_skincare.mp4',
    status: 'completed',
    durationSec: VEO_TASK_SPEC.durationSec.fallback,
    resolution: VEO_TASK_SPEC.resolution,
  },
]

/**
 * Host Veo task feed: optimistic submit + 1.5s poll + poll-timer cleanup.
 *
 * 提交门禁在 Hook 内再走一遍 `buildVidsRequest`：校验失败**不创建乐观任务**，
 * 直接返回 false；运行期失败把乐观卡片置为失败态（卡片上展示可读原因），不吞错。
 *
 * @param {{
 *   isEditorReady: boolean,
 *   promptText: string,
 *   setPromptText: (next: string) => void,
 *   currentMode: string,
 *   modeInputs?: { imageUrl?: string, videoId?: string },
 *   params?: { seconds?: number, resolution?: string, aspectRatio?: string },
 * }} args
 */
export function useVeoTaskFeed({
  isEditorReady,
  promptText,
  setPromptText,
  currentMode,
  modeInputs,
  params,
}) {
  const pollTimersRef = useRef(new Map())
  const [tasks, setTasks] = useState(DEMO_TASKS)

  // 轮询定时器的清理路径必须在本文件可见（生命周期静态检查按文件判定）。
  useEffect(() => () => {
    pollTimersRef.current.forEach((timer) => clearInterval(timer))
    pollTimersRef.current.clear()
  }, [])

  const clearPollTimer = useCallback((taskId) => {
    const timer = pollTimersRef.current.get(taskId)
    if (timer) clearInterval(timer)
    pollTimersRef.current.delete(taskId)
  }, [])

  const failOptimistic = useCallback((id, message) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: 'failed', progress: 0, message, error: message }
          : t
      )
    )
  }, [])

  /**
   * 提交一份已规范化的请求（生成按钮与「重新创建」共用）。
   * @param {object} request
   * @returns {Promise<boolean>} true = 已入队；false = 未提交（校验失败或运行期失败）
   */
  const submitRequest = useCallback(async (request) => {
    const rebuilt = buildVidsRequest({
      mode: request?.mode,
      prompt: request?.prompt,
      seconds: request?.seconds,
      resolution: request?.resolution,
      aspectRatio: request?.aspect_ratio,
      imageUrl: request?.image_url,
      videoId: request?.video_id,
    })
    if (!rebuilt.ok) return false
    const normalized = rebuilt.request

    const optimisticId = `task_pending_${Date.now()}`
    const optimistic = {
      ...seedVeoTask({
        id: optimisticId,
        prompt: normalized.prompt,
        mode: normalized.mode,
        durationSec: normalized.seconds,
        status: 'generating',
        progress: 2,
        phase: 'submitting',
        message: '正在提交生成任务…',
      }),
      resolution: normalized.resolution,
      aspectRatio: normalized.aspect_ratio,
      request: normalized,
    }
    setTasks((prev) => [optimistic, ...prev])

    let created
    try {
      created = await createVeoTask(normalized)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failOptimistic(optimisticId, message)
      // 保留提示词以便重试（PRD 异常兜底）；失败原因已落到卡片上。
      return false
    }

    if (!created.ok || !created.body?.task?.id) {
      const message = created.body?.message || `提交失败（HTTP ${created.status}）`
      failOptimistic(optimisticId, message)
      return false
    }

    const remote = created.body.task
    setPromptText('')
    setTasks((prev) =>
      prev.map((t) =>
        t.id === optimisticId
          ? {
              ...remote,
              resolution: remote.resolution || normalized.resolution,
              aspectRatio: remote.aspect_ratio || normalized.aspectRatio,
              request: normalized,
              status: remote.status === 'completed'
                ? 'completed'
                : remote.status === 'failed'
                  ? 'failed'
                  : 'generating',
            }
          : t
      )
    )

    const taskId = remote.id
    clearPollTimer(taskId)
    const timer = setInterval(async () => {
      let polled
      try {
        polled = await fetchVeoTask(taskId)
      } catch (err) {
        // 单次轮询失败不中断轮询：留结构化日志便于排查瞬时网络抖动。
        console.warn('[omnimux-video] veo task poll failed:', err)
        return
      }
      const task = polled.body?.task
      if (!polled.ok || !task) {
        if (polled.status === 404) clearPollTimer(taskId)
        return
      }
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: task.status === 'failed'
                  ? 'failed'
                  : task.status === 'completed'
                    ? 'completed'
                    : 'generating',
                progress: task.progress ?? t.progress,
                message: task.message || t.message,
                error: task.error,
                videoUrl: task.videoUrl || t.videoUrl,
                durationSec: task.durationSec || t.durationSec,
                resolution: task.resolution || t.resolution,
                aspectRatio: task.aspect_ratio || t.aspectRatio,
                title: task.title || t.title,
              }
            : t
        )
      )
      if (task.status === 'completed' || task.status === 'failed') {
        clearPollTimer(taskId)
      }
    }, 1500)
    pollTimersRef.current.set(taskId, timer)
    return true
  }, [clearPollTimer, failOptimistic, setPromptText])

  /**
   * 生成按钮：从当前模式输入 + 参数构造请求；校验失败或剪辑器未就绪都不提交。
   * @returns {Promise<boolean>}
   */
  const submitTask = useCallback(async () => {
    if (!isEditorReady) return false
    const built = buildVidsRequest({
      mode: currentMode,
      prompt: promptText,
      seconds: params?.seconds,
      resolution: params?.resolution,
      aspectRatio: params?.aspectRatio,
      imageUrl: modeInputs?.imageUrl,
      videoId: modeInputs?.videoId,
    })
    if (!built.ok) return false
    return submitRequest(built.request)
  }, [currentMode, isEditorReady, modeInputs, params, promptText, submitRequest])

  const removeTask = useCallback((taskId) => {
    clearPollTimer(taskId)
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
  }, [clearPollTimer])

  return {
    tasks,
    submitTask,
    submitRequest,
    removeTask,
  }
}
