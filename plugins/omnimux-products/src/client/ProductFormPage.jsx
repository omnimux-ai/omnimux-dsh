import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Divider, IconButton, PageHeader } from 'dsh-ui-kit'
import { DigitalProductForm } from './DigitalProductForm.jsx'
import { PhysicalProductForm } from './PhysicalProductForm.jsx'
import { mediaPreviewUrl } from './api.js'
import { BackIcon } from './icons.jsx'
import { UnsavedChangesDialog } from './UnsavedChangesDialog.jsx'
import { useProductFormState } from './useProductFormState.js'

/** 形态 → 文案键前缀。`kind` 在进入本页时就已经定死，不再有第二种可能。 */
const COPY = Object.freeze({
  physical: Object.freeze({
    titleCreate: 'add.titlePhysical',
    titleEdit: 'detail.titlePhysical',
    crumbCreate: 'page.crumbCreatePhysical',
    crumbEdit: 'page.crumbEditPhysical',
    subtitleCreate: 'page.subtitleCreatePhysical',
    subtitleEdit: 'page.subtitleEditPhysical',
  }),
  digital: Object.freeze({
    titleCreate: 'add.titleDigital',
    titleEdit: 'detail.titleDigital',
    crumbCreate: 'page.crumbCreateDigital',
    crumbEdit: 'page.crumbEditDigital',
    subtitleCreate: 'page.subtitleCreateDigital',
    subtitleEdit: 'page.subtitleEditDigital',
  }),
})

/**
 * 二级全屏表单页（同 Tab 内子视图）。
 *
 * 形态：整屏覆盖列表视图（`position:absolute; inset:0`），没有模态遮罩、没有浮空
 * 关闭叉号；顶部是常驻返回栏（面包屑 + 未保存圆点），底部是常驻动作条，中间是双栏
 * 内容区。
 *
 * `kind` 决定挂载哪一个专属表单：实物走 `PhysicalProductForm`，数字走
 * `DigitalProductForm`。形态在这里锚定后，表单内部既不渲染形态切换，也不会出现
 * 另一半的字段 —— 这是「实物 / 数字分治」的落点。
 *
 * 未保存保护只有一条守卫（`requestLeave`）：返回、面包屑、取消、Esc 四条路径全部
 * 经过它。干净时直接离开；脏时弹三选一（继续编辑 / 放弃修改 / 保存并返回）。
 *
 * @param {{
 *   t: (key: string) => string,
 *   kind: 'physical' | 'digital',
 *   mode: 'create' | 'edit',
 *   initial?: object | null,
 *   serverError?: string,
 *   saving?: boolean,
 *   onSubmit: (payload: Record<string, unknown>) => Promise<boolean>,
 *   onLeave: () => void,
 *   onDirtyChange?: (dirty: boolean) => void,
 *   onPick: (kind: 'file' | 'directory') => Promise<string[]>,
 * }} props
 */
export function ProductFormPage(props) {
  const {
    t,
    kind,
    mode,
    initial = null,
    serverError = '',
    saving = false,
    onSubmit,
    onLeave,
    onDirtyChange,
    onPick,
  } = props

  const formKind = kind === 'digital' ? 'digital' : 'physical'
  const copy = COPY[formKind]

  const form = useProductFormState(initial, saving, formKind)
  const { state, setters, actions, canSubmit, payload, isDirty } = form

  const [pendingLeave, setPendingLeave] = useState(false)
  const nameRef = useRef(null)

  const productId = mode === 'edit' ? String(initial?.id ?? '') : ''
  const previewOf = useCallback(
    (file) => {
      if (!file || !file.id) return ''
      const isPersisted =
        Boolean(productId) &&
        Array.isArray(initial?.media) &&
        initial.media.some((item) => item && item.id === file.id)
      return mediaPreviewUrl({ productId: isPersisted ? productId : null, mediaId: file.id })
    },
    [productId, initial],
  )

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  // 脏标记只作镜像上报，宿主不得反向写回（表单是唯一真源）。
  useEffect(() => {
    if (typeof onDirtyChange !== 'function') return undefined
    onDirtyChange(isDirty)
    return undefined
  }, [isDirty, onDirtyChange])

  useEffect(() => () => { onDirtyChange?.(false) }, [onDirtyChange])

  const commitLeave = () => {
    setPendingLeave(false)
    onLeave()
  }

  const requestLeave = () => {
    if (isDirty) {
      setPendingLeave(true)
      return
    }
    onLeave()
  }

  const handleSave = async () => {
    if (!canSubmit) return false
    const result = await onSubmit(payload())
    return result === true
  }

  // Esc 走取消路径；确认框打开时不抢键盘（键盘交给 Modal 原语处理）。
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || pendingLeave) return
      event.preventDefault()
      if (isDirty) {
        setPendingLeave(true)
        return
      }
      onLeave()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isDirty, pendingLeave, onLeave])

  const saveRef = useRef(handleSave)
  useEffect(() => { saveRef.current = handleSave })

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (String(event.key).toLowerCase() !== 's') return
      event.preventDefault()
      void saveRef.current()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const displayName = state.name.trim() !== ''
    ? state.name.trim()
    : (mode === 'edit' ? t('page.untitled') : t('page.newProduct'))

  const crumbText = mode === 'edit'
    ? t(copy.crumbEdit).replace('{name}', displayName)
    : t(copy.crumbCreate)

  const title = mode === 'edit' ? t(copy.titleEdit) : t(copy.titleCreate)
  const subtitle = mode === 'edit' ? t(copy.subtitleEdit) : t(copy.subtitleCreate)
  const submitText = mode === 'edit' ? t('detail.save') : t('add.submit')

  const handleSaveAndLeave = () => {
    void handleSave().then((ok) => {
      // 保存失败留在二级页：确认框关掉，错误条可见，输入零丢失、可重试。
      setPendingLeave(false)
      if (ok) onLeave()
    })
  }

  const formProps = {
    t,
    state,
    setters,
    actions,
    busy: saving,
    error: serverError,
    onPick,
    previewOf,
    nameRef,
  }

  return (
    <div className="omnimux-products-subscreen omnimux-products-form-view">
      <PageHeader
        title={title}
        subtitle={subtitle}
        breadcrumb={(
          <div className="omnimux-products-back-path">
            <IconButton
              className="omnimux-products-back-button"
              variant="ghost"
              size="sm"
              aria-label={t('page.back')}
              title={t('page.back')}
              onClick={requestLeave}
            >
              <BackIcon size={16} />
            </IconButton>
            <Button
              variant="ghost"
              size="xs"
              onClick={requestLeave}
            >
              {t('nav')}
            </Button>
            <span className="omnimux-products-back-sep" aria-hidden="true">/</span>
            <span className="omnimux-products-back-current" aria-current="page">{crumbText}</span>
          </div>
        )}
        badge={isDirty ? (
          <span
            className="omnimux-products-dirty-dot"
            role="img"
            aria-label={t('page.unsavedBadge')}
            title={t('page.unsavedBadge')}
          />
        ) : undefined}
        actions={(
          <div className="omnimux-products-form-actions">
            <Button
              variant="ghost"
              onClick={requestLeave}
            >
              {t('add.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!canSubmit}
              loading={saving}
              onClick={() => { void handleSave() }}
            >
              {submitText}
            </Button>
          </div>
        )}
      />

      <Divider className="omnimux-products-form-divider" />

      <div className="omnimux-products-form-scroll">
        {formKind === 'digital'
          ? <DigitalProductForm {...formProps} />
          : <PhysicalProductForm {...formProps} />}
      </div>

      <UnsavedChangesDialog
        t={t}
        open={pendingLeave}
        productName={displayName}
        canSave={canSubmit}
        saving={saving}
        onKeep={() => { setPendingLeave(false) }}
        onDiscard={commitLeave}
        onSaveAndLeave={handleSaveAndLeave}
      />
    </div>
  )
}
