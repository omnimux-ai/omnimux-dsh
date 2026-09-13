/**
 * Pure rules of the 账号监控 account filter and its card adapter.
 *
 * Two jobs live here, both of them things a second implementation would get
 * wrong:
 *
 * 1. **The multi-select set.** The selection is「模式 + 集合」rather than a bare
 *    `Set`, because「反选 from 全部」and「重置 to 全部」are different states with
 *    the same empty set. The explicit mode makes all three rules testable and
 *    lets an account added later fall into the browsing range automatically.
 *
 * 2. **Feed row → card descriptor.** The grid reuses `InspirationCoverCard`
 *    unchanged, so the difference between a library card and a monitored work
 *    has to be expressed in data only — never by forking the card component.
 */

/** Selection whose mode is `'all'`: every monitored account, present and future. */
export const ALL_ACCOUNTS = Object.freeze({ mode: 'all', ids: [] })

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function accountIds(accounts) {
  if (!Array.isArray(accounts)) return []
  return accounts.map((account) => String(account?.id ?? '')).filter(Boolean)
}

/**
 * The selected ids as an array, in account-list order.
 *
 * `all` mode returns every id: callers need the materialized set to compute the
 * next state, and the list order is what makes the request parameter stable.
 * @param {string[]} allIds
 * @param {{ mode?: string, ids?: string[] | Set<string> }} state
 * @returns {string[]}
 */
export function selectedAccountIds(allIds, state) {
  const ids = Array.isArray(allIds) ? allIds : []
  if (state?.mode !== 'subset') return ids.slice()
  const set = state.ids instanceof Set ? state.ids : new Set(state.ids || [])
  return ids.filter((id) => set.has(id))
}

/**
 * Normalize a subset back to `all` when it covers every account.
 *
 * Without this, unchecking the last account and re-checking it would leave the
 * trigger reading「已选 N 个账号」for a selection that is the whole list.
 * @param {string[]} allIds
 * @param {string[]} next
 * @returns {{ mode: 'all' | 'subset', ids: string[] }}
 */
function normalizeSelection(allIds, next) {
  const ids = Array.isArray(allIds) ? allIds : []
  const unique = [...new Set(next)].filter((id) => ids.includes(id))
  if (unique.length === ids.length) return { mode: 'all', ids: [] }
  return { mode: 'subset', ids: unique }
}

/**
 * Check or uncheck one account.
 * @param {{ mode?: string, ids?: string[] | Set<string> }} state
 * @param {string} id
 * @param {string[]} allIds
 * @returns {{ mode: 'all' | 'subset', ids: string[] }}
 */
export function toggleAccountSelection(state, id, allIds) {
  const base = selectedAccountIds(allIds, state)
  const next = base.includes(id) ? base.filter((entry) => entry !== id) : [...base, id]
  return normalizeSelection(allIds, next)
}

/**
 * Invert the selection.
 *
 * From「全部」this yields the empty set — the trigger reads「未选择账号 (0)」and
 * the grid is empty, which is what the prototype does and the honest reading of
 * 「反选」.
 * @param {{ mode?: string, ids?: string[] | Set<string> }} state
 * @param {string[]} allIds
 * @returns {{ mode: 'all' | 'subset', ids: string[] }}
 */
export function invertAccountSelection(state, allIds) {
  const ids = Array.isArray(allIds) ? allIds : []
  const base = new Set(selectedAccountIds(ids, state))
  const next = ids.filter((id) => !base.has(id))
  return normalizeSelection(ids, next)
}

/**
 * Reset to the default: every monitored account, nothing excluded.
 * @returns {{ mode: 'all', ids: string[] }}
 */
export function resetAccountSelection() {
  return { mode: 'all', ids: [] }
}

/**
 * The account filter's value in a request query: `''` means "all" and is left
 * out of the URL entirely, so the two states are distinguishable on the wire.
 * @param {{ mode?: string, ids?: string[] | Set<string> }} state
 * @param {string[]} allIds
 * @returns {string}
 */
export function selectionQuery(state, allIds) {
  if (state?.mode !== 'subset') return ''
  return selectedAccountIds(allIds, state).join(',')
}

/**
 * Trigger label of the account filter.
 *
 * 全部 reads as the bare dimension name (「账号」/「Accounts」), with no tally:
 * design.md §5.1 fixes a full-selection trigger to the dimension name or a
 * name:value pair, and a count of monitored accounts is not what the person
 * reading the trigger is choosing between — it is a property of the list, not
 * of the selection. The tally that still matters is the one a narrowed
 * selection has, and 已选 N 个账号/未选择账号 (0) carry it below.
 * @param {{ mode?: string, ids?: string[] | Set<string> }} state
 * @param {(key: string) => string} t
 * @returns {string}
 */
export function rivalSelectionSummary(state, t) {
  const translate = typeof t === 'function' ? t : (key) => key
  if (state?.mode !== 'subset') return translate('rivalFilter.all')
  const size = state.ids instanceof Set ? state.ids.size : (state.ids || []).length
  if (size === 0) return translate('rivalFilter.none')
  return translate('rivalFilter.some').replace('{k}', String(size))
}

/**
 * One row of the filter panel.
 * @param {Record<string, any>} account
 * @returns {{
 *   id: string, nickname: string, handle: string, platform: string,
 *   avatarUrl: string, profileUrl: string, initial: string,
 *   postCount: number, checked: boolean,
 * }}
 */
export function toAccountFilterRow(account, state) {
  const id = String(account?.id ?? '')
  const nickname = String(account?.nickname || account?.handle || account?.external_id || '')
  const selected = state?.mode !== 'subset'
    ? true
    : (state.ids instanceof Set ? state.ids : new Set(state.ids || [])).has(id)
  return {
    id,
    nickname,
    handle: String(account?.handle || ''),
    platform: String(account?.platform || ''),
    avatarUrl: String(account?.avatar_url || ''),
    profileUrl: String(account?.profile_url || ''),
    // The fallback avatar is drawn, not downloaded: an account whose avatar is
    // missing still needs something to sit where the image would be.
    initial: nickname.replace(/^@/, '').slice(0, 1).toUpperCase(),
    postCount: Number(account?.post_count) || 0,
    checked: selected,
  }
}

/**
 * Feed row → the descriptor `InspirationCoverCard` already understands.
 *
 * The card is shared with the library grid, so the monitored-work shape is
 * carried by data: a composite key (the same post can exist on two accounts), a
 * validated cover address, and platform metadata instead of library actions.
 * @param {Record<string, any>} row
 * @returns {Record<string, any>}
 */
export function toRivalCardRow(row) {
  const account = row?.account || {}
  const title = String(row?.title || row?.text || row?.url || row?.id || '')
  const coverSrc = String(row?.cover_src || '')
  return {
    id: String(row?.row_id || `${row?.account_id || ''}:${row?.id || ''}`),
    title,
    cover_key: coverSrc,
    // Kept beside the display address: the replication chain reads the original
    // and must not be handed a locally rewritten one.
    cover_http_url: coverSrc,
    source_platform: String(row?.source_platform || account.platform || ''),
    source_url: String(row?.url || ''),
    posted_at: String(row?.posted_at || ''),
    duration: typeof row?.duration === 'number' ? row.duration : null,
    stats: row?.stats || {},
    author_name: String(account.nickname || account.handle || ''),
    author_handle: String(account.handle || ''),
    // The card itself shows a platform badge, but the detail dialog names the
    // creator and needs the block: keeping it here means the dialog is handed
    // the same descriptor the card got, not a second shape to keep in sync.
    account: {
      id: String(account.id || ''),
      nickname: String(account.nickname || ''),
      handle: String(account.handle || ''),
      platform: String(account.platform || ''),
      profile_url: String(account.profile_url || ''),
    },
    // Not a library row: it shows a platform badge and carries no in-library
    // selection checkbox, and it has no import status to announce.
    is_local: false,
    in_library: row?.in_library === true,
    inspiration_id: row?.inspiration_id ?? null,
    account_id: String(row?.account_id || ''),
    post_id: String(row?.id || ''),
  }
}

/**
 * Card descriptor → the post shape the「add to session」chain expects.
 *
 * The chain was written for the account column's post rows and reaches for
 * `id`, `account_id` and the local media paths; the grid carries the same facts
 * under the ids the feed endpoint names them with. Mapping here keeps that
 * knowledge in one place instead of teaching the card a second vocabulary.
 * @param {Record<string, any>} card
 * @returns {Record<string, any>}
 */
export function toRivalPost(card) {
  return {
    id: String(card?.post_id || card?.id || ''),
    account_id: String(card?.account_id || ''),
    title: String(card?.title || ''),
    url: String(card?.source_url || ''),
    cover_http_url: String(card?.cover_http_url || ''),
    duration: typeof card?.duration === 'number' ? card.duration : null,
    posted_at: String(card?.posted_at || ''),
    stats: card?.stats || {},
    in_library: card?.in_library === true,
    inspiration_id: card?.inspiration_id ?? null,
  }
}
