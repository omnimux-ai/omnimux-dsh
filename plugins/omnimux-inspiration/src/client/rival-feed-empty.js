/**
 * Which empty answer the 账号监控 grid owes the user (#3112).
 *
 * Extracted from `RivalAccountsPanel` because the answer matrix is a pure
 * decision and the panel is a `.jsx` — keeping it here lets node:test pin
 * every branch without a bundler.
 *
 * The spec gives three mutually exclusive empty states — E1「还没有监控
 * 账号」, E2 `正在为你抓取内容`, E3「当前筛选下没有内容」— and the ticket
 * adds the failure exit: the wait ended, nothing collected, the user gets a
 * reason and a retry instead of「暂无监控作品」. Priority order is the spec's
 * mutual exclusion, read top to bottom.
 *
 * @param {Record<string, any>} feed the useRivalFeed state (plus the shell's query/platform)
 * @returns {'loading' | 'no-accounts' | 'fetching' | 'fetch-failed' | 'filtered' | 'no-posts'}
 */
export function feedEmptyKind(feed) {
  // A wait that ended badly outranks everything else — including an active
  // queue elsewhere in the pool, because the user asked about *this* fetch.
  if (feed.fetchPhase) return 'fetch-failed'
  // queued/running with nothing on screen is the E2 promise, not「暂无作品」.
  // It outranks `loading` too: the poll reload keeps `loading` true, and the
  // shimmer must not hide the promise between polls.
  if (feed.fetching) return 'fetching'
  if (feed.loading) return 'loading'
  if (feed.accounts.length === 0) return 'no-accounts'
  if (feed.emptySelection || feed.error || feed.query || feed.platform) return 'filtered'
  return 'no-posts'
}
