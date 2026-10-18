import { useState } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconButton } from 'dsh-ui-kit'
import { Ellipsis } from 'lucide-react'

/** Same official menu used by the shared dropdown; all actions stay within the card. */
export function InspirationCollectionMenu({ t, onMerge, onRename, onRemove, disabled = false }) {
  const [open, setOpen] = useState(false)
  const actions = [
    onMerge && { id: 'merge', label: t('collection.merge'), run: onMerge },
    onRename && { id: 'rename', label: t('collection.rename'), run: onRename },
    onRemove && { id: 'remove', label: t('collection.remove'), run: onRemove },
  ].filter(Boolean)
  return (
    <div className="omnimux-inspiration-collection-menu" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <Menu
        open={open && !disabled} portal compact align="end"
        items={actions.map(({ id, label }) => ({ id, label }))}
        onClose={() => setOpen(false)}
        onSelect={id => { setOpen(false); actions.find(action => action.id === id)?.run() }}
        anchor={<IconButton variant="ghost" aria-label={t('collection.more')} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(value => !value)}><Ellipsis size={16} aria-hidden="true" /></IconButton>}
      />
    </div>
  )
}
