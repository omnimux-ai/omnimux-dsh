import { ConfirmModal } from 'dsh-ui-kit'

/**
 * Confirm removing a library record. Never unlinks the real file.
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
      title={title || t('remove.title').replace('{name}', name)}
      message={name ? `${t('remove.hint')}（关联资产: ${name}）` : t('remove.hint')}
      confirmLabel={t('remove.confirm')}
      cancelLabel={t('remove.cancel')}
      confirmVariant="danger"
      confirmLoading={busy}
      onConfirm={onConfirm}
    />
  )
}
