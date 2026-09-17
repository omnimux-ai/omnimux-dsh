import { useEffect, useState } from 'react'
import { Badge, Button, IconButton } from 'dsh-ui-kit'
import { activateRowKeydown } from './a11y.js'
import { EditIcon, FileIcon, FolderIcon, RevealLocationIcon } from './icons.jsx'
import { listAssetFiles, previewUrl, revealAssetEntry } from './api.js'
import { isDirectoryRef, detectMediaKind, resolveAssetMediaPreview } from './asset-routing.js'
import { useGridColumns } from './use-grid-columns.js'

export { isDirectoryRef }

/**
 * One hanging folder → card click opens that folder's first layer.
 * Mixed files/folders stay on the top list.
 * @param {any} asset
 */
function initialStack(asset) {
  const files = Array.isArray(asset.files) ? asset.files : []
  const folders = files.filter(isDirectoryRef)
  if (folders.length === 1 && files.length === 1) return { file: folders[0], path: '' }
  return null
}

/**
 * Main-pane hierarchical browse after clicking an asset card.
 * Same card grid as the library; images/videos stream from a read-only preview route.
 *
 * @param {{
 *   t: (key: string) => string,
 *   asset: any,
 *   onBack: () => void,
 *   onPreview?: (item: any) => void,
 * }} props
 */
export function AssetBrowse({ t, asset, onBack, onPreview, onEdit }) {
  const [stack, setStack] = useState(() => initialStack(asset))
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // 文件浏览的卡片墙与货架网格共用同一列数规则（封顶 5 列）。
  const [gridRef, gridColumns] = useGridColumns()

  useEffect(() => {
    setStack(initialStack(asset))
    setEntries([])
    setError('')
    setNotice('')
  }, [asset.id])

  /**
   * Hand one entry to the Host so the platform file manager shows it. The Host
   * owns path validation and platform support; a refusal surfaces here as a
   * readable notice instead of a silent no-op.
   * @param {{ fileId: string, subPath: string }} target
   */
  const revealEntry = async (target) => {
    setNotice('')
    const result = await revealAssetEntry(asset.id, target.fileId, target.subPath)
    if (!result.ok) setNotice(t('browse.revealFailed'))
  }

  useEffect(() => {
    if (!stack) return undefined
    let cancelled = false
    setLoading(true)
    setError('')
    void listAssetFiles(asset.id, stack.file.id, stack.path).then((result) => {
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
  }, [asset.id, stack?.file?.id, stack?.path])

  const crumbs = stack
    ? [asset.name, stack.file.original_name || stack.file.real_path, ...String(stack.path || '').split('/').filter(Boolean)]
    : [asset.name]

  const goCrumb = (index) => {
    if (index <= 0) {
      onBack()
      return
    }
    if (!stack) return
    if (index === 1) {
      setStack({ file: stack.file, path: '' })
      return
    }
    const parts = String(stack.path || '').split('/').filter(Boolean)
    setStack({ file: stack.file, path: parts.slice(0, index - 1).join('/') })
  }

  const files = Array.isArray(asset.files) ? asset.files : []

  return (
    <div className="omnimux-assets-browse">
      <div className="omnimux-assets-crumbs">
        <Button
          variant="outline"
          size="xs"
          onClick={() => {
            if (!stack) {
              onBack()
              return
            }
            const parts = String(stack.path || '').split('/').filter(Boolean)
            if (parts.length === 0) setStack(null)
            else setStack({ file: stack.file, path: parts.slice(0, -1).join('/') })
          }}
        >
          {t('browse.back')}
        </Button>
        {crumbs.map((crumb, index) => (
          <span key={`${crumb}-${index}`} className="omnimux-assets-crumb">
            {index > 0 ? <span className="omnimux-assets-crumb-sep">/</span> : null}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => { goCrumb(index) }}
            >
              {crumb}
            </Button>
          </span>
        ))}
        {typeof onEdit === 'function' ? (
          <IconButton
            variant="ghost"
            size="xs"
            aria-label={t('detail.edit')}
            title={t('detail.edit')}
            onClick={onEdit}
            className="omnimux-assets-crumb-edit"
          >
            <EditIcon size={14} />
          </IconButton>
        ) : null}
      </div>

      {notice ? <p className="omnimux-assets-error" role="alert">{notice}</p> : null}

      {stack ? (
        <>
          {loading ? <p className="omnimux-assets-muted">{t('loading')}</p> : null}
          {error ? <p className="omnimux-assets-error">{error}</p> : null}
          {!loading && !error && entries.length === 0 ? <p className="omnimux-assets-muted">{t('detail.emptyFolder')}</p> : null}
          {!loading && entries.length > 0 ? (
            <div ref={gridRef} className="omnimux-assets-grid" data-columns={gridColumns}>
              {entries.map((entry) => {
                const folder = Boolean(entry.is_dir) || isDirectoryRef(entry)
                const kind = detectMediaKind(entry)
                const entryPath = entry.relative_path || [stack.path, entry.name].filter(Boolean).join('/')
                const src = folder ? '' : previewUrl(asset.id, stack.file.id, entryPath)
                return (
                  <MediaCard
                    key={String(entry.relative_path || entry.name)}
                    t={t}
                    title={entry.name}
                    kind={kind}
                    src={src}
                    onReveal={() => revealEntry({ fileId: stack.file.id, subPath: entryPath })}
                    onOpen={folder
                      ? () => {
                          setStack({ file: stack.file, path: entryPath })
                        }
                      : () => {
                          if (typeof onPreview === 'function') {
                            onPreview(resolveAssetMediaPreview(entry, { asset, stack }))
                          }
                        }}
                  />
                )
              })}
            </div>
          ) : null}
        </>
      ) : (
        files.length === 0
          ? <p className="omnimux-assets-muted">{t('browse.empty')}</p>
          : (
            <div ref={gridRef} className="omnimux-assets-grid" data-columns={gridColumns}>
              {files.map((file) => {
                const folder = isDirectoryRef(file)
                const kind = detectMediaKind(file)
                const src = folder ? '' : previewUrl(asset.id, file.id)
                return (
                  <MediaCard
                    key={file.id}
                    t={t}
                    title={file.original_name || file.real_path}
                    kind={kind}
                    src={src}
                    onReveal={() => revealEntry({ fileId: file.id, subPath: '' })}
                    onOpen={folder
                      ? () => { setStack({ file, path: '' }) }
                      : () => {
                          if (typeof onPreview === 'function') {
                            onPreview(resolveAssetMediaPreview(file, { asset }))
                          }
                        }}
                  />
                )
              })}
            </div>
          )
      )}
    </div>
  )
}

/**
 * @param {{
 *   t: (key: string) => string,
 *   title: string,
 *   kind: 'folder' | 'image' | 'video' | 'file',
 *   src?: string,
 *   onOpen?: () => void,
 *   onReveal?: () => void,
 * }} props
 */
function MediaCard({ t, title, kind, src, onOpen, onReveal }) {
  const clickable = typeof onOpen === 'function'
  const activate = clickable ? onOpen : undefined
  const [broken, setBroken] = useState(false)
  const showImage = kind === 'image' && Boolean(src) && !broken
  const showVideo = kind === 'video' && Boolean(src) && !broken
  // A rendered thumbnail already states its own media type, so the badge is
  // reserved for the entries whose type cannot be read off the card face.
  const badge = kind === 'folder'
    ? t('detail.folder')
    : kind === 'file'
      ? t('detail.file')
      : ''
  const revealable = typeof onReveal === 'function'

  const handleReveal = (event) => {
    event.stopPropagation()
    onReveal()
  }

  return (
    <article
      className="omnimux-assets-focusable omnimux-assets-card"
      tabIndex={clickable ? 0 : undefined}
      role={clickable ? 'button' : undefined}
      aria-label={title}
      onClick={activate}
      onKeyDown={clickable ? activateRowKeydown(activate) : undefined}
    >
      <div className="omnimux-assets-card-thumb omnimux-assets-card-thumb--tall">
        {showImage ? (
          <img
            src={src}
            alt=""
            className="omnimux-assets-card-media"
            onError={() => { setBroken(true) }}
          />
        ) : null}
        {showVideo ? (
          <video
            src={src}
            muted
            playsInline
            preload="metadata"
            controls
            aria-label={t('browse.previewVideo')}
            className="omnimux-assets-card-video"
            onClick={(event) => { event.stopPropagation() }}
            onError={() => { setBroken(true) }}
          />
        ) : null}
        {!showImage && !showVideo ? (kind === 'folder' ? <FolderIcon size={28} /> : <FileIcon size={28} />) : null}
        {badge || revealable ? (
          <div className="omnimux-assets-card-corner">
            {badge ? (
              <Badge size="sm" shape="capsule" className="omnimux-assets-badge">{badge}</Badge>
            ) : null}
            {revealable ? (
              <IconButton
                variant="ghost"
                size="xs"
                className="omnimux-assets-reveal"
                aria-label={t('browse.revealLocation')}
                title={t('browse.revealLocation')}
                onClick={handleReveal}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleReveal(event)
                  }
                }}
              >
                <RevealLocationIcon size={14} />
              </IconButton>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="omnimux-assets-card-body">
        <div className="omnimux-assets-card-title">{title}</div>
      </div>
    </article>
  )
}
