import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BYOK_PROVIDER_DISPLAY_MAP,
  buildByokChannelGroup,
  getModelChannelGroups,
  inferCapabilityFromModel,
  isOfficialChannelId,
  OFFICIAL_CHANNEL_IDS,
  parseModelAndGroup,
  resolveChannelCandidates,
  resolveChannelPlan,
  resolveModelChannelGroups,
  resolveRequestChannelIntent,
  ROUTING_STRATEGIES,
} from './channel-groups.js'

describe('OmniMux Model Channel Groups & Routing Strategies', () => {
  it('defines valid routing strategies', () => {
    assert.deepEqual(ROUTING_STRATEGIES, ['auto', 'stability_first', 'cost_first'])
  })

  describe('parseModelAndGroup', () => {
    it('parses models without group', () => {
      assert.deepEqual(parseModelAndGroup('seedance-2-0'), {
        modelId: 'seedance-2-0',
        group: null,
      })
      assert.deepEqual(parseModelAndGroup('  seedance-2.0  '), {
        modelId: 'seedance-2-0',
        group: null,
      })
    })

    it('parses model@group format', () => {
      assert.deepEqual(parseModelAndGroup('seedance-2-0@standard'), {
        modelId: 'seedance-2-0',
        group: 'standard',
      })
      assert.deepEqual(parseModelAndGroup('claude-opus-4-6@claude-plus'), {
        modelId: 'claude-opus-4-6',
        group: 'claude-plus',
      })
    })

    it('handles empty or malformed inputs', () => {
      assert.deepEqual(parseModelAndGroup(''), { modelId: '', group: null })
      assert.deepEqual(parseModelAndGroup(null), { modelId: '', group: null })
      assert.deepEqual(parseModelAndGroup(undefined), { modelId: '', group: null })
      assert.deepEqual(parseModelAndGroup({}), { modelId: '', group: null })
      assert.deepEqual(parseModelAndGroup('@group-only'), { modelId: '', group: null })
      assert.deepEqual(parseModelAndGroup('seedance-2-0@'), { modelId: 'seedance-2-0', group: null })
      // 健壮处理前后空格
      assert.deepEqual(parseModelAndGroup('   seedance-2-0  @  standard   '), {
        modelId: 'seedance-2-0',
        group: 'standard',
      })
      // 遇到包含多于一个 @ 的模型名称时 Fail-Closed
      assert.deepEqual(parseModelAndGroup('seedance-2-0@standard@extra@tag'), {
        modelId: '',
        group: null,
      })
    })
  })

  describe('getModelChannelGroups', () => {
    it('returns defined channel groups for seedance-2-0', () => {
      const groups = getModelChannelGroups('seedance-2-0')
      assert.ok(Array.isArray(groups))
      assert.ok(groups.length >= 3)
      const ids = groups.map((g) => g.id)
      assert.ok(ids.includes('pro'))
      assert.ok(ids.includes('preferred'))
      assert.ok(ids.includes('standard'))
      assert.ok(ids.includes('cheap'))
    })

    it('returns defined channel groups for seedance-2-5 with the task-based pro line only', () => {
      const groups = getModelChannelGroups('seedance-2-5')
      assert.ok(Array.isArray(groups))
      assert.equal(groups.length, 2)
      const ids = groups.map((g) => g.id)
      assert.ok(ids.includes('pro'))
      assert.ok(ids.includes('standard'))
      // 30 秒 / 9 图特惠线路（wireGroup seedance-cheap）上游断货，已下架
      assert.equal(ids.includes('cheap'), false)
      assert.equal(groups.some((g) => g.wireGroup === 'seedance-cheap'), false)

      const proGroup = groups.find((g) => g.id === 'pro')
      assert.equal(proGroup.wireGroup, 'seedance-2-5-task-pro')
      assert.equal(proGroup.pricing?.billingMode, 'per_task')
    })

    it('returns empty array for models without defined groups', () => {
      assert.deepEqual(getModelChannelGroups('unregistered-custom-model'), [])
    })
  })

  describe('resolveChannelCandidates', () => {
    it('resolves explicit group requests first', () => {
      const candidates = resolveChannelCandidates('seedance-2-0', { group: 'standard' })
      assert.equal(candidates[0], 'seedance-2-0@default')
      // Routing intent stays inside the group plan: no bare-model escape hatch.
      assert.ok(candidates.every((id) => id.includes('@')), candidates.join(','))
    })

    it('resolves explicit group from inline model@group', () => {
      const candidates = resolveChannelCandidates('claude-opus-4-6@default')
      assert.equal(candidates[0], 'claude-opus-4-6@default')
      assert.ok(candidates.every((id) => id.includes('@')), candidates.join(','))
    })

    it('keeps the pro line, reports the delisted cheap line, and fails closed on a pinned dead line', () => {
      const proCandidates = resolveChannelCandidates('seedance-2-5', { group: 'pro' })
      assert.equal(proCandidates[0], 'seedance-2-5@seedance-2-5-task-pro')

      // 下架后显式请求旧分组必须被报告为不可解析，而不是当成有效线路继续下发。
      const cheapPlan = resolveChannelPlan('seedance-2-5', { group: 'seedance-cheap' })
      assert.deepEqual(cheapPlan.unresolvedGroups, ['seedance-cheap'])

      // 低价优先不再指向已下架的特惠线路，落到标准版。
      const costCandidates = resolveChannelCandidates('seedance-2-5', { strategy: 'cost_first' })
      assert.equal(costCandidates[0], 'seedance-2-5@default')

      // 历史工程把该线路钉成白名单时必须失败关闭：零候选，且不放宽为全量线路。
      const pinned = resolveChannelPlan('seedance-2-5', { allowedGroups: ['seedance-cheap'] })
      assert.deepEqual(pinned.candidates, [])
      assert.deepEqual(pinned.unresolvedGroups, ['seedance-cheap'])
    })

    it('sorts by cost_first (lowest points estimate first)', () => {
      const candidates = resolveChannelCandidates('seedance-2-0', { strategy: 'cost_first' })
      assert.ok(candidates.length >= 4)
      // cheap (1.5) -> standard (4.9, wireGroup: default) -> preferred (5.7) -> pro (9.8)
      assert.equal(candidates[0], 'seedance-2-0@cheap')
      assert.equal(candidates[1], 'seedance-2-0@default')
    })

    it('sorts by stability_first (highest 24h stability first)', () => {
      const candidates = resolveChannelCandidates('seedance-2-0', { strategy: 'stability_first' })
      assert.ok(candidates.length >= 4)
      // cheap has 90% stability, should be ranked last among groups
      const cheapIndex = candidates.findIndex((c) => c.includes('@cheap'))
      const proIndex = candidates.findIndex((c) => c.includes('@seedance-2-0-task-pro'))
      assert.ok(proIndex < cheapIndex, 'pro (100%) should rank before cheap (90%)')
    })

    it('filters by allowedGroups when provided', () => {
      const candidates = resolveChannelCandidates('seedance-2-0', {
        strategy: 'cost_first',
        allowedGroups: ['standard', 'cheap'],
      })
      assert.ok(candidates.includes('seedance-2-0@default'))
      assert.ok(candidates.includes('seedance-2-0@cheap'))
      assert.ok(!candidates.includes('seedance-2-0@seedance-standard'))
    })

    it('fails closed when the requested pool matches no configured group', () => {
      const plan = resolveChannelPlan('seedance-2-0', { allowedGroups: ['preferred-v2'] })
      // The pre-fix behaviour widened this into every channel; a cost-capped
      // request must never silently escalate to the priciest group.
      assert.deepEqual(plan.candidates, [])
      assert.deepEqual(plan.unresolvedGroups, ['preferred-v2'])
    })

    it('reports a group this model does not serve instead of dropping it silently', () => {
      // `preferred` exists for seedance-2-0 but not for seedance-2-0-fast.
      const plan = resolveChannelPlan('seedance-2-0-fast', { group: 'preferred' })
      assert.equal(plan.candidates[0], 'seedance-2-0-fast@preferred')
      assert.deepEqual(plan.unresolvedGroups, ['preferred'])
    })

    it('restricts the explicit-group failover tail to the allowed pool', () => {
      const plan = resolveChannelPlan('seedance-2-0', { group: 'cheap', allowedGroups: ['cheap'] })
      assert.deepEqual(plan.candidates, ['seedance-2-0@cheap'])
    })

    it('orders the explicit-group tail by the requested strategy', () => {
      const plan = resolveChannelPlan('seedance-2-0', { group: 'cheap', strategy: 'cost_first' })
      assert.deepEqual(plan.candidates, [
        'seedance-2-0@cheap',
        'seedance-2-0@default',
        'seedance-2-0@seedance-standard',
        'seedance-2-0@seedance-2-0-task-pro',
      ])
    })

    it('keeps a model without a channel pool on its base candidates and reports the intent', () => {
      const plan = resolveChannelPlan('grok-imagine-image-2', { allowedGroups: ['standard'] })
      // #1751：别名先归一到 grok-imagine-image-2-0，再取网关注册候选（产品 ID 恒在首位）。
      assert.deepEqual(plan.candidates, [
        'grok-imagine-image-2-0',
        'grok-imagine-image-2',
        'grok-imagine-image',
        'grok-imagine-image-2.0',
      ])
      assert.deepEqual(plan.unresolvedGroups, ['standard'])
      // 同一产品 ID 的四种写法落到同一份候选表，顺序完全一致。
      assert.deepEqual(
        resolveChannelPlan('grok-imagine-image-2-0', { allowedGroups: ['standard'] }),
        plan,
      )
    })

    it('falls back to gatewayCandidates for unregistered models', () => {
      const candidates = resolveChannelCandidates('custom-unregistered-test-model')
      assert.deepEqual(candidates, ['custom-unregistered-test-model'])
    })

    it('fails closed and refuses to synthesize candidate on unknown channel group', () => {
      const plan = resolveChannelPlan('seedance-2-0', { group: 'totally-unknown-channel' })
      assert.deepEqual(plan.candidates, [])
      assert.deepEqual(plan.unresolvedGroups, ['totally-unknown-channel'])
    })
  })

  // H3 全系列按分组接入：包含标准版、3倍速极速版、ComfyUI工作流双档专线、15秒长片版以及口型同步专线版。
  // 靠分组自带的 wireModel 指向各自的上游独立型号；每个分组携带独立契约。
  describe('MiniMax H3 series as groups', () => {
    it('declares all 6 lines, each with its own upstream model and contract', () => {
      const groups = getModelChannelGroups('minimax-h3')
      assert.equal(groups.length, 6)
      const byId = new Map(groups.map((group) => [group.id, group]))

      const standard = byId.get('standard')
      assert.equal(standard.wireGroup, 'default')
      assert.equal(standard.wireModel, undefined)
      assert.equal(standard.constraints, undefined)

      const turbo = byId.get('turbo')
      assert.equal(turbo.wireModel, 'minimax-h3-turbo')
      assert.equal(turbo.wireGroup, 'default')
      assert.equal(turbo.pricing?.pointsEstimate, 0.4)

      const videoFast = byId.get('video_fast')
      assert.equal(videoFast.wireModel, 'minimax-h3-video')
      assert.equal(videoFast.wireGroup, 'minimax-h3-video-fast')
      assert.equal(videoFast.pricing?.pointsEstimate, 0.2)
      assert.deepEqual(videoFast.constraints?.parameters?.resolution, { only: ['768P', '2K'] })

      const videoPro = byId.get('video_pro')
      assert.equal(videoPro.wireModel, 'minimax-h3-video')
      assert.equal(videoPro.wireGroup, 'minimax-h3-video-pro')
      assert.equal(videoPro.pricing?.pointsEstimate, 0.3)
      assert.deepEqual(videoPro.constraints?.parameters?.resolution, { only: ['768P', '2K'] })

      const task = byId.get('task')
      assert.equal(task.wireModel, 'minimax-h3-task')
      assert.equal(task.wireGroup, 'default')
      assert.equal(task.pricing?.billingMode, 'per_task')
      assert.deepEqual(task.constraints.parameters.duration, { fixed: 15 })
      assert.deepEqual(task.constraints.parameters.resolution, { only: ['768P', '2K'] })
      assert.deepEqual(task.constraints.operations, [
        'text_to_video',
        'first_frame',
        'first_last_frame',
        'video_multi_ref',
      ])

      const lipsync = byId.get('lipsync')
      assert.equal(lipsync.wireModel, 'minimax-h3-lip-sync')
      assert.equal(lipsync.wireGroup, 'default')
      assert.equal(lipsync.pricing?.pointsEstimate, 6.3)
      assert.equal(lipsync.pricing?.billingMode, 'per_second')
      assert.deepEqual(lipsync.constraints?.parameters?.resolution, { only: ['768P', '2K'] })
      assert.deepEqual(lipsync.constraints?.operations, ['digital_human'])
      assert.equal(lipsync.description, '专注音频驱动人像唇形对齐，完美匹配口播短剧、带货解说与虚拟角色对白场景。')
    })

    it('routes each line to its own upstream model', () => {
      assert.deepEqual(
        resolveChannelPlan('minimax-h3', { allowedGroups: ['standard'] }).candidates,
        ['minimax-h3@default'],
      )
      assert.deepEqual(
        resolveChannelPlan('minimax-h3', { allowedGroups: ['turbo'] }).candidates,
        ['minimax-h3-turbo@default'],
      )
      assert.deepEqual(
        resolveChannelPlan('minimax-h3', { allowedGroups: ['video_fast'] }).candidates,
        ['minimax-h3-video@minimax-h3-video-fast'],
      )
      assert.deepEqual(
        resolveChannelPlan('minimax-h3', { allowedGroups: ['video_pro'] }).candidates,
        ['minimax-h3-video@minimax-h3-video-pro'],
      )
      assert.deepEqual(
        resolveChannelPlan('minimax-h3', { allowedGroups: ['task'] }).candidates,
        ['minimax-h3-task@default'],
      )
      assert.deepEqual(
        resolveChannelPlan('minimax-h3', { allowedGroups: ['lipsync'] }).candidates,
        ['minimax-h3-lip-sync@default'],
      )
      // 显式点名分组同样走该线路自己的上游型号与分组
      assert.deepEqual(
        resolveChannelPlan('minimax-h3', { group: 'video_fast', allowedGroups: ['video_fast'] }).candidates,
        ['minimax-h3-video@minimax-h3-video-fast'],
      )
    })

    it('sorts by strategy: cost_first picks video_fast, stability_first picks standard', () => {
      const allAllowed = ['standard', 'turbo', 'video_fast', 'video_pro', 'task', 'lipsync']
      // 成本优先：video_fast (0.2积分) 单价最低，排在首位
      const costPlan = resolveChannelPlan('minimax-h3', { strategy: 'cost_first', allowedGroups: allAllowed })
      assert.equal(costPlan.candidates[0], 'minimax-h3-video@minimax-h3-video-fast')

      // 稳定性优先：standard (99% 24h 稳定性) 排在首位
      const stabilityPlan = resolveChannelPlan('minimax-h3', { strategy: 'stability_first', allowedGroups: allAllowed })
      assert.equal(stabilityPlan.candidates[0], 'minimax-h3@default')
    })
  })

  describe('resolveModelChannelGroups with dynamic BYOK', () => {
    it('exports BYOK_PROVIDER_DISPLAY_MAP conforming to spec', () => {
      assert.ok(BYOK_PROVIDER_DISPLAY_MAP.fal)
      assert.equal(BYOK_PROVIDER_DISPLAY_MAP.fal.id, 'byok-fal')
      assert.equal(BYOK_PROVIDER_DISPLAY_MAP.fal.label, '我的 fal.ai')
      assert.equal(BYOK_PROVIDER_DISPLAY_MAP.fal.badge, '自备 API Key · 直连专线')
      assert.equal(BYOK_PROVIDER_DISPLAY_MAP.fal.chipLabel, '按需自付')

      assert.ok(BYOK_PROVIDER_DISPLAY_MAP.openai)
      assert.equal(BYOK_PROVIDER_DISPLAY_MAP.openai.id, 'byok-openai')
      assert.equal(BYOK_PROVIDER_DISPLAY_MAP.openai.label, '我的 OpenAI')

      assert.ok(BYOK_PROVIDER_DISPLAY_MAP.openrouter)
      assert.equal(BYOK_PROVIDER_DISPLAY_MAP.openrouter.id, 'byok-openrouter')
      assert.equal(BYOK_PROVIDER_DISPLAY_MAP.openrouter.label, '我的 OpenRouter')

      assert.ok(BYOK_PROVIDER_DISPLAY_MAP.custom)
      assert.equal(BYOK_PROVIDER_DISPLAY_MAP.custom.id, 'byok-custom')
      assert.equal(BYOK_PROVIDER_DISPLAY_MAP.custom.chipLabel, '内部专线')
    })

    it('returns official groups without BYOK when settings not configured or verified', () => {
      const groups = resolveModelChannelGroups('seedance-2-0', null)
      assert.ok(groups.length >= 3)
      assert.ok(groups.every((g) => g.category === 'official'))
      assert.ok(groups.every((g) => g.sourceType === 'official'))
      assert.equal(groups.some((g) => g.id.startsWith('byok-')), false)

      const unverified = resolveModelChannelGroups('seedance-2-0', {
        runtimeMediaProvider: 'fal',
        runtimeKeyVerified: false,
      })
      assert.equal(unverified.some((g) => g.id.startsWith('byok-')), false)
    })

    it('appends byok-fal channel group when fal is configured and verified', () => {
      // 模态联动防御：视频模型仅当开启视频开关时挂载，仅开图片开关时绝对不挂载
      const imageOnlySettings = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaImage: true,
        runtimeMediaVideo: false,
      }
      const imageOnlyGroups = resolveModelChannelGroups('seedance-2-0', imageOnlySettings)
      assert.equal(imageOnlyGroups.find((g) => g.id === 'byok-fal'), undefined)

      const settings = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaVideo: true,
      }
      const groups = resolveModelChannelGroups('seedance-2-0', settings)
      const byok = groups.find((g) => g.id === 'byok-fal')
      assert.ok(byok)
      assert.equal(byok.label, '我的 fal.ai')
      assert.equal(byok.badge, '自备 API Key · 直连专线')
      assert.equal(byok.chipLabel, '按需自付')
      assert.equal(byok.category, 'byok')
      assert.equal(byok.sourceType, 'byok')
      assert.equal(byok.enabled, true)
      assert.equal(byok.isAvailable, true)
      assert.equal(byok.pricing?.billingMode, 'payg')
      assert.deepEqual(byok.constraints, {})
    })

    it('supports custom provider with 内部专线 chip label', () => {
      // 1. 未配置 endpoint 时，custom provider 坚决不加入渠道池
      const unconfiguredCustomSettings = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'custom',
        runtimeKeyEndpoint: '',
        runtimeMediaVideo: true,
      }
      const groupsWithoutEndpoint = resolveModelChannelGroups('seedance-2-0', unconfiguredCustomSettings)
      assert.equal(groupsWithoutEndpoint.find((g) => g.id === 'byok-custom'), undefined)

      // 2. 填写有效 endpoint 后，正常加入渠道池并标识“内部专线”
      const settings = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'custom',
        runtimeKeyEndpoint: 'https://custom.internal.ai/v1',
        runtimeMediaVideo: true,
      }
      const groups = resolveModelChannelGroups('seedance-2-0', settings)
      const byok = groups.find((g) => g.id === 'byok-custom')
      assert.ok(byok)
      assert.equal(byok.label, '我的 自建端点')
      assert.equal(byok.chipLabel, '内部专线')
    })

    it('supports multiple byokProviders in settings and deduplicates', () => {
      const settings = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaVideo: true,
        byokProviders: [
          { provider: 'openai', verified: true, video: true },
          { provider: 'fal', verified: true, video: true },
          { provider: 'openrouter', verified: false, video: true },
        ],
      }
      const groups = resolveModelChannelGroups('seedance-2-0', settings)
      const byokIds = groups.filter((g) => g.id.startsWith('byok-')).map((g) => g.id)
      assert.deepEqual(byokIds, ['byok-fal', 'byok-openai'])
    })

    it('resolves channel plan with byok group without throwing unknown-group error', () => {
      const verifiedSettings = {
        runtimeMediaProvider: 'fal',
        runtimeKeyVerified: true,
        runtimeMediaVideo: true,
      }
      const plan = resolveChannelPlan('seedance-2-0', {
        group: 'byok-fal',
        runtimeSettings: verifiedSettings,
      })
      assert.deepEqual(plan.unresolvedGroups, [])
      assert.equal(plan.candidates[0], 'seedance-2-0@byok-fal')

      const planWithAllowed = resolveChannelPlan('seedance-2-0', {
        allowedGroups: ['byok-fal'],
        runtimeSettings: verifiedSettings,
      })
      assert.deepEqual(planWithAllowed.unresolvedGroups, [])
      assert.equal(planWithAllowed.candidates[0], 'seedance-2-0@byok-fal')

      // 大小写不一致的 requestedGroup（如 BYOK-FAL）归一化后不重复追加且正常命中
      const planUpper = resolveChannelPlan('seedance-2-0', {
        group: 'BYOK-FAL',
        runtimeSettings: verifiedSettings,
      })
      assert.deepEqual(planUpper.unresolvedGroups, [])
      assert.equal(planUpper.candidates.filter((c) => c === 'seedance-2-0@byok-fal').length, 1)

      // 混杂官方与 BYOK 渠道时（isMixedAllowedGroups 为真），实施 Fail-Closed 阻断，拦截并返回空候选池
      const mixedPlan = resolveChannelPlan('seedance-2-0', {
        allowedGroups: ['standard', 'byok-fal'],
        runtimeSettings: verifiedSettings,
      })
      assert.deepEqual(mixedPlan.candidates, [])
      assert.deepEqual(mixedPlan.unresolvedGroups, ['standard', 'byok-fal'])
    })

    it('safeguards against non-string provider and aligns channel structure', () => {
      // 非字符串 provider 安全防御：Fail-Closed 直接返回 null，杜绝静默替换为 fal
      assert.equal(buildByokChannelGroup(null), null)

      // 显式传入 image 能力与合法 provider 时，注入图片约束
      const imageGroup = buildByokChannelGroup('fal', null, 'image')
      assert.equal(imageGroup.constraints?.inputs?.image?.max, 1)

      assert.equal(buildByokChannelGroup(123), null)

      // 异常 item.provider 格式不应崩溃
      const corruptSettings = {
        runtimeKeyVerified: true,
        byokProviders: [
          { provider: null, verified: true },
          { provider: 12345, verified: true },
          { provider: 'openai', verified: true, video: true },
        ],
      }
      const groups = resolveModelChannelGroups('seedance-2-0', corruptSettings)
      const openaiGroup = groups.find((g) => g.id === 'byok-openai')
      assert.ok(openaiGroup)
      assert.equal(openaiGroup.label, '我的 OpenAI')
      assert.equal(openaiGroup.pricing?.billingMode, 'payg')
      assert.deepEqual(openaiGroup.constraints, {})
    })

    it('resolveRequestChannelIntent unifies channel parsing and intent detection', () => {
      // 1. 无渠道参数
      assert.deepEqual(resolveRequestChannelIntent(null), {
        requestedChannel: '',
        effectiveChannel: '',
        isByokChannel: false,
        isOfficialChannel: false,
        byokProvider: '',
      })
      assert.deepEqual(resolveRequestChannelIntent({ model: 'seedance-2-0' }), {
        requestedChannel: '',
        effectiveChannel: '',
        isByokChannel: false,
        isOfficialChannel: false,
        byokProvider: '',
      })

      // 2. 内联 @byok-fal 后缀
      const byokInline = resolveRequestChannelIntent({ model: 'seedance-2-0@byok-fal' })
      assert.equal(byokInline.requestedChannel, 'byok-fal')
      assert.equal(byokInline.effectiveChannel, 'byok-fal')
      assert.equal(byokInline.isByokChannel, true)
      assert.equal(byokInline.isOfficialChannel, false)
      assert.equal(byokInline.byokProvider, 'fal')

      // 3. 内联 @official 后缀
      const officialInline = resolveRequestChannelIntent({ model: 'seedance-2-0@official' })
      assert.equal(officialInline.requestedChannel, 'official')
      assert.equal(officialInline.effectiveChannel, 'official')
      assert.equal(officialInline.isByokChannel, false)
      assert.equal(officialInline.isOfficialChannel, true)
      assert.equal(officialInline.byokProvider, '')

      // 4. req.group 显式传参
      const explicitGroup = resolveRequestChannelIntent({ model: 'seedance-2-0', group: 'byok-openai' })
      assert.equal(explicitGroup.requestedChannel, 'byok-openai')
      assert.equal(explicitGroup.effectiveChannel, 'byok-openai')
      assert.equal(explicitGroup.isByokChannel, true)
      assert.equal(explicitGroup.isOfficialChannel, false)
      assert.equal(explicitGroup.byokProvider, 'openai')

      // 5. req.allowedGroups 兜底
      const allowedIntent = resolveRequestChannelIntent({ model: 'seedance-2-0', allowedGroups: ['pro', 'default'] })
      assert.equal(allowedIntent.requestedChannel, '')
      assert.equal(allowedIntent.effectiveChannel, 'pro')
      assert.equal(allowedIntent.isByokChannel, false)
      assert.equal(allowedIntent.isOfficialChannel, true)

      // 6. req.allowedGroups 混合列表（官方渠道与 BYOK 混杂），包含 BYOK 时不应误判为仅限官方专线
      const mixedAllowedIntent = resolveRequestChannelIntent({ model: 'seedance-2-0', allowedGroups: ['default', 'byok-fal'] })
      assert.equal(mixedAllowedIntent.requestedChannel, '')
      assert.equal(mixedAllowedIntent.effectiveChannel, 'default')
      assert.equal(mixedAllowedIntent.isByokChannel, false)
      assert.equal(mixedAllowedIntent.isOfficialChannel, false)

      // 7. req.allowedGroups 混合列表且首项为 BYOK 时（如 ['byok-fal', 'default']），Fail-Closed 拦截使 isByokChannel 为 false
      const mixedByokFirstIntent = resolveRequestChannelIntent({ model: 'seedance-2-0', allowedGroups: ['byok-fal', 'default'] })
      assert.equal(mixedByokFirstIntent.requestedChannel, '')
      assert.equal(mixedByokFirstIntent.effectiveChannel, 'byok-fal')
      assert.equal(mixedByokFirstIntent.isByokChannel, false)
      assert.equal(mixedByokFirstIntent.isOfficialChannel, false)
      assert.equal(mixedByokFirstIntent.byokProvider, '')

      // 8. 存在显式 requestedChannel 时，即使 allowedGroups 混合也尊重显式指定
      const explicitMixedIntent = resolveRequestChannelIntent({ model: 'seedance-2-0', group: 'byok-fal', allowedGroups: ['byok-fal', 'default'] })
      assert.equal(explicitMixedIntent.requestedChannel, 'byok-fal')
      assert.equal(explicitMixedIntent.effectiveChannel, 'byok-fal')
      assert.equal(explicitMixedIntent.isByokChannel, true)
      assert.equal(explicitMixedIntent.isOfficialChannel, false)
      assert.equal(explicitMixedIntent.byokProvider, 'fal')
    })

    it('infers capability from modelId and mounts image constraints during channel group resolution', () => {
      const settings = {
        runtimeKeyVerified: true,
        byokProviders: [
          { provider: 'fal', verified: true, image: true, video: true },
        ],
      }
      // 1. 生图模型：推导为 image，默认挂载单图约束
      const imageGroups = resolveModelChannelGroups('gpt-image-2.5', settings)
      const falImageGroup = imageGroups.find((g) => g.id === 'byok-fal')
      assert.ok(falImageGroup)
      assert.deepEqual(falImageGroup.constraints, { inputs: { image: { max: 1 } } })

      // 2. 视频模型：推导为 video，默认 constraints 为 {}
      const videoGroups = resolveModelChannelGroups('seedance-2-5', settings)
      const falVideoGroup = videoGroups.find((g) => g.id === 'byok-fal')
      assert.ok(falVideoGroup)
      assert.deepEqual(falVideoGroup.constraints, {})
    })

    it('extracts custom constraints dynamically from runtimeSettings instead of hardcoding', () => {
      const customConstraints = {
        inputs: {
          image: { max: 5 },
          video: { max: 2 },
        },
      }
      const settings = {
        runtimeKeyVerified: true,
        byokProviders: [
          {
            provider: 'fal',
            verified: true,
            video: true,
            constraints: customConstraints,
          },
        ],
      }
      // 1. resolveModelChannelGroups 中正确带出 customConstraints
      const groups = resolveModelChannelGroups('seedance-2-0', settings)
      const falGroup = groups.find((g) => g.id === 'byok-fal')
      assert.ok(falGroup)
      assert.deepEqual(falGroup.constraints, customConstraints)

      // 2. resolveChannelPlan 中 ensureByokGroup 动态构造时也提取 customConstraints
      const plan = resolveChannelPlan('seedance-2-0', {
        group: 'byok-fal',
        runtimeSettings: settings,
      })
      assert.deepEqual(plan.unresolvedGroups, [])
      assert.equal(plan.candidates[0], 'seedance-2-0@byok-fal')
    })

    it('enforces immutable array construction and never mutates resolved groups', () => {
      const settings = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaVideo: true,
      }
      const initialGroups = resolveModelChannelGroups('seedance-2-0', settings)
      const initialLength = initialGroups.length

      // resolveChannelPlan 中动态注入 BYOK 分组时，不能对 groups 进行 push 变异
      resolveChannelPlan('seedance-2-0', {
        group: 'byok-openai',
        runtimeSettings: settings,
      })

      const afterGroups = resolveModelChannelGroups('seedance-2-0', settings)
      assert.equal(afterGroups.length, initialLength)
    })

    it('strictly isolates modal capabilities for image, video, and audio models', () => {
      const settings = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaImage: true,
        runtimeMediaVideo: false,
        runtimeMediaAudio: false,
      }
      // 生图模型能挂载 fal BYOK
      const imageGroups = resolveModelChannelGroups('gpt-image-2.5', settings)
      assert.ok(imageGroups.some((g) => g.id === 'byok-fal'))

      // 视频模型绝对不能挂载 fal BYOK
      const videoGroups = resolveModelChannelGroups('seedance-2-0', settings)
      assert.equal(videoGroups.some((g) => g.id === 'byok-fal'), false)

      // 音频模型绝对不能挂载 fal BYOK
      const audioGroups = resolveModelChannelGroups('seed-audio-1.0', settings)
      assert.equal(audioGroups.some((g) => g.id === 'byok-fal'), false)
    })

    it('strictly isolates modal capabilities for byokProviders and prevents cross-modal leakage', () => {
      const settings = {
        runtimeKeyVerified: true,
        byokProviders: [
          // 仅开启图片能力，未开启视频能力
          { provider: 'openai', verified: true, image: true },
          // 显式关闭视频能力
          { provider: 'fal', verified: true, video: false },
        ],
      }
      // 视频模型下绝不挂载 openai 与 fal
      const videoGroups = resolveModelChannelGroups('seedance-2-0', settings)
      assert.equal(videoGroups.some((g) => g.id === 'byok-openai'), false)
      assert.equal(videoGroups.some((g) => g.id === 'byok-fal'), false)

      // 生图模型下正常挂载 openai
      const imageGroups = resolveModelChannelGroups('gpt-image-2.5', settings)
      assert.ok(imageGroups.some((g) => g.id === 'byok-openai'))
    })

    it('exports OFFICIAL_CHANNEL_IDS dynamically containing all declared official channel and wireGroup ids as read-only array', () => {
      assert.ok(Array.isArray(OFFICIAL_CHANNEL_IDS))
      assert.ok(OFFICIAL_CHANNEL_IDS.length > 0)
      assert.ok(OFFICIAL_CHANNEL_IDS.includes('official'))
      assert.ok(OFFICIAL_CHANNEL_IDS.includes('default'))
      assert.ok(OFFICIAL_CHANNEL_IDS.includes('standard'))
      assert.ok(OFFICIAL_CHANNEL_IDS.includes('pro'))
      assert.ok(OFFICIAL_CHANNEL_IDS.includes('seedance-2-0-task-pro'))
      assert.ok(OFFICIAL_CHANNEL_IDS.includes('minimax-h3-video-fast'))
      assert.ok(!OFFICIAL_CHANNEL_IDS.includes('byok-fal'))
      assert.throws(() => OFFICIAL_CHANNEL_IDS.push('malicious'), TypeError)
      assert.equal(isOfficialChannelId('official'), true)
      assert.equal(isOfficialChannelId('seedance-2-0-task-pro'), true)
      assert.equal(isOfficialChannelId('byok-fal'), false)
      assert.equal(isOfficialChannelId('unknown-channel'), false)
      assert.equal(isOfficialChannelId(null), false)
      assert.equal(isOfficialChannelId(123), false)
    })

    it('does not fall back to fal when runtimeMediaProvider is explicit empty string or null', () => {
      const emptySettings = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: '  ',
        runtimeMediaImage: true,
      }
      const groupsEmpty = resolveModelChannelGroups('gpt-image-2.5', emptySettings)
      assert.equal(groupsEmpty.some((g) => g.id === 'byok-fal'), false)

      const nullSettings = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: null,
        runtimeMediaImage: true,
      }
      const groupsNull = resolveModelChannelGroups('gpt-image-2.5', nullSettings)
      assert.equal(groupsNull.some((g) => g.id === 'byok-fal'), false)
    })

    it('robustly handles unknown modality models when settings are verified and non-empty', () => {
      const settings = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaImage: true,
      }
      const groups = resolveModelChannelGroups('unknown-custom-model-xyz', settings)
      assert.ok(groups.some((g) => g.id === 'byok-fal'))
    })

    it('matches byokProviders modal capabilities using item.capabilities.includes aligned with TypeScript', () => {
      const settings = {
        runtimeKeyVerified: false,
        byokProviders: [
          {
            provider: 'fal',
            verified: true,
            capabilities: ['image'],
          },
          {
            provider: 'openai',
            verified: true,
            capabilities: ['video'],
          },
        ],
      }
      const videoGroups = resolveModelChannelGroups('seedance-2-0', settings)
      assert.ok(videoGroups.some((g) => g.id === 'byok-openai'))
      assert.equal(videoGroups.some((g) => g.id === 'byok-fal'), false)

      const imageGroups = resolveModelChannelGroups('gpt-image-2.5', settings)
      assert.ok(imageGroups.some((g) => g.id === 'byok-fal'))
      assert.equal(imageGroups.some((g) => g.id === 'byok-openai'), false)
    })

    it('strictly excludes candidates when capabilities are unspecified and modal toggle is omitted without model', () => {
      // 对齐执行层门禁：当开关省略且无能力模型时，排除该候选
      const settingsTripleUndefined = {
        runtimeKeyVerified: true,
        byokProviders: [
          { provider: 'fal', verified: true },
        ],
      }
      const groups = resolveModelChannelGroups('seedance-2-0', settingsTripleUndefined)
      assert.equal(groups.some((g) => g.id === 'byok-fal'), false)
    })

    it('keeps unverified or unready BYOK groups in unresolvedGroups during ensureByokGroup', () => {
      // 仅当提供商在 options.runtimeSettings 中已验证且具备相应模态能力时才进行合成，否则保持 unresolved
      const settings = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaVideo: true,
      }
      const plan = resolveChannelPlan('seedance-2-0', {
        group: 'byok-openai',
        runtimeSettings: settings,
      })
      assert.deepEqual(plan.unresolvedGroups, ['byok-openai'])
      // fail-closed 门禁原则：未匹配的 BYOK 渠道严禁输出候选 head
      assert.deepEqual(plan.candidates, [])
    })

    it('enforces fail-closed when requested BYOK channel is not synthesized and safely handles malformed byokProviders', () => {
      const plan = resolveChannelPlan('seedance-2-0', {
        group: 'byok-custom',
        runtimeSettings: {
          byokProviders: [null, 123, { provider: 456 }, { provider: 'custom', endpoint: '   ' }],
        },
      })
      assert.deepEqual(plan.unresolvedGroups, ['byok-custom'])
      assert.deepEqual(plan.candidates, [])
    })

    it('strictly intercepts BYOK channel synthesis when runtimeSettings is omitted or unverified', () => {
      // 缺失 runtimeSettings 时，严禁直接合成 BYOK 渠道
      const planNoSettings = resolveChannelPlan('seedance-2-0', { group: 'byok-fal' })
      assert.deepEqual(planNoSettings.unresolvedGroups, ['byok-fal'])
      assert.deepEqual(planNoSettings.candidates, [])

      // 存在未验证的 settings 时，严禁直接合成
      const planUnverified = resolveChannelPlan('seedance-2-0', {
        group: 'byok-fal',
        runtimeSettings: { runtimeMediaProvider: 'fal', runtimeKeyVerified: false },
      })
      assert.deepEqual(planUnverified.unresolvedGroups, ['byok-fal'])
      assert.deepEqual(planUnverified.candidates, [])
    })

    it('strictly compares requestedChannel and allowedGroups against OFFICIAL_CHANNEL_IDS whitelist', () => {
      // 未知渠道绝不误判为官方渠道
      const unknownIntent = resolveRequestChannelIntent({ model: 'seedance-2-0@unknown-custom-channel' })
      assert.equal(unknownIntent.requestedChannel, 'unknown-custom-channel')
      assert.equal(unknownIntent.isOfficialChannel, false)

      const unknownAllowedIntent = resolveRequestChannelIntent({
        model: 'seedance-2-0',
        allowedGroups: ['unregistered-external-wire'],
      })
      assert.equal(unknownAllowedIntent.isOfficialChannel, false)

      // 白名单内的官方渠道正确识别为官方渠道
      const officialIntent = resolveRequestChannelIntent({ model: 'seedance-2-0@standard' })
      assert.equal(officialIntent.isOfficialChannel, true)
    })

    it('finds verified provider robustly among multiple byokProviders records without shadowing', () => {
      // 前置失效记录（未验证或能力未开），后置有效记录（已验证且开模态）
      const multiRecordsSettings = {
        byokProviders: [
          { provider: 'fal', verified: false, video: true },
          { provider: 'fal', verified: true, video: false },
          { provider: 'fal', verified: true, video: true },
        ],
      }
      const groups = resolveModelChannelGroups('seedance-2-0', multiRecordsSettings)
      assert.ok(groups.some((g) => g.id === 'byok-fal'))
    })

    it('guards constraints in buildByokChannelGroup against array injection', () => {
      // 传入数组作为 constraints 时，严禁直接赋为数组，必须回退至 defaultConstraints
      const groupFromArray = buildByokChannelGroup('fal', ['injected-array'], 'video')
      assert.equal(Array.isArray(groupFromArray.constraints), false)
      assert.deepEqual(groupFromArray.constraints, {})

      const imageGroupFromArray = buildByokChannelGroup('fal', ['injected-array'], 'image')
      assert.equal(Array.isArray(imageGroupFromArray.constraints), false)
      assert.deepEqual(imageGroupFromArray.constraints, { inputs: { image: { max: 1 } } })
    })

    it('enforces whitelist naming and prototype safety in buildByokChannelGroup', () => {
      // 1. 原型属性名防污染（__proto__, toString, constructor）
      const protoGroup = buildByokChannelGroup('__proto__')
      assert.equal(protoGroup.id, 'byok-__proto__')
      assert.equal(protoGroup.label, '我的 __proto__')
      assert.equal(protoGroup.provider, undefined)

      const toStringGroup = buildByokChannelGroup('toString')
      assert.equal(toStringGroup.id, 'byok-tostring')
      assert.equal(toStringGroup.label, '我的 tostring')

      // 2. 非法字符过滤降级为 null（Fail-Closed，包含空格、斜杠、特殊字符）
      assert.equal(buildByokChannelGroup('invalid/provider/path'), null)
      assert.equal(buildByokChannelGroup('hack; drop table'), null)

      // 3. 合法白名单字符正常保留
      const validGroup = buildByokChannelGroup('custom_provider-99')
      assert.equal(validGroup.id, 'byok-custom_provider-99')
      assert.equal(validGroup.label, '我的 custom_provider-99')
    })

    it('enforces fail-closed on BYOK intent when official channel pool is empty and BYOK synthesis fails', () => {
      // 针对没有官方渠道池的模型，若请求携带 BYOK 意图但 BYOK 未成功合成，严禁回退至官方 gatewayCandidates
      // 1. group: 'byok-fal'
      const planExplicit = resolveChannelPlan('unregistered-custom-model', {
        group: 'byok-fal',
      })
      assert.deepEqual(planExplicit.unresolvedGroups, ['byok-fal'])
      assert.deepEqual(planExplicit.candidates, [])

      // 2. allowedGroups: ['byok-fal']
      const planAllowed = resolveChannelPlan('unregistered-custom-model', {
        allowedGroups: ['byok-fal'],
      })
      assert.deepEqual(planAllowed.unresolvedGroups, ['byok-fal'])
      assert.deepEqual(planAllowed.candidates, [])

      // 3. inline model@byok-fal
      const planInline = resolveChannelPlan('unregistered-custom-model@byok-fal', {})
      assert.deepEqual(planInline.unresolvedGroups, ['byok-fal'])
      assert.deepEqual(planInline.candidates, [])
    })

    it('strictly enforces word-boundary regex for wan and sound models avoiding false substring matches', () => {
      // 1. wan 词界正则验证：/(?:^|[-_])wan(?:[-_]?(?:[0-9]|i2v|t2v)|x|$)/
      assert.equal(inferCapabilityFromModel('wan-2.1'), 'video')
      assert.equal(inferCapabilityFromModel('my-wan_3'), 'video')
      assert.equal(inferCapabilityFromModel('wan'), 'video')
      assert.equal(inferCapabilityFromModel('wan-i2v'), 'video')
      assert.equal(inferCapabilityFromModel('wan_t2v'), 'video')
      assert.equal(inferCapabilityFromModel('wanx-v1'), 'video')
      // 子串误伤防护：taiwan 不应被识别为 video
      assert.equal(inferCapabilityFromModel('taiwan-model'), '')
      assert.equal(inferCapabilityFromModel('swan-model'), '')

      // 2. sound 词界正则验证：/(?:^|[-_])sound(?:[-_0-9]|fx|effect|$)/
      assert.equal(inferCapabilityFromModel('seed-sound'), 'audio')
      assert.equal(inferCapabilityFromModel('soundfx-1'), 'audio')
      assert.equal(inferCapabilityFromModel('seed-sound-effect'), 'audio')
      // 子串误伤防护：soundxyz 不应被识别为 audio
      assert.equal(inferCapabilityFromModel('soundxyz-v1'), '')
      assert.equal(inferCapabilityFromModel('resound-tool'), '')
    })

    it('guards resolveRequestChannelIntent against array input', () => {
      const intentFromArray = resolveRequestChannelIntent(['malicious', 'array'])
      assert.deepEqual(intentFromArray, {
        requestedChannel: '',
        effectiveChannel: '',
        isByokChannel: false,
        isOfficialChannel: false,
        byokProvider: '',
      })
    })

    it('ensures constraints are deep cloned via structuredClone avoiding reference leakage', () => {
      const originalConstraints = { inputs: { image: { max: 5 } }, deep: { key: 'val' } }
      const settings = {
        byokProviders: [
          {
            provider: 'fal',
            verified: true,
            video: true,
            constraints: originalConstraints,
          },
        ],
      }
      const groups = resolveModelChannelGroups('seedance-2-0', settings)
      const falGroup = groups.find((g) => g.id === 'byok-fal')
      assert.ok(falGroup)
      assert.notEqual(falGroup.constraints, originalConstraints)

      // 突变返回对象的 constraints 不影响原 settings 对象
      falGroup.constraints.inputs.image.max = 999
      falGroup.constraints.deep.key = 'mutated'
      assert.equal(originalConstraints.inputs.image.max, 5)
      assert.equal(originalConstraints.deep.key, 'val')
    })

    it('safely handles invalid provider key in byokProviders without throwing TypeError', () => {
      const settings = {
        byokProviders: [
          {
            provider: 'invalid provider with space',
            verified: true,
            video: true,
          },
          {
            provider: 'fal',
            verified: true,
            video: true,
          },
        ],
      }
      // 不抛错，合法 provider 正常加入
      const groups = resolveModelChannelGroups('seedance-2-0', settings)
      assert.ok(groups.some((g) => g.id === 'byok-fal'))
      assert.ok(!groups.some((g) => g.id.includes('invalid')))
    })

    it('matches official channel group case-insensitively with lowercasing', () => {
      // 传入大写 PRO 能够成功解析，匹配到对应 wireGroup，不作为未解析组
      const planUpper = resolveChannelPlan('seedance-2-0', { group: 'PRO' })
      assert.equal(planUpper.unresolvedGroups.length, 0)
      assert.equal(planUpper.candidates[0], 'seedance-2-0@seedance-2-0-task-pro')

      const planOfficial = resolveChannelPlan('seedance-2-0', { group: 'OFFICIAL' })
      assert.equal(planOfficial.unresolvedGroups.length, 0)
      assert.equal(planOfficial.candidates[0], 'seedance-2-0@default')
    })

    it('strictly requires modal-specific model declaration and ignores generic model fallback', () => {
      const settingsWithGenericModelOnly = {
        runtimeKeyVerified: true,
        byokProviders: [
          {
            provider: 'fal',
            verified: true,
            model: 'fal-ai/flux/dev',
          },
        ],
      }
      // 生图模型解析渠道组：由于未配置 image 专属模型且未显式开启开关，严禁回退至通用 model 字段放行
      const groups = resolveModelChannelGroups('gpt-image-2.5', settingsWithGenericModelOnly)
      const falGroup = groups.find((g) => g.id === 'byok-fal')
      assert.equal(falGroup, undefined)

      // 配置模态专属模型声明时正常放行
      const settingsWithCapModel = {
        runtimeKeyVerified: true,
        byokProviders: [
          {
            provider: 'fal',
            verified: true,
            models: { image: 'fal-ai/flux/dev' },
          },
        ],
      }
      const groupsWithCap = resolveModelChannelGroups('gpt-image-2.5', settingsWithCapModel)
      const falGroupWithCap = groupsWithCap.find((g) => g.id === 'byok-fal')
      assert.ok(falGroupWithCap)
    })
  })
})
