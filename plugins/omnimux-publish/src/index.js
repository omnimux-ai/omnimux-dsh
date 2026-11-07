/**
 * omnimux-publish Host half: Config 解析 → stores → dispatcher → 工具注册 →
 * prompt section → 惰性 HTTP 挂载。
 *
 * 同源约束：9 个 publish_* 工具的 execute 与 /omnimux/publish HTTP 路由调
 * 同一个 dispatcher（http-routes.js createPublishDispatcher）。
 */
import { createPublishDispatcher, registerPublishRoutes } from './http-routes.js'
import { parsePublishConfig } from './config.js'
import { resolvePublishPaths } from './paths.js'
import { createRecordStore } from './store.js'
import { createMediaStore } from './media.js'
import { createHubChannel } from './hubtools.js'
import { createAccountSource } from './accounts.js'
import { createSubmitService } from './submit.js'

export const name = 'omnimux-publish'
export const inject = ['tools', 'systemPrompt']

const PUBLISH_PROMPT = `This workspace may mount the omnimux-publish content publishing center.
publish_list_records lists records (status_filter: draft | submitted | reviewing | published | failed | all; the three UI tabs are views of this same ledger).
publish_create_draft / publish_update_draft manage drafts (type: video | image; media entries take a local path or an imported media_id); publish_delete_draft needs confirm:true.
publish_list_accounts lists connected social accounts (from the omnimux hub); publish_assign_accounts attaches accounts to a draft (availability + platform capability checks run on both assign and submit).
publish_submit publishes a draft: media upload via presign, then one create call per account — a single account failing never blocks the others; results land in the per-account subtask ledger.
publish_get_record returns the record with per-account subtask statuses (refresh:true polls the platform first); publish_retry_task retries one failed account, reusing already uploaded media.
Unpublished drafts need neither OmniMux sign-in nor the hub; submitting requires the omnimux hub plugin and an OmniMux sign-in.`

/**
 * Compile a flat field table into a JSON Schema object. Raw `register`
 * does not run defineTool, so the wire schema must already be type:object.
 * @param {Record<string, Record<string, unknown> & { required?: boolean }>} fields
 */
function objectParams(fields) {
  /** @type {Record<string, unknown>} */
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
 *   tools: { register: (tool: object) => unknown },
 *   systemPrompt?: { section: (spec: object) => unknown },
 *   effect?: (fn: () => unknown, label?: string) => unknown,
 *   inject?: (deps: string[], callback: (inner: object) => void) => void,
 * }} ctx
 * @param {Record<string, unknown>} [config]
 */
export function apply(ctx, config = {}) {
  const parsed = parsePublishConfig(config)
  const paths = resolvePublishPaths({
    dataDir: parsed.dataDir,
    accountsOverlayPath: parsed.accountsOverlayPath,
  })

  const store = createRecordStore({ paths })
  store.recover() // 中断恢复：遗留 submitting 子任务 → failed('interrupted')
  const media = createMediaStore({ paths, maxBytes: parsed.maxMediaMb * 1024 * 1024 })
  const channel = createHubChannel({ tools: ctx.tools })
  const accounts = createAccountSource({ channel, overlayPath: paths.accountsOverlayPath })
  const service = createSubmitService({ store, media, channel, accounts, config: parsed })
  const dispatcher = createPublishDispatcher({ store, media, accounts, service, channel, config: parsed })

  // ---- 惰性 HTTP 挂载（webServer 是 Service，就绪后端口才可读）----
  const mountHttp = (httpCtx) => {
    const webServer = httpCtx.webServer ?? httpCtx.get?.('webServer')
    if (!webServer || typeof webServer.register !== 'function') return
    const mount = () => registerPublishRoutes(webServer, dispatcher)
    if (typeof httpCtx.effect === 'function') httpCtx.effect(mount, 'omnimux-publish: http routes')
    else mount()
  }
  if (typeof ctx.inject === 'function') ctx.inject(['webServer'], mountHttp)
  else mountHttp(ctx)

  // ---- systemPrompt section ----
  if (ctx.systemPrompt && typeof ctx.systemPrompt.section === 'function') {
    const registerPrompt = () => ctx.systemPrompt.section({
      name: 'publish:ops',
      order: 51,
      text: PUBLISH_PROMPT,
    })
    if (typeof ctx.effect === 'function') ctx.effect(registerPrompt, 'publish.ops')
    else registerPrompt()
  }

  // ---- 卸载清理：in-flight runner 标 interrupted ----
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => service.dispose('plugin unloaded'), 'omnimux-publish: submit runners')
  }

  // ---- 9 个 publish_* 工具（raw register + objectParams，同 omnix-assets 范式）----
  ctx.tools.register({
    name: 'publish_list_records',
    description:
      'List omnimux-publish records (drafts and submissions share one ledger). status_filter: "draft" (draft box), "submitted" (all published/submission records), "reviewing" (records with tasks under platform review), "published", "failed", "all". Optional type filter (video | image) and page.',
    parameters: objectParams({
      status_filter: { type: 'string', enum: ['draft', 'submitted', 'reviewing', 'published', 'failed', 'all'], description: 'Which view of the ledger to list (UI three-tab filter)' },
      type: { type: 'string', enum: ['video', 'image'], description: 'Optional record type filter' },
      page: { type: 'number', description: '1-based page (50 per page)' },
    }),
    output: jsonOut,
    async execute(args) {
      return dispatcher.listRecords({
        status_filter: args.status_filter,
        type: args.type,
        page: args.page,
      })
    },
  })

  ctx.tools.register({
    name: 'publish_create_draft',
    description:
      'Create a publishing draft. type: video | image. payload: { title?, description?, topics?: string[], media: [{ path | media_id, kind? }], cover?: { path | media_id }, settings? }. Local file paths are imported into the plugin media store (sha256, deduplicated) — never uploaded until submit. Returns the draft plus content_errors from the same validation submit uses.',
    parameters: objectParams({
      type: { type: 'string', required: true, enum: ['video', 'image'] },
      payload: {
        type: 'object',
        required: true,
        description: 'Draft content payload (title/description/topics/media/cover/settings)',
        additionalProperties: true,
      },
    }),
    output: jsonOut,
    async execute(args) {
      return dispatcher.createDraft({ type: args.type, payload: args.payload })
    },
  })

  ctx.tools.register({
    name: 'publish_update_draft',
    description:
      'Update a draft (only drafts are editable). patch uses the same payload shape as publish_create_draft; omitted fields stay unchanged.',
    parameters: objectParams({
      draft_id: { type: 'string', required: true, description: 'Draft record id (rec_…)' },
      patch: { type: 'object', required: true, description: 'Fields to patch (title/description/topics/media/cover/settings/account_ids)', additionalProperties: true },
    }),
    output: jsonOut,
    async execute(args) {
      return dispatcher.updateDraft({ draft_id: args.draft_id, patch: args.patch })
    },
  })

  ctx.tools.register({
    name: 'publish_delete_draft',
    description: 'Delete a draft. Requires confirm:true — without it the call fails with confirm-required instead of deleting.',
    parameters: objectParams({
      draft_id: { type: 'string', required: true, description: 'Draft record id (rec_…)' },
      confirm: { type: 'boolean', required: true, description: 'Must be true to actually delete' },
    }),
    output: jsonOut,
    async execute(args) {
      return dispatcher.deleteDraft({ draft_id: args.draft_id, confirm: args.confirm === true })
    },
  })

  ctx.tools.register({
    name: 'publish_list_accounts',
    description:
      'List connected social accounts (platform, display name, status, agent_usable). Requires the omnimux hub plugin; reading the list needs an OmniMux sign-in (returns degraded:"needs-omnimux" otherwise). Optional platform filter.',
    parameters: objectParams({
      platform: { type: 'string', description: 'Optional platform filter (e.g. xiaohongshu)' },
    }),
    output: jsonOut,
    async execute(args) {
      return dispatcher.listAccounts({ platform: args.platform })
    },
  })

  ctx.tools.register({
    name: 'publish_assign_accounts',
    description:
      'Attach accounts to a draft (platform → account two-level selection in the UI). Validates each account exists, is available, and its platform capabilities do not conflict with the draft content (media type / cover / image count).',
    parameters: objectParams({
      draft_id: { type: 'string', required: true, description: 'Draft record id (rec_…)' },
      account_ids: { type: 'array', required: true, items: { type: 'string' }, description: 'Account ids to attach' },
    }),
    output: jsonOut,
    async execute(args) {
      return dispatcher.assignAccounts({ draft_id: args.draft_id, account_ids: args.account_ids })
    },
  })

  ctx.tools.register({
    name: 'publish_submit',
    description:
      'One-click publish a draft: validates, uploads media via presign, then creates one post per account (isolated failures; per-account subtasks land in the ledger immediately). Inlined — resolves when all accounts settled. Requires the omnimux hub plugin and an OmniMux sign-in.',
    parameters: objectParams({
      draft_id: { type: 'string', required: true, description: 'Draft record id (rec_…)' },
    }),
    output: jsonOut,
    async execute(args, exec) {
      // exec.agent 透传进嵌套 ctx.tools.execute：ask 审批策略能正确路由回会话
      return dispatcher.submit({
        record_id: args.draft_id,
        agent: exec && typeof exec === 'object' ? exec.agent : undefined,
        signal: exec && typeof exec === 'object' ? exec.signal : undefined,
      })
    },
  })

  ctx.tools.register({
    name: 'publish_get_record',
    description:
      'Get one record with per-account subtask statuses. refresh (default true) polls the hub for the latest platform status of each task before answering.',
    parameters: objectParams({
      record_id: { type: 'string', required: true, description: 'Record id (rec_…)' },
      refresh: { type: 'boolean', description: 'Poll hub status first (default true)' },
    }),
    output: jsonOut,
    async execute(args, exec) {
      return dispatcher.getRecord({
        record_id: args.record_id,
        refresh: args.refresh !== false,
        agent: exec && typeof exec === 'object' ? exec.agent : undefined,
        signal: exec && typeof exec === 'object' ? exec.signal : undefined,
      })
    },
  })

  ctx.tools.register({
    name: 'publish_retry_task',
    description:
      'Retry one failed per-account subtask: reuses already uploaded media, re-runs create for that account only, and moves the subtask back to submitted with a new post id.',
    parameters: objectParams({
      task_id: { type: 'string', required: true, description: 'Subtask id (tsk_…)' },
    }),
    output: jsonOut,
    async execute(args, exec) {
      return dispatcher.retryTask({
        task_id: args.task_id,
        agent: exec && typeof exec === 'object' ? exec.agent : undefined,
        signal: exec && typeof exec === 'object' ? exec.signal : undefined,
      })
    },
  })
}
