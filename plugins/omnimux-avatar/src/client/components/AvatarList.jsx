// 形象行（源工作台没有这一段）：当前形象名 + 切换下拉 + 「新建形象」。
// 新建走内联输入框：Enter 提交、Escape 取消；重名不静默改名，直接提示冲突。

import { useEffect, useRef, useState } from 'react'

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

/**
 * 把服务端错误映射成可读文案；看起来是重名冲突时用统一词条。
 * @param {unknown} error
 * @param {(key: string) => string} t
 * @returns {string}
 */
function readCreateError(error, t) {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  if (/exists|duplicate|conflict|已存在|重名/i.test(raw)) return t('error.avatarNameExists')
  return raw || t('error.avatarNameExists')
}

/**
 * @param {{
 *   avatars: { id: string, name: string }[],
 *   currentId: string|null,
 *   createAvatar: (input: { name: string }) => Promise<unknown>,
 *   selectAvatar: (id: string) => void,
 *   t: (key: string, vars?: Record<string, unknown>) => string,
 * }} props
 */
export function AvatarList(props) {
  const { avatars, currentId, createAvatar, selectAvatar, t } = props
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const wrapRef = useRef(null)

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

  const closeCreate = () => {
    setCreating(false)
    setDraft('')
    setError('')
  }

  const commit = async () => {
    const name = draft.trim()
    if (!name) return
    const clash = (avatars ?? []).some((item) => item.name === name)
    if (clash) {
      setError(t('error.avatarNameExists'))
      return
    }
    try {
      await createAvatar({ name })
      closeCreate()
    } catch (e) {
      setError(readCreateError(e, t))
    }
  }

  return (
    <div className="omx-avatar-avatars">
      <span className="omx-avatar-field-lbl">{t('avatar.label')}</span>
      <span className="omx-avatar-avatars-name">
        {current?.name ?? t('avatar.empty')}
      </span>
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
                    selectAvatar(item.id)
                  }}
                >
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {creating ? (
        <>
          <input
            className="omx-avatar-input"
            value={draft}
            placeholder={t('avatar.name')}
            aria-label={t('avatar.name')}
            autoFocus
            onChange={(event) => {
              setDraft(event.target.value)
              if (error) setError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void commit()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                closeCreate()
              }
            }}
          />
          <button type="button" /* exempt-ui01: 行内次要动作按钮 */
            className="omx-avatar-abtn"
            onClick={() => {
              void commit()
            }}
          >
            {t('avatar.createConfirm')}
          </button>
          <button type="button" /* exempt-ui01: 行内次要动作按钮 */
            className="omx-avatar-abtn"
            onClick={closeCreate}
          >
            {t('avatar.cancel')}
          </button>
        </>
      ) : (
        <button type="button" /* exempt-ui01: 行内次要动作按钮 */
          className="omx-avatar-abtn"
          onClick={() => setCreating(true)}
        >
          {t('avatar.create')}
        </button>
      )}

      {error ? <span className="omx-avatar-error">{error}</span> : null}
    </div>
  )
}
