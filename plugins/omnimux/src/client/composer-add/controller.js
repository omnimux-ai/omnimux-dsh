import { inferKindFromName, MAX_ATTACHMENTS } from './kind.js'
import { resolveProductPreview } from '../components/product-picker/product-attachment-sync.js'
import { promptForCard, tabForKind } from './library-stage-model.js'
import { getGlobalAssetHubNavStore } from '../workbench/asset-hub-store.js'
import { ASSET_HUB_TAB_ID } from '../workbench/geometry.js'

/**
 * @typedef {import('../attachments/store.ts').AttachmentStore} AttachmentStore
 * @typedef {{ ok: boolean, status: number, body: object }} JsonResponse
 * @typedef {{ id: number, sessionId: string, kind: 'library' | 'product' | 'inspiration', importing: boolean, selection: AbortController }} Operation
 */

/** Reads JSON through the Host attachment seam without assuming a response shape. */
export async function requestComposerJson(path, body, signal) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  })
  const json = await response.json()
  if (!json || typeof json !== 'object') throw new Error('Invalid attachment response')
  return { ok: response.ok, status: response.status, body: json }
}

/**
 * Own one visible adding operation while admitted imports retain their session.
 * @param {{
 *   store: AttachmentStore,
 *   getCurrentSessionId: () => string | undefined,
 *   subscribeCurrentSession: (listener: () => void) => () => void,
 *   t: (key: string, vars?: object) => string,
 *   notify: (message: string) => void,
 *   renderLibrary: (model: object | null) => void,
 *   request?: (path: string, body: object, signal?: AbortSignal) => Promise<JsonResponse>,
 *   onBegin?: () => void,
 *   restoreFocus?: (sessionId: string) => void,
 * }} options
 */
export function createComposerAddController(options) {
  const { store, getCurrentSessionId, t, notify, renderLibrary } = options
  const request = options.request || requestComposerJson
  let disposed = false
  let revision = 0
  const importingSessions = new Set()
  /** @type {Operation | null} */
  let owner = null
  let stopAttachments = () => {}

  const text = (key, vars) => t(key, vars).replace(/\{(\w+)\}/g, (match, name) => (
    vars?.[name] == null ? match : String(vars[name])
  ))
  const visible = (operation) => {
    if (disposed || owner !== operation) return false
    const current = getCurrentSessionId()
    return !usableSession(current) || current === operation.sessionId
  }
  const rowsFor = (sessionId) => store.getSnapshot(sessionId)

  function makeFingerprint(row) {
    if (!row) return ''
    const sourcePlugin = row.sourcePlugin || ''
    const kind = row.kind || ''
    const entityId = row.entityId || row.id || ''
    return `${sourcePlugin}:${kind}:${entityId}`
  }

  function alreadyIdsFor(operation) {
    const rows = rowsFor(operation.sessionId)
    if (operation.kind === 'product') {
      return new Set(
        rows
          .filter(r => r.sourcePlugin === 'omnimux-products' || r.kind === 'product')
          .map(r => r.entityId)
          .filter(Boolean),
      )
    }
    if (operation.kind === 'inspiration') {
      return new Set(
        rows
          .filter(r => r.sourcePlugin === 'omnimux-inspiration')
          .map(r => r.entityId)
          .filter(Boolean),
      )
    }
    return new Set(
      rows
        .filter(r => r.sourcePlugin === 'omnimux' || r.sourcePlugin === 'omnimux-assets' || r.kind === 'asset')
        .map(r => r.entityId)
        .filter(Boolean),
    )
  }

  function summary(counts) {
    const parts = []
    if (counts.added) parts.push(text('composerAdd.toast.added', { n: counts.added }))
    if (counts.duplicate) parts.push(text('composerAdd.toast.duplicate', { n: counts.duplicate }))
    if (counts.quota) parts.push(text('composerAdd.toast.quota'))
    if (counts.failed) parts.push(text('composerAdd.toast.failed', { n: counts.failed }))
    return parts.join(' · ')
  }

  function close(operation, focus = false) {
    if (owner !== operation) return
    const restore = focus && visible(operation)
    operation.selection.abort()
    stopAttachments()
    stopAttachments = () => {}
    owner = null
    renderLibrary(null)
    if (restore) options.restoreFocus?.(operation.sessionId)
  }

  function confirmFor(operation) {
    if (operation.kind === 'product') {
      return (picked) => confirmDirect(operation, normalizeProductPicked(picked), mapProductAttachment)
    }
    if (operation.kind === 'inspiration') {
      return (picked) => confirmDirect(operation, Array.isArray(picked) ? picked : [picked], mapInspirationAttachment)
    }
    return (picked) => confirmLibrary(operation, picked)
  }

  function render(operation) {
    if (!visible(operation)) return
    renderLibrary({
      key: operation.id,
      kind: operation.kind,
      tab: operation.tab || tabForKind(operation.kind),
      sessionId: operation.sessionId,
      presentation: 'stage',
      occupied: rowsFor(operation.sessionId).length,
      alreadyIds: alreadyIdsFor(operation),
      onClose: () => close(operation, true),
      onConfirm: confirmFor(operation),
      onTab: (tab) => {
        if (!visible(operation)) return
        operation.tab = tab
        render(operation)
      },
      onPick: (card) => pickCard(operation, card),
    })
  }

  function pickCard(operation, card) {
    if (!visible(operation) || !card?.raw) return undefined
    const prompt = promptForCard(card)
    const finish = (result) => {
      if (prompt && result?.added) options.onPrompt?.(prompt)
      return result
    }
    if (card.lane === 'featured' || card.lane === 'skills') {
      if (prompt) options.onPrompt?.(prompt)
      return Promise.resolve({ added: 0, promptOnly: true })
    }
    if (card.lane === 'assets') {
      return Promise.resolve(confirmLibrary(operation, [card.raw], { keepOpen: true })).then(finish, (error) => {
        if (visible(operation)) notify(error instanceof Error ? error.message : String(error))
      })
    }
    if (card.lane === 'products') {
      return Promise.resolve(confirmDirect(operation, [card.raw], mapProductAttachment, { keepOpen: true })).then(finish)
    }
    return Promise.resolve(confirmDirect(operation, [card.raw], mapInspirationAttachment, { keepOpen: true })).then(finish)
  }

  function usableSession(id) {
    return Boolean(id) && id !== 'default'
  }

  function resolveSessionId(sessionId) {
    const current = getCurrentSessionId()
    if (usableSession(sessionId)) {
      if (!usableSession(current) || current === sessionId) return sessionId
      return null
    }
    return usableSession(current) ? current : null
  }

  function begin(sessionId, kind = 'library') {
    if (disposed) return null
    const target = resolveSessionId(sessionId)
    if (!target) {
      if (!usableSession(getCurrentSessionId())) notify(text('composerAdd.needSession'))
      return null
    }
    if (owner) {
      if (owner.sessionId === target) {
        if (owner.kind !== kind) {
          owner.kind = kind
          owner.tab = tabForKind(kind)
          return owner
        }
        return null
      }
      notify(text('composerAdd.busy'))
      return null
    }
    if (importingSessions.has(target)) {
      notify(text('composerAdd.busy'))
      return null
    }
    if (rowsFor(target).length >= MAX_ATTACHMENTS) {
      notify(text('composerAdd.toast.quota'))
      return null
    }
    const operation = { id: ++revision, sessionId: target, kind, importing: false, selection: new AbortController() }
    owner = operation
    options.onBegin?.()
    stopAttachments = typeof store?.subscribe === 'function'
      ? store.subscribe(target, () => render(operation))
      : () => {}
    return operation
  }

  function addResults(operation, items, counts) {
    if (disposed) return counts
    const knownFp = new Set(rowsFor(operation.sessionId).map(makeFingerprint))
    for (const item of items) {
      if (!item || item.ok !== true) {
        counts.failed += 1
        continue
      }
      const id = item.entityId || item.sourcePath || item.relativePath
      const sourcePlugin = item.sourcePlugin || 'omnimux'
      const kind = item.kind || inferKindFromName(item.title, item.relativePath)
      const fp = makeFingerprint({ sourcePlugin, kind, entityId: id })
      if (id && knownFp.has(fp)) {
        counts.duplicate += 1
        continue
      }
      const metadata = {
        ...(Array.isArray(item.files) ? { files: item.files } : {}),
      }
      const result = store.addAttachment(operation.sessionId, {
        sourcePlugin,
        kind,
        entityId: id,
        title: item.title,
        extension: item.extension,
        relativePath: item.relativePath,
        previewUrl: item.previewUrl,
        metadata,
      })
      if (result.ok) {
        counts.added += 1
        knownFp.add(fp)
      } else if (result.reason === 'duplicate') counts.duplicate += 1
      else if (result.reason === 'quota-exceeded') counts.quota += 1
      else counts.failed += 1
    }
    return counts
  }

  async function confirmLibrary(operation, picked, { keepOpen = false } = {}) {
    if (!visible(operation) || operation.importing) return
    const currentRows = rowsFor(operation.sessionId)
    const knownFp = new Set(currentRows.map(makeFingerprint))
    const totalRemaining = Math.max(0, MAX_ATTACHMENTS - currentRows.length)
    const uniquePicked = [...new Set(picked.map(row => row.id))].filter(Boolean)
    const nonDuplicates = uniquePicked.filter(id => {
      const fp1 = makeFingerprint({ sourcePlugin: 'omnimux', kind: 'asset', entityId: id })
      const fp2 = makeFingerprint({ sourcePlugin: 'omnimux-assets', kind: 'asset', entityId: id })
      return !knownFp.has(fp1) && !knownFp.has(fp2)
    })
    if (!nonDuplicates.length) {
      if (uniquePicked.length > 0 && totalRemaining > 0) {
        throw new Error(text('composerAdd.toast.duplicate', { n: uniquePicked.length }))
      }
      throw new Error(text('composerAdd.toast.quota'))
    }
    const assetIds = nonDuplicates.slice(0, totalRemaining)
    if (!assetIds.length) throw new Error(text('composerAdd.toast.quota'))
    operation.importing = true
    importingSessions.add(operation.sessionId)
    try {
      const response = await request('/omnimux/composer/attachments/instantiate', {
        sessionId: operation.sessionId, assetIds,
      })
      if (!Array.isArray(response.body.results)) {
        throw new Error(text('composerAdd.invalidResponse'))
      }
      const items = response.body.results
      const counts = addResults(operation, items, { added: 0, duplicate: 0, quota: 0, failed: 0 })
      if (!visible(operation)) return
      if (!counts.added && !counts.duplicate) {
        const failed = items.find(item => item?.ok === false)
        throw new Error(failed?.message || response.body.message || summary(counts) || text('composerAdd.toast.failed', { n: 1 }))
      }
      notify(summary(counts))
      if (!keepOpen) close(operation, true)
      return counts
    } finally {
      operation.importing = false
      importingSessions.delete(operation.sessionId)
    }
  }

  function normalizeProductPicked(picked) {
    if (!picked) return []
    return Array.isArray(picked) ? picked : [picked]
  }

  function mapProductAttachment(product) {
    if (!product || !product.id) return null
    return {
      sourcePlugin: 'omnimux-products',
      kind: 'product',
      entityId: String(product.id),
      title: String(product.name || product.title || '产品'),
      extension: 'JSON',
      relativePath: `products/${product.id}.json`,
      previewUrl: resolveProductPreview(product),
      metadata: {
        product: {
          id: product.id,
          name: product.name,
          price: product.price,
          sku: product.sku,
          brand: product.brand,
          description: product.description,
          selling_points: product.selling_points,
          features: product.features,
          target_audience: product.target_audience,
        },
      },
    }
  }

  function mapInspirationAttachment(item) {
    if (!item || !item.id) return null
    const KIND_MAP = { video: 'video', audio: 'audio' }
    const DEFAULT_EXT = { video: 'MP4', audio: 'MP3', image: 'JPG' }
    const kind = KIND_MAP[item.kind] || 'image'
    const extension = item.extension || DEFAULT_EXT[kind]
    return {
      sourcePlugin: 'omnimux-inspiration',
      kind,
      entityId: String(item.id),
      title: String(item.title || item.name || item.id),
      extension,
      relativePath: item.relativePath || `inspiration/${item.id}.${extension.toLowerCase()}`,
      previewUrl: item.previewUrl || '',
      metadata: {
        inspiration: {
          id: item.id,
          is_local: Boolean(item.is_local),
          category: item.category || '',
        },
      },
    }
  }

  function confirmDirect(operation, picked, mapper, { keepOpen = false } = {}) {
    if (!visible(operation) || operation.importing) return
    const currentRows = rowsFor(operation.sessionId)
    const knownFp = new Set(currentRows.map(makeFingerprint))
    const totalRemaining = Math.max(0, MAX_ATTACHMENTS - currentRows.length)
    const rawPayloads = picked.map(mapper).filter(Boolean)
    const nonDuplicates = rawPayloads.filter((payload) => !knownFp.has(makeFingerprint(payload)))
    if (!nonDuplicates.length) {
      if (rawPayloads.length > 0 && totalRemaining > 0) {
        notify(text('composerAdd.toast.duplicate', { n: rawPayloads.length }))
      } else {
        notify(text('composerAdd.toast.quota'))
      }
      return
    }
    const payloads = nonDuplicates.slice(0, totalRemaining)
    if (!payloads.length) {
      notify(text('composerAdd.toast.quota'))
      return
    }
    const counts = { added: 0, duplicate: 0, quota: 0, failed: 0 }
    for (const payload of payloads) {
      const result = store.addAttachment(operation.sessionId, payload)
      if (result.ok) counts.added += 1
      else if (result.reason === 'duplicate') counts.duplicate += 1
      else if (result.reason === 'quota-exceeded') counts.quota += 1
      else counts.failed += 1
    }
    notify(summary(counts))
    if (counts.added && !keepOpen) close(operation, true)
    return counts
  }

  async function openKind(sessionId, kind) {
    const targetSessionId = resolveSessionId(sessionId)
    const targetTab = tabForKind(kind) || 'assets'
    const navStore = options.assetHubNavStore || getGlobalAssetHubNavStore()
    navStore?.setActiveTab?.(targetTab)

    // 全屏新会话守卫：若当前处于全屏探索专区且右栏未展开，优先就地滚动置顶并激活 Tab，绝不打开 split 挤压会话！
    const win = typeof window !== 'undefined' ? window : null
    const isFullscreenExplore = Boolean(win?.__omnimuxFullscreenExploreActive)
    const isRightPanelOpen = Boolean(win?.__omnimuxWorkbench?.getSnapshot?.()?.state?.panelOpen)

    if (isFullscreenExplore && !isRightPanelOpen && win) {
      win.dispatchEvent(new CustomEvent('omnimux:explore:scroll-to-tab', {
        detail: { tab: targetTab, sessionId: targetSessionId, kind },
      }))
      return
    }

    const operation = begin(sessionId, kind)
    if (operation) {
      render(operation)
    }

    if (targetSessionId) {
      const wb = (typeof window !== 'undefined' ? window.__omnimuxWorkbench : null) || options.workbench
      try {
        await wb?.openWorkbench?.({
          tabId: ASSET_HUB_TAB_ID,
          focus: 'split',
          sessionId: targetSessionId,
        })
      } catch {
        // 容错处理：宿主工作台打开失败时不崩溃
      }
    }
  }

  const stopSession = options.subscribeCurrentSession(() => {
    const current = getCurrentSessionId()
    if (owner && usableSession(current) && current !== owner.sessionId) close(owner)
  })

  return {
    openLibrary(sessionId) {
      return openKind(sessionId, 'library').catch(() => {})
    },
    openProduct(sessionId) {
      return openKind(sessionId, 'product').catch(() => {})
    },
    openInspiration(sessionId) {
      return openKind(sessionId, 'inspiration').catch(() => {})
    },
    openFeatured(sessionId) {
      return openKind(sessionId, 'featured').catch(() => {})
    },
    openTrending(sessionId) {
      return openKind(sessionId, 'trending').catch(() => {})
    },
    openSkills(sessionId) {
      return openKind(sessionId, 'skills').catch(() => {})
    },
    dispose() {
      if (disposed) return
      if (owner) close(owner)
      disposed = true
      stopSession()
    },
  }
}
