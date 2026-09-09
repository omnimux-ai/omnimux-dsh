/** Session-local selection. Draft text remains owned by the official input. */
export function emptyGuideState() {
  return { selectedId: null }
}

/** Choosing another task replaces its prompt without submitting. */
export function selectStarter(state, draft, { id, prompt }) {
  if (state.selectedId === id) return { status: 'unchanged', state, draft }
  return { status: 'applied', draft: prompt, state: { selectedId: id } }
}

/** Official Session/Conversation state, never the editor's emptiness. */
export function isBlankConversation(session, hasActiveTargets) {
  return Boolean(session && (session.blank || session.awaitingFirstTurn) && !session.running && !hasActiveTargets)
}

/** Dispose together with the Hub; no independent draft persistence. */
export function createGuideStore() {
  const rows = new Map()
  const listeners = new Set()
  return {
    get(id) {
      if (!rows.has(id)) rows.set(id, emptyGuideState())
      return rows.get(id)
    },
    set(id, state) { rows.set(id, state); for (const fn of listeners) fn() },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    dispose() { rows.clear(); listeners.clear() },
  }
}
