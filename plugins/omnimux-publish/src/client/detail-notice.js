import { isPublishingAccount } from '../account-policy.js'

/** TikTok app review is pending, so a submitted direct post stays private in-app. */
const PRIVATE_STATUSES = new Set(['submitted', 'reviewing', 'published'])

/**
 * Whether this record's live TikTok direct subtasks are subject to the
 * pre-review "Only you" visibility. Draft, failed and historical non-official
 * rows never qualify, so the notice cannot mislead them.
 * @param {Array<Record<string, unknown>>} tasks
 */
export function showsPrivateNotice(tasks) {
  const rows = Array.isArray(tasks) ? tasks : []
  return rows.some((task) => isPublishingAccount(task)
    && typeof task.post_id === 'string' && task.post_id !== ''
    && PRIVATE_STATUSES.has(String(task.status || '')))
}
