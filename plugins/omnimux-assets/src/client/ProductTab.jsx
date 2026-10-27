import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, ConfirmModal } from 'dsh-ui-kit'
import {
  ChatIcon,
  CreateProductMenu,
  ProductGrid,
  createProduct,
  deleteProduct,
  deliverProductReference,
  getProductForEdit,
  getState,
  injectProductsStyles,
  pickPath,
  updateProduct,
} from 'omnimux-products/ui'

const POLL_MS = 5000

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

/**
 * 归一化形态：只认 `digital`，其余一律实物。菜单的选择、列表行的形态、取回的完整
 * 记录共用同一口径，二级页拿到的永远是这两种之一。
 */
function normalizedKind(value) {
  return value === 'digital' ? 'digital' : 'physical'
}

/**
 * 资产库「产品库」Tab 的内容区。
 *
 * 视图状态机：`view = { name: 'list' } | { name: 'form', mode, kind, product }`。
 * 二级页是**同一 Tab 内的覆盖层**（`position:absolute; inset:0`），不是弹窗，也不再
 * 跳去另一个工作台 Tab —— 因此「返回」回到的就是用户点进来的这个产品库列表，
 * 而不是另一个页面里的同名列表。
 *
 * 列表常驻挂载：切到二级页不卸载列表，返回时筛选、搜索与滚动位置完好。
 * 产品表单、卡片、链接解析与样式全部来自 `omnimux-products/ui`（单真源），
 * 资产库这里只持有页面级状态与工作台动作。
 *
 * @param {{
 *   t: (key: string) => string,
 *   visible?: boolean,
 *   query?: string,
 *   kindTab?: string,
 *   intent?: { mode: 'create' | 'edit', kind?: string, productId?: string | null, nonce?: number } | null,
 *   onOpenConversation?: () => void,
 * }} props
 */
export function ProductTab(props) {
  const { t, visible = true, query = '', kindTab = 'all', intent = null, onViewChange, onOpenConversation } = props

  useEffect(() => { injectProductsStyles() }, [])

  const [products, setProducts] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState(LIST_VIEW)
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [pendingRemove, setPendingRemove] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())

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
    } catch (caught) {
      setError(errText(caught))
    } finally {
      if (!silent) setBusy(false)
    }
  }, [t])

  useEffect(() => {
    if (!visible) return undefined
    void refreshState(true)
    const timer = setInterval(() => { void refreshState(true) }, POLL_MS)
    return () => { clearInterval(timer) }
  }, [visible, refreshState])

  const handleCreate = useCallback((kind) => {
    editRequest.current += 1
    setFormError('')
    setView({ name: 'form', mode: 'create', kind: normalizedKind(kind), product: null })
  }, [])

  const handleOpenProduct = useCallback(async (product) => {
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
  }, [t])

  const leaveForm = useCallback(() => {
    editRequest.current += 1
    setFormBusy(false)
    setFormError('')
    setView(LIST_VIEW)
  }, [])

  /**
   * 宿主（资产库动作行 / 产品选择器 / Agent 自动跟随）送来的开页意图。
   * 只在 nonce 变化时执行一次：同一产品连点两次也要重新展开二级页。
   */
  const lastIntentNonce = useRef(null)
  useEffect(() => {
    if (!intent || intent.nonce === lastIntentNonce.current) return
    lastIntentNonce.current = intent.nonce ?? null
    if (intent.mode === 'create') {
      handleCreate(intent.kind)
    } else if (intent.mode === 'edit' && intent.productId) {
      void handleOpenProduct({ id: intent.productId, kind: intent.kind })
    }
  }, [intent, handleCreate, handleOpenProduct])

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
      setView(LIST_VIEW)
      return true
    } catch (caught) {
      setFormError(errText(caught))
      return false
    } finally {
      setFormBusy(false)
    }
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

  const toggleSelect = (product) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(product.id)) next.delete(product.id)
      else next.add(product.id)
      return next
    })
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

  /**
   * 二级页由资产库 Stage 根渲染（铺满整个区域），本组件只上报「现在该显示什么」。
   * 每次渲染重建一次视图描述：表单的提交/离开/取文件都闭包在最新状态上。
   */
  useEffect(() => {
    if (!onViewChange) return
    onViewChange(view.name === 'form'
      ? {
          name: 'form',
          kind: view.kind,
          mode: view.mode,
          product: view.product,
          error: formError,
          saving: formBusy,
          onSubmit: handleSubmitForm,
          onLeave: leaveForm,
          onPick: handlePick,
        }
      : null)
  }, [view, formError, formBusy, onViewChange, handleSubmitForm, leaveForm, handlePick])

  const onOpen = view.name === 'form'
    ? null
    : (product) => { void handleOpenProduct(product) }

  return (
    <div className="omnimux-products-list-view omnimux-assets-product-tab">
      {error ? (
        <div className="omnimux-products-error" role="alert">{error}</div>
      ) : null}

      <ProductGrid
        t={t}
        products={visibleProducts}
        emptyLabel={query.trim() ? t('empty.noMatch') : t('empty.all')}
        showEmptyAction={!query.trim()}
        emptyAction={<CreateProductMenu t={t} onSelect={handleCreate} />}
        onOpen={onOpen}
        onAddToChat={(product) => { void deliverProductReference(product) }}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
      />

      {selectedIds.size > 0 ? (
        <div className="omnimux-products-selection">
          <span>{t('select.count').replace('{n}', String(selectedIds.size))}</span>
          <div className="omnimux-products-selection-actions">
            <Button variant="ghost" size="sm" onClick={() => { setSelectedIds(new Set()) }}>
              {t('select.clear')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<ChatIcon size={13} />}
              onClick={async () => {
                const chosen = products.filter((p) => selectedIds.has(p.id))
                for (const product of chosen) await deliverProductReference(product)
                setSelectedIds(new Set())
                onOpenConversation?.()
              }}
            >
              {t('add.chatButton')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const chosen = products.filter((p) => selectedIds.has(p.id))
                setPendingRemove({
                  ids: chosen.map((p) => p.id),
                  names: chosen.map((p) => p.name),
                  isBatch: true,
                })
              }}
            >
              {t('select.delete').replace('{n}', String(selectedIds.size))}
            </Button>
          </div>
        </div>
      ) : null}

      {pendingRemove ? (
        <ConfirmModal
          open
          onClose={() => setPendingRemove(null)}
          title={
            pendingRemove.isBatch
              ? t('select.removeTitle').replace('{n}', String(pendingRemove.ids.length))
              : t('remove.title').replace('{name}', String(pendingRemove.names[0] ?? ''))
          }
          message={
            String(pendingRemove.names[0] ?? '')
              ? `${t('remove.hint')}（关联资产: ${String(pendingRemove.names[0] ?? '')}）`
              : t('remove.hint')
          }
          confirmLabel={t('remove.confirm')}
          cancelLabel={t('remove.cancel')}
          confirmVariant="danger"
          confirmLoading={busy}
          onConfirm={handleConfirmDelete}
        />
      ) : null}
    </div>
  )
}
