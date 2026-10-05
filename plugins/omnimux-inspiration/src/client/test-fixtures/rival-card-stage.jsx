/**
 * Render-test mount point for the v2.1 rival cards.
 *
 * A stage rather than raw component imports: the test asserts on the same
 * `RivalFeedGrid → RivalMasonry → RivalPostCard` chain the panel renders, so
 * an integration break (wrong prop name, dropped callback) fails here first.
 */

import { RivalMasonry } from '../RivalMasonry.jsx'

export function RivalCardStage(props) {
  const {
    cards,
    t,
    onDetail,
    onReplicate,
    onMarkDone,
    onDeconstruct,
    containerWidth,
  } = props
  return (
    <div className="omnimux-rival-card-stage">
      <RivalMasonry
        cards={cards}
        t={t}
        onDetail={onDetail}
        onReplicate={onReplicate}
        onMarkDone={onMarkDone}
        onDeconstruct={onDeconstruct}
        containerWidth={containerWidth}
      />
    </div>
  )
}
