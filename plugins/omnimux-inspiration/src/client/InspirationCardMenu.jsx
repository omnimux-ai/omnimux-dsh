import { useState } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconButton } from 'dsh-ui-kit'
import { Ellipsis } from 'lucide-react'

/**
 * The card's overflow menu (Issue 3502).
 *
 * Every content card carries one: local cards get conversation / collection /
 * delete, cloud cards get conversation only. The menu is hidden by CSS until
 * the card is hovered or focused, so the default card face stays content-only.
 */
export function InspirationCardMenu({ t, items, disabled = false }) {
  const [open, setOpen] = useState(false)
  const actions = (Array.isArray(items) ? items : []).filter((item) => item && item.label && typeof item.run === 'function')
  if (actions.length === 0) return null
  return (
    <div
      className="omnimux-inspiration-card-menu"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <Menu
        open={open && !disabled}
        portal
        compact
        align="end"
        items={actions.map(({ id, label }) => ({ id, label }))}
        onClose={() => setOpen(false)}
        onSelect={(id) => {
          setOpen(false)
          actions.find((action) => action.id === id)?.run()
        }}
        anchor={(
          <IconButton
            variant="ghost"
            size="xs"
            className="omnimux-inspiration-card-menu-trigger"
            aria-label={t('card.menu.more')}
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={disabled}
            onClick={() => setOpen((value) => !value)}
          >
            <Ellipsis size={16} aria-hidden="true" />
          </IconButton>
        )}
      />
    </div>
  )
}
