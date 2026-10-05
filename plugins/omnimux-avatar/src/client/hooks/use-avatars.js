// 形象（avatar）列表状态：当前形象的选择与增删改。
//
// 本文件是插件新增能力，真源没有对应实现（真源的 influencer 工作台只有单一形象）。
// 与真源一致的约定：形象本身是一等实体，可创建、可复用、可累积产出；
// 当前形象的记忆落在 localStorage，键 `omnimux-avatar:current`。
//
// 本文件允许依赖 React（lib/* 不允许）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  createAvatar as createAvatarRequest,
  deleteAvatar as deleteAvatarRequest,
  fetchAvatars,
  updateAvatar as updateAvatarRequest,
} from '../api.js'
import { STORAGE_KEYS } from '../lib/types.js'

const KEY = STORAGE_KEYS.currentAvatar

/**
 * 读取本地记住的形象 id。
 * 只接受非空字符串；读不到或存储不可用时返回空串。
 * @returns {string}
 */
export function readStoredAvatarId() {
  try {
    const raw = localStorage.getItem(KEY)
    return typeof raw === 'string' && raw ? raw : ''
  } catch {
    return ''
  }
}

/**
 * 写入当前形象 id。
 * @param {string} id
 * @returns {void}
 */
export function writeStoredAvatarId(id) {
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch {
    /* 存储可能不可用；本次会话内该选择依然生效 */
  }
}

/**
 * 形象列表与当前形象。
 *
 * 当前形象的解析规则：本地记住的 id 若在列表中就用它，否则用列表第一个。
 * 列表为空时 current 为 null、currentId 为空串。
 *
 * @returns {{
 *   avatars: import('../lib/types.js').AvatarSummary[],
 *   current: import('../lib/types.js').AvatarSummary|null,
 *   currentId: string,
 *   loading: boolean,
 *   error: unknown,
 *   refresh: () => Promise<import('../lib/types.js').AvatarSummary[]>,
 *   createAvatar: (input: { name: string, sheet: string }) => Promise<import('../lib/types.js').AvatarSummary>,
 *   selectAvatar: (id: string) => void,
 *   updateAvatar: (input: { id: string, name?: string, sheet?: string }) => Promise<import('../lib/types.js').AvatarSummary>,
 *   deleteAvatar: (input: { id: string }) => Promise<true>,
 *   persistLocalSelection: (id: string) => void,
 * }}
 */
export function useAvatars() {
  const [avatars, setAvatars] = useState([])
  const [preferredId, setPreferredId] = useState(() => readStoredAvatarId())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    const page = await fetchAvatars()
    if (mountedRef.current) {
      setAvatars(page.avatars)
      setError(null)
    }
    return page.avatars
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    void (async () => {
      try {
        await refresh()
      } catch (e) {
        if (alive) setError(e)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [refresh])

  // 本地记住的 id 若已不在列表里，回退到第一个形象；解析结果同时写回本地。
  const current = useMemo(() => {
    const hit = avatars.find((item) => item?.id === preferredId)
    return hit ?? avatars[0] ?? null
  }, [avatars, preferredId])

  const currentId = current?.id ?? ''

  useEffect(() => {
    if (currentId && currentId !== readStoredAvatarId()) writeStoredAvatarId(currentId)
  }, [currentId])

  /** 选中一个形象并记住它。 */
  const selectAvatar = useCallback((id) => {
    setPreferredId(id)
    writeStoredAvatarId(id)
  }, [])

  /** 只把选择写进本地存储，不改动列表。 */
  const persistLocalSelection = useCallback((id) => {
    writeStoredAvatarId(id)
  }, [])

  const createAvatar = useCallback(
    async (input) => {
      const avatar = await createAvatarRequest(input)
      await refresh()
      if (avatar?.id) selectAvatar(avatar.id)
      return avatar
    },
    [refresh, selectAvatar]
  )

  const updateAvatar = useCallback(
    async (input) => {
      const avatar = await updateAvatarRequest(input)
      await refresh()
      return avatar
    },
    [refresh]
  )

  const deleteAvatar = useCallback(
    async (input) => {
      const deleted = await deleteAvatarRequest(input)
      await refresh()
      // 被删掉的正好是当前形象时，清掉本地记忆，让列表第一个接管。
      if (input?.id === preferredId) {
        setPreferredId('')
        writeStoredAvatarId('')
      }
      return deleted
    },
    [preferredId, refresh]
  )

  return {
    avatars,
    current,
    currentId,
    loading,
    error,
    refresh,
    createAvatar,
    selectAvatar,
    updateAvatar,
    deleteAvatar,
    persistLocalSelection,
  }
}
