import { assertCapabilityEnabled, isToolEnabled } from '../gate/guard.js'
import { OmnimuxError } from '../media/errors.js'
import { connectAccount, disconnectAccount, listAccounts } from './accounts.js'
import {
  getDailyMetrics,
  getBestTimeToPost,
  getPostingFrequency,
  getContentDecay,
  getFollowerStats,
  getPostAnalytics,
  syncExternalPosts,
  getInboxAnalytics,
} from './analytics.js'
import { createOfficialClient } from './client.js'
import {
  createInspiration,
  deleteInspiration,
  getInspiration,
  inspirationStatus,
  listInspirations,
  listTags,
  updateInspiration,
  uploadMedia,
} from './inspiration.js'
import { createPost, getPost, presignMedia } from './publish.js'
import { fetchSocialData } from './social-data.js'

/**
 * @param {{
 *   tools: { register: (tool: object) => unknown },
 * }} ctx
 * @param {{
 *   hub: { official: { mount: boolean }, gate?: object },
 *   gate?: object,
 *   identity: { require: Function },
 *   store: { resolve: () => Promise<string | undefined> },
 *   siteBaseUrl: string,
 *   env?: Record<string, string | undefined>,
 *   fetcher?: typeof fetch,
 *   objectParams: Function,
 *   jsonOut: object,
 *   rethrow: (error: unknown) => never,
 * }} deps
 */
export function mountOfficial(ctx, deps) {
  if (!deps.hub?.official?.mount) return
  const gate = deps.gate ?? deps.hub?.gate ?? ctx.get?.('gate')
  const env = deps.env ?? process.env
  const client = createOfficialClient({
    fetcher: deps.fetcher,
    siteBaseUrl: deps.siteBaseUrl,
    apiBaseUrl: (env.OMNIMUX_BASE_URL || 'https://api.omnimux.ai/v1').replace(/\/v1\/?$/, ''),
    resolveApiKey: deps.resolveApiKey ?? (() => env.OMNIMUX_API_KEY || env.OMNIMUX_TOKEN),
    async resolveAccess() {
      const profile = await deps.identity.require()
      const token = await deps.store.resolve()
      if (!token) {
        throw new OmnimuxError('needs-omnimux', 'sign in to OmniMux or set OMNIMUX_ACCESS_TOKEN')
      }
      return { token, userId: profile.id }
    },
  })

  /**
   * @param {string} name
   * @param {string} description
   * @param {Record<string, object>} fields
   * @param {(args: Record<string, unknown>) => Promise<unknown>} run
   */
  function tool(name, description, fields, run) {
    if (!isToolEnabled(gate, name)) return
    ctx.tools.register({
      name,
      description,
      parameters: deps.objectParams(fields),
      output: deps.jsonOut,
      async execute(args) {
        try {
          assertCapabilityEnabled(gate, name, 'tool')
          return await run(args)
        } catch (error) {
          if (error instanceof OmnimuxError) throw error
          return deps.rethrow(error)
        }
      },
    })
  }

  tool(
    'omnimux_social_data',
    [
      'Fetch read-only OmniMux social post/profile data (NOT publishing).',
      'Required pair platform+capability:',
      'tiktok/video|user|posts|search, instagram/post|user|posts|search, youtube/video|user|posts|search, x/tweet|user|posts|search.',
      'Pass url and/or id and/or query; hub maps them to upstream top-level fields',
      '(x/tweet→tweet_id from status URL or numeric id; tiktok/video→aweme_id; instagram/post→url;',
      'youtube/video→video_id; */search→keyword|query|search_query; profiles→username|screen_name|channel_id|uniqueId).',
      'Returns {platform,capability,model,field,value,data}.',
      'For x/tweet, data typically includes text/display_text, author{name,screen_name,image},',
      'engagement (likes/views/retweets/replies/bookmarks), and media attachments:',
      'data.media.video[].variants[].url (mp4/m3u8), data.media.video[].media_url_https (thumb),',
      'plus data.entities.media[] (type, media_url_https, expanded_url, video_info.variants).',
      'Requires OMNIMUX_API_KEY. Example: {platform:"x", capability:"tweet", url:"https://x.com/<user>/status/<tweet_id>"}.',
    ].join(' '),
    {
      platform: { type: 'string', required: true, enum: ['tiktok', 'instagram', 'youtube', 'x'] },
      capability: { type: 'string', required: true, enum: ['video', 'user', 'post', 'posts', 'tweet', 'search'] },
      url: { type: 'string' },
      id: { type: 'string' },
      query: { type: 'string' },
    },
    (args) => fetchSocialData(client, args),
  )

  tool(
    'omnimux_accounts_list',
    'List connected social accounts. Requires OmniMux sign-in. Does not store a local matrix.',
    { provider: { type: 'string', enum: ['tiktok_direct', 'zernio'], required: true } },
    (args) => listAccounts(client, args),
  )
  tool(
    'omnimux_accounts_connect',
    'Start connecting a social account. Returns auth_url. Requires OmniMux sign-in.',
    {
      provider: { type: 'string', enum: ['tiktok_direct', 'zernio'], required: true },
      platform: { type: 'string', required: true },
      redirect_url: { type: 'string' },
    },
    (args) => connectAccount(client, args),
  )
  tool(
    'omnimux_accounts_disconnect',
    'Disconnect a social account by id. Requires OmniMux sign-in.',
    { id: { type: 'string', required: true }, provider: { type: 'string', enum: ['tiktok_direct', 'zernio'], required: true } },
    (args) => disconnectAccount(client, args),
  )
  tool(
    'omnimux_publish_presign',
    'Presign media for a social post. Requires OmniMux sign-in.',
    {
      filename: { type: 'string', required: true },
      content_type: { type: 'string' },
    },
    (args) => presignMedia(client, args),
  )
  tool(
    'omnimux_publish_create',
    'Create a social post via OmniMux. Requires OmniMux sign-in. Not a scheduling calendar.',
    {
      provider: { type: 'string', enum: ['tiktok_direct', 'zernio'], required: true },
      account_ids: { type: 'array' },
      content: { type: 'string' },
      media_items: { type: 'array' },
    },
    (args) => createPost(client, args),
  )
  tool(
    'omnimux_publish_get',
    'Get a social post by id. Requires OmniMux sign-in.',
    { id: { type: 'string', required: true }, provider: { type: 'string', enum: ['tiktok_direct', 'zernio'], required: true } },
    (args) => getPost(client, args),
  )
  tool(
    'omnimux_inspiration_list',
    'List inspiration items. Requires OmniMux sign-in. Filters: type, tag, tags, q, is_favorite, sort, page, page_size.',
    {
      type: { type: 'string' },
      tag: { type: 'string' },
      tags: { type: 'string' },
      q: { type: 'string' },
      is_favorite: { type: 'boolean' },
      sort: { type: 'string', enum: ['hot', 'new', 'fav'] },
      page: { type: 'number' },
      page_size: { type: 'number' },
    },
    (args) => listInspirations(client, args),
  )
  tool(
    'omnimux_inspiration_get',
    'Get one inspiration item by id. Requires OmniMux sign-in.',
    { id: { type: 'string', required: true } },
    (args) => getInspiration(client, args),
  )
  tool(
    'omnimux_inspiration_create',
    'Create an inspiration item from a source URL. Duplicate URLs return 409 unless return_existing. Requires OmniMux sign-in.',
    {
      source_url: { type: 'string', required: true },
      type: { type: 'string', enum: ['video', 'image', 'link'] },
      title: { type: 'string' },
      content: { type: 'string' },
      tags: { type: 'array' },
      is_favorite: { type: 'boolean' },
      hot_score: { type: 'number' },
      return_existing: { type: 'boolean' },
    },
    (args) => createInspiration(client, args),
  )
  tool(
    'omnimux_inspiration_update',
    'Patch an inspiration item (title/content/tags/is_favorite/hot_score). Requires OmniMux sign-in.',
    {
      id: { type: 'string', required: true },
      title: { type: 'string' },
      content: { type: 'string' },
      tags: { type: 'array' },
      is_favorite: { type: 'boolean' },
      hot_score: { type: 'number' },
    },
    (args) => updateInspiration(client, args),
  )
  tool(
    'omnimux_inspiration_delete',
    'Soft-delete an inspiration item by id. Requires OmniMux sign-in.',
    { id: { type: 'string', required: true } },
    (args) => deleteInspiration(client, args),
  )
  tool(
    'omnimux_inspiration_upload_media',
    'Upload a cover or media file to cloud storage (URL ingest or payload). Returns media key and rewritten path. Requires OmniMux sign-in.',
    {
      url: { type: 'string', required: true },
      kind: { type: 'string', enum: ['cover', 'media'] },
    },
    (args) => uploadMedia(client, args),
  )
  tool(
    'omnimux_inspiration_tags',
    'List inspiration tags with counts. Requires OmniMux sign-in.',
    {},
    () => listTags(client),
  )
  tool(
    'omnimux_inspiration_status',
    'Inspiration gateway probe: enabled / configured / gateway_ready. Requires OmniMux sign-in.',
    {},
    () => inspirationStatus(client),
  )

  tool(
    'omnimux_analytics_daily_metrics',
    'Fetch daily aggregated social analytics metrics and per-platform breakdown. Requires OmniMux sign-in.',
    {
      fromDate: { type: 'string' },
      toDate: { type: 'string' },
      profileId: { type: 'string' },
      platform: { type: 'string' },
      accountIds: { type: 'string' },
    },
    (args) => getDailyMetrics(client, args),
  )

  tool(
    'omnimux_analytics_best_time',
    'Fetch 7x24h best times to post based on historical engagement. Requires OmniMux sign-in.',
    {
      platform: { type: 'string' },
      accountId: { type: 'string' },
      profileId: { type: 'string' },
    },
    (args) => getBestTimeToPost(client, args),
  )

  tool(
    'omnimux_analytics_frequency',
    'Fetch correlation between posting frequency and engagement rate. Requires OmniMux sign-in.',
    {
      platform: { type: 'string' },
      profileId: { type: 'string' },
    },
    (args) => getPostingFrequency(client, args),
  )

  tool(
    'omnimux_analytics_content_decay',
    'Fetch how engagement accumulates over time post-publishing (decay curve). Requires OmniMux sign-in.',
    {
      platform: { type: 'string' },
      profileId: { type: 'string' },
    },
    (args) => getContentDecay(client, args),
  )

  tool(
    'omnimux_analytics_follower_stats',
    'Fetch follower count history and growth for connected accounts. Requires OmniMux sign-in.',
    {
      profileId: { type: 'string' },
      accountIds: { type: 'string' },
      days: { type: 'number' },
    },
    (args) => getFollowerStats(client, args),
  )

  tool(
    'omnimux_analytics_posts',
    'Fetch post analytics list or single post detail with sorting and pagination. Requires OmniMux sign-in.',
    {
      postId: { type: 'string' },
      sortBy: { type: 'string' },
      sortOrder: { type: 'string', enum: ['asc', 'desc'] },
      platform: { type: 'string' },
      limit: { type: 'number' },
      page: { type: 'number' },
    },
    (args) => getPostAnalytics(client, args),
  )

  tool(
    'omnimux_analytics_sync_external',
    'Trigger on-demand sync for external posts published directly on platform. Requires OmniMux sign-in.',
    {
      accountId: { type: 'string', required: true },
      url: { type: 'string' },
    },
    (args) => syncExternalPosts(client, args),
  )

  tool(
    'omnimux_analytics_inbox',
    'Fetch inbox and conversation analytics (volume, response-time, heatmap, source-breakdown). Requires OmniMux sign-in.',
    {
      capability: { type: 'string', required: true, enum: ['volume', 'response-time', 'heatmap', 'source-breakdown'] },
      fromDate: { type: 'string' },
      toDate: { type: 'string' },
      profileId: { type: 'string' },
      accountId: { type: 'string' },
    },
    (args) => {
      const { capability, ...query } = args
      return getInboxAnalytics(client, String(capability), query)
    },
  )
}
