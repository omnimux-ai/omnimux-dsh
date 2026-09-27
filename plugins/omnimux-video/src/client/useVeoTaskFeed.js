import { useCallback, useEffect, useRef, useState } from 'react'
import { createVeoTask, fetchVeoTask } from './veo-api.js'

const DEMO_TASKS = [
  {
    id: 'task_demo_skincare',
    title: '韩国极简防晒美学成片',
    videoUrl: './media/google_vids_korean_skincare.mp4',
    status: 'completed',
    durationSec: 10,
    resolution: '720p',
    isUpscaled: false,
  },
]

/**
 * Host Veo task feed: optimistic submit + 1.5s poll + generation-timer cleanup.
 * Upscale fake progress stays in the stage (see #2746) and shares the same
 * timer map only for clear-on-remove / unmount until that issue lands.
 *
 * @param {{
 *   isEditorReady: boolean,
 *   promptText: string,
 *   setPromptText: (next: string) => void,
 *   currentMode: string,
 * }} args
 */
export function useVeoTaskFeed({
  isEditorReady,
  promptText,
  setPromptText,
  currentMode,
}) {
  const pollTimersRef = useRef(new Map())
  const [tasks, setTasks] = useState(DEMO_TASKS)

  useEffect(() => () => {
    pollTimersRef.current.forEach((timer) => clearInterval(timer))
    pollTimersRef.current.clear()
  }, [])

  const clearPollTimer = useCallback((taskId) => {
    const timer = pollTimersRef.current.get(taskId)
    if (timer) {
      clearInterval(timer)
      pollTimersRef.current.delete(taskId)
    }
  }, [])

  const submitTask = useCallback(async () => {
    if (!isEditorReady || !promptText.trim()) return

    const prompt = promptText.trim()
    const optimisticId = `task_pending_${Date.now()}`
    setTasks((prev) => [
      {
        id: optimisticId,
        title: prompt.slice(0, 16),
        status: 'generating',
        progress: 2,
        durationSec: 10,
        resolution: '720p',
        message: '正在提交生成任务…',
      },
      ...prev,
    ])

    try {
      const created = await createVeoTask({
        prompt,
        mode: currentMode,
        durationSec: 10,
      })
      if (!created.ok || !created.body?.task?.id) {
        const message = created.body?.message || `提交失败（HTTP ${created.status}）`
        setTasks((prev) =>
          prev.map((t) =>
            t.id === optimisticId
              ? { ...t, status: 'failed', progress: 0, message, error: message }
              : t
          )
        )
        // Keep prompt for retry (PRD exception defense).
        return
      }

      const remote = created.body.task
      setPromptText('')
      setTasks((prev) =>
        prev.map((t) =>
          t.id === optimisticId
            ? {
                ...t,
                id: remote.id,
                status: remote.status === 'completed' ? 'completed' : 'generating',
                progress: remote.progress ?? 3,
                title: remote.title || t.title,
                message: remote.message,
                videoUrl: remote.videoUrl,
                durationSec: remote.durationSec || 10,
                resolution: remote.resolution || '720p',
              }
            : t
        )
      )

      const taskId = remote.id
      clearPollTimer(taskId)
      const timer = setInterval(async () => {
        try {
          const polled = await fetchVeoTask(taskId)
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
                    title: task.title || t.title,
                  }
                : t
            )
          )
          if (task.status === 'completed' || task.status === 'failed') {
            clearPollTimer(taskId)
          }
        } catch {
          // keep polling; transient network blips
        }
      }, 1500)
      pollTimersRef.current.set(taskId, timer)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setTasks((prev) =>
        prev.map((t) =>
          t.id === optimisticId
            ? { ...t, status: 'failed', progress: 0, message, error: message }
            : t
        )
      )
    }
  }, [clearPollTimer, currentMode, isEditorReady, promptText, setPromptText])

  const removeTask = useCallback((taskId) => {
    clearPollTimer(taskId)
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
  }, [clearPollTimer])

  return {
    tasks,
    setTasks,
    submitTask,
    removeTask,
    /** Exposed so stage-local upscale can clear a poll timer if it still shares lifecycle (#2746 will split). */
    clearPollTimer,
    pollTimersRef,
  }
}
