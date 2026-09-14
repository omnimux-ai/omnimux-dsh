import { useEffect, useRef } from 'react'
import { Button, ModalDialog, focusFirstDescendant, trapFocus } from 'dsh-ui-kit'

/**
 * 未保存离开拦截：三选一确认。
 *
 * 安全项在最前（「继续编辑」是默认焦点，也是点遮罩 / 按 Esc / 点右上关闭的落点），
 * 破坏性操作在中间，保存并返回在最后。三条路径共用同一组件，避免每个入口各写一套。
 *
 * @param {{
 *   t: (key: string) => string,
 *   open: boolean,
 *   productName: string,
 *   canSave: boolean,
 *   saving: boolean,
 *   onKeep: () => void,
 *   onDiscard: () => void,
 *   onSaveAndLeave: () => void,
 * }} props
 */
export function UnsavedChangesDialog(props) {
  const { t, open, productName, canSave, saving, onKeep, onDiscard, onSaveAndLeave } = props
  const panelRef = useRef(null)
  const restoreRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    // 打开前记录触发元素，关闭后把焦点还回去，键盘用户不会掉到页面角落。
    restoreRef.current = typeof document !== 'undefined' ? document.activeElement : null
    const timer = setTimeout(() => {
      if (panelRef.current) focusFirstDescendant(panelRef.current)
    }, 0)
    return () => {
      clearTimeout(timer)
      const node = restoreRef.current
      if (node && typeof node.focus === 'function') node.focus()
    }
  }, [open])

  const handleKeyDown = (event) => {
    if (panelRef.current) trapFocus(panelRef.current, event)
  }

  const message = t('unsaved.message').replace('{name}', productName)

  return (
    <ModalDialog
      open={open}
      size="sm"
      title={t('unsaved.title')}
      description={message}
      onClose={onKeep}
      closeLabel={t('unsaved.keep')}
      footer={(
        <div
          className="omnimux-products-unsaved-actions"
          ref={panelRef}
          onKeyDown={handleKeyDown}
        >
          <Button
            variant="ghost"
            onClick={onKeep}
          >
            {t('unsaved.keep')}
          </Button>
          <Button
            variant="danger"
            onClick={onDiscard}
          >
            {t('unsaved.discard')}
          </Button>
          <Button
            variant="primary"
            disabled={!canSave}
            loading={saving}
            onClick={onSaveAndLeave}
          >
            {t('unsaved.saveAndLeave')}
          </Button>
        </div>
      )}
    />
  )
}
