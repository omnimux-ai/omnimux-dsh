import { useEffect, useRef, useState } from 'react'
import { Button, ModalDialog } from 'dsh-ui-kit'
import { parseLocalPaths } from './path-selection.js'

const CSS = `
.omx-local-path-pick { display:flex; flex-direction:column; gap:10px; min-width:0; }
.omx-local-path-pick label { font-size:13px; font-weight:500; color:var(--dsw-alias-label-primary); }
.omx-local-path-pick textarea {
  box-sizing:border-box; width:100%; min-height:144px; max-height:45vh; resize:vertical;
  padding:10px 12px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary);
  font:12px/18px ui-monospace, monospace; transition:border-color .12s, box-shadow .12s;
}
.omx-local-path-pick textarea:focus-visible {
  outline:none; border-color:var(--dsw-alias-brand-primary);
  box-shadow:0 0 0 2px var(--dsw-alias-state-business-tertiary);
}
.omx-local-path-pick p { margin:0; font-size:12px; line-height:18px; color:var(--dsw-alias-label-secondary); }
.omx-local-path-pick [role="alert"] { color:var(--dsw-alias-state-error-primary); white-space:pre-wrap; overflow-wrap:anywhere; }
.omx-local-path-pick__footer { display:flex; width:100%; align-items:center; justify-content:space-between; gap:12px; }
.omx-local-path-pick__count { font-size:12px; color:var(--dsw-alias-label-secondary); }
.omx-local-path-pick__actions { display:flex; gap:8px; flex:none; }
`

/**
 * Normal product input for paths on the machine running OmniMux.
 * @param {{
 *   onClose: () => void,
 *   t: (key: string, vars?: object) => string,
 *   remaining: number,
 *   onConfirm: (paths: string[]) => Promise<{ remainingPaths: string[], error?: string } | null>,
 * }} props
 */
export function LocalPathPicker({ onClose, t, remaining, onConfirm }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const owner = useRef({ mounted: true, busy: false })
  const input = useRef(null)
  useEffect(() => {
    const instance = owner.current
    instance.mounted = true
    input.current?.focus()
    return () => { instance.mounted = false }
  }, [])
  const { paths, invalid } = parseLocalPaths(text)
  const validation = invalid ? t('composerAdd.pathInvalid')
    : paths.length > remaining ? t('composerAdd.toast.quota') : ''

  const confirm = async () => {
    const instance = owner.current
    if (instance.busy || paths.length === 0 || validation) return
    instance.busy = true
    setBusy(true)
    setError('')
    try {
      const result = await onConfirm(paths)
      if (!instance.mounted || !result) return
      setText(result.remainingPaths.join('\n'))
      setError(result.error || '')
    } catch (cause) {
      if (instance.mounted) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      instance.busy = false
      if (instance.mounted) setBusy(false)
    }
  }

  return (
    <ModalDialog
      open
      onClose={onClose}
      title={t('composerAdd.addFile')}
      closeLabel={t('composerAdd.cancel')}
      footer={(
        <div className="omx-local-path-pick__footer">
          <span className="omx-local-path-pick__count">{t('composerAdd.selectedMeta', { n: paths.length, m: remaining })}</span>
          <span className="omx-local-path-pick__actions">
            <Button variant="outline" onClick={onClose}>{t('composerAdd.cancel')}</Button>
            <Button variant="primary" onClick={() => { void confirm() }} disabled={busy || paths.length === 0 || Boolean(validation)}>
              {busy ? t('composerAdd.importing') : t('composerAdd.confirm')}
            </Button>
          </span>
        </div>
      )}
    >
      <style>{CSS}</style>
      <div className="omx-local-path-pick">
        <label htmlFor="omx-local-path-input">{t('composerAdd.pathLabel')}</label>
        <textarea
          ref={input}
          id="omx-local-path-input"
          aria-describedby="omx-local-path-help"
          aria-invalid={Boolean(validation || error)}
          value={text}
          disabled={busy}
          placeholder={t('composerAdd.pathPlaceholder')}
          onChange={(event) => { setText(event.target.value); setError('') }}
        />
        <p id="omx-local-path-help">{t('composerAdd.pathHelp')}</p>
        {(validation || error) && <p role="alert">{validation || error}</p>}
      </div>
    </ModalDialog>
  )
}
