import { useEffect, useState } from 'react'
import { Button, DropdownSelect, InputField, ModalDialog } from 'dsh-ui-kit'
import { ASSET_TYPE_KEYS } from './AddAssetDialog.jsx'

/**
 * Asset detail modal dialog: displays and edits asset metadata (name, type, description, citation)
 * without displaying related media files, adhering to shared UI kit standards.
 *
 * @param {{
 *   open?: boolean,
 *   t: (key: string) => string,
 *   asset: any,
 *   busy: boolean,
 *   onClose: () => void,
 *   onSave: (patch: { name: string, type: string, description: string }) => void,
 * }} props
 */
export function AssetDetail({ open = true, t, asset, busy, onClose, onSave }) {
  const [name, setName] = useState(asset?.name || '')
  const [type, setType] = useState(asset?.type || 'character')
  const [description, setDescription] = useState(asset?.description || '')

  useEffect(() => {
    if (asset) {
      setName(asset.name || '')
      setType(asset.type || 'character')
      setDescription(asset.description || '')
    }
  }, [asset?.id, asset?.name, asset?.type, asset?.description])

  if (!asset) return null

  const canSave = name.trim() !== '' && !busy
  const typeLabel = t(`type.${type}`) || type
  const citePreview = asset.cite && asset.name === name.trim() && asset.type === type
    ? asset.cite
    : `@${typeLabel}/${name.trim() || asset.name}`

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={t('detail.title')}
      closeLabel={t('detail.close')}
      size="md"
      footer={(
        <Button
          variant="primary"
          disabled={!canSave}
          loading={busy}
          onClick={() => {
            onSave({ name: name.trim(), type, description })
          }}
        >
          {t('detail.save')}
        </Button>
      )}
    >
      <div className="omnimux-assets-detail-dialog-body">
        <div className="omnimux-assets-detail-field">
          <InputField
            label={t('detail.name')}
            value={name}
            disabled={busy}
            onChange={(event) => { setName(event.target.value) }}
          />
        </div>
        <div className="omnimux-assets-detail-field">
          <DropdownSelect
            value={type}
            aria-label={t('detail.type')}
            disabled={busy}
            options={ASSET_TYPE_KEYS.map((key) => ({ value: key, label: t(`type.${key}`) }))}
            onChange={setType}
          />
        </div>
        <div className="omnimux-assets-detail-field">
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
        </div>
        <div className="omnimux-assets-detail-field">
          <div className="omnimux-assets-muted">{t('detail.cite')}</div>
          <code className="omnimux-assets-cite">{citePreview}</code>
        </div>
      </div>
    </ModalDialog>
  )
}

export const AssetDetailDialog = AssetDetail
