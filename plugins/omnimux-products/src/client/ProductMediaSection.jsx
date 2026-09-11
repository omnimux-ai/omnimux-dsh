import { Button, IconButton, InputField } from 'dsh-ui-kit'
import { FileIcon } from './icons.jsx'

export function CoverDropzone(props) {
  const { t, onAddPaths, onPick } = props
  const handleDragOver = (event) => {
    event.preventDefault()
  }
  const handleDrop = (event) => {
    event.preventDefault()
    const dropped = Array.from(event.dataTransfer?.files || [])
    const paths = dropped.map((file) => (typeof file.path === 'string' ? file.path : '')).filter(Boolean)
    onAddPaths(paths)
  }
  const handlePick = () => {
    void onPick('file').then(onAddPaths)
  }

  return (
    <div
      className="omnimux-products-drop"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <FileIcon size={22} />
      {t('add.drop')}
      <Button
        variant="outline"
        size="sm"
        onClick={handlePick}
      >
        {t('add.pickFiles')}
      </Button>
    </div>
  )
}

export function MediaItem(props) {
  const { t, file, index, actions } = props
  const onSetCover = () => actions.onSetCover(file, index)
  const onRemove = () => actions.onRemove(file, index)

  return (
    <li>
      <FileIcon size={14} />
      <span className="omnimux-products-filelist-name">
        {file.original_name || file.real_path}
      </span>
      <Button
        variant="ghost"
        size="xs"
        onClick={onSetCover}
      >
        {t('detail.primary')}
      </Button>
      <IconButton
        variant="ghost"
        size="xs"
        aria-label={t('remove.confirm')}
        onClick={onRemove}
      >
        × {/* exempt-ui04: 历史存量待迁移为矢量SVG */}
      </IconButton>
    </li>
  )
}

export function MediaList(props) {
  const { t, media, coverId, actions } = props
  return (
    <ul className="omnimux-products-filelist">
      {media.map((file, index) => (
        <MediaItem
          key={file.id || file.real_path}
          t={t}
          file={file}
          index={index}
          coverId={coverId}
          actions={actions}
        />
      ))}
    </ul>
  )
}

export function CategoriesEditor(props) {
  const { t, categories, tagDraft, actions } = props
  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      actions.onAddTag()
    }
  }

  return (
    <div>
      <div className="omnimux-products-label">{t('add.categories')}</div>
      <div className="omnimux-products-tags">
        {categories.map((tag) => (
          <span key={tag} className="omnimux-products-tag">
            {tag}
            <IconButton
              variant="ghost"
              size="xs"
              aria-label={t('remove.confirm')}
              onClick={() => actions.onRemoveTag(tag)}
            >
              × {/* exempt-ui04: 历史存量待迁移为矢量SVG */}
            </IconButton>
          </span>
        ))}
      </div>
      <InputField
        value={tagDraft}
        placeholder={t('add.categoriesPlaceholder')}
        onChange={actions.onDraftChange}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}
