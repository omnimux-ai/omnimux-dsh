import { Button, IconButton, InputField } from 'dsh-ui-kit'
import { CloseIcon, FileIcon } from './icons.jsx'

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

/** 可预览的媒体行：有预览地址时给出缩略图，没有时退回文件图标。 */
function MediaThumb(props) {
  const { src, label } = props
  if (!src) return <FileIcon size={14} />
  return (
    <img
      className="omnimux-products-media-thumb"
      src={src}
      alt={label}
      loading="lazy"
    />
  )
}

/**
 * One media row. The row currently serving as the cover carries a visible
 * selected state — a badge and a left rule — so "which one is the cover" is
 * readable at a glance rather than inferred from a button label.
 */
export function MediaItem(props) {
  const { t, file, index, actions, previewOf } = props
  const coverId = props.coverId || null
  const isCover = Boolean(coverId) && coverId === file.id
  const onSetCover = () => actions.onSetCover(file, index)
  const onRemove = () => actions.onRemove(file, index)
  const label = file.original_name || file.real_path
  const src = typeof previewOf === 'function' ? previewOf(file) : ''

  return (
    <li className={isCover ? 'omnimux-products-filelist-row is-cover' : 'omnimux-products-filelist-row'}>
      <MediaThumb src={src} label={label} />
      <span className="omnimux-products-filelist-name">
        {label}
      </span>
      {isCover ? (
        <span className="omnimux-products-cover-badge">{t('detail.coverBadge')}</span>
      ) : null}
      <Button
        variant={isCover ? 'outline' : 'ghost'}
        size="xs"
        aria-pressed={isCover}
        onClick={onSetCover}
      >
        {t('detail.primary')}
      </Button>
      <IconButton
        variant="ghost"
        size="xs"
        aria-label={t('detail.removeMedia')}
        title={t('detail.removeMedia')}
        onClick={onRemove}
      >
        <CloseIcon size={12} />
      </IconButton>
    </li>
  )
}

export function MediaList(props) {
  const { t, media, coverId, previewOf, actions } = props
  return (
    <ul className="omnimux-products-filelist">
      {media.map((file, index) => (
        <MediaItem
          key={file.id || file.real_path}
          t={t}
          file={file}
          index={index}
          coverId={coverId}
          previewOf={previewOf}
          actions={actions}
        />
      ))}
    </ul>
  )
}

export function CategoriesEditor(props) {
  const { t, categories, tagDraft, disabled = false, actions } = props
  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      actions.onAddTag()
    }
  }

  return (
    <div className="omnimux-products-categories">
      <div className="omnimux-products-label">{t('add.categories')}</div>
      <div className="omnimux-products-tags">
        {categories.map((tag) => (
          <span key={tag} className="omnimux-products-tag">
            {tag}
            <IconButton
              className="omnimux-products-tag-remove"
              variant="ghost"
              size="xs"
              aria-label={t('detail.removeTag').replace('{name}', tag)}
              title={t('detail.removeTag').replace('{name}', tag)}
              disabled={disabled}
              onClick={() => actions.onRemoveTag(tag)}
            >
              <CloseIcon size={10} />
            </IconButton>
          </span>
        ))}
      </div>
      <InputField
        value={tagDraft}
        placeholder={t('add.categoriesPlaceholder')}
        aria-label={t('add.categoriesPlaceholder')}
        disabled={disabled}
        onChange={actions.onDraftChange}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}
