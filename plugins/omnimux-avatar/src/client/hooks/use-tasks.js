// 任务历史分页轮询与提交轮询。
//
// 来源：OmniMux/web/src/features/influencer/hooks/use-tasks.ts（只读真源）。
// 偏离（依赖替换）：真源用 @tanstack/react-query 的 useInfiniteQuery 与认证 store；
// 插件端没有 react-query，也没有主仓的 auth store，因此用普通 React state + 定时器
// 实现同样的「分页 / 轮询 / 到终态即停 / 页面隐藏暂停」行为，并对外暴露同一份快照形状
// （items / total / hasMore / isInitialLoading / isFetchingMore / loadMoreFailed / loadMore）。
// 账号 id 与形象 id 由调用方注入：分页按形象取数，缓存按账号隔离。
//
// 本文件允许依赖 React（lib/* 不允许）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { fetchTask, fetchTasks, submitSheet } from '../api.js'
import { isTerminalStatus } from '../lib/history.js'
import { readHistoryCache, writeHistoryCache } from '../lib/history-cache.js'
import {
  PAGE_SIZE,
  POLL_BACKOFF_AFTER_MS,
  POLL_MS,
  POLL_SLOW_MS,
} from '../lib/types.js'

/**
 * @typedef {object} InfluencerHistory
 * @property {import('../lib/types.js').TaskRecord[]} items
 * @property {number} total
 * @property {boolean} hasMore
 * @property {boolean} isInitialLoading 仅当首页仍在加载且尚无内容可画时为真
 * @property {boolean} isFetchingMore
 * @property {boolean} loadMoreFailed
 * @property {() => void} loadMore
 * @property {unknown} error
 */

/** 任务列表里是否还有未到终态的行（未到终态才需要继续轮询）。 */
function hasRunning(items) {
  return items.some((item) => !isTerminalStatus(item?.status))
}

/** 当前是否处于可见状态；无 document（测试/SSR）时视为可见。 */
function isVisible() {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
}

/**
 * 形象的历史记录：按需分页展示，并用本地缓存先画一屏，等网络答案到达后覆盖。
 *
 * 注意：插件端点一次返回该形象的全部任务（GET /api/omnimux/avatar/tasks?avatarId=），
 * 因此「分页」在客户端完成——先展示 PAGE_SIZE 条，loadMore 再向服务端取一次最新列表
 * 并多展示一页。取数失败会置 loadMoreFailed，供底部「加载历史失败」按钮重试。
 *
 * @param {{ avatarId?: string, userId?: number }} [options]
 * @returns {InfluencerHistory}
 */
export function useInfluencerHistory({ avatarId, userId } = {}) {
  const cached = useMemo(() => readHistoryCache(userId), [userId])

  const [items, setItems] = useState(() => cached?.items ?? [])
  const [total, setTotal] = useState(() => cached?.total ?? 0)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [fetchingMore, setFetchingMore] = useState(false)
  const [loadMoreFailed, setLoadMoreFailed] = useState(false)
  const [error, setError] = useState(null)

  const mountedRef = useRef(true)
  const fetchingMoreRef = useRef(false)
  const timerRef = useRef(null)
  const activeSinceRef = useRef(0)
  const tickRef = useRef(null)

  /** 拉取该形象的最新任务列表；成功后刷新缓存。 */
  const loadOnce = useCallback(async () => {
    if (!avatarId) {
      setItems([])
      setTotal(0)
      return
    }
    const page = await fetchTasks(avatarId)
    if (!mountedRef.current) return
    setItems(page.items)
    setTotal(page.total)
    setError(null)
    // 只持久化本次网络返回的内容，避免过期种子不断刷新自己的时间戳。
    writeHistoryCache(userId, page.items, page.total)
  }, [avatarId, userId])

  // 首屏加载。
  useEffect(() => {
    mountedRef.current = true
    let alive = true
    setLoading(true)
    void (async () => {
      try {
        await loadOnce()
      } catch (e) {
        if (alive) setError(e)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [loadOnce])

  // 轮询：列表里还有未完成的任务时才继续；超过退避时长后放慢；页面隐藏时暂停，
  // 回到前台立刻补一次读取。全部到终态即停止。
  useEffect(() => {
    const running = hasRunning(items)
    if (!running) {
      activeSinceRef.current = 0
      return undefined
    }
    if (!activeSinceRef.current) activeSinceRef.current = Date.now()

    let disposed = false
    let inFlight = false

    const schedule = () => {
      if (disposed || !mountedRef.current) return
      const elapsed = Date.now() - activeSinceRef.current
      const delay = elapsed > POLL_BACKOFF_AFTER_MS ? POLL_SLOW_MS : POLL_MS
      timerRef.current = setTimeout(() => {
        void tick()
      }, delay)
    }

    const tick = async () => {
      if (disposed || !mountedRef.current || inFlight) return
      if (!isVisible()) {
        schedule()
        return
      }
      inFlight = true
      try {
        await loadOnce()
      } catch (e) {
        if (!disposed && mountedRef.current) setError(e)
      } finally {
        inFlight = false
      }
      schedule()
    }

    tickRef.current = () => {
      void tick()
    }
    schedule()

    const onVisibilityChange = () => {
      if (!disposed && isVisible()) tickRef.current?.()
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    return () => {
      disposed = true
      tickRef.current = null
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
    }
  }, [items, loadOnce])

  // 组件卸载后不再触碰 state。
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount])
  const hasMore = visibleCount < items.length

  const loadMore = useCallback(() => {
    if (fetchingMoreRef.current || !hasMore) return
    fetchingMoreRef.current = true
    setFetchingMore(true)
    setLoadMoreFailed(false)
    void (async () => {
      try {
        await loadOnce()
        setVisibleCount((count) => count + PAGE_SIZE)
      } catch {
        if (mountedRef.current) setLoadMoreFailed(true)
      } finally {
        fetchingMoreRef.current = false
        if (mountedRef.current) setFetchingMore(false)
      }
    })()
  }, [hasMore, loadOnce])

  return {
    items: visibleItems,
    total,
    hasMore,
    isInitialLoading: visibleItems.length === 0 && loading,
    isFetchingMore: fetchingMore,
    loadMoreFailed,
    loadMore,
    error,
  }
}

/**
 * 提交一条角色设定板或多视角任务，然后轮询该任务直到进入终态。
 * 任务记录本身就是真源——不使用任何本地模拟数据。
 *
 * @param {{ avatarId?: string }} [options]
 */
export function useSheetSubmit({ avatarId } = {}) {
  const [pending, setPending] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)
  const mountedRef = useRef(true)
  const polledTaskRef = useRef(null)
  const tickRef = useRef(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    polledTaskRef.current = null
    tickRef.current = null
  }, [])

  /**
   * 只有已完成的任务才做产物投影（服务端对成功任务跑一次 resolveTaskArtifacts），
   * 因此轮询读保持廉价，产物读取只在最后发生一次。
   * @param {string} taskId
   * @returns {Promise<import('../lib/types.js').TaskRecord|null>}
   */
  const loadRecord = useCallback(
    async (taskId) => {
      const record = await fetchTask(avatarId, taskId)
      if (!record || !isTerminalStatus(record.status)) return record
      const settled = await fetchTask(avatarId, taskId, { refresh: true })
      return settled ?? record
    },
    [avatarId]
  )

  useEffect(() => {
    mountedRef.current = true
    // 后台标签页看不到结果，所以隐藏时暂停轮询，回到前台立刻读一次。
    const onVisibilityChange = () => {
      if (typeof document === 'undefined') return
      if (document.visibilityState !== 'visible') return
      if (polledTaskRef.current) tickRef.current?.()
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }
    return () => {
      mountedRef.current = false
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      clearTimer()
    }
  }, [clearTimer])

  /**
   * @param {string} taskId
   */
  const startPolling = useCallback(
    (taskId) => {
      const startedAt = Date.now()
      let inFlight = false

      const schedule = () => {
        if (!mountedRef.current) return
        const elapsed = Date.now() - startedAt
        const delay = elapsed > POLL_BACKOFF_AFTER_MS ? POLL_SLOW_MS : POLL_MS
        timerRef.current = setTimeout(() => {
          void tick()
        }, delay)
      }

      const tick = async () => {
        if (!mountedRef.current || inFlight) return
        if (!isVisible()) {
          schedule()
          return
        }
        inFlight = true
        try {
          const next = await loadRecord(taskId)
          if (!mountedRef.current) return
          if (next) setPending(next)
          if (next && isTerminalStatus(next.status)) {
            clearTimer()
            return
          }
        } catch (e) {
          clearTimer()
          if (mountedRef.current) setError(e)
          return
        } finally {
          inFlight = false
        }
        schedule()
      }

      polledTaskRef.current = taskId
      tickRef.current = () => {
        void tick()
      }
      schedule()
    },
    [clearTimer, loadRecord]
  )

  /**
   * @param {object} body 提交载荷（含 avatarId / model / tier / selection 等）
   * @returns {Promise<import('../lib/types.js').TaskRecord|null>}
   */
  const submit = useCallback(
    async (body) => {
      clearTimer()
      setSubmitting(true)
      setError(null)
      try {
        const payload = await submitSheet(body)
        const taskId = payload.taskRef || String(payload.task?.task_id ?? payload.task?.id ?? '')
        const rec = taskId ? await loadRecord(taskId) : payload.task
        if (!mountedRef.current) return rec
        setPending(rec)
        setSubmitting(false)
        if (rec && !isTerminalStatus(rec.status) && taskId) {
          startPolling(taskId)
        }
        return rec
      } catch (e) {
        setSubmitting(false)
        if (mountedRef.current) setError(e)
        return null
      }
    },
    [clearTimer, loadRecord, startPolling]
  )

  const reset = useCallback(() => {
    clearTimer()
    setPending(null)
    setError(null)
  }, [clearTimer])

  return { pending, submitting, error, submit, reset }
}
