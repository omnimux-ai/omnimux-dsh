import { randomUUID } from 'node:crypto'

/**
 * @typedef {import('./local-store.js').LocalInspirationRecord} LocalInspirationRecord
 * @typedef {{id: string, title: string, item_ids: string[], created_at: string, updated_at: string, revision?: string}} InspirationCollection
 * @typedef {{version: number, items: LocalInspirationRecord[], collections: InspirationCollection[], [key: string]: unknown}} InspirationLibrary
 * @typedef {{id: string, title: string, item_ids: string[], item_count: number, preview_items: LocalInspirationRecord[], created_at: string, updated_at: string}} CollectionView
 * @typedef {{data: CollectionView | {undone: true, collection: CollectionView | null}, undo_token: string | null}} CollectionMutation
 */

/** Refuse malformed persisted relationships instead of rewriting them as empty.
 * @param {unknown} collections
 * @param {LocalInspirationRecord[]} items
 */
export function validateCollections(collections, items) {
  if (collections === undefined) return
  if (!Array.isArray(collections)) throw new Error('invalid collections')
  const ids = new Set()
  const titles = new Set()
  const members = new Set()
  const existing = new Set(items.map((item) => item.id))
  for (const entry of collections) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) ||
      typeof entry.title !== 'string' || !entry.title.trim() || [...entry.title].length > 20 || titles.has(entry.title) ||
      !Array.isArray(entry.item_ids) || typeof entry.created_at !== 'string' || typeof entry.updated_at !== 'string') throw new Error('invalid collection')
    ids.add(entry.id)
    titles.add(entry.title)
    for (const id of entry.item_ids) {
      if (typeof id !== 'string' || !id || members.has(id) || !existing.has(id)) throw new Error('invalid collection member')
      members.add(id)
    }
  }
}

/** @param {InspirationCollection} collection @param {LocalInspirationRecord[]} items @returns {CollectionView} */
export function collectionView(collection, items) {
  const byId = new Map(items.map((item) => [item.id, item]))
  const realItems = collection.item_ids.map((id) => byId.get(id)).filter(Boolean)
  return {
    id: collection.id, title: collection.title, item_ids: realItems.map((item) => item.id),
    item_count: realItems.length, preview_items: realItems.slice(0, 3),
    created_at: collection.created_at, updated_at: collection.updated_at,
  }
}

/** Keep empty shells, and invalidate undo after a real member deletion.
 * @param {InspirationCollection[]} collections @param {LocalInspirationRecord[]} items
 * @returns {InspirationCollection[]}
 */
export function pruneCollectionMembers(collections, items) {
  const existing = new Set(items.map((item) => item.id))
  return collections.map((entry) => {
    const item_ids = entry.item_ids.filter((id) => existing.has(id))
    return item_ids.length === entry.item_ids.length ? entry : {
      ...entry, item_ids, updated_at: new Date().toISOString(), revision: randomUUID(),
    }
  })
}

/** All relationship mutations run synchronously between the current read and atomic write.
 * @param {{
 *   readLibrary: () => InspirationLibrary,
 *   writeLibrary: (library: InspirationLibrary) => void,
 *   fail: (code: string, message: string, status: number) => Error,
 *   undoTtlMs?: number,
 * }} deps
 */
export function createCollectionStore({ readLibrary, writeLibrary, fail, undoTtlMs = 60_000 }) {
  /** @type {Map<string, {before: InspirationCollection | null, after: InspirationCollection, expiresAt: number}>} */
  const undo = new Map()
  const conflict = (message) => fail('collection-conflict', message, 409)

  /** @param {unknown} input @param {InspirationLibrary} library @param {string} [exceptId] */
  function titleOf(input, library, exceptId) {
    const title = typeof input === 'string' ? input.trim() : ''
    if (!title || [...title].length > 20) throw fail('collection-title-invalid', '合集名称须为1至20个字', 400)
    if (library.collections.some((entry) => entry.id !== exceptId && entry.title === title)) throw conflict('已有同名合集，请换个名称')
    return title
  }

  /** @param {unknown} input @param {InspirationLibrary} library @returns {string[]} */
  function idsOf(input, library) {
    if (!Array.isArray(input) || !input.length || input.some((id) => typeof id !== 'string' || !id.trim())) {
      throw fail('collection-items-invalid', '请选择本地灵感', 400)
    }
    const ids = [...new Set(input)]
    const existing = new Set(library.items.map((item) => item.id))
    if (ids.some((id) => !existing.has(id))) throw fail('collection-item-not-found', '部分灵感已不存在，请刷新后重试', 404)
    return ids
  }

  /** @param {InspirationLibrary} library @param {string} id @returns {InspirationCollection} */
  function requireCollection(library, id) {
    const collection = library.collections.find((entry) => entry.id === id)
    if (!collection) throw fail('collection-not-found', '合集不存在', 404)
    return collection
  }

  /** @param {InspirationLibrary} library @param {string[]} ids @param {string} [exceptId] */
  function assertAvailable(library, ids, exceptId) {
    const targets = new Set(ids)
    if (library.collections.some((entry) => entry.id !== exceptId && entry.item_ids.some((id) => targets.has(id)))) {
      throw conflict('部分灵感已在其他合集中，请刷新后重试')
    }
  }

  /** @param {InspirationLibrary} library @param {InspirationCollection | null} before @param {InspirationCollection} after @returns {CollectionMutation} */
  function save(library, before, after) {
    if (before && before.title === after.title && JSON.stringify(before.item_ids) === JSON.stringify(after.item_ids)) {
      return { data: collectionView(before, library.items), undo_token: null }
    }
    const next = { ...after, updated_at: new Date().toISOString(), revision: randomUUID() }
    const collections = before
      ? library.collections.map((entry) => entry.id === before.id ? next : entry)
      : [next, ...library.collections]
    writeLibrary({ ...library, collections })
    for (const [token, operation] of undo) if (operation.expiresAt <= Date.now()) undo.delete(token)
    while (undo.size >= 100) undo.delete(undo.keys().next().value)
    const token = randomUUID()
    undo.set(token, { before, after: next, expiresAt: Date.now() + undoTtlMs })
    return { data: collectionView(next, library.items), undo_token: token }
  }

  return {
    /** A real deletion also invalidates tokens for members removed before it.
     * @param {string[]} ids
     */
    invalidateDeletedItems(ids) {
      if (!ids.length) return
      const deleted = new Set(ids)
      for (const [token, operation] of undo) {
        if ([...(operation.before?.item_ids || []), ...operation.after.item_ids].some((id) => deleted.has(id))) undo.delete(token)
      }
    },
    /** @returns {{collections: CollectionView[], collection_names: string[]}} */
    collections() {
      const library = readLibrary()
      return { collections: library.collections.map((entry) => collectionView(entry, library.items)), collection_names: library.collections.map((entry) => entry.title) }
    },
    /** @param {unknown} title @param {unknown} itemIds @returns {CollectionMutation} */
    createCollection(title, itemIds) {
      const library = readLibrary()
      const name = titleOf(title, library)
      const item_ids = idsOf(itemIds, library)
      if (item_ids.length < 2) throw fail('collection-items-invalid', '至少选择两条不同的本地灵感', 400)
      assertAvailable(library, item_ids)
      const now = new Date().toISOString()
      return save(library, null, { id: `collection_${randomUUID()}`, title: name, item_ids, created_at: now, updated_at: now })
    },
    /** @param {string} id @param {unknown} title @returns {CollectionMutation} */
    renameCollection(id, title) {
      const library = readLibrary()
      const before = requireCollection(library, id)
      return save(library, before, { ...before, title: titleOf(title, library, id) })
    },
    /** @param {string} id @param {unknown} itemIds @returns {CollectionMutation} */
    addCollectionItems(id, itemIds) {
      const library = readLibrary()
      const before = requireCollection(library, id)
      const ids = idsOf(itemIds, library)
      assertAvailable(library, ids, id)
      return save(library, before, { ...before, item_ids: [...new Set([...before.item_ids, ...ids])] })
    },
    /** @param {string} id @param {unknown} itemIds @returns {CollectionMutation} */
    removeCollectionItems(id, itemIds) {
      const library = readLibrary()
      const before = requireCollection(library, id)
      const ids = new Set(idsOf(itemIds, library))
      return save(library, before, { ...before, item_ids: before.item_ids.filter((itemId) => !ids.has(itemId)) })
    },
    /** Undo only the target relationship metadata, preserving all current item fields.
     * @param {unknown} token @returns {CollectionMutation}
     */
    undoCollection(token) {
      const operation = typeof token === 'string' ? undo.get(token) : undefined
      if (!operation || operation.expiresAt <= Date.now()) {
        if (typeof token === 'string') undo.delete(token)
        throw conflict('撤销已过期，请以当前内容为准')
      }
      const library = readLibrary()
      const current = library.collections.find((entry) => entry.id === operation.after.id)
      if (JSON.stringify(current) !== JSON.stringify(operation.after)) throw conflict('合集已有后续变更，无法撤销')
      const { before } = operation
      if (before) {
        const existing = new Set(library.items.map((item) => item.id))
        if (before.item_ids.some((id) => !existing.has(id))) throw conflict('部分灵感已删除，无法撤销')
        assertAvailable(library, before.item_ids, before.id)
        if (library.collections.some((entry) => entry.id !== before.id && entry.title === before.title)) throw conflict('原名称已被其他合集使用，无法撤销')
      }
      const restored = before ? { ...before, updated_at: new Date().toISOString(), revision: randomUUID() } : null
      writeLibrary({ ...library, collections: restored
        ? library.collections.map((entry) => entry.id === restored.id ? restored : entry)
        : library.collections.filter((entry) => entry.id !== operation.after.id) })
      undo.delete(token)
      return { data: { undone: true, collection: restored ? collectionView(restored, library.items) : null }, undo_token: null }
    },
  }
}
