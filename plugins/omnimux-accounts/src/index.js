import { createAccountMetaStore, mergeMeta } from './account-meta.js'

export const name = 'omnimux-accounts'
export const inject = ['tools']

export const ACCOUNTS_TOOL_NAMES = [
  'accounts_list',
  'accounts_update_group',
]

function objectParams(fields) {
  const properties = {}
  const required = []
  for (const [key, spec] of Object.entries(fields)) {
    const { required: isRequired, ...rest } = spec
    properties[key] = rest
    if (isRequired) required.push(key)
  }
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  }
}

const jsonOut = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

/**
 * @param {{
 *   tools: { register: (tool: object) => unknown, get?: (name: string) => any },
 *   effect?: (factory: () => () => void, label?: string) => void,
 * }} ctx
 */
export function apply(ctx) {
  const homeDir = process.env.DSH_HOME || process.env.HOME || '.'
  const metaStore = createAccountMetaStore({ home: homeDir })

  async function listZernioAccounts() {
    const tool = ctx.tools.get?.('omnimux_accounts_list')
    if (!tool || typeof tool.execute !== 'function') throw new Error('needs-hub: install the OmniMux execution hub')
    const res = await tool.execute({ provider: 'zernio' })
    if (res?.success === false) throw new Error(res.error?.message || res.message || 'account list failed')
    const rows = Array.isArray(res?.accounts) ? res.accounts : res?.data?.accounts
    if (!Array.isArray(rows)) throw new Error('invalid account list response')
    return rows.filter((acc) => acc?.provider === 'zernio')
  }

  ctx.tools.register({
    name: 'accounts_list',
    description: 'List connected social accounts with local group and agent_usable settings. Optional platform, group, or agent_usable filter.',
    parameters: objectParams({
      platform: { type: 'string', description: 'tiktok | instagram | youtube | x' },
      group: { type: 'string', description: 'Filter by account group name' },
      agent_usable_only: { type: 'boolean', description: 'Only return accounts enabled for Agent use' },
    }),
    output: jsonOut,
    async execute(args) {
      const rawAccounts = await listZernioAccounts()
      const meta = metaStore.read()
      let accounts = rawAccounts.map((acc) => {
        const id = String(acc.id || '')
        const overlaid = meta[id] ? mergeMeta(acc, meta[id]) : { ...acc }
        return {
          id,
          platform: overlaid.platform,
          provider: overlaid.provider,
          account_name: overlaid.account_name || overlaid.name || id,
          avatar_url: overlaid.avatar_url,
          group: overlaid.group || null,
          agent_usable: overlaid.agent_usable !== false,
          status: overlaid.status || 'active',
        }
      })

      if (args.platform) {
        const p = String(args.platform).trim().toLowerCase()
        accounts = accounts.filter((a) => String(a.platform).toLowerCase() === p)
      }
      if (args.group !== undefined && args.group !== '') {
        const g = String(args.group).trim()
        accounts = accounts.filter((a) => a.group === g)
      }
      if (args.agent_usable_only) {
        accounts = accounts.filter((a) => a.agent_usable === true)
      }

      return { count: accounts.length, accounts }
    },
  })

  ctx.tools.register({
    name: 'accounts_update_group',
    description: 'Update the business group name and agent_usable permission flag for a social account.',
    parameters: objectParams({
      id: { type: 'string', required: true, description: 'Social account unique ID' },
      group: { type: 'string', description: 'New business group name (empty string to unassign)' },
      agent_usable: { type: 'boolean', description: 'Enable or disable Agent invocation permission for this account' },
    }),
    output: jsonOut,
    async execute(args) {
      const id = String(args.id)
      const rows = await listZernioAccounts()
      if (!rows.some((acc) => String(acc.id) === id)) {
        throw new Error('account-provider-mismatch: account does not belong to Zernio')
      }
      const patch = {}
      if (args.group !== undefined) patch.group = args.group === '' ? null : String(args.group)
      if (args.agent_usable !== undefined) patch.agent_usable = Boolean(args.agent_usable)
      const updated = metaStore.patch(id, patch)
      return { ok: true, id, meta: updated }
    },
  })
}
