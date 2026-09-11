import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Divider, FilterBar, PageHeader, SearchField, Tabs } from 'dsh-ui-kit'
import { createProduct, deleteProduct, getProductForEdit, getState, pickPath, updateProduct } from './api.js'
import { ConfirmRemoveDialog } from './ConfirmRemoveDialog.jsx'
import { ChatIcon, PlusIcon, RefreshIcon } from './icons.jsx'
import { ProductFormDialog } from './ProductFormDialog.jsx'
import { ProductGrid } from './ProductGrid.jsx'
import { injectProductsStyles } from './styles.js'

const POLL_MS = 5000
const TAB_ID = 'omnimux-products:library'

function messageOf(result, t) {
  if (result.body?.error === 'name-conflict') return t('error.nameConflict')
  return String(result.body?.message || result.body?.error || `HTTP ${String(result.status)}` || t('error.generic'))
}

function errText(caught) {
  return caught instanceof Error ? caught.message : String(caught)
}

function pickErrorText(result, t) {
  const code = String(result.body?.error ?? '')
  if (code === 'picker-unsupported') return t('error.pickerUnsupported')
  if (code === 'picker-failed') return t('error.pickerFailed')
  return messageOf(result, t)
}

function citeOf(product) {
  return product.cite || `@产品/${product.name}`
}

/**
 * Product library workbench tab component in dsh-better-sidebar.
 * @param {{
 *   t: (key: string) => string,
 *   stage?: { getSnapshot: () => boolean, subscribe: Function, set: Function },
 *   store?: { reduce?: Function, getSnapshot?: Function },
 *   visible?: boolean,
 * }} props
 */
export function ProductsStage({ t, stage, store, visible = true }) {
  useEffect(() => { injectProductsStyles() }, [])
  const everOpened = true

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (!api || typeof api.attachStore !== 'function' || !store) return undefined
    api.attachStore(store)
    return () => { api.detachStore?.(store) }
  }, [store])

  const [products, setProducts] = useState([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formError, setFormError] = useState('')
  const [editingDirty, setEditingDirty] = useState(false)
  const [pendingRemove, setPendingRemove] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  const isFirstMount = useRef(true)
  const editRequest = useRef(0)

  useEffect(() => () => { editRequest.current += 1 }, [])

  const invalidateEditRequest = () => {
    editRequest.current += 1
    setBusy(false)
  }

  const handleCreate = () => {
    invalidateEditRequest()
    setCreating(true)
    setFormError('')
    setEditing(null)
    setEditingDirty(false)
  }

  const handleCancelForm = () => {
    invalidateEditRequest()
    setCreating(false)
    setEditing(null)
    setFormError('')
    setEditingDirty(false)
  }

  const refreshState = useCallback(async (silent = false) => {
    if (!silent) setBusy(true)
    try {
      const res = await getState()
      if (res.ok && Array.isArray(res.body?.products)) {
        setProducts(res.body.products)
        setError('')
      } else if (!res.ok) {
        setError(messageOf(res, t))
      }
    } catch (e) {
      setError(errText(e))
    } finally {
      if (!silent) setBusy(false)
    }
  }, [t])

  useEffect(() => {
    if (!visible) return undefined
    if (isFirstMount.current) {
      isFirstMount.current = false
      void refreshState(false)
    } else {
      void refreshState(true)
    }
    const timer = setInterval(() => { void refreshState(true) }, POLL_MS)
    return () => { clearInterval(timer) }
  }, [visible, refreshState])

  const handleCopyCite = (product) => {
    const cite = citeOf(product)
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(cite).then(() => {
        setCopiedId(product.id)
        setTimeout(() => { setCopiedId(null) }, 2000)
      })
    }
  }

  const handleOpenProduct = async (product) => {
    const request = ++editRequest.current
    setBusy(true)
    setError('')
    try {
      const result = await getProductForEdit(product.id)
      if (request !== editRequest.current) return
      if (!result.ok || !result.body?.product) {
        setError(messageOf(result, t))
        return
      }
      setEditing(result.body.product)
      setEditingDirty(false)
      setFormError('')
      setCreating(false)
    } catch (caught) {
      if (request === editRequest.current) setError(errText(caught))
    } finally {
      if (request === editRequest.current) setBusy(false)
    }
  }

  const handleSaveProduct = (data, id) => {
    setBusy(true)
    setFormError('')
    const action = id ? updateProduct(id, data) : createProduct(data)
    return action.then((result) => {
      if (!result.ok) {
        setFormError(messageOf(result, t))
        return
      }
      editRequest.current += 1
      setCreating(false)
      setEditing(null)
      setEditingDirty(false)
      return refreshState(true)
    }).catch((caught) => {
      setFormError(errText(caught))
    }).finally(() => {
      setBusy(false)
    })
  }

  const handleConfirmDelete = () => {
    if (!pendingRemove) return
    const ids = pendingRemove.ids || (pendingRemove.product ? [pendingRemove.product.id] : [])
    setBusy(true)
    Promise.all(ids.map((id) => deleteProduct(id))).then((results) => {
      const failed = results.find((r) => !r.ok)
      if (failed) {
        setError(messageOf(failed, t))
        return
      }
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const id of ids) next.delete(id)
        return next
      })
      setPendingRemove(null)
      return refreshState(true)
    }).catch((caught) => {
      setError(errText(caught))
    }).finally(() => {
      setBusy(false)
    })
  }

  const handlePick = async (kind) => {
    const result = await pickPath(kind)
    if (!result.ok) {
      setFormError(pickErrorText(result, t))
      return []
    }
    const paths = Array.isArray(result.body?.paths)
      ? result.body.paths.filter((path) => typeof path === 'string' && path !== '')
      : []
    if (paths.length > 0) return paths
    return typeof result.body?.path === 'string' && result.body.path !== '' ? [result.body.path] : []
  }

  const [kindTab, setKindTab] = useState('all')

  const visibleProducts = products.filter((product) => {
    if (kindTab !== 'all') {
      const productKind = product.kind || 'physical'
      if (productKind !== kindTab) return false
    }
    if (!query.trim()) return true
    const hay = `${product.name}\n${product.handle}\n${product.selling_points}\n${product.brand}\n${product.sku}\n${product.link}\n${(product.categories || []).join('\n')}`.toLowerCase()
    return hay.includes(query.trim().toLowerCase())
  })

  const selectedCount = selectedIds.size
  const selecting = selectedCount > 0

  const toggleSelect = (product) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(product.id)) next.delete(product.id)
      else next.add(product.id)
      return next
    })
  }

  const clearSelection = () => { setSelectedIds(new Set()) }

  const handleClose = () => {
    handleCancelForm()
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (api && typeof api.closeTab === 'function') {
      api.closeTab(TAB_ID)
    } else {
      stage?.set?.(false)
    }
  }

  const handleOpenConversation = () => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (api) {
      if (typeof api.setConversationCollapsed === 'function') {
        try { api.setConversationCollapsed(false) } catch { /* ignore */ }
      }
      if (typeof api.setFocus === 'function') {
        try { api.setFocus('split') } catch { /* ignore */ }
      }
      if (typeof setTimeout === 'function') {
        const replay = () => {
          try { api.setConversationCollapsed?.(false) } catch { /* ignore */ }
          try { api.setFocus?.('split') } catch { /* ignore */ }
        }
        setTimeout(replay, 0)
        setTimeout(replay, 50)
      }
    }
  }

  return (
    <div
      role="region"
      aria-label={t('stage.title')}
      aria-hidden={visible ? undefined : 'true'}
      className="omnimux-products-stage"
      data-visible={visible ? 'true' : 'false'}
      style={{
        display: visible ? 'flex' : 'none',
        position: 'relative',
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <PageHeader
        title={t('stage.title')}
        subtitle={t('stage.subtitle')}
        onRefresh={() => {
          setBusy(true)
          void refreshState(true).finally(() => { setBusy(false) })
        }}
        refreshing={busy}
        refreshTitle={t('stage.refresh')}
        onClose={handleClose}
        closeTitle={t('stage.close')}
      />

      <div className="omnimux-products-action-row">
        <Button
          variant="primary"
          leadingIcon={<PlusIcon />}
          onClick={handleCreate}
        >
          {t('add.button')}
        </Button>
        <Button
          variant="secondary"
          leadingIcon={<ChatIcon />}
          onClick={handleOpenConversation}
        >
          {t('add.chatButton') || '对话中添加'}
        </Button>
      </div>

      <Divider />

      <FilterBar
        className="omnimux-products-stage-toolbar"
        filters={
          <Tabs
            variant="underline"
            items={[
              { id: 'all', label: t('all') || '全部' },
              { id: 'physical', label: t('kind.physical') },
              { id: 'digital', label: t('kind.digital') },
            ]}
            activeId={kindTab}
            onChange={setKindTab}
          />
        }
        search={(
          <SearchField
            value={query}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            debounceMs={0}
            stretch
            onValueChange={setQuery}
          />
        )}
      />

      {selecting && (
        <div className="omnimux-products-selection">
          <span>{t('select.count').replace('{n}', String(selectedCount))}</span>
          <div className="omnimux-products-selection-actions">
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              {t('select.clear')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => {
                const names = products.filter((p) => selectedIds.has(p.id)).map((p) => p.name)
                setPendingRemove({ isBatch: true, ids: Array.from(selectedIds), names })
              }}
            >
              {t('select.delete').replace('{n}', String(selectedCount))}
            </Button>
          </div>
        </div>
      )}

      {error !== '' && <p className="omnimux-products-error">{error}</p>}

      <div className="omnimux-products-body">
        <ProductGrid
          products={visibleProducts}
          emptyLabel={t(query.trim() ? 'empty.noMatch' : 'empty.all')}
          emptyActionLabel={t('add.button')}
          showEmptyAction={query.trim() === ''}
          selectedIds={selectedIds}
          copiedId={copiedId}
          onToggleSelect={toggleSelect}
          onOpen={handleOpenProduct}
          onRemove={(p) => { setPendingRemove({ isBatch: false, product: p, names: [p.name] }) }}
          onCopy={handleCopyCite}
          onEmptyAction={handleCreate}
          t={t}
        />
      </div>

      {creating && (
        <ProductFormDialog
          t={t}
          data={{ mode: 'create', busy, error: formError, dirty: false, initial: null }}
          onAction={{
            onCancel: handleCancelForm,
            onPick: handlePick,
            onSubmit: (payload) => { void handleSaveProduct(payload) },
          }}
        />
      )}

      {editing && (
        <ProductFormDialog
          t={t}
          data={{ mode: 'edit', busy, error: formError, dirty: editingDirty, initial: editing }}
          onAction={{
            onCancel: handleCancelForm,
            onPick: handlePick,
            onSubmit: (payload) => { void handleSaveProduct(payload, editing.id) },
          }}
        />
      )}

      {pendingRemove && (
        <ConfirmRemoveDialog
          t={t}
          name={String(pendingRemove.names[0] ?? '')}
          title={
            pendingRemove.isBatch
              ? t('confirm.deleteSelected').replace('{n}', String(pendingRemove.ids.length))
              : t('confirm.deleteTitle').replace('{name}', String(pendingRemove.names[0] ?? ''))
          }
          busy={busy}
          onCancel={() => { setPendingRemove(null) }}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  )
}
