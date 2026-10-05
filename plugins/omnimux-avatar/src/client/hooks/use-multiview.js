// 多视角（转面）设定板的提交与追踪。
//
// 来源：OmniMux/web/src/features/influencer/hooks/use-multiview.ts（只读真源）。
// 偏离（依赖替换）：真源用网关的 /pg/influencer/multiview 与 /api/task/self；
// 插件端改走 /api/omnimux/avatar/multiview 与 /api/omnimux/avatar/task，
// 需要调用方注入 avatarId。行为不变：普通 React state + 定时器，无 react-query。
//
// 本文件允许依赖 React（lib/* 不允许）。

import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchTask, submitMultiView } from '../api.js'
import { pendingMultiViewRecord } from '../lib/multiview.js'
import { isTerminalStatus } from '../lib/history.js'
import { POLL_MS } from '../lib/types.js'

/**
 * 提交并追踪多视角设定板，且不触碰画廊自身的提交状态：设定板是挂在父卡片上的，
 * 因此绝不能作为待处理卡片出现在列表里。轮询以父任务 id 为键，查看器关闭时仍在跑，
 * 这正是重新打开页面能显示已完成设定板的原因。
 *
 * @param {{ avatarId?: string }} [options]
 */
export function useMultiViewSubmit({ avatarId } = {}) {
  const [childByParent, setChildByParent] = useState({})
  const [submittingParent, setSubmittingParent] = useState(null)
  const timersRef = useRef(new Map())
  const mountedRef = useRef(true)

  const clearTimer = useCallback((parentId) => {
    const timer = timersRef.current.get(parentId)
    if (timer !== undefined) {
      clearInterval(timer)
      timersRef.current.delete(parentId)
    }
  }, [])

  const clearAll = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearInterval(timer)
    }
    timersRef.current.clear()
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearAll()
    }
  }, [clearAll])

  const track = useCallback((parentId, record) => {
    setChildByParent((prev) => ({ ...prev, [parentId]: record }))
  }, [])

  const startPolling = useCallback(
    (parentId, taskId) => {
      clearTimer(parentId)
      const timer = setInterval(() => {
        void (async () => {
          try {
            const next = await fetchTask(avatarId, taskId)
            if (!mountedRef.current) return
            if (next) track(parentId, next)
            if (next && isTerminalStatus(next.status)) clearTimer(parentId)
          } catch {
            clearTimer(parentId)
          }
        })()
      }, POLL_MS)
      timersRef.current.set(parentId, timer)
    },
    [avatarId, clearTimer, track]
  )

  /**
   * @param {{ parentTaskId: string }} body 派生载荷（含 avatarId / model / group 等）
   * @returns {Promise<import('../lib/types.js').TaskRecord|null>}
   */
  const submit = useCallback(
    async (body) => {
      const parentId = body.parentTaskId
      setSubmittingParent(parentId)
      try {
        const payload = await submitMultiView(body)
        const taskId = payload.taskRef || String(payload.task?.task_id ?? payload.task?.id ?? '')
        const record =
          (taskId ? await fetchTask(avatarId, taskId) : null) ??
          payload.task ??
          pendingMultiViewRecord(taskId)
        if (!mountedRef.current) return record
        track(parentId, record)
        if (!isTerminalStatus(record.status) && taskId) startPolling(parentId, taskId)
        return record
      } finally {
        if (mountedRef.current) setSubmittingParent(null)
      }
    },
    [avatarId, startPolling, track]
  )

  /** 本地摘掉已挂载的设定板；任务行本身不动。 */
  const forget = useCallback(
    (parentId) => {
      clearTimer(parentId)
      setChildByParent((prev) => {
        const next = { ...prev }
        delete next[parentId]
        return next
      })
    },
    [clearTimer]
  )

  return { childByParent, submittingParent, submit, forget }
}
