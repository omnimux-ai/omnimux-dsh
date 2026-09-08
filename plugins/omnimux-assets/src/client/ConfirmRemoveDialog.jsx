import { ConfirmModal } from 'dsh-ui-kit'

/**
 * Confirm removing an index record. Only eligible, unreferenced managed files may be recycled.
 * @param {{
 *   t: (key: string) => string,
 *   name: string,
 *   title?: string,
 *   busy: boolean,
 *   onCancel: () => void,
 *   onConfirm: () => void,
 * }} props
 */
export function ConfirmRemoveDialog({ t, name, title, busy, onCancel, onConfirm }) {
  return (
    <ConfirmModal
      open
      onClose={onCancel}
      title={title && !title.startsWith('confirm.') ? title : t('mapping.removeTitle').replace('{name}', name)}
      message={t('mapping.removeHint')}
      confirmLabel={t('mapping.removeConfirm')}
      cancelLabel={t('mapping.cancel')}
      confirmVariant="danger"
      confirmLoading={busy}
      onConfirm={onConfirm}
    />
  )
}
