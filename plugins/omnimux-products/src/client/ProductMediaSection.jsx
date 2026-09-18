import { useEffect, useState } from 'react'
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

/** 全屏无损大图灯箱预览 */
export function ImageLightbox(props) {
  const { src, label, onClose, t } = props

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!src) return null

  return (
    <div
      className="omnimux-products-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={label || (typeof t === 'function' ? t('detail.zoomPreview') : '查看大图')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="omnimux-products-lightbox-container">
        <img
          className="omnimux-products-lightbox-image"
          src={src}
          alt={label}
        />
        {label ? (
          <div className="omnimux-products-lightbox-caption">
            <span className="omnimux-products-lightbox-name">{label}</span>
          </div>
        ) : null}
      </div>
      <IconButton
        className="omnimux-products-lightbox-close"
        variant="ghost"
        size="md"
        aria-label={typeof t === 'function' ? t('detail.closePreview') : '关闭预览'}
        title={typeof t === 'function' ? t('detail.closePreview') : '关闭预览'}
        onClick={onClose}
      >
        <CloseIcon size={18} />
      </IconButton>
    </div>
  )
}

/**
 * 可预览的媒体行缩略图：
 * - 有预览地址时给出缩略图；
 * - 鼠标悬停显示放大浮窗（Hover Popover）；
 * - 点击缩略图触发 onViewLarge 打开全屏大图灯箱；
 * - 没有预览地址时退回文件图标。
 */
export function MediaThumb(props) {
  const { src, label, onViewLarge, t } = props
  if (!src) return <FileIcon size={14} />

  const handleClick = (e) => {
    e.stopPropagation()
    if (typeof onViewLarge === 'function') {
      onViewLarge(src, label)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick(e)
    }
  }

  const zoomHint = typeof t === 'function' ? t('detail.zoomPreview') : '点击查看大图'

  return (
    <div className="omnimux-products-thumb-wrap">
      <div
        role="button"
        tabIndex={0}
        className="omnimux-products-thumb-button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label={`${zoomHint}: ${label}`}
        title={zoomHint}
      >
        <img
          className="omnimux-products-media-thumb"
          src={src}
          alt={label}
          loading="lazy"
        />
      </div>
      <div className="omnimux-products-thumb-popover" aria-hidden="true">
        <img
          className="omnimux-products-popover-image"
          src={src}
          alt={label}
        />
        <div className="omnimux-products-popover-footer">
          <span className="omnimux-products-popover-hint">{zoomHint}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * One media row. The row currently serving as the cover carries a visible
 * selected state — a badge and a left rule — so "which one is the cover" is
 * readable at a glance rather than inferred from a button label.
 */
export function MediaItem(props) {
  const { t, file, index, actions, previewOf, onViewLarge } = props
  const coverId = props.coverId || null
  const isCover = Boolean(coverId) && coverId === file.id
  const onSetCover = () => actions.onSetCover(file, index)
  const onRemove = () => actions.onRemove(file, index)
  const label = file.original_name || file.real_path
  const src = typeof previewOf === 'function' ? previewOf(file) : ''

  return (
    <li className={isCover ? 'omnimux-products-filelist-row is-cover' : 'omnimux-products-filelist-row'}>
      <MediaThumb src={src} label={label} onViewLarge={onViewLarge} t={t} />
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
  const [activeLightbox, setActiveLightbox] = useState(null)

  const handleViewLarge = (src, label) => {
    setActiveLightbox({ src, label })
  }

  const handleCloseLightbox = () => {
    setActiveLightbox(null)
  }

  return (
    <>
      <ul className="omnimux-products-filelist">
        {media.map((file, index) => (
          <MediaItem
            key={file.id || file.real_path}
            t={t}
            file={file}
            index={index}
            coverId={coverId}
            previewOf={previewOf}
            onViewLarge={handleViewLarge}
            actions={actions}
          />
        ))}
      </ul>
      {activeLightbox ? (
        <ImageLightbox
          src={activeLightbox.src}
          label={activeLightbox.label}
          onClose={handleCloseLightbox}
          t={t}
        />
      ) : null}
    </>
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
