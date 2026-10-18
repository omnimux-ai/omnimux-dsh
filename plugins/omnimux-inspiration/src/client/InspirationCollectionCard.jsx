import { useEffect, useState } from 'react'
import { Button, IconButton } from 'dsh-ui-kit'
import { Ellipsis, Eye, Folder, Image as ImageIcon, MessageSquarePlus } from 'lucide-react'
import { isUsableCoverSize, pickCoverSrc, pickImageSources } from './api.js'
import { RivalPostCard } from './RivalPostCard.jsx'

/**
 * @typedef {{ id: string, title: string, item_ids?: string[], item_count?: number, preview_items?: Record<string, any>[] }} InspirationCollection
 */

/** @param {InspirationCollection} collection */
export function toCollectionCardRow(collection) {
  return { id: `collection:${collection.id}`, card_type: 'collection', title: collection.title }
}

/**
 * Inner controls must not reach the card's detail handler or the collection
 * drag gesture: the card is one big click target, so every button owns its
 * pointer/mouse/click events outright.
 */
function stopInnerEvent(event) {
  event.preventDefault()
  event.stopPropagation()
}

/**
 * Keyboard events only stop bubbling. `preventDefault` is deliberately absent:
 * Enter/Space activation of a native button is the default action, and the card
 * ignores key events whose target is not the card itself.
 */
function isolateInnerKey(event) {
  event.stopPropagation()
}

function CollectionThumbnail({ item }) {
  const sources = [...new Set([pickCoverSrc(item), ...pickImageSources(item)].filter(Boolean))]
  const sourceKey = sources.join('\u0000')
  const [sourceIndex, setSourceIndex] = useState(0)
  useEffect(() => setSourceIndex(0), [sourceKey])
  const source = sources[sourceIndex]
  if (!source) return <div className="omnimux-inspiration-collection-placeholder"><ImageIcon size={18} aria-hidden="true" /></div>
  return (
    <img
      src={source}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setSourceIndex(index => index + 1)}
      onLoad={event => {
        const image = event.currentTarget
        if (!isUsableCoverSize(image.naturalWidth, image.naturalHeight)) setSourceIndex(index => index + 1)
      }}
    />
  )
}

/**
 * @param {{
 *   collection: InspirationCollection,
 *   t: (key: string) => string,
 *   style?: Record<string, any>,
 *   column?: number,
 *   onOpen?: (collection: InspirationCollection) => void,
 *   onView?: (collection: InspirationCollection) => void,
 *   onAddToSession?: (collection: InspirationCollection) => void,
 *   addToSessionBusy?: boolean,
 *   onMenu?: (event: import('react').MouseEvent<HTMLButtonElement>, collection: InspirationCollection) => void,
 *   preview?: boolean,
 * }} props
 */
export function InspirationCollectionCard({ collection, t, style, column, onOpen, onView, onAddToSession, addToSessionBusy = false, onMenu, menuNode, preview = false }) {
  const items = (Array.isArray(collection.preview_items) ? collection.preview_items : []).slice(0, 3)
  const count = Number.isFinite(Number(collection.item_count))
    ? Math.max(items.length, Number(collection.item_count))
    : Math.max(items.length, collection.item_ids?.length || 0)
  const remaining = Math.max(0, count - 3)
  const title = String(collection.title || '')
  const addBusy = Boolean(addToSessionBusy)
  return (
    <RivalPostCard
      card={toCollectionCardRow(collection)}
      t={t}
      className={`omnimux-inspiration-collection-card${preview ? ' is-preview' : ''}`}
      collectionId={String(collection.id)}
      style={style}
      column={column}
      onDetail={!preview && onOpen ? () => onOpen(collection) : undefined}
      overlayNode={null}
      mediaNode={(
        <div className="omnimux-rival-card-media omnimux-inspiration-collection-cover">
          {items.length ? items.map((item, index) => (
            <div key={`${item.id || index}:${index}`} className="omnimux-inspiration-collection-column" aria-hidden="true">
              <CollectionThumbnail item={item} />
              {index === 2 && remaining > 0 ? <span className="omnimux-inspiration-collection-more-count">{t('collection.moreCount').replace('{count}', String(remaining))}</span> : null}
            </div>
          )) : <div className="omnimux-inspiration-collection-placeholder" aria-hidden="true"><Folder size={26} aria-hidden="true" /></div>}
          {!preview ? (
            <div className="omnimux-inspiration-collection-actions" role="group" aria-label={t('collection.actions')}>
              <Button
                variant="outline"
                size="sm"
                className="omnimux-inspiration-collection-action-view"
                aria-label={t('collection.view')}
                leadingIcon={<Eye size={14} aria-hidden="true" />}
                onPointerDown={stopInnerEvent}
                onMouseDown={stopInnerEvent}
                onKeyDown={isolateInnerKey}
                onClick={event => {
                  stopInnerEvent(event)
                  const view = typeof onView === 'function' ? onView : onOpen
                  if (typeof view === 'function') view(collection)
                }}
              >
                {t('collection.view')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="omnimux-inspiration-collection-action-add"
                aria-label={t('collection.addToSession')}
                leadingIcon={<MessageSquarePlus size={14} aria-hidden="true" />}
                loading={addBusy}
                onPointerDown={stopInnerEvent}
                onMouseDown={stopInnerEvent}
                onKeyDown={isolateInnerKey}
                onClick={event => {
                  stopInnerEvent(event)
                  if (addBusy) return
                  if (typeof onAddToSession === 'function') onAddToSession(collection)
                }}
              >
                {t('collection.addToSession')}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    >
      <div className="omnimux-inspiration-collection-title" title={title}>
        <Folder size={14} aria-hidden="true" />
        <span>{title}</span>
      </div>
      {!preview && menuNode ? menuNode : !preview && onMenu ? (
        <IconButton
          variant="ghost"
          className="omnimux-inspiration-collection-menu"
          aria-label={t('collection.more')}
          aria-haspopup="menu"
          onPointerDown={event => event.stopPropagation()}
          onMouseDown={event => event.stopPropagation()}
          onKeyDown={event => event.stopPropagation()}
          onClick={event => {
            event.preventDefault()
            event.stopPropagation()
            onMenu(event, collection)
          }}
        >
          <Ellipsis size={16} aria-hidden="true" />
        </IconButton>
      ) : null}
    </RivalPostCard>
  )
}
