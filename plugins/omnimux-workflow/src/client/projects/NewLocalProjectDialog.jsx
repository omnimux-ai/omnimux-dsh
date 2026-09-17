import { useEffect, useRef, useState } from 'react'
import { Button, InputField, ModalDialog } from 'dsh-ui-kit'
import { MAX_PROJECT_TITLE_LENGTH } from './limits.js'

function extractFolderName(p) {
  if (typeof p !== 'string' || !p.trim()) return ''
  const clean = p.trim().replace(/[/\\]+$/, '')
  const idx = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  return idx >= 0 ? clean.slice(idx + 1) : clean
}

/**
 * 「新建本地项目」overlay。token 走 --dsw-alias-*（消费 dsh-ui-kit）。
 * P0 只收名称；目录路径为可选，留空则 Host 写入默认项目库。
 * 支持传入 initialPath（当前会话物理工作区路径）与 initialTitle 自动预填。
 *
 * @param {{
 *   t: (key: string) => string,
 *   busy?: boolean,
 *   error?: string,
 *   initialPath?: string,
 *   initialTitle?: string,
 *   onCancel: () => void,
 *   onSubmit: (payload: { title: string, projectRoot?: string }) => void,
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
}) {
  const nameRef = useRef(null)
  const defaultTitle = initialTitle || extractFolderName(initialPath)
  const [name, setName] = useState(defaultTitle)
  const [path, setPath] = useState(initialPath || '')

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const trimmed = name.trim()
  const trimmedPath = path.trim()
  const canSubmit = trimmed !== '' && trimmed.length <= MAX_PROJECT_TITLE_LENGTH && !busy

  const submit = () => {
    if (!canSubmit) return
    onSubmit({
      title: trimmed,
      ...(trimmedPath !== '' ? { projectRoot: trimmedPath } : {}),
    })
  }

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
        <InputField
          ref={nameRef}
          id="omnimux-new-local-project-name"
          label={t('projects.dialog.nameLabel')}
          value={name}
          maxLength={MAX_PROJECT_TITLE_LENGTH}
          placeholder={t('projects.dialog.namePlaceholder')}
          hint={t('projects.dialog.hint')}
          disabled={busy}
          required
          onChange={(event) => { setName(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canSubmit) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <InputField
          id="omnimux-new-local-project-path"
          label={t('projects.dialog.pathLabel')}
          value={path}
          placeholder={t('projects.dialog.pathPlaceholder')}
          hint={t('projects.dialog.pathHint')}
          disabled={busy}
          onChange={(event) => { setPath(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canSubmit) {
              event.preventDefault()
              submit()
            }
          }}
        />
        {error ? <p className="omnimux-workflow-form-error">{error}</p> : null}
      </div>
    </ModalDialog>
  )
}
