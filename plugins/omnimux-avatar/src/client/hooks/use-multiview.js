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
  const avatarRef = useRef(avatarId)
  const epochRef=useRef(0)
  const parentIntentRef=useRef(new Map())
  if(avatarRef.current!==avatarId){avatarRef.current=avatarId;epochRef.current++}

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

  useEffect(()=>{clearAll();setChildByParent({});setSubmittingParent(null)},[avatarId,clearAll])
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
      const epoch=epochRef.current
      const intent=parentIntentRef.current.get(parentId)
      let inflight=false
      const timer = setInterval(() => {
        if(inflight||avatarRef.current!==avatarId||epoch!==epochRef.current||document.visibilityState==='hidden'||navigator.onLine===false)return
        inflight=true
        void (async () => {
          try {
            const next = await fetchTask(avatarId, taskId, { refresh: true })
            if (!mountedRef.current || avatarRef.current!==avatarId||epoch!==epochRef.current||parentIntentRef.current.get(parentId)!==intent) return
            if (next) track(parentId, next)
            if (next && isTerminalStatus(next.status)) clearTimer(parentId)
          } catch (error) {
            if(!mountedRef.current||avatarRef.current!==avatarId||epoch!==epochRef.current||parentIntentRef.current.get(parentId)!==intent)return
            setChildByParent(prev => ({ ...prev, [parentId]: prev[parentId] ? { ...prev[parentId], error: error.message } : prev[parentId] }))
          } finally {inflight=false}
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
      const epoch=epochRef.current
      const parentId = body.parentTaskId
      const intent=Symbol(parentId)
      parentIntentRef.current.set(parentId,intent)
      clearTimer(parentId)
      setSubmittingParent(parentId)
      try {
        const payload = await submitMultiView(body)
        if(!mountedRef.current||epoch!==epochRef.current||parentIntentRef.current.get(parentId)!==intent)return null
        const taskId = payload.taskRef || String(payload.task?.task_id ?? payload.task?.id ?? '')
        const record =
          (taskId ? await fetchTask(avatarId, taskId) : null) ??
          payload.task ??
          pendingMultiViewRecord(taskId)
        if (!mountedRef.current || avatarRef.current!==avatarId||epoch!==epochRef.current||parentIntentRef.current.get(parentId)!==intent) return null
        track(parentId, record)
        if (!isTerminalStatus(record.status) && taskId) startPolling(parentId, taskId)
        return record
      } catch(error) {
        if(!mountedRef.current||epoch!==epochRef.current||parentIntentRef.current.get(parentId)!==intent)return null
        throw error
      } finally {
        if (mountedRef.current&&avatarRef.current===avatarId&&epoch===epochRef.current&&parentIntentRef.current.get(parentId)===intent) setSubmittingParent(prev=>prev===parentId?null:prev)
      }
    },
    [avatarId, startPolling, track]
  )

  /** 本地摘掉已挂载的设定板；任务行本身不动。 */
  const forget = useCallback(
    (parentId) => {
      parentIntentRef.current.delete(parentId)
      setSubmittingParent(prev=>prev===parentId?null:prev)
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
