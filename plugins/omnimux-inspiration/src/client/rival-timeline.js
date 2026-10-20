/**
 * Pure rules of the account-monitor timeline (#3432).
 *
 * The Host already returns the feed sorted for the `latest` request, but the
 * timeline re-sorts defensively: an appended page, a cached page or a future
 * sort option must never make one account's posts break the descending
 * publish-time order the page promises.
 */

/** @param {Record<string, any>} row */
export function timelineTimestamp(row) {
  const at = Date.parse(String(row?.posted_at ?? ''))
  return Number.isFinite(at) ? at : null
}

/**
 * Newest first, stable: rows with an unreadable timestamp sink to the end and
 * ties fall back to the id so two renders never swap places.
 * @param {Array<Record<string, any>>} rows
 * @returns {Array<Record<string, any>>}
 */
export function sortTimelineRows(rows) {
  const list = Array.isArray(rows) ? rows.slice() : []
  return list.sort((left, right) => {
    const leftAt = timelineTimestamp(left)
    const rightAt = timelineTimestamp(right)
    if (leftAt === null && rightAt === null) return String(right?.id || '').localeCompare(String(left?.id || ''))
    if (leftAt === null) return 1
    if (rightAt === null) return -1
    if (rightAt !== leftAt) return rightAt - leftAt
    return String(right?.id || '').localeCompare(String(left?.id || ''))
  })
}

/** @param {Record<string, any>} row */
export function timelineBody(row) {
  return String(row?.text || row?.title || '')
}

/**
 * First visible character of the author name, for the no-avatar fallback.
 * @param {Record<string, any>} row
 */
export function timelineInitial(row) {
  const name = String(row?.account?.nickname || row?.account?.handle || row?.author_name || '').trim()
  const chars = [...name.replace(/^@/, '')]
  return chars.length > 0 ? chars[0].toUpperCase() : '?'
}

/**
 * Fourth-slot state text of a processed row: 已处理 / 已复刻 / 已互动 · HH:mm.
 * Mirrors the retired card's mapping so the wire's flags keep their meaning.
 * @param {Record<string, any>} card
 * @param {(key: string) => string} t
 * @returns {string}
 */
export function timelineStateText(card, t) {
  const label = String(card?.state_label || '')
  if (label) return label
  if (card?.done_at || card?.state === 'done') return String(t('rivalFeed.card.done'))
  if (card?.state === 'replicated' || card?.in_library) return String(t('rivalFeed.card.replicated'))
  if (card?.state === 'interacted' || card?.interacted_at) {
    const at = Date.parse(String(card?.interacted_at || ''))
    const template = String(t('rivalFeed.card.interacted'))
    if (!Number.isFinite(at)) return template.replace(/\s*·\s*\{time\}/, '')
    const date = new Date(at)
    return template.replace('{time}', `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`)
  }
  return ''
}
