import { listAccounts } from './accounts.js'
import { OmnimuxError } from '../media/errors.js'
import { assertSocialSuccess, requireSocialProvider } from './provider.js'
/**
 * @param {{ withPat: Function }} client
 * @param {{ filename?: string, content_type?: string }} args
 */
export function presignMedia(client, args) {
  return client.withPat('/api/social/v1/media/presign', {
    method: 'POST',
    body: {
      filename: args.filename,
      content_type: args.content_type,
    },
  })
}

/**
 * @param {{ withPat: Function }} client
 * @param {Record<string, unknown>} args
 * @param {{ readForAuthorization: () => Record<string, Record<string, unknown>> }} accountMetaStore
 */
export async function createPost(client, args, accountMetaStore) {
  const provider = requireSocialProvider(args.provider)
  if (!Array.isArray(args.account_ids) || args.account_ids.length === 0 || args.account_ids.some((id) => typeof id !== 'string' || id.trim() === '')) {
    throw new OmnimuxError('invalid-account-ids', 'explicit account IDs are required', { status: 400 })
  }
  const accountIds = [...new Set(args.account_ids)]
  const { accounts } = await listAccounts(client, { provider })
  const available = new Set(accounts.map((row) => row.id))
  if (accountIds.some((id) => !available.has(id))) {
    throw new OmnimuxError('account-provider-mismatch', 'account does not belong to the selected provider', { status: 409 })
  }
  if (typeof accountMetaStore?.readForAuthorization !== 'function') {
    throw new OmnimuxError('account-policy-unavailable', 'account permissions are unavailable', { status: 503 })
  }
  const assertPermission = () => {
    const meta = accountMetaStore.readForAuthorization()
    if (accountIds.some((id) => Object.hasOwn(meta, id) && meta[id].agent_usable === false)) {
      throw new OmnimuxError('account-agent-disabled', 'account does not allow Agent invocation', { status: 403 })
    }
  }
  assertPermission()
  return assertSocialSuccess(await client.withPat('/api/social/v1/posts', {
    method: 'POST',
    body: { ...args, provider, account_ids: accountIds },
  }, assertPermission))
}

/**
 * @param {{ withPat: Function }} client
 * @param {{ id?: string, provider?: unknown }} args
 */
export async function getPost(client, args) {
  const provider = requireSocialProvider(args.provider)
  const id = encodeURIComponent(String(args.id || ''))
  return assertSocialSuccess(await client.withPat(`/api/social/v1/posts/${id}?provider=${provider}`))
}
