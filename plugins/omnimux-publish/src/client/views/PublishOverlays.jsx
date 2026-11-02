import { ConfirmModal } from 'dsh-ui-kit'
import { Composer } from '../Composer/index.jsx'
import { RecordDetail } from '../RecordDetail.jsx'

export function PublishOverlays({
  t,
  view,
  onBack,
  onManageAccounts,
  onSubmitted,
  onSaved,
  onChanged,
  detailTick,
}) {
  if (view.name === 'composer') {
    return (
      <div className="omnimux-publish-subscreen">
        <Composer
          t={t}
          draftId={view.draftId}
          onBack={onBack}
          onManageAccounts={onManageAccounts}
          onSubmitted={onSubmitted}
          onSaved={onSaved}
        />
      </div>
    )
  }
  if (view.name === 'detail') {
    return (
      <div className="omnimux-publish-subscreen">
        <RecordDetail
          key={`${view.recordId}:${detailTick}`}
          t={t}
          recordId={view.recordId}
          onBack={onBack}
          onChanged={onChanged}
        />
      </div>
    )
  }
  return null
}

function resolveDeleteTargetTitle(item) {
  if (!item) return ''
  if (item.title) return String(item.title)
  if (item.description) return String(item.description)
  return String(item.id || '')
}

export function PublishDeleteConfirmModal({
  t,
  pendingDelete,
  busyDelete,
  onConfirm,
  onClose,
}) {
  const open = Boolean(pendingDelete)
  const title = resolveDeleteTargetTitle(pendingDelete)
  const message = t('records.deleteConfirm', { title })

  return (
    <ConfirmModal
      open={open}
      title={t('records.delete')}
      message={message}
      confirmLabel={t('records.delete')}
      cancelLabel={t('close')}
      closeLabel={t('close')}
      confirmVariant="danger"
      confirmLoading={busyDelete}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  )
}
