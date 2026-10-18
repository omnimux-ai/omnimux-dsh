import { useCallback, useEffect, useRef, useState } from 'react'
import { pickCoverSrc } from './api.js'
import { writeCollection } from './collection-api.js'

/** Deterministic local suggestion using complete server-provided collection names. */
export function suggestCollectionName(items, names, t) {
  const category = String(items[0]?.category || '').trim()
  const common = category && items.every(item => String(item.category || '').trim() === category)
  const translated = common ? t(`category.${category}`) : ''
  const label = translated && translated !== `category.${category}` ? translated : category
  const base = common ? t('collection.categoryName').replace('{category}', label) : t('collection.new')
  let name = Array.from(base).slice(0, 20).join(''), number = 2
  while (names.includes(name)) {
    const suffix = ` ${number++}`
    name = Array.from(base).slice(0, 20 - suffix.length).join('') + suffix
  }
  return name
}

/** Server-owned relations; navigation and pending intentions stay local to the view. */
export function useInspirationCollections({ feed, collectionId, setCollectionId, t, showToast }) {
  const [intent, setIntent] = useState(null)
  const [selectedSource, setSelectedSource] = useState(null)
  const [opened, setOpened] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const busyRef = useRef(false)
  const current = useRef(null)
  current.current = { feed, collectionId, setCollectionId, t, showToast }
  const collections = feed.collectionData.collections
  const names = feed.collectionData.collection_names
  const activeCollection = collectionId ? (feed.collectionData.collection?.id === collectionId ? feed.collectionData.collection : opened?.id === collectionId ? opened : null) : null

  useEffect(() => {
    setIntent(null); setSelectedSource(null)
    if (feed.tab !== 'local') { setCollectionId(''); setOpened(null) }
  }, [feed.tab, setCollectionId])

  const open = useCallback(collection => {
    if (busyRef.current) return
    current.current.feed.clearSelection()
    current.current.feed.dropLanded()
    setSelectedSource(null); setOpened(collection); setCollectionId(collection.id)
  }, [setCollectionId])
  const back = useCallback(() => {
    current.current.feed.clearSelection(); current.current.feed.dropLanded()
    setSelectedSource(null); setOpened(null); setCollectionId('')
  }, [setCollectionId])

  const requestMerge = useCallback((source, target, collection = null) => {
    if (busyRef.current || !source?.is_local || (!collection && (!target?.is_local || String(source.id) === String(target.id)))) return
    const { feed, t } = current.current
    const items = collection ? [source] : [target, source]
    setError(''); setSelectedSource(null); feed.clearSelection()
    setIntent({ kind: collection ? 'add' : 'create', collection, items,
      defaultName: suggestCollectionName(items, feed.collectionData.collection_names, t), names: feed.collectionData.collection_names })
  }, [])

  const selectSource = useCallback(source => {
    if (busyRef.current) return
    current.current.feed.clearSelection(); setSelectedSource(source)
  }, [])
  const rename = useCallback(collection => {
    if (busyRef.current) return
    setError(''); setIntent({ kind: 'rename', collection, items: [], defaultName: collection.title, names: current.current.feed.collectionData.collection_names })
  }, [])

  const notifyMutation = useCallback((result, key) => {
    const { t, showToast } = current.current
    const token = result.undo_token
    const undo = async () => {
      if (busyRef.current) return
      busyRef.current = true; setBusy(true)
      try {
        const undone = await writeCollection('/undo', { token })
        const now = current.current
        if (undone.data?.collection === null && now.collectionId === result.data?.id) back()
        await current.current.feed.refreshData()
        current.current.showToast(current.current.t('collection.undone'))
      } catch (failure) {
        current.current.showToast(String(failure?.message || current.current.t('collection.saveFailed')))
      } finally { busyRef.current = false; setBusy(false) }
    }
    showToast(t(key), token ? { action: undo, actionLabel: t('collection.undo'), duration: 12000 } : {})
  }, [back])

  const confirm = useCallback(async name => {
    if (busyRef.current || !intent) return
    const operation = intent
    busyRef.current = true; setBusy(true); setError('')
    try {
      const id = operation.collection?.id
      const path = operation.kind === 'create' ? '' : operation.kind === 'rename' ? `/${encodeURIComponent(id)}` : `/${encodeURIComponent(id)}/items`
      const body = operation.kind === 'rename' ? { title: name } : operation.kind === 'create'
        ? { title: name, item_ids: operation.items.map(item => item.id) } : { item_ids: operation.items.map(item => item.id) }
      const result = await writeCollection(path, body, operation.kind === 'rename' ? 'PATCH' : 'POST')
      current.current.feed.dropLanded(operation.items.map(item => item.id))
      current.current.feed.clearSelection(); setIntent(null)
      if (result.data?.id === current.current.collectionId) setOpened(result.data)
      await current.current.feed.refreshData()
      notifyMutation(result, operation.kind === 'create' ? 'collection.created' : operation.kind === 'rename' ? 'collection.renamed' : 'collection.added')
    } catch (failure) { setError(String(failure?.message || current.current.t('collection.saveFailed'))) }
    finally { busyRef.current = false; setBusy(false) }
  }, [intent, notifyMutation])

  const remove = useCallback(async item => {
    if (busyRef.current || !current.current.collectionId) return
    busyRef.current = true; setBusy(true)
    try {
      const result = await writeCollection(`/${encodeURIComponent(current.current.collectionId)}/remove-items`, { item_ids: [item.id] })
      current.current.feed.dropLanded([item.id]); current.current.feed.clearSelection()
      await current.current.feed.refreshData()
      notifyMutation(result, 'collection.removed')
    } catch (failure) { current.current.showToast(String(failure?.message || current.current.t('collection.saveFailed'))) }
    finally { busyRef.current = false; setBusy(false) }
  }, [notifyMutation])

  return { collections, names, activeCollection, intent, busy, error, selectedSource,
    requestMerge, selectSource, cancelSelection: () => setSelectedSource(null), open, back, rename, remove, confirm,
    close: () => { if (!busyRef.current) { setIntent(null); setError('') } } }
}

/** Pointer gesture around the existing flat masonry; inner controls keep their own events. */
export function useCollectionDrag({ enabled, items, collections, onDrop, onStart, t }) {
  const gesture = useRef(null)
  const suppressClick = useRef(false)
  const latest = useRef(null)
  latest.current = { enabled, items, collections, onDrop, onStart, t }

  const cleanup = useCallback(() => {
    const active = gesture.current
    gesture.current = null
    active?.source?.removeAttribute('data-collection-dragging')
    active?.target?.removeAttribute('data-collection-drop')
    active?.target?.removeAttribute('data-collection-drop-label')
    active?.ghost?.remove()
    if (active?.root.hasPointerCapture(active.pointerId)) active.root.releasePointerCapture(active.pointerId)
  }, [])
  useEffect(() => {
    const cancel = event => { if (event.key === 'Escape') cleanup() }
    document.addEventListener('keydown', cancel)
    return () => { document.removeEventListener('keydown', cancel); cleanup() }
  }, [cleanup])
  useEffect(() => { if (!enabled) cleanup() }, [enabled, cleanup])

  return {
    onDragStart: event => event.preventDefault(),
    onClickCapture: event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation() } },
    onPointerDown: event => {
      if (!latest.current.enabled || event.button !== 0 || event.pointerType === 'touch' || event.target.closest('button,input,a,[role="checkbox"],[role="menu"]')) return
      const source = event.target.closest('[data-inspiration-id]')
      const item = latest.current.items.find(row => String(row.id) === source?.dataset.inspirationId && row.is_local)
      if (!source || !item) return
      event.preventDefault()
      gesture.current = { source, item, root: event.currentTarget, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false }
    },
    onPointerMove: event => {
      const drag = gesture.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return
      event.preventDefault()
      if (!drag.active) {
        drag.active = true; drag.root.setPointerCapture(event.pointerId); drag.source.dataset.collectionDragging = 'true'
        latest.current.onStart()
        const ghost = document.createElement('div')
        ghost.className = 'omnimux-inspiration-collection-drag-ghost'; ghost.setAttribute('aria-hidden', 'true')
        const src = pickCoverSrc(drag.item)
        if (src) { const image = document.createElement('img'); image.src = src; image.alt = ''; ghost.append(image) }
        const label = document.createElement('span'); label.textContent = drag.item.title; ghost.append(label)
        drag.root.append(ghost); drag.ghost = ghost
      }
      drag.ghost.style.setProperty('--collection-drag-x', `${event.clientX + 12}px`)
      drag.ghost.style.setProperty('--collection-drag-y', `${event.clientY + 12}px`)
      drag.target?.removeAttribute('data-collection-drop'); drag.target?.removeAttribute('data-collection-drop-label'); drag.target = null
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-inspiration-id],[data-collection-id]')
      if (!target || target === drag.source || !drag.root.contains(target)) return
      const collection = latest.current.collections.find(row => String(row.id) === target.dataset.collectionId)
      const item = latest.current.items.find(row => String(row.id) === target.dataset.inspirationId && row.is_local)
      if (!collection && !item) return
      drag.target = target; drag.collection = collection; drag.targetItem = item
      target.dataset.collectionDrop = collection ? 'add' : 'create'
      target.dataset.collectionDropLabel = latest.current.t(collection ? 'collection.dropAdd' : 'collection.dropCreate')
    },
    onPointerUp: event => {
      const drag = gesture.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const valid = drag.active && drag.target
      cleanup()
      if (drag.active) { suppressClick.current = true; setTimeout(() => { suppressClick.current = false }, 0) }
      if (valid) latest.current.onDrop(drag.item, drag.targetItem, drag.collection)
    },
    onPointerCancel: cleanup,
    onLostPointerCapture: cleanup,
  }
}
