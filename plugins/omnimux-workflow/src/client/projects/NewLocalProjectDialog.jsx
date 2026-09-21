import { useEffect, useRef, useState } from 'react'
import { Button, IconButton, InputField, ModalDialog } from 'dsh-ui-kit'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { browseProjectDirectory } from '../api.js'
import { MAX_PROJECT_TITLE_LENGTH } from './limits.js'
import { extractFolderName } from './pickDirectory.js'

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

function ComputerGlyph({ size = 14 }) {
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
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 19h8" />
    </svg>
  )
}

function ChevronGlyph({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronLeftGlyph({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * 「创建项目」弹窗。token 走 --dsw-alias-*。
 * 名称必填；源文件夹在弹窗内浏览本机目录，选中后切成可移除卡片。
 * 留空目录则 Host 写入默认项目库。禁止弹出系统选文件夹窗口。
 *
 * @param {{
 *   t: (key: string) => string,
 *   busy?: boolean,
 *   error?: string,
 *   initialPath?: string,
 *   initialTitle?: string,
 *   onCancel: () => void,
 *   onSubmit: (payload: { title: string, projectRoot?: string, confirmedExisting?: boolean }) => void | Promise<unknown>,
 *   onBrowseDirectory?: (path?: string) => Promise<unknown>,
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
  onBrowseDirectory,
}) {
  const nameRef = useRef(null)
  const defaultTitle = initialTitle || extractFolderName(initialPath)
  const [name, setName] = useState(defaultTitle)
  const [path, setPath] = useState(initialPath || '')
  const [nameTouched, setNameTouched] = useState(Boolean(defaultTitle))
  const [browsing, setBrowsing] = useState(false)
  const [browsePath, setBrowsePath] = useState('')
  const [browseParent, setBrowseParent] = useState(null)
  const [browseEntries, setBrowseEntries] = useState([])
  const [browseBusy, setBrowseBusy] = useState(false)
  const [browseError, setBrowseError] = useState('')
  const [confirmedExisting, setConfirmedExisting] = useState(false)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const trimmed = name.trim()
  const trimmedPath = path.trim()
  const canSubmit = trimmed !== '' && trimmed.length <= MAX_PROJECT_TITLE_LENGTH && !busy && !browsing
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
    setBrowsing(false)
    if (!nameTouched) {
      const fromFolder = extractFolderName(next)
      if (fromFolder) setName(fromFolder)
    }
  }

  const loadBrowse = async (nextPath) => {
    setBrowseBusy(true)
    setBrowseError('')
    try {
      const loader = typeof onBrowseDirectory === 'function' ? onBrowseDirectory : browseProjectDirectory
      const result = await loader(nextPath)
      const body = result && typeof result === 'object' && 'body' in result ? result.body : result
      if (!result || result.ok === false || !body || typeof body.path !== 'string') {
        setBrowseError(t('projects.dialog.browseFailed'))
        return
      }
      setBrowsePath(body.path)
      setBrowseParent(typeof body.parent === 'string' ? body.parent : null)
      setBrowseEntries(Array.isArray(body.entries) ? body.entries : [])
      setBrowsing(true)
    } catch {
      setBrowseError(t('projects.dialog.browseFailed'))
    } finally {
      setBrowseBusy(false)
    }
  }

  const openBrowse = () => {
    if (busy || browseBusy) return
    void loadBrowse('')
  }

  const sourcePane = browsing ? (
    <div className="omnimux-new-project-browse" data-omnimux-new-project-browse="">
      <div className="omnimux-new-project-browse-bar">
        <IconButton
          variant="ghost"
          size="xs"
          disabled={browseBusy || !browseParent}
          aria-label={t('projects.dialog.goUp')}
          data-omnimux-new-project-up=""
          onClick={() => { if (browseParent) void loadBrowse(browseParent) }}
        >
          <ChevronLeftGlyph />
        </IconButton>
        <span className="omnimux-new-project-browse-path" title={browsePath}>{browsePath}</span>
        <IconButton
          variant="ghost"
          size="xs"
          disabled={browseBusy}
          aria-label={t('projects.dialog.closeBrowse')}
          data-omnimux-new-project-browse-close=""
          onClick={() => { setBrowsing(false); setBrowseError('') }}
        >
          <IconCloseOutline16 size={14} />
        </IconButton>
      </div>
      <div className="omnimux-new-project-browse-list">
        {browseEntries.map((entry) => (
          <Button
            key={entry.path}
            type="button"
            variant="ghost"
            className="omnimux-new-project-folder-row"
            data-omnimux-new-project-folder=""
            disabled={browseBusy}
            onClick={() => { void loadBrowse(entry.path) }}
          >
            <FolderGlyph size={14} />
            <span>{entry.name}</span>
          </Button>
        ))}
        {browseEntries.length === 0 && !browseBusy ? (
          <p className="omnimux-new-project-browse-empty">{t('projects.dialog.browseEmpty')}</p>
        ) : null}
      </div>
      <div className="omnimux-new-project-browse-actions">
        <Button variant="outline" disabled={browseBusy} onClick={() => { setBrowsing(false); setBrowseError('') }}>
          {t('projects.dialog.cancel')}
        </Button>
        <Button
          variant="primary"
          disabled={browseBusy || !browsePath}
          data-omnimux-new-project-choose=""
          onClick={() => { applyPickedPath(browsePath) }}
        >
          {t('projects.dialog.chooseHere')}
        </Button>
      </div>
    </div>
  ) : trimmedPath ? (
    <div className="omnimux-new-project-picked" data-omnimux-new-project-picked="">
      <span className="omnimux-new-project-picked-icon" aria-hidden="true">
        <FolderGlyph />
      </span>
      <span className="omnimux-new-project-picked-name" title={trimmedPath}>{folderName || trimmedPath}</span>
      <IconButton
        variant="ghost"
        size="xs"
        disabled={busy}
        aria-label={t('projects.dialog.removeFolder')}
        data-omnimux-new-project-remove=""
        onClick={() => { setPath(''); setConfirmedExisting(false) }}
      >
        <IconCloseOutline16 size={14} />
      </IconButton>
    </div>
  ) : (
    <Button
      type="button"
      variant="ghost"
      className="omnimux-new-project-drop"
      data-omnimux-new-project-drop=""
      disabled={busy || browseBusy}
      onClick={openBrowse}
    >
      <span className="omnimux-new-project-drop-title">
        {t('projects.dialog.addFolder')}
        <ChevronGlyph />
      </span>
      <span className="omnimux-new-project-add-pill">
        <FolderPlusGlyph />
        {t('projects.dialog.add')}
      </span>
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
            {t('projects.dialog.submit')}
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
          {trimmedPath && !browsing ? (
            <span className="omnimux-new-project-device">
              <ComputerGlyph />
              {t('projects.dialog.thisComputer')}
            </span>
          ) : null}
        </div>

        {sourcePane}

        {browseError ? <p className="omnimux-workflow-form-error">{browseError}</p> : null}
        {error ? <p className="omnimux-workflow-form-error">{error}</p> : null}
      </div>
    </ModalDialog>
  )
}


