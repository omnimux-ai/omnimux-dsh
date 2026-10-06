// 形象行（源工作台没有这一段）：当前形象名 + 切换下拉 + 「+」新建。
// 名称是轻量编辑：双击进入编辑态，Enter 或失焦保存，Escape 取消；
// 重名不静默改名，就地提示冲突。列表为空时自动新建一个「未命名」。

import { useCallback, useEffect, useRef, useState } from 'react'

/** 下拉箭头：矢量 SVG。 */
function ChevronDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 新建：矢量加号（14×14）。 */
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M7 3v8M3 7h8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * 把服务端错误映射成可读文案；看起来是重名冲突时用统一词条。
 * @param {unknown} error
 * @param {(key: string) => string} t
 * @returns {string}
 */
function readNameError(error, t) {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  if (/exists|duplicate|conflict|已存在|重名/i.test(raw)) return t('error.avatarNameExists')
  return raw || t('error.avatarNameExists')
}

/**
 * @param {{
 *   avatars: { id: string, name: string }[],
 *   currentId: string|null,
 *   loading?: boolean,
 *   createAvatar: (input: { name: string }) => Promise<unknown>,
 *   renameAvatar: (input: { id: string, name: string }) => Promise<unknown>,
 *   selectAvatar: (id: string) => void,
 *   t: (key: string, vars?: Record<string, unknown>) => string,
 * }} props
 */
export function AvatarList(props) {
  const { avatars, currentId, loading, createAvatar, renameAvatar, selectAvatar, t } = props
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const wrapRef = useRef(null)
  const cancelledRef = useRef(false)
  const creatingRef = useRef(false)

  useEffect(() => {
    if (!open) return undefined
    if (typeof document === 'undefined') return undefined
    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains?.(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const current = (avatars ?? []).find((item) => item.id === currentId) ?? null

  /**
   * 新建时的默认名：优先「未命名」，已被占用就顺延「未命名 2 / 3 …」。
   * 候选数恒为已用名数 + 1，抽屉原理保证一定能取到一个没被占用的名字，
   * 因此「+」不会因为重名而失败。
   * @returns {string}
   */
  const nextUnnamed = useCallback(() => {
    const taken = new Set((avatars ?? []).map((item) => item.name))
    const base = t('avatar.unnamed')
    if (!taken.has(base)) return base
    for (let i = 2; i <= taken.size + 1; i += 1) {
      const candidate = `${base} ${i}`
      if (!taken.has(candidate)) return candidate
    }
    return `${base} ${taken.size + 1}`
  }, [avatars, t])

  const beginEdit = useCallback(() => {
    setDraft(current?.name ?? t('avatar.unnamed'))
    setError('')
    setEditing(true)
  }, [current, t])

  // 列表为空（且首次加载结束）时自动新建一个「未命名」：默认态是名称标签，
  // 双击才进入编辑，不在用户没要求的时候抢焦点。
  useEffect(() => {
    if (loading !== false) return
    if ((avatars ?? []).length !== 0) return
    if (creatingRef.current) return
    creatingRef.current = true
    void (async () => {
      try {
        await createAvatar({ name: nextUnnamed() })
      } catch (e) {
        setError(readNameError(e, t))
      } finally {
        creatingRef.current = false
      }
    })()
  }, [loading, avatars, createAvatar, nextUnnamed, t])

  // 切换当前形象时退出编辑态，避免把旧名字的草稿带到新形象上。
  // 放在切换动作里显式关闭，而不是监听 currentId：新建形象同样会换 currentId，
  // 用 effect 会把「点 + 后立刻进入编辑」的编辑态一起关掉（竞态）。
  const onSelect = useCallback(
    (id) => {
      setEditing(false)
      setError('')
      selectAvatar(id)
    },
    [selectAvatar]
  )

  /** 失焦 / Enter 保存；重名或不合法时提示并回到原名，绝不覆盖账本里的名字。 */
  const commit = useCallback(() => {
    const name = draft.trim()
    if (!current) {
      setEditing(false)
      return
    }
    if (!name || name === current.name) {
      setEditing(false)
      setError('')
      return
    }
    const clash = (avatars ?? []).some((item) => item.id !== current.id && item.name === name)
    if (clash) {
      setEditing(false)
      setError(t('error.avatarNameExists'))
      return
    }
    setEditing(false)
    void renameAvatar({ id: current.id, name }).catch((e) => {
      setError(readNameError(e, t))
    })
  }, [avatars, current, draft, renameAvatar, t])

  // 「+」新建一个默认名数字人并切到它；默认态仍是名称标签，
  // 想改名就双击名称，不自动抢焦点进编辑。
  const onCreate = useCallback(() => {
    if (creatingRef.current) return
    creatingRef.current = true
    void (async () => {
      try {
        await createAvatar({ name: nextUnnamed() })
        setError('')
      } catch (e) {
        setError(readNameError(e, t))
      } finally {
        creatingRef.current = false
      }
    })()
  }, [createAvatar, nextUnnamed, t])

  return (
    <div className="omx-avatar-avatars">
      <span className="omx-avatar-field-lbl">{t('avatar.label')}</span>

      {editing ? (
        <input
          className="omx-avatar-input omx-avatar-input--name"
          value={draft}
          placeholder={t('avatar.name')}
          aria-label={t('avatar.name')}
          autoFocus
          onChange={(event) => {
            setDraft(event.target.value)
            if (error) setError('')
          }}
          onBlur={() => {
            if (cancelledRef.current) {
              cancelledRef.current = false
              return
            }
            commit()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              cancelledRef.current = true
              setEditing(false)
              setError('')
            }
          }}
        />
      ) : (
        <span
          className="omx-avatar-avatars-name"
          title={t('avatar.renameHint')}
          onDoubleClick={current ? beginEdit : undefined}
        >
          {current?.name ?? t('avatar.unnamed')}
        </span>
      )}

      <span className="omx-avatar-avatars-spacer" />

      {(avatars ?? []).length > 1 ? (
        <div className="omx-avatar-popover-wrap" ref={wrapRef}>
          <button type="button" /* exempt-ui01: 形象切换是自绘下拉触发器 */
            className="omx-avatar-abtn"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={t('avatar.switch')}
            onClick={() => setOpen((prev) => !prev)}
          >
            <span>{t('avatar.switch')}</span>
            <ChevronDownIcon />
          </button>
          {open ? (
            <div className="omx-avatar-menu" role="listbox" aria-label={t('avatar.switch')}>
              {(avatars ?? []).map((item) => (
                <button key={item.id} type="button" /* exempt-ui01: 下拉项是自绘列表项 */
                  role="option"
                  aria-selected={item.id === currentId}
                  className="omx-avatar-menu-item"
                  onClick={() => {
                    setOpen(false)
                    onSelect(item.id)
                  }}
                >
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <button type="button" /* exempt-ui01: 新建是自绘图标按钮 */
        className="omx-avatar-abtn omx-avatar-abtn--icon"
        aria-label={t('avatar.create')}
        title={t('avatar.create')}
        onClick={onCreate}
      >
        <PlusIcon />
      </button>

      {error ? <span className="omx-avatar-error">{error}</span> : null}
    </div>
  )
}
