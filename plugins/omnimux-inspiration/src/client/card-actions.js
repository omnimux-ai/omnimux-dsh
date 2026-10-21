/**
 * The ⋯ menu contract of a library card (Issue 3502), kept pure so the item set
 * can be asserted without a DOM.
 *
 * Local cards can start a conversation, merge into a collection (or leave the
 * one they are in), and delete the local record. Cloud cards have no local
 * record, so they only offer the conversation entry.
 */
export function buildCardMenuItems(io) {
  const translate = typeof io?.t === 'function' ? io.t : (key) => key
  const items = [{
    id: 'chat',
    label: translate('card.menu.addToConversation'),
    run: io.onAddToConversation,
  }]
  if (io.local && !io.inCollection) {
    items.push({ id: 'merge', label: translate('collection.merge'), run: io.onMerge })
  }
  if (io.local && io.inCollection) {
    items.push({ id: 'remove', label: translate('collection.remove'), run: io.onRemove })
  }
  if (io.local) {
    items.push({ id: 'delete', label: translate('card.menu.delete'), run: io.onDelete })
  }
  return items.filter((item) => typeof item.run === 'function')
}
