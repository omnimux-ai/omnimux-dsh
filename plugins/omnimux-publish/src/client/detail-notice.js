import { isPublishingAccount } from '../account-policy.js'
import { normalizeTikTokOptions } from '../shared/tiktok-options.js'

/** TikTok app review is pending, so a submitted direct post stays private in-app. */
const PRIVATE_STATUSES = new Set(['submitted', 'reviewing', 'published'])

/**
 * Whether this record's live TikTok direct subtasks are subject to the
 * pre-review "Only you" visibility. Draft, failed and historical non-official
 * rows never qualify, so the notice cannot mislead them.
 * A record explicitly published with a wider privacy level must not show the
 * notice; records without stored options keep the pre-review behavior.
 * @param {Array<Record<string, unknown>>} tasks
 * @param {{ settings?: Record<string, unknown> } | null} [record]
 */
export function showsPrivateNotice(tasks, record) {
  const rows = Array.isArray(tasks) ? tasks : []
  const privacy = normalizeTikTokOptions(record?.settings?.tiktok_options).privacy_level
  if (privacy !== 'SELF_ONLY') return false
  return rows.some((task) => isPublishingAccount(task)
    && typeof task.post_id === 'string' && task.post_id !== ''
    && PRIVATE_STATUSES.has(String(task.status || '')))
}
