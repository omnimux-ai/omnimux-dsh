import { useEffect, useRef, useState } from 'react'
import { Button, IconButton } from 'dsh-ui-kit'
import { activateRowKeydown } from './a11y.js'
import { CheckIcon, FileIcon, EyeIcon, ChatIcon } from './icons.jsx'
import { previewUrl } from './api.js'
import { pickCoverFile, addAssetToConversation } from './add-to-chat.js'
import { isFolderAsset, resolveAssetMediaPreview } from './asset-routing.js'

/**
 * @param {{
 *   asset: any,
 *   t: (key: string) => string,
 *   selected?: boolean,
 *   onToggleSelect?: (asset: any) => void,
 *   onOpen: (asset: any) => void,
 *   onPreview?: (item: any) => void,
 *   onAddToConversation?: (asset: any) => void,
 *   missing?: boolean,
 * }} props
 */
function AssetGridCard({ asset, t, selected, onToggleSelect, onOpen, onPreview, onAddToConversation, missing }) {
  const [broken, setBroken] = useState(false)
  const [added, setAdded] = useState(false)
  const timerRef = useRef(null)

  const coverFile = pickCoverFile(asset)

  useEffect(() => {
    setBroken(false)
  }, [asset?.id, coverFile?.id])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const src = coverFile && !broken ? previewUrl(asset.id, coverFile.id) : ''

  const handleTriggerAction = () => {
    if (isFolderAsset(asset)) {
      onOpen(asset)
    } else if (typeof onPreview === 'function') {
      onPreview(resolveAssetMediaPreview(asset))
    } else {
      onOpen(asset)
    }
  }

  const handleView = (event) => {
    event.stopPropagation()
    handleTriggerAction()
  }

  const handleAdd = (event) => {
    event.stopPropagation()
    if (added) return
    if (typeof onAddToConversation === 'function') {
      onAddToConversation(asset)
    } else {
      addAssetToConversation(asset)
    }
    setAdded(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setAdded(false)
    }, 1800)
  }

  return (
    <article
      className="omnimux-assets-focusable omnimux-assets-card"
      tabIndex={0}
      role="button"
      aria-selected={selected ? 'true' : 'false'}
      onClick={handleTriggerAction}
      onKeyDown={activateRowKeydown(handleTriggerAction)}
    >
      <div className="omnimux-assets-card-thumb">
        {onToggleSelect ? (
          <IconButton
            variant="ghost"
            size="xs"
            className="omnimux-assets-check"
            data-selected={selected ? 'true' : 'false'}
            aria-label={t('select.toggle')}
            aria-pressed={selected ? 'true' : 'false'}
            title=""
            onClick={(event) => {
              event.stopPropagation()
              onToggleSelect(asset)
            }}
          >
            {selected ? <CheckIcon size={12} /> : <span />}
          </IconButton>
        ) : null}
        {src ? (
          <img
            src={src}
            className="omnimux-assets-card-media"
            alt=""
            onError={() => setBroken(true)}
          />
        ) : (
          <FileIcon size={22} />
        )}
        <span className="omnimux-assets-badge">{t(`type.${asset.type}`)}</span>
        {missing ? <span className="omnimux-assets-missing">{t('card.missing')}</span> : null}
        <div className="omnimux-assets-card-overlay">
          <div className="omnimux-assets-card-overlay-actions">
            <button
              type="button"
              className="omnimux-assets-overlay-btn omnimux-assets-overlay-btn--secondary"
              aria-label={t('card.view')}
              onClick={handleView}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleView(event)
                }
              }}
            >
              <EyeIcon size={14} />
              <span>{t('card.view')}</span>
            </button>
            <button
              type="button"
              className="omnimux-assets-overlay-btn omnimux-assets-overlay-btn--primary"
              aria-label={added ? t('card.addedToConversation') : t('card.addToConversation')}
              disabled={added}
              onClick={handleAdd}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleAdd(event)
                }
              }}
            >
              <ChatIcon size={14} />
              <span>{added ? t('card.addedToConversation') : t('card.addToConversation')}</span>
            </button>
          </div>
        </div>
      </div>
      <div className="omnimux-assets-card-body">
        <div className="omnimux-assets-card-title">{asset.name}</div>
        <div className="omnimux-assets-card-desc">{asset.description || '—'}</div>
      </div>
    </article>
  )
}

/**
 * @param {{
 *   asset: any,
 *   t: (key: string) => string,
 *   selected?: boolean,
 *   onToggleSelect?: (asset: any) => void,
 *   onOpen: (asset: any) => void,
 *   onPreview?: (item: any) => void,
 *   onAddToConversation?: (asset: any) => void,
 *   missing?: boolean,
 * }} props
 */
function AssetListRow({ asset, t, selected, onToggleSelect, onOpen, onPreview, onAddToConversation, missing }) {
  const [added, setAdded] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleTriggerAction = () => {
    if (isFolderAsset(asset)) {
      onOpen(asset)
    } else if (typeof onPreview === 'function') {
      onPreview(resolveAssetMediaPreview(asset))
    } else {
      onOpen(asset)
    }
  }

  const handleView = (event) => {
    event.stopPropagation()
    handleTriggerAction()
  }

  const handleAdd = (event) => {
    event.stopPropagation()
    if (added) return
    if (typeof onAddToConversation === 'function') {
      onAddToConversation(asset)
    } else {
      addAssetToConversation(asset)
    }
    setAdded(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setAdded(false)
    }, 1800)
  }

  return (
    <tr
      className="omnimux-assets-list-row"
      aria-selected={selected ? 'true' : 'false'}
      onClick={handleTriggerAction}
    >
      <td className="omnimux-assets-td-check" onClick={(e) => e.stopPropagation()}>
        {onToggleSelect ? (
          <IconButton
            variant="ghost"
            size="xs"
            aria-label={t('select.toggle')}
            aria-pressed={selected ? 'true' : 'false'}
            onClick={() => onToggleSelect(asset)}
          >
            {selected ? <CheckIcon size={12} /> : <span />}
          </IconButton>
        ) : null}
      </td>
      <td className="omnimux-assets-td-name">
        <div className="omnimux-assets-list-cell-name">
          <FileIcon size={16} />
          <span>{asset.name}</span>
        </div>
      </td>
      <td className="omnimux-assets-td-type">
        <span className="omnimux-assets-badge omnimux-assets-list-badge">
          {t(`type.${asset.type}`)}
        </span>
      </td>
      <td className="omnimux-assets-td-desc">
        {asset.description || '—'}
      </td>
      <td className="omnimux-assets-td-files">
        {asset.files?.length ? `${asset.files.length} 个素材` : '无素材'}
        {missing ? <span className="omnimux-assets-missing omnimux-assets-list-missing">{t('card.missing')}</span> : null}
      </td>
      <td className="omnimux-assets-td-actions" onClick={(e) => e.stopPropagation()}>
        <div className="omnimux-assets-list-actions">
          <Button
            variant="ghost"
            size="xs"
            leadingIcon={<EyeIcon size={14} />}
            onClick={handleView}
          >
            {t('card.view')}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            leadingIcon={<ChatIcon size={14} />}
            disabled={added}
            onClick={handleAdd}
          >
            {added ? t('card.addedToConversation') : t('card.addToConversation')}
          </Button>
        </div>
      </td>
    </tr>
  )
}

/**
 * @param {{
 *   t: (key: string) => string,
 *   assets: any[],
 *   emptyLabel: string,
 *   emptyActionLabel?: string,
 *   showEmptyAction?: boolean,
 *   onEmptyAction?: () => void,
 *   onOpen: (asset: any) => void,
 *   onPreview?: (item: any) => void,
 *   onAddToConversation?: (asset: any) => void,
 *   selectedIds?: Set<string>,
 *   onToggleSelect?: (asset: any) => void,
 *   viewMode?: 'grid' | 'list',
 *   onCopy?: (asset: any) => void,
 *   onRemove?: (asset: any) => void,
 *   copiedId?: string,
 *   onBrowse?: (asset: any) => void,
 * }} props
 */
export function AssetGrid({
  t,
  assets,
  emptyLabel,
  emptyActionLabel,
  showEmptyAction = true,
  onEmptyAction,
  onOpen,
  onPreview,
  onAddToConversation,
  selectedIds,
  onToggleSelect,
  viewMode = 'grid',
}) {
  if (assets.length === 0) {
    return (
      <div className="omnimux-assets-empty">
        <p>{emptyLabel}</p>
        {emptyActionLabel && onEmptyAction && showEmptyAction ? (
          <Button variant="primary" size="sm" onClick={onEmptyAction}>
            {emptyActionLabel}
          </Button>
        ) : null}
      </div>
    )
  }

  if (viewMode === 'list') {
    return (
      <div className="omnimux-assets-list-wrap">
        <table className="omnimux-assets-list-table">
          <thead>
            <tr>
              <th className="omnimux-assets-th-check" />
              <th className="omnimux-assets-th-name">{t('detail.name')}</th>
              <th className="omnimux-assets-th-type">{t('detail.type')}</th>
              <th className="omnimux-assets-th-desc">{t('detail.description')}</th>
              <th className="omnimux-assets-th-files">{t('detail.files')}</th>
              <th className="omnimux-assets-th-actions">{t('card.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const selected = selectedIds?.has(asset.id)
              const missing = Number(asset.missing_file_count) > 0 && (!asset.files || asset.files.length === 0)
              return (
                <AssetListRow
                  key={asset.id}
                  asset={asset}
                  t={t}
                  selected={selected}
                  onToggleSelect={onToggleSelect}
                  onOpen={onOpen}
                  onPreview={onPreview}
                  onAddToConversation={onAddToConversation}
                  missing={missing}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="omnimux-assets-grid">
      {assets.map((asset) => {
        const missing = Number(asset.missing_file_count) > 0 && (!asset.files || asset.files.length === 0)
        const selected = selectedIds?.has(asset.id)
        return (
          <AssetGridCard
            key={asset.id}
            asset={asset}
            t={t}
            selected={selected}
            onToggleSelect={onToggleSelect}
            onOpen={onOpen}
            onPreview={onPreview}
            onAddToConversation={onAddToConversation}
            missing={missing}
          />
        )
      })}
    </div>
  )
}
