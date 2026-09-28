import { useCallback, useEffect, useRef, useState } from 'react'
import { createVeoTask, fetchVeoTask } from './veo-api.js'
import { seedVeoTask } from '../shared/veoTaskSeed.js'
import { VEO_TASK_SPEC } from '../shared/veoTaskSpec.js'

const DEMO_TASKS = [
  {
    id: 'task_demo_skincare',
    title: '韩国极简防晒美学成片',
    videoUrl: './media/google_vids_korean_skincare.mp4',
    status: 'completed',
    durationSec: VEO_TASK_SPEC.durationSec.fallback,
    resolution: VEO_TASK_SPEC.resolution,
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

  const failOptimistic = useCallback((id, message) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: 'failed', progress: 0, message, error: message }
          : t
      )
    )
  }, [])

  const submitTask = useCallback(async () => {
    if (!isEditorReady || !promptText.trim()) return

    const prompt = promptText.trim()
    const optimisticId = `task_pending_${Date.now()}`
    const optimistic = seedVeoTask({
      id: optimisticId,
      prompt,
      mode: currentMode,
      durationSec: VEO_TASK_SPEC.durationSec.fallback,
      status: 'generating',
      progress: 2,
      phase: 'submitting',
      message: '正在提交生成任务…',
    })
    setTasks((prev) => [optimistic, ...prev])

    try {
      const created = await createVeoTask({
        prompt,
        mode: currentMode,
        durationSec: VEO_TASK_SPEC.durationSec.fallback,
      })
      if (!created.ok || !created.body?.task?.id) {
        const message = created.body?.message || `提交失败（HTTP ${created.status}）`
        failOptimistic(optimisticId, message)
        // Keep prompt for retry (PRD exception defense).
        return
      }

      const remote = created.body.task
      setPromptText('')
      setTasks((prev) =>
        prev.map((t) =>
          t.id === optimisticId
            ? {
                ...remote,
                isUpscaled: t.isUpscaled,
                isUpscaling: t.isUpscaling,
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
      failOptimistic(optimisticId, message)
    }
  }, [clearPollTimer, currentMode, failOptimistic, isEditorReady, promptText, setPromptText])

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
