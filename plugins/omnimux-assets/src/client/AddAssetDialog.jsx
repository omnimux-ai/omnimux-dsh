import { useEffect, useRef, useState } from 'react'
import { Badge, Button, DropdownSelect, IconButton, InputField, ModalDialog } from 'dsh-ui-kit'
import { FileIcon, FolderIcon } from './icons.jsx'

export const ASSET_TYPE_KEYS = ['character', 'scene', 'style', 'prop', 'knowledge', 'custom']

/**
 * Create-asset sheet: name + type + description + path refs + optional tags.
 * @param {{
 *   t: (key: string) => string,
 *   busy: boolean,
 *   presetType?: string,
 *   error?: string,
 *   onCancel: () => void,
 *   onPick: (kind: 'file' | 'directory') => Promise<string[]>,
 *   onSubmit: (payload: { name: string, type: string, description: string, tags: string[], files: { real_path: string }[] }) => void,
 * }} props
 */
export function AddAssetDialog({ t, busy, presetType = 'character', error, onCancel, onPick, onSubmit }) {
  const nameRef = useRef(null)
  const [name, setName] = useState('')
  const [type, setType] = useState(ASSET_TYPE_KEYS.includes(presetType) ? presetType : 'character')
  const [description, setDescription] = useState('')
  const [tagsOpen, setTagsOpen] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [tags, setTags] = useState([])
  const [files, setFiles] = useState([])

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const addTag = () => {
    const next = tagDraft.trim()
    if (!next) return
    if (tags.some((tag) => tag.toLowerCase() === next.toLowerCase())) {
      setTagDraft('')
      return
    }
    setTags([...tags, next])
    setTagDraft('')
  }

  const addPaths = (paths) => {
    const next = Array.isArray(paths) ? paths.filter((path) => typeof path === 'string' && path !== '') : []
    if (next.length === 0) return
    setFiles((current) => {
      const seen = new Set(current.map((file) => file.real_path))
      const extra = []
      for (const path of next) {
        if (seen.has(path)) continue
        seen.add(path)
        extra.push({ real_path: path })
      }
      return extra.length === 0 ? current : [...current, ...extra]
    })
  }

  const looksLikeFolder = (path) => typeof path === 'string' && /\/$/.test(path)
  const canSubmit = name.trim() !== '' && !busy
  const typeOptions = ASSET_TYPE_KEYS.map((key) => ({ value: key, label: t(`type.${key}`) }))

  return (
    <ModalDialog
      open
      onClose={onCancel}
      title={t('add.title')}
      closeLabel={t('stage.close')}
      size="lg"
      footer={(
        <Button
          variant="primary"
          disabled={!canSubmit}
          loading={busy}
          onClick={() => {
            onSubmit({
              name: name.trim(),
              type,
              description,
              tags,
              files,
            })
          }}
        >
          {t('add.submit')}
        </Button>
      )}
    >
      <div className="omnimux-assets-form">
        <div className="omnimux-assets-name-row">
          <span className="omnimux-assets-at" aria-hidden="true">@</span>
          <InputField
            ref={nameRef}
            className="omnimux-assets-name-field"
            value={name}
            placeholder={t('add.namePlaceholder')}
            disabled={busy}
            onChange={(event) => { setName(event.target.value) }}
          />
        </div>
        <div className="omnimux-assets-type-row">
          <DropdownSelect
            value={type}
            options={typeOptions}
            aria-label={t('detail.type')}
            disabled={busy}
            onChange={setType}
          />
          <span className="omnimux-assets-type-sep" aria-hidden="true">|</span>
          <InputField
            className="omnimux-assets-desc-field"
            value={description}
            placeholder={t('add.descriptionPlaceholder')}
            disabled={busy}
            onChange={(event) => { setDescription(event.target.value) }}
          />
        </div>
        <div
          className="omnimux-assets-drop"
          onDragOver={(event) => { event.preventDefault() }}
          onDrop={(event) => {
            event.preventDefault()
            const dropped = Array.from(event.dataTransfer?.files ?? [])
            addPaths(dropped.map((file) => (typeof file.path === 'string' ? file.path : '')).filter(Boolean))
          }}
        >
          <FileIcon size={22} />
          {t('add.drop')}
          <div className="omnimux-assets-drop-actions">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => { void onPick('file').then(addPaths) }}>
              {t('add.pickFiles')}
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => { void onPick('directory').then(addPaths) }}>
              {t('add.pickFolders')}
            </Button>
          </div>
        </div>
        {files.length > 0 ? (
          <ul className="omnimux-assets-filelist">
            {files.map((file) => (
              <li key={file.real_path}>
                {looksLikeFolder(file.real_path) ? <FolderIcon size={14} /> : <FileIcon size={14} />}
                <span className="omnimux-assets-filelist-name">{file.real_path}</span>
                {looksLikeFolder(file.real_path) ? (
                  <Badge size="sm" shape="capsule" variant="neutral" className="omnimux-assets-folder-badge">{t('add.folderBadge')}</Badge>
                ) : null}
                <IconButton
                  variant="ghost"
                  size="xs"
                  aria-label={t('mapping.remove')}
                  onClick={() => { setFiles((current) => current.filter((row) => row.real_path !== file.real_path)) }}
                >
                  × {/* exempt-ui04: 历史存量待迁移为矢量SVG */}
                </IconButton>
              </li>
            ))}
          </ul>
        ) : null}
        <div>
          <Button variant="ghost" size="sm" onClick={() => { setTagsOpen(!tagsOpen) }}>
            {tagsOpen ? '▾' : '▸'} {t('add.tags')}
          </Button>
          {tagsOpen ? (
            <div>
              <div className="omnimux-assets-tags">
                {tags.map((tag) => (
                  <Badge key={tag} size="sm" shape="capsule" variant="neutral" className="omnimux-assets-tag">
                    {tag}
                    <IconButton
                      variant="ghost"
                      size="xs"
                      aria-label={t('mapping.remove')}
                      onClick={() => { setTags(tags.filter((item) => item !== tag)) }}
                    >
                      × {/* exempt-ui04: 历史存量待迁移为矢量SVG */}
                    </IconButton>
                  </Badge>
                ))}
              </div>
              <InputField
                value={tagDraft}
                placeholder={t('add.tagsPlaceholder')}
                disabled={busy}
                onChange={(event) => { setTagDraft(event.target.value) }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addTag()
                  }
                }}
              />
            </div>
          ) : null}
        </div>
        {error ? <p className="omnimux-assets-error">{error}</p> : null}
      </div>
    </ModalDialog>
  )
}
