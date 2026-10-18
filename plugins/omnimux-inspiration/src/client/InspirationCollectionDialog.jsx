import { useEffect, useRef, useState } from 'react'
import { Button, InputField, ModalDialog } from 'dsh-ui-kit'
import { InspirationCollectionCard } from './InspirationCollectionCard.jsx'

/** @typedef {import('./InspirationCollectionCard.jsx').InspirationCollection} InspirationCollection */
/** @typedef {{ kind: 'create'|'add'|'rename', collection?: InspirationCollection, items?: Record<string, any>[], defaultName?: string, names?: string[] }} CollectionIntent */

function previewOf(intent, title) {
  const collection = intent.collection
  const existingIds = new Set(collection?.item_ids || [])
  const additions = (intent.items || []).filter((item, index, rows) => !existingIds.has(item.id)
    && rows.findIndex(row => row.id === item.id) === index)
  const items = intent.kind === 'add' ? [...(collection?.preview_items || []), ...additions] : additions
  return {
    id: collection?.id || 'preview',
    title,
    item_ids: [...existingIds, ...additions.map(item => item.id)],
    item_count: intent.kind === 'add'
      ? Math.max(Number(collection?.item_count) || 0, existingIds.size) + additions.length
      : additions.length,
    preview_items: items.slice(0, 3),
  }
}

function CollectionDialogBody({ intent, t, onClose, onConfirm, busy, error }) {
  const kind = intent.kind
  const [name, setName] = useState(() => String(intent.defaultName ?? intent.collection?.title ?? ''))
  const [confirming, setConfirming] = useState(false)
  const inputRef = useRef(null)
  const composing = useRef(false)
  const submitting = useRef(false)
  const locked = Boolean(busy) || confirming
  const trimmed = kind === 'add' ? String(intent.collection?.title || '').trim() : name.trim()
  const nameLength = Array.from(trimmed).length
  const duplicate = (intent.names || []).some(value => value.trim() === trimmed)
    && !(kind === 'rename' && trimmed === String(intent.collection?.title || '').trim())
  const validation = kind === 'add' ? ''
    : !trimmed ? t('collection.nameRequired')
      : nameLength > 20 ? t('collection.nameTooLong')
        : duplicate ? t('collection.nameExists') : ''

  useEffect(() => {
    if (kind === 'add') return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [kind])

  const close = () => {
    if (!locked && !submitting.current) onClose()
  }
  const confirm = async event => {
    event?.preventDefault()
    if (locked || submitting.current || composing.current || validation) return
    submitting.current = true
    setConfirming(true)
    try {
      await onConfirm(trimmed)
    } finally {
      submitting.current = false
      setConfirming(false)
    }
  }

  const titleKey = kind === 'create' ? 'collection.create' : kind === 'add' ? 'collection.add' : 'collection.rename'
  const preview = previewOf(intent, trimmed || intent.defaultName || t('collection.new'))
  return (
    <ModalDialog
      open
      title={t(titleKey)}
      description={kind === 'rename' ? undefined : t(kind === 'add' ? 'collection.addHint' : 'collection.createHint')}
      closeLabel={t('collection.close')}
      onClose={close}
      className="omnimux-inspiration-collection-dialog"
      footer={(
        <div className="omnimux-inspiration-collection-dialog-actions">
          <Button variant="outline" disabled={locked} onClick={close}>{t('collection.cancel')}</Button>
          <Button variant="primary" loading={locked} disabled={locked || Boolean(validation)} onClick={confirm}>
            {t(kind === 'add' ? 'collection.add' : 'collection.confirm')}
          </Button>
        </div>
      )}
    >
      <form className="omnimux-inspiration-collection-form" onSubmit={confirm} aria-busy={locked || undefined}>
        {kind !== 'rename' ? (
          <div className="omnimux-inspiration-collection-dialog-preview" aria-label={t('collection.preview')}>
            <InspirationCollectionCard collection={preview} t={t} preview />
          </div>
        ) : null}
        {kind !== 'add' ? (
          <InputField
            ref={inputRef}
            autoFocus
            label={(
              <span className="omnimux-inspiration-collection-name-label">
                <span>{t('collection.name')}</span>
                <span className="omnimux-inspiration-collection-name-count">{nameLength}/20</span>
              </span>
            )}
            placeholder={t('collection.namePlaceholder')}
            value={name}
            disabled={locked}
            error={validation}
            hint={t('collection.nameHint')}
            onChange={event => setName(event.target.value)}
            onCompositionStart={() => { composing.current = true }}
            onCompositionEnd={() => { composing.current = false }}
            onKeyDown={event => {
              if (event.key !== 'Enter') return
              if (composing.current || event.nativeEvent.isComposing) return
              event.preventDefault()
              if (event.nativeEvent.keyCode === 229) return
              confirm(event)
            }}
          />
        ) : null}
        {error ? <div className="omnimux-inspiration-collection-dialog-error" role="alert">{String(error)}</div> : null}
      </form>
    </ModalDialog>
  )
}

/**
 * @param {{
 *   intent: CollectionIntent | null,
 *   t: (key: string) => string,
 *   onClose: () => void,
 *   onConfirm: (name: string) => void | Promise<void>,
 *   busy?: boolean,
 *   error?: string,
 * }} props
 */
export function InspirationCollectionDialog(props) {
  const { intent } = props
  if (!intent) return null
  const key = `${intent.kind}:${intent.collection?.id || ''}:${(intent.items || []).map(item => item.id).join(',')}`
  return <CollectionDialogBody key={key} {...props} />
}
