import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Divider, FilterBar, PageHeader, SearchField, Tabs } from 'dsh-ui-kit'
import { createProduct, deleteProduct, getProductForEdit, getState, pickPath, updateProduct } from './api.js'
import { deliverProductReference } from './reference.js'
import { ConfirmRemoveDialog } from './ConfirmRemoveDialog.jsx'
import { CreateProductMenu } from './CreateProductMenu.jsx'
import { ChatIcon } from './icons.jsx'
import { ProductFormPage } from './ProductFormPage.jsx'
import { ProductGrid } from './ProductGrid.jsx'
import { injectProductsStyles } from './styles.js'

const POLL_MS = 5000
const TAB_ID = 'omnimux-products:library'

/** 列表视图：默认视图，也是表单保存 / 返回后的落点。 */
const LIST_VIEW = Object.freeze({ name: 'list' })

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
 * 归一化形态：只认 `digital`，其余一律实物。菜单的选择、列表行的形态、取回的完整
 * 记录共用同一口径，二级页拿到的永远是这两种之一。
 */
function normalizedKind(value) {
  return value === 'digital' ? 'digital' : 'physical'
}

/**
 * Product library workbench tab component in dsh-better-sidebar.
 *
 * 视图状态机：`view = { name: 'list' } | { name: 'form', mode, kind, product }`。
 * `kind` 在进入二级页的那一刻就被锚定（新建来自悬停菜单的选择，编辑来自产品的
 * 持久化形态），因此二级页内部不再有形态切换，也不会渲染另一半的字段。
 * 列表视图常驻挂载（切到表单不卸载），因此返回时滚动位置与筛选条件完好；
 * 表单是覆盖在列表之上的同 Tab 子屏，不是弹窗。
 *
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
  const [view, setView] = useState(LIST_VIEW)
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [formDirty, setFormDirty] = useState(false)
  const [pendingRemove, setPendingRemove] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [kindTab, setKindTab] = useState('all')

  const isFirstMount = useRef(true)
  const editRequest = useRef(0)

  useEffect(() => () => { editRequest.current += 1 }, [])

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

  const handleCreate = (kind) => {
    editRequest.current += 1
    setFormError('')
    setFormDirty(false)
    setView({ name: 'form', mode: 'create', kind: normalizedKind(kind), product: null })
  }

  const handleOpenProduct = async (product) => {
    const request = ++editRequest.current
    setBusy(true)
    setError('')
    setFormError('')
    try {
      const result = await getProductForEdit(product.id)
      if (request !== editRequest.current) return
      const fresh = result.body?.product
      if (!result.ok || !fresh) {
        // 取数失败留在列表视图 + 错误条，绝不进入空白二级页。
        setError(messageOf(result, t))
        return
      }
      setFormDirty(false)
      // 形态以取回的完整记录为准，列表行只做兜底：卡片点开的落点必须与产品自身
      // 的持久化形态一致，而不是跟当前筛选页签走。
      setView({
        name: 'form',
        mode: 'edit',
        kind: normalizedKind(fresh.kind || product.kind),
        product: fresh,
      })
    } catch (caught) {
      if (request === editRequest.current) setError(errText(caught))
    } finally {
      if (request === editRequest.current) setBusy(false)
    }
  }

  const leaveForm = useCallback(() => {
    editRequest.current += 1
    setFormBusy(false)
    setFormError('')
    setView(LIST_VIEW)
  }, [])

  const handleDirtyChange = useCallback((dirty) => { setFormDirty(Boolean(dirty)) }, [])

  /**
   * 保存并回列表。返回 `true` 表示已落库，调用方据此决定是否离开。
   * @param {Record<string, unknown>} data
   * @returns {Promise<boolean>}
   */
  const handleSubmitForm = async (data) => {
    const productId = view.mode === 'edit' ? view.product?.id : null
    setFormBusy(true)
    setFormError('')
    try {
      const result = productId ? await updateProduct(productId, data) : await createProduct(data)
      if (!result.ok) {
        setFormError(messageOf(result, t))
        return false
      }
      await refreshState(true)
      setFormDirty(false)
      setView(LIST_VIEW)
      return true
    } catch (caught) {
      setFormError(errText(caught))
      return false
    } finally {
      setFormBusy(false)
    }
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

  /**
   * 关 Tab：不清空表单。平台侧的关闭不可否决，静默清空会让用户连恢复的机会都没有；
   * 若宿主保留 Tab 实例，再次打开还能回到同一个二级页。
   * 但仍在路上的取数请求要作废 —— 迟到的响应不该回来改写已经打开的表单。
   */
  const handleCloseTab = () => {
    editRequest.current += 1
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (api && typeof api.closeTab === 'function') {
      api.closeTab(TAB_ID)
    } else {
      stage?.set?.(false)
    }
  }

  const handleOpenConversation = async () => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined

    // 1. 若当前用户已勾选若干商品，批量挂载选中商品到会话
    if (selectedIds.size > 0) {
      const selectedProducts = products.filter((p) => selectedIds.has(p.id))
      for (const prod of selectedProducts) {
        await deliverProductReference(prod)
      }
      clearSelection()
      return
    }

    // 2. 若仅展示单个商品且未勾选，直接将该商品挂载到会话
    if (visibleProducts.length === 1) {
      await deliverProductReference(visibleProducts[0])
      return
    }

    // 3. 默认展开会话分栏
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

  const formOpen = view.name === 'form'

  return (
    <div
      role="region"
      aria-label={t('stage.title')}
      aria-hidden={visible ? undefined : 'true'}
      className="omnimux-products-stage"
      data-visible={visible ? 'true' : 'false'}
      data-form-dirty={formDirty ? 'true' : 'false'}
      style={visible ? undefined : { display: 'none' }}
    >
      <div
        className="omnimux-products-list-view"
        aria-hidden={formOpen ? 'true' : undefined}
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
          onClose={handleCloseTab}
          closeTitle={t('stage.close')}
        />

        <div className="omnimux-products-action-row">
          <CreateProductMenu t={t} onSelect={handleCreate} />
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
            emptyAction={query.trim() === '' ? <CreateProductMenu t={t} onSelect={handleCreate} /> : null}
            showEmptyAction={query.trim() === ''}
            selectedIds={selectedIds}
            copiedId={copiedId}
            onToggleSelect={toggleSelect}
            onOpen={handleOpenProduct}
            onRemove={(p) => { setPendingRemove({ isBatch: false, product: p, names: [p.name] }) }}
            onCopy={handleCopyCite}
            onAddToChat={deliverProductReference}
            onEmptyAction={handleCreate}
            t={t}
          />
        </div>
      </div>

      {formOpen && (
        <ProductFormPage
          key={`${view.mode === 'edit' ? String(view.product?.id ?? '') : 'create'}:${view.kind}`}
          t={t}
          kind={view.kind}
          mode={view.mode}
          initial={view.mode === 'edit' ? view.product : null}
          serverError={formError}
          saving={formBusy}
          onSubmit={handleSubmitForm}
          onLeave={leaveForm}
          onDirtyChange={handleDirtyChange}
          onPick={handlePick}
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
