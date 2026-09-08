import { useEffect, useMemo, useState } from 'react'
import { Badge, Button } from 'dsh-ui-kit'
import { activateRowKeydown } from './a11y.js'
import { FileIcon, FolderIcon } from './icons.jsx'
import { previewUrl } from './api.js'
import { isDirectoryRef, detectMediaKind, resolveAssetMediaPreview } from './asset-routing.js'
import { BROWSE_PAGE_SIZE, createDirectoryFeed } from './directory-feed.js'

export { isDirectoryRef, BROWSE_PAGE_SIZE }

function initialLocation(asset) {
  const files = asset.files || []
  const logical = files.some((file) => file.logical_path) || Boolean(asset.unavailable_files?.length)
  const file = !logical && files.length === 1 && isDirectoryRef(files[0]) ? files[0] : null
  return { file, path: '', logical: !file }
}

/** Shared card/detail browser. Every displayed layer comes from the paginated route. */
export function AssetBrowse({ t, asset, onBack, onPreview }) {
  const [location, setLocation] = useState(() => initialLocation(asset))
  const feed = useMemo(() => createDirectoryFeed(), [asset.id])
  const [listing, setListing] = useState(() => feed.getSnapshot())
  useEffect(() => feed.subscribe(setListing), [feed])
  useEffect(() => { setLocation(initialLocation(asset)) }, [asset.id])
  useEffect(() => {
    void feed.navigate({ assetId: asset.id, fileId: location.file?.id, path: location.path, logical: location.logical })
  }, [feed, asset.id, location])
  useEffect(() => {
    const refresh = () => { void feed.refresh() }
    window.addEventListener('omnimux-assets-root-changed', refresh)
    return () => window.removeEventListener('omnimux-assets-root-changed', refresh)
  }, [feed])
  const crumbs = location.path.split('/').filter(Boolean)
  const navigate = (path) => setLocation({ ...location, path })
  const goCrumb = (index) => navigate(crumbs.slice(0, index + 1).join('/'))
  const back = () => {
    if (crumbs.length) navigate(crumbs.slice(0, -1).join('/'))
    else if (location.file && (asset.files?.length !== 1 || asset.files?.some((file) => file.logical_path))) setLocation({ file: null, path: '', logical: true })
    else onBack()
  }
  return <div className="omnimux-assets-browse">
    <div className="omnimux-assets-crumbs" aria-label={t('browse.location')}>
      <Button variant="outline" size="xs" onClick={back}>{t('browse.back')}</Button>
      <Button variant="ghost" size="xs" onClick={() => setLocation(initialLocation(asset))}>{asset.name}</Button>
      {location.file && <Button variant="ghost" size="xs" onClick={() => navigate('')}>{location.file.original_name || location.file.id}</Button>}
      {crumbs.map((crumb, index) => <Button key={index} variant="ghost" size="xs" onClick={() => goCrumb(index)}>{crumb}</Button>)}
    </div>
    {asset.unavailable_files?.length > 0 && <p className="omnimux-assets-browse-notice">{t('browse.unavailableNotice')}</p>}
    {listing.loading && <p className="omnimux-assets-muted">{t('loading')}</p>}
    {listing.error && <div role="alert"><p className="omnimux-assets-error">{listing.error}</p><Button onClick={() => { void feed.refresh() }}>{t('storage.retryRead')}</Button></div>}
    {!listing.loading && !listing.error && <>
      {listing.entries.length === 0 && <p className="omnimux-assets-muted">{t('detail.emptyFolder')}</p>}
      <div className="omnimux-assets-grid">
        {listing.entries.map((entry) => {
          const unavailable = ['unmigrated', 'excluded'].includes(entry.status)
          const folder = entry.virtual || isDirectoryRef(entry)
          const file = { ...entry, id: entry.fileId, original_name: entry.name }
          const stack = location.file ? { file: location.file, path: location.path } : null
          const src = folder || unavailable ? '' : previewUrl(asset.id, entry.fileId, location.logical ? '' : entry.relative_path)
          const open = () => {
            if (entry.virtual) navigate(entry.logical_path)
            else if (folder) {
              if (location.logical) setLocation({ file, path: '', logical: false })
              else navigate(entry.relative_path)
            } else if (typeof onPreview === 'function') {
              if (location.logical) onPreview(resolveAssetMediaPreview(file, { asset }))
              else onPreview(resolveAssetMediaPreview(entry, { asset, stack }))
            }
          }
          return <MediaCard key={entry.fileId ? `${entry.fileId}:${entry.relative_path || entry.logical_path}` : entry.logical_path}
            t={t} title={entry.name} kind={folder ? 'folder' : detectMediaKind(entry)} src={src}
            status={unavailable ? t(`storage.operation.${entry.status}`) : ''}
            detail={unavailable ? [entry.reason || entry.recovery_ref?.reason, entry.recovery_ref?.taskId].filter(Boolean).join(' · ') : ''}
            onOpen={unavailable ? undefined : open} />
        })}
      </div>
      {(listing.page > 0 || listing.nextCursor) && <nav className="omnimux-assets-storage-actions" aria-label={t('browse.pages')}>
        <Button size="sm" variant="outline" disabled={listing.page === 0} onClick={() => { void feed.previous() }}>{t('storage.previousPage')}</Button>
        <span role="status">{t('browse.page').replace('{page}', String(listing.page + 1)).replace('{pages}', String(Math.ceil(listing.total / BROWSE_PAGE_SIZE)))}</span>
        <Button size="sm" variant="outline" disabled={!listing.nextCursor} onClick={() => { void feed.next() }}>{t('storage.nextPage')}</Button>
      </nav>}
    </>}
  </div>
}

function MediaCard({ t, title, kind, src, onOpen, status = '', detail = '' }) {
  const clickable = typeof onOpen === 'function'
  const activate = clickable ? onOpen : undefined
  const [broken, setBroken] = useState(false)
  useEffect(() => { setBroken(false) }, [src])
  const showImage = kind === 'image' && Boolean(src) && !broken
  const showVideo = kind === 'video' && Boolean(src) && !broken
  const badge = kind === 'folder'
    ? t('detail.folder')
    : kind === 'image'
      ? t('media.image')
      : kind === 'video'
        ? t('media.video')
        : t('detail.file')
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
        <Badge size="sm" shape="capsule" className="omnimux-assets-badge">{badge}</Badge>
      </div>
      <div className="omnimux-assets-card-body">
        <div className="omnimux-assets-card-title" title={title}>{title}</div>
        {status && <p className="omnimux-assets-browse-notice">{status}</p>}
        {detail && <small className="omnimux-assets-browse-notice">{detail}</small>}
      </div>
    </article>
  )
}
