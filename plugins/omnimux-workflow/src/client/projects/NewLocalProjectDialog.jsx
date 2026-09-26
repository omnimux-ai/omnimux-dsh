import { useEffect, useRef, useState } from 'react'
import { Button, IconButton, InputField, ModalDialog } from 'dsh-ui-kit'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { pickProjectDirectory } from '../api.js'
import { MAX_PROJECT_TITLE_LENGTH } from './limits.js'
import { extractFolderName, firstPickedDirectory } from './pickDirectory.js'

function FolderGlyph({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v7A1.5 1.5 0 0 1 19.5 18h-15A1.5 1.5 0 0 1 3 16.5v-9Z" />
    </svg>
  )
}

function FolderPlusGlyph({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v7A1.5 1.5 0 0 1 19.5 18h-15A1.5 1.5 0 0 1 3 16.5v-9Z" />
      <path d="M12 11v5M9.5 13.5H14.5" />
    </svg>
  )
}

/**
 * 「创建项目」弹窗。token 走 --dsw-alias-*。
 * 名称必填；点击「选择文件夹」唤起系统原生打开窗口，选中后切成可移除卡片。
 *
 * @param {{
 *   t: (key: string) => string,
 *   busy?: boolean,
 *   error?: string,
 *   initialPath?: string,
 *   initialTitle?: string,
 *   onCancel: () => void,
 *   onSubmit: (payload: { title: string, projectRoot?: string, confirmedExisting?: boolean }) => void | Promise<unknown>,
 *   onPickDirectory?: () => Promise<unknown>,
 *   onBrowseDirectory?: () => Promise<unknown>,
 * }} props
 */
export function NewLocalProjectDialog({
  t,
  busy = false,
  error,
  initialPath = '',
  initialTitle = '',
  onCancel,
  onSubmit,
  onPickDirectory,
  onBrowseDirectory,
}) {
  const nameRef = useRef(null)
  const defaultTitle = initialTitle || extractFolderName(initialPath)
  const [name, setName] = useState(defaultTitle)
  const [path, setPath] = useState(initialPath || '')
  const [nameTouched, setNameTouched] = useState(Boolean(defaultTitle))
  const [picking, setPicking] = useState(false)
  const [pickError, setPickError] = useState('')
  const [confirmedExisting, setConfirmedExisting] = useState(false)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  useEffect(() => {
    const confirmMessage = t('projects.existingConfirm')
    if (error && (error === confirmMessage || (typeof confirmMessage === 'string' && confirmMessage !== '' && error.includes(confirmMessage)))) {
      setConfirmedExisting(true)
    }
  }, [error, t])

  const trimmed = name.trim()
  const trimmedPath = path.trim()
  const canSubmit = trimmed !== '' && trimmed.length <= MAX_PROJECT_TITLE_LENGTH && !busy && !picking
  const folderName = extractFolderName(trimmedPath)

  const submit = () => {
    if (!canSubmit) return
    void Promise.resolve(onSubmit({
      title: trimmed,
      ...(trimmedPath !== '' ? { projectRoot: trimmedPath } : {}),
      ...(confirmedExisting ? { confirmedExisting: true } : {}),
    })).then((result) => {
      if (result && typeof result === 'object' && result.existing) {
        setConfirmedExisting(true)
      }
    }).catch(() => {})
  }

  const applyPickedPath = (nextPath) => {
    const next = typeof nextPath === 'string' ? nextPath.trim() : ''
    if (next === '') return
    setPath(next)
    setConfirmedExisting(false)
    if (!nameTouched) {
      const fromFolder = extractFolderName(next)
      if (fromFolder) setName(fromFolder)
    }
  }

  const handlePickDirectory = async () => {
    if (busy || picking) return
    setPicking(true)
    setPickError('')
    try {
      const picker = typeof onPickDirectory === 'function'
        ? onPickDirectory
        : typeof onBrowseDirectory === 'function'
          ? onBrowseDirectory
          : pickProjectDirectory
      const result = await picker()
      const chosen = firstPickedDirectory(result)
      if (chosen) {
        applyPickedPath(chosen)
      }
    } catch {
      setPickError(t('projects.dialog.browseFailed'))
    } finally {
      setPicking(false)
    }
  }

  const sourcePane = trimmedPath ? (
    <div className="omnimux-new-project-picked" data-omnimux-new-project-picked="">
      <span className="omnimux-new-project-picked-icon" aria-hidden="true">
        <FolderGlyph />
      </span>
      <span className="omnimux-new-project-picked-name" title={trimmedPath}>
        {folderName || trimmedPath}
      </span>
      <div className="omnimux-new-project-picked-actions">
        <Button
          variant="ghost"
          size="xs"
          disabled={busy || picking}
          data-omnimux-new-project-change=""
          onClick={handlePickDirectory}
        >
          {t('projects.dialog.change')}
        </Button>
        <IconButton
          variant="ghost"
          size="xs"
          disabled={busy || picking}
          aria-label={t('projects.dialog.removeFolder')}
          data-omnimux-new-project-remove=""
          onClick={() => { setPath(''); setConfirmedExisting(false) }}
        >
          <IconCloseOutline16 size={14} />
        </IconButton>
      </div>
    </div>
  ) : (
    <Button
      type="button"
      variant="ghost"
      className="omnimux-new-project-drop"
      data-omnimux-new-project-drop=""
      disabled={busy || picking}
      onClick={handlePickDirectory}
    >
      <FolderPlusGlyph />
      <span>{t('projects.dialog.addFolder')}</span>
    </Button>
  )

  return (
    <ModalDialog
      open
      onClose={() => { if (!busy) onCancel() }}
      title={t('projects.dialog.title')}
      closeLabel={t('projects.close')}
      size="md"
      footer={(
        <div className="omnimux-workflow-dialog-footer">
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            {t('projects.dialog.cancel')}
          </Button>
          <Button variant="primary" disabled={!canSubmit} loading={busy} onClick={submit}>
            {confirmedExisting
              ? (t('projects.existingConfirmSubmit') || '新建创作页')
              : (t('projects.dialog.submit') || '创建项目')}
          </Button>
        </div>
      )}
    >
      <div className="omnimux-workflow-form">
        <div className="omnimux-new-project-name">
          <span className="omnimux-new-project-name-prefix" aria-hidden="true">
            <FolderGlyph />
          </span>
          <InputField
            ref={nameRef}
            id="omnimux-new-local-project-name"
            className="omnimux-new-project-name-field"
            value={name}
            maxLength={MAX_PROJECT_TITLE_LENGTH}
            placeholder={t('projects.dialog.namePlaceholder')}
            disabled={busy}
            aria-label={t('projects.dialog.nameLabel')}
            onChange={(event) => {
              setName(event.target.value)
              setNameTouched(event.target.value.trim() !== '')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSubmit) {
                event.preventDefault()
                submit()
              }
            }}
          />
        </div>

        <div className="omnimux-new-project-source-head">
          <span className="omnimux-new-project-source-label">{t('projects.dialog.pathLabel')}</span>
        </div>

        {sourcePane}

        {pickError ? <p className="omnimux-workflow-form-error">{pickError}</p> : null}
        {error ? <p className="omnimux-workflow-form-error">{error}</p> : null}
      </div>
    </ModalDialog>
  )
}
