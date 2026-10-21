/**
 * Render-test mount point for the collection card action layer.
 *
 * A stage rather than a raw component import: the test mounts the same
 * `RivalPostCard → InspirationCollectionCard` chain the section renders, so a
 * dropped prop or a broken inner event boundary fails in the gate. The
 * `inspiration` kind mounts the ordinary cover card for the "no collection
 * buttons" assertion.
 */

import { InspirationCollectionCard } from '../../src/client/InspirationCollectionCard.jsx'
import { InspirationCoverCard } from '../../src/client/InspirationCoverCard.jsx'
import { toInspirationCardRow } from '../../src/client/inspiration-card.js'

export function CollectionCardStage({ kind, collection, row, t, preview, addToSessionBusy, onOpen, onView, onAddToSession }) {
  if (kind === 'inspiration') {
    return (
      <InspirationCoverCard
        descriptor={toInspirationCardRow(row, t)}
        column={0}
        actionsNode={null}
        card={{
          row,
          t,
          selected: false,
          selecting: false,
          replicateBusy: false,
          onToggleSelect: () => undefined,
          onSelect: () => undefined,
          onReplicate: () => undefined,
        }}
      />
    )
  }
  return (
    <InspirationCollectionCard
      collection={collection}
      t={t}
      column={0}
      preview={preview}
      addToSessionBusy={addToSessionBusy}
      onOpen={onOpen}
      onView={onView}
      onAddToSession={onAddToSession}
    />
  )
}
