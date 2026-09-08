import { useEffect, useState } from 'react'
import { Button, DropdownSelect, IconButton, InputField } from 'dsh-ui-kit'
import { ASSET_TYPE_KEYS } from './AddAssetDialog.jsx'
import { AssetBrowse } from './AssetBrowse.jsx'
import { isFolderAsset } from './asset-routing.js'
import { CloseIcon, FileIcon } from './icons.jsx'

/**
 * @param {{
 *   t: (key: string) => string,
 *   asset: any,
 *   busy: boolean,
 *   onClose: () => void,
 *   onSave: (patch: object) => void,
 *   onPreview?: (item: any) => void,
 * }} props
 */
export function AssetDetail({ t, asset, busy, onClose, onSave, onPreview }) {
  const [name, setName] = useState(asset.name)
  const [type, setType] = useState(asset.type)
  const [description, setDescription] = useState(asset.description || '')

  useEffect(() => {
    setName(asset.name)
    setType(asset.type)
    setDescription(asset.description || '')
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
          {isFolderAsset(asset) ? (
            <AssetBrowse key={asset.id} t={t} asset={asset} onBack={onClose} onPreview={onPreview} />
          ) : !asset.files?.length ? (
            <p className="omnimux-assets-muted">—</p>
          ) : (
            <ul className="omnimux-assets-filelist">
              {(asset.files || []).map((file) => (
                <li key={file.id}>
                  <Button variant="ghost" size="xs" disabled>
                    <FileIcon size={14} />
                    <span className="omnimux-assets-filelist-name">{file.original_name || file.real_path}</span>
                    <span className="omnimux-assets-folder-badge">{t('detail.file')}</span>
                  </Button>
                </li>
              ))}
            </ul>
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
