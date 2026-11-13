import { useEffect, useRef, useState } from 'react'
import { Button, IconButton, IconCloseOutline16, InputField, ModalDialog } from 'dsh-ui-kit'
import { pickProjectDirectory, preflightProject } from '../api.js'
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
 *   onSubmit: (payload: { title: string, mode: 'independent'|'workspace', workspaceDir?: string }) => void | Promise<unknown>,
 *   onPickDirectory?: () => Promise<unknown>,
 *   onBrowseDirectory?: () => Promise<unknown>,
 *   onPreflight?: (payload: { mode: 'workspace', workspaceDir: string }) => Promise<unknown>,
 * }} props
 */
const PREFLIGHT_ACTIONS = {
  initialize: { status: 'projects.preflight.initialize', submit: 'projects.dialog.submit' },
  open: { status: 'projects.preflight.open', submit: 'projects.openProject' },
  converge: { status: 'projects.preflight.open', submit: 'projects.openProject' },
  rebuild: { status: 'projects.preflight.rebuild', submit: 'projects.rebuildAndOpen' },
  repair: { status: 'projects.preflight.repair', submit: 'projects.repairAndOpen' },
  'create-independent': { status: 'projects.preflight.independent', submit: 'projects.dialog.submit' },
}

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
  onPreflight,
}) {
  const nameRef = useRef(null)
  const defaultTitle = initialTitle || extractFolderName(initialPath)
  const [name, setName] = useState(defaultTitle)
  const [path, setPath] = useState(initialPath || '')
  const [nameTouched, setNameTouched] = useState(Boolean(defaultTitle))
  const [picking, setPicking] = useState(false)
  const [pickError, setPickError] = useState('')
  const [preflight, setPreflight] = useState(null)
  const [preflightError, setPreflightError] = useState(false)
  const [preflighting, setPreflighting] = useState(false)
  const preflightSeq = useRef(0)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  // 选中目录后先做只读预检：S0–S4 → 中性状态 + 明确动作（不再用红字「已有项目」）。
  useEffect(() => {
    const dir = path.trim()
    if (dir === '') {
      setPreflight(null)
      setPreflightError(false)
      setPreflighting(false)
      preflightSeq.current += 1
      return
    }
    const seq = preflightSeq.current + 1
    preflightSeq.current = seq
    setPreflighting(true)
    setPreflightError(false)
    setPickError('')
    const run = typeof onPreflight === 'function' ? onPreflight : preflightProject
    Promise.resolve(run({ mode: 'workspace', workspaceDir: dir }))
      .then((result) => {
        if (preflightSeq.current !== seq) return
        if (result?.ok && result.body) {
          setPreflight(result.body)
          setPreflightError(false)
        } else {
          setPreflight(null)
          setPreflightError(true)
        }
      })
      .catch(() => {
        if (preflightSeq.current !== seq) return
        setPreflight(null)
        setPreflightError(true)
      })
      .finally(() => {
        if (preflightSeq.current === seq) setPreflighting(false)
      })
  }, [path, onPreflight])

  const trimmed = name.trim()
  const trimmedPath = path.trim()
  const dirNeedsPreflight = trimmedPath !== ''
  const dirReady = !dirNeedsPreflight || (Boolean(preflight?.action) && !preflightError && !preflighting)
  const canSubmit = trimmed !== '' && trimmed.length <= MAX_PROJECT_TITLE_LENGTH && !busy && !picking && !preflighting && dirReady
  const folderName = extractFolderName(trimmedPath)
  const mode = trimmedPath !== '' ? 'workspace' : 'independent'
  const preflightMeta = trimmedPath !== '' ? PREFLIGHT_ACTIONS[preflight?.action] : PREFLIGHT_ACTIONS['create-independent']
  const statusKey = trimmedPath === ''
    ? 'projects.preflight.independent'
    : (preflightMeta?.status || 'projects.preflight.failed')
  const submitKey = preflightMeta?.submit || 'projects.dialog.submit'
  const statusText = String(t(statusKey) || '')
    .replace('{title}', preflight?.project?.title || '')

  const submit = () => {
    if (!canSubmit) return
    void Promise.resolve(onSubmit({
      title: trimmed,
      mode,
      ...(mode === 'workspace' ? { workspaceDir: trimmedPath } : {}),
    })).catch(() => {})
  }

  const applyPickedPath = (nextPath) => {
    const next = typeof nextPath === 'string' ? nextPath.trim() : ''
    if (next === '') return
    setPath(next)
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
          onClick={() => { setPath('') }}
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
            {t(submitKey) || t('projects.dialog.submit') || '创建项目'}
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

        {trimmedPath !== '' ? (
          <p
            className="omnimux-new-project-preflight"
            data-omnimux-new-project-preflight={preflight?.state || (preflighting ? 'checking' : 'failed')}
            data-preflight-state={preflight?.state || (preflighting ? 'checking' : 'failed')}
            data-preflight-action={preflight?.action || ''}
            aria-live="polite"
          >
            {preflighting ? (t('projects.preflight.checking') || '正在检查该目录…') : statusText}
          </p>
        ) : (
          <p className="omnimux-new-project-preflight" data-omnimux-new-project-preflight="independent">
            {t('projects.preflight.independent') || '将作为独立项目创建在默认库，不绑定工作区。'}
          </p>
        )}

        {pickError ? <p className="omnimux-workflow-form-error">{pickError}</p> : null}
        {error ? <p className="omnimux-workflow-form-error">{error}</p> : null}
      </div>
    </ModalDialog>
  )
}
