/** Session-local starter state. Draft text remains owned by the official input. */
export function emptyGuideState() {
  return { selectedId: null, lastWritten: null, urlValue: '', syncedValue: '', urlBlock: '', manualUrl: false }
}

/** @param {string} value @param {boolean} multiple */
export function parseVideoUrls(value, multiple) {
  const lines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (!multiple && lines.length > 1) return { error: 'singleUrl', urls: [] }
  const urls = []
  for (const line of lines) {
    try {
      const url = new URL(line)
      if (!/^https?:\/\//i.test(line) || !['http:', 'https:'].includes(url.protocol)
        || !url.hostname || url.username || url.password || /\s/.test(line)) throw new Error('invalid')
      if (!urls.includes(line)) urls.push(line)
    } catch { return { error: 'invalidUrl', urls: [] } }
  }
  return { error: null, urls }
}

function hasOwnedBlock(draft, block) {
  if (!block) return true
  const index = draft.indexOf(block)
  if (index < 0 || index !== draft.lastIndexOf(block)) return false
  const end = index + block.length
  return (index === 0 || draft.slice(index - 2, index) === '\n\n')
    && (end === draft.length || draft.slice(end, end + 2) === '\n\n')
}

/** Read user-edited reference paragraphs only during explicit template replacement. */
function currentReferenceBlock(state, draft) {
  if (!state.urlBlock) return ''
  if (hasOwnedBlock(draft, state.urlBlock)) return state.urlBlock
  const label = state.urlBlock.split('\n')[0].split(/[:：]/)[0]
  return draft.split(/\n\s*\n/).find(part => part.startsWith(`${label}:`) || part.startsWith(`${label}：`)) || ''
}

/** Choosing another task replaces its prompt and retains the current references. */
export function selectStarter(state, draft, { id, prompt }) {
  if (state.selectedId === id) return { status: 'unchanged', state, draft }
  const references = currentReferenceBlock(state, draft)
  const nextDraft = prompt + (references ? `\n\n${references}` : '')
  const detached = state.manualUrl || !hasOwnedBlock(draft, state.urlBlock)
  return {
    status: 'applied', draft: nextDraft,
    state: { ...state, selectedId: id, lastWritten: nextDraft,
      ...(detached ? { urlValue: '', syncedValue: '', urlBlock: '', manualUrl: false } : {}),
    },
  }
}

/**
 * Update only the exact reference paragraph that this feature last wrote.
 * A user's edit or deletion transfers ownership permanently back to the draft.
 */
export function syncVideoUrls(state, draft, { multiple, label }) {
  if (state.manualUrl || !hasOwnedBlock(draft, state.urlBlock)) {
    return { status: 'manualUrl', draft, state: { ...state, manualUrl: true } }
  }
  const parsed = parseVideoUrls(state.urlValue, multiple)
  if (parsed.error) return { status: parsed.error, state, draft }
  if (state.urlValue === state.syncedValue) return { status: 'ready', state, draft }
  let body = draft
  if (state.urlBlock) {
    const index = draft.indexOf(state.urlBlock)
    // The separator immediately before our paragraph is ours; other whitespace is not.
    const start = index >= 2 && draft.slice(index - 2, index) === '\n\n' ? index - 2 : index
    body = draft.slice(0, start) + draft.slice(index + state.urlBlock.length)
  }
  const urls = parsed.urls.filter(url => !body.split(/\s+/).includes(url))
  const block = urls.length ? `${label}:\n${urls.join('\n')}` : ''
  const nextDraft = body + (block ? `${body ? '\n\n' : ''}${block}` : '')
  return {
    status: nextDraft === draft ? 'ready' : 'synced', draft: nextDraft,
    state: { ...state, urlBlock: block, syncedValue: state.urlValue,
      lastWritten: draft === state.lastWritten ? nextDraft : state.lastWritten },
  }
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
