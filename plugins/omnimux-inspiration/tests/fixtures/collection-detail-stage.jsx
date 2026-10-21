/**
 * Render-test mount points for the collection detail surface.
 *
 * The gates mount the real components (not copies of their markup): the
 * collection header decides what "return / rename / add to session" look like,
 * and the cover card decides whether a member card is cover-first. A stage keeps
 * the bundling fixture generic and the assertions about product DOM.
 */
import { CollectionHeader } from '../../src/client/CollectionHeader.jsx'
import { InspirationCoverCard } from '../../src/client/InspirationCoverCard.jsx'

export function CoverCardStage({ card, descriptor }) {
  return (
    <div className="omnimux-inspiration-stage">
      <InspirationCoverCard card={card} descriptor={descriptor} />
    </div>
  )
}

export function CollectionHeaderStage(props) {
  return <CollectionHeader {...props} />
}
