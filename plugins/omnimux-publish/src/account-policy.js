/** The publishing plugin owns only TikTok official accounts. */
export const PUBLISH_PROVIDER = 'tiktok_direct'

/** @param {unknown} row @returns {row is Record<string, unknown> & { platform: 'tiktok', provider: 'tiktok_direct' }} */
export function isPublishingAccount(row) {
  if (!row || typeof row !== 'object') return false
  const account = /** @type {Record<string, unknown>} */ (row)
  return account.platform === 'tiktok' && account.provider === PUBLISH_PROVIDER
}

/** @param {Record<string, unknown>} task */
export function isRetryablePublishingTask(task) {
  return isPublishingAccount(task) && task.status === 'failed' && typeof task.id === 'string' && task.id !== ''
}

export const ACCOUNT_SOURCE_MESSAGE = '原账号不属于官方发布链路或已不可用，请重新选择 TikTok 官方授权账号。'
