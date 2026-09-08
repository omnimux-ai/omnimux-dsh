import { useEffect, useState } from 'react'
import { Badge, Button, DropdownSelect, IconButton, InputField } from 'dsh-ui-kit'
import { activateRowKeydown } from './a11y.js'
import { listAssetFiles } from './api.js'
import { ASSET_TYPE_KEYS } from './AddAssetDialog.jsx'
import { CloseIcon, FileIcon, FolderIcon } from './icons.jsx'

/**
 * @param {{
 *   t: (key: string) => string,
 *   asset: any,
 *   busy: boolean,
 *   onClose: () => void,
 *   onSave: (patch: object) => void,
 * }} props
 */
export function AssetDetail({ t, asset, busy, onClose, onSave }) {
  const [name, setName] = useState(asset.name)
  const [type, setType] = useState(asset.type)
  const [description, setDescription] = useState(asset.description || '')
  const [browse, setBrowse] = useState(null)

  useEffect(() => {
    setName(asset.name)
    setType(asset.type)
    setDescription(asset.description || '')
    setBrowse(null)
  }, [asset.id, asset.name, asset.type, asset.description])

  return (
    <aside className="omnimux-assets-detail">
      <div className="omnimux-assets-detail-header">
        <h2 className="omnimux-assets-detail-title">{t('detail.title')}</h2>
        <IconButton variant="ghost" size="sm" aria-label={t('detail.close')} onClick={onClose}>
          <CloseIcon size={16} />
        </IconButton>
      </div>
      <div className="omnimux-assets-detail-body">
        <InputField
          label={t('detail.name')}
          value={name}
          disabled={busy}
          onChange={(event) => { setName(event.target.value) }}
        />
        <DropdownSelect
          value={type}
          aria-label={t('detail.type')}
          disabled={busy}
          options={ASSET_TYPE_KEYS.map((key) => ({ value: key, label: t(`type.${key}`) }))}
          onChange={setType}
        />
        <label>
          <div className="omnimux-assets-muted">{t('detail.description')}</div>
          <textarea
            className="omnimux-assets-textarea"
            value={description}
            rows={6}
            disabled={busy}
            onChange={(event) => { setDescription(event.target.value) }}
          />
        </label>
        <div>
          <div className="omnimux-assets-muted">{t('detail.cite')}</div>
          <code className="omnimux-assets-cite">{asset.cite || `@${asset.type}/${asset.name}`}</code>
        </div>
        <div>
          <div className="omnimux-assets-muted">{t('detail.files')}</div>
          {browse ? (
            <FolderBrowse
              t={t}
              assetId={asset.id}
              file={browse.file}
              onBack={() => { setBrowse(null) }}
            />
          ) : (
            <TopFileList t={t} files={asset.files || []} onOpenFolder={(file) => { setBrowse({ file }) }} />
          )}
        </div>
        <Button
          variant="primary"
          disabled={busy || name.trim() === ''}
          loading={busy}
          onClick={() => { onSave({ name: name.trim(), type, description }) }}
        >
          {t('detail.save')}
        </Button>
      </div>
    </aside>
  )
}

function isDirectoryRef(file) {
  return file?.kind === 'directory' || file?.is_dir === true
}

function TopFileList({ t, files, onOpenFolder }) {
  if (files.length === 0) {
    return <p className="omnimux-assets-muted">—</p>
  }
  return (
    <ul className="omnimux-assets-filelist">
      {files.map((file) => {
        const folder = isDirectoryRef(file)
        const activate = folder ? () => { onOpenFolder(file) } : undefined
        return (
          <li key={file.id}>
            <Button
              variant="ghost"
              size="xs"
              className="omnimux-assets-focusable"
              disabled={!folder}
              onClick={activate}
              onKeyDown={folder ? activateRowKeydown(activate) : undefined}
            >
              {folder ? <FolderIcon size={14} /> : <FileIcon size={14} />}
              <span className="omnimux-assets-filelist-name">
                {file.original_name || file.real_path}
              </span>
              <Badge size="sm" shape="capsule" variant="neutral" className="omnimux-assets-folder-badge">
                {folder ? t('detail.browse') : t('detail.file')}
              </Badge>
            </Button>
          </li>
        )
      })}
    </ul>
  )
}

function FolderBrowse({ t, assetId, file, onBack }) {
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    void listAssetFiles(assetId, file.id, path).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setError(String(result.body?.message || result.body?.error || `HTTP ${String(result.status)}`))
        setEntries([])
        setLoading(false)
        return
      }
      setEntries(Array.isArray(result.body?.entries) ? result.body.entries : [])
      setLoading(false)
    }).catch((caught) => {
      if (cancelled) return
      setError(caught instanceof Error ? caught.message : String(caught))
      setEntries([])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [assetId, file.id, path])

  const crumbs = path === '' ? [] : path.split('/').filter(Boolean)

  return (
    <div>
      <div className="omnimux-assets-crumbs">
        <Button
          variant="outline"
          size="xs"
          onClick={() => {
            if (path === '') onBack()
            else setPath(crumbs.slice(0, -1).join('/'))
          }}
        >
          {t('detail.back')}
        </Button>
        <Button variant="ghost" size="xs" onClick={() => { setPath('') }}>
          {file.original_name || t('detail.root')}
        </Button>
        {crumbs.map((crumb, index) => (
          <span key={`${crumb}-${index}`} className="omnimux-assets-crumb">
            <span className="omnimux-assets-crumb-sep">/</span>
            <Button variant="ghost" size="xs" onClick={() => { setPath(crumbs.slice(0, index + 1).join('/')) }}>
              {crumb}
            </Button>
          </span>
        ))}
      </div>
      {loading ? <p className="omnimux-assets-muted">{t('loading')}</p> : null}
      {error ? <p className="omnimux-assets-error">{error}</p> : null}
      {!loading && !error && entries.length === 0 ? (
        <p className="omnimux-assets-muted">{t('detail.emptyFolder')}</p>
      ) : null}
      {!loading && entries.length > 0 ? (
        <ul className="omnimux-assets-filelist">
          {entries.map((entry) => {
            const folder = Boolean(entry.is_dir)
            const activate = folder
              ? () => { setPath(entry.relative_path || [path, entry.name].filter(Boolean).join('/')) }
              : undefined
            return (
              <li key={String(entry.relative_path || entry.name)}>
                <Button
                  variant="ghost"
                  size="xs"
                  className="omnimux-assets-focusable"
                  disabled={!folder}
                  onClick={activate}
                  onKeyDown={folder ? activateRowKeydown(activate) : undefined}
                >
                  {folder ? <FolderIcon size={14} /> : <FileIcon size={14} />}
                  <span className="omnimux-assets-filelist-name">{entry.name}</span>
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
