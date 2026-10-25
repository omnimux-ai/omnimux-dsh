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
      // 2026-10-21 网关对账 #3516：只保留现役 default 标准版线路。
      assert.equal(groups.length, 1)
      assert.deepEqual(groups.map((g) => g.id), ['standard'])
      const [standard] = groups
      assert.equal(standard.wireGroup, 'default')
      assert.equal(standard.default, true)
      assert.equal(standard.enabled, true)
      // P1b：积分改由网关快照单价 × 分组倍率推导（0.0971 × 1 × 5s × 10）。
      assert.equal(standard.pricing?.pointsEstimate, 4.86)
      assert.equal(standard.pricing?.unitPriceUsd, 0.0971)
      assert.equal(standard.pricing?.groupRatio, 1)
      assert.equal(standard.pricing?.billingMode, 'per_second')
      // 旧的多分组线路（pro / preferred / cheap / official）已随上游对账退场。
      for (const retired of ['pro', 'preferred', 'cheap', 'official']) {
        assert.equal(groups.some((g) => g.id === retired), false, retired)
      }
    })

    it('returns the 480p economy and 720p standard(default) lines for seedance-2-5', () => {
      const groups = getModelChannelGroups('seedance-2-5')
      assert.ok(Array.isArray(groups))
      // P1b：线路取自快照 enable_groups —— 本地覆盖表命名 480p/720p，网关另发布两条
      // seedance-2-5-480p / -720p 专线，两者都必须在册。
      assert.equal(groups.length, 4)
      assert.deepEqual(groups.map((g) => g.id), ['480p', '720p', 'seedance-2-5-480p', 'seedance-2-5-720p'])
      const [p480, p720, gateway480, gateway720] = groups
      assert.equal(gateway480.wireGroup, 'seedance-2-5-480p')
      assert.equal(gateway480.pricing?.pointsEstimate, 20.96)
      assert.equal(gateway480.pricing?.groupRatio, 0.524)
      assert.equal(gateway720.wireGroup, 'seedance-2-5-720p')
      assert.equal(gateway720.pricing?.pointsEstimate, 28.82)
      assert.equal(gateway720.pricing?.groupRatio, 0.7206)
      // #3516 评审修正：默认档位是 720p 标准版；480p 是经济版（非默认）。
      assert.equal(p480.label, '经济版')
      assert.equal(p480.wireGroup, 'desktop-480p')
      assert.equal(p480.pricing?.billingMode, 'per_second')
      assert.equal(p480.pricing?.pointsEstimate, 6.8)
      assert.equal(p480.pricing?.discountRate, 0.17)
      assert.equal(p480.default, undefined)
      // 每档用固定分辨率约束锁住自己的档位，禁止跨档静默改写。
      assert.deepEqual(p480.constraints?.parameters?.resolution, { fixed: '480p' })
      assert.equal(p720.label, '标准版')
      assert.equal(p720.wireGroup, 'desktop-720p')
      assert.equal(p720.pricing?.billingMode, 'per_second')
      assert.equal(p720.pricing?.pointsEstimate, 9.6)
      assert.equal(p720.pricing?.discountRate, 0.24)
      assert.equal(p720.default, true)
      assert.deepEqual(p720.constraints?.parameters?.resolution, { fixed: '720p' })
      // 旧的 task-based pro 线路与特惠线路上游断货，已下架
      assert.equal(groups.some((g) => g.wireGroup === 'seedance-2-5-task-pro'), false)
      assert.equal(groups.some((g) => g.wireGroup === 'seedance-cheap'), false)
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
      const candidates = resolveChannelCandidates('seedance-2-0@standard')
      assert.deepEqual(candidates, ['seedance-2-0@default'])
      const unregistered = resolveChannelPlan('seedance-2-0@pro')
      assert.deepEqual(unregistered.candidates, [])
      assert.deepEqual(unregistered.unresolvedGroups, ['pro'])
      // #3516：claude-opus-4-6 的分组目录已整体退场，带分组请求必须 fail-closed。
      const retiredModel = resolveChannelPlan('claude-opus-4-6@standard')
      assert.deepEqual(retiredModel.candidates, [])
      assert.deepEqual(retiredModel.unresolvedGroups, ['standard'])
    })

    it('retires the old pro/cheap lines and fails closed on a pinned dead line', () => {
      // #3516：旧的 task-based pro 与 seedance-cheap 特惠线路都不再登记。
      const proPlan = resolveChannelPlan('seedance-2-5', { group: 'pro' })
      assert.deepEqual(proPlan.candidates, [])
      assert.deepEqual(proPlan.unresolvedGroups, ['pro'])
      assert.deepEqual(resolveChannelCandidates('seedance-2-5', { group: 'seedance-2-5-task-pro' }), [])

      const cheapPlan = resolveChannelPlan('seedance-2-5', { group: 'seedance-cheap' })
      assert.deepEqual(cheapPlan.candidates, [])
      assert.deepEqual(cheapPlan.unresolvedGroups, ['seedance-cheap'])

      // 低价优先落到现役最低价的 480p 档，而不是任何已下架线路。
      const costCandidates = resolveChannelCandidates('seedance-2-5', { strategy: 'cost_first' })
      assert.equal(costCandidates[0], 'seedance-2-5@desktop-480p')

      // 历史工程把已删线路钉成白名单时必须失败关闭：零候选，且不放宽为全量线路。
      const pinned = resolveChannelPlan('seedance-2-5', { allowedGroups: ['seedance-cheap'] })
      assert.deepEqual(pinned.candidates, [])
      assert.deepEqual(pinned.unresolvedGroups, ['seedance-cheap'])
      // 钉住现役线路则只返回该线路。
      const pinnedLive = resolveChannelPlan('seedance-2-5', { allowedGroups: ['desktop-480p'] })
      assert.deepEqual(pinnedLive.candidates, ['seedance-2-5@desktop-480p'])
    })

    it('sorts by cost_first (lowest points estimate first)', () => {
      // P1b：价格取自快照，四条线路按积分升序：6.8 / 9.6 / 20.96 / 28.82。
      const candidates = resolveChannelCandidates('seedance-2-5', { strategy: 'cost_first' })
      assert.deepEqual(candidates, [
        'seedance-2-5@desktop-480p',
        'seedance-2-5@desktop-720p',
        'seedance-2-5@seedance-2-5-480p',
        'seedance-2-5@seedance-2-5-720p',
      ])
      assert.ok(
        candidates.indexOf('seedance-2-5@desktop-480p') < candidates.indexOf('seedance-2-5@desktop-720p'),
      )
    })

    it('sorts by stability_first (highest 24h stability first; unpublished SLA ranks last)', () => {
      const groups = getModelChannelGroups('seedance-2-5')
      // #3516 评审修正：只有 480p 经济版公布了 SLA（100% / 60s）；720p 默认档未公布，
      // 按「未公布 SLA 用中性默认值参与排序」的既有规则排在后面。
      assert.deepEqual(groups.map((g) => g.sla?.stability24h), [100, undefined, undefined, undefined])
      assert.deepEqual(groups.map((g) => g.sla?.avgWaitTimeSec), [60, undefined, undefined, undefined])
      const candidates = resolveChannelCandidates('seedance-2-5', { strategy: 'stability_first' })
      assert.equal(candidates[0], 'seedance-2-5@desktop-480p', 'the only line with a published SLA ranks first')
      assert.deepEqual(candidates.slice(1), [
        'seedance-2-5@desktop-720p',
        'seedance-2-5@seedance-2-5-480p',
        'seedance-2-5@seedance-2-5-720p',
      ])
    })

    it('filters by allowedGroups when provided', () => {
      const only480 = resolveChannelCandidates('seedance-2-5', {
        strategy: 'cost_first',
        allowedGroups: ['480p'],
      })
      assert.deepEqual(only480, ['seedance-2-5@desktop-480p'])
      const both = resolveChannelCandidates('seedance-2-5', { allowedGroups: ['480p', '720p'] })
      assert.deepEqual(both, [
        'seedance-2-5@desktop-480p',
        'seedance-2-5@desktop-720p',
      ])
      // allowedGroups 也可直接用 wireGroup 名称匹配。
      const byWire = resolveChannelCandidates('seedance-2-5', { allowedGroups: ['desktop-720p'] })
      assert.deepEqual(byWire, ['seedance-2-5@desktop-720p'])
      assert.ok(!both.includes('seedance-2-5@seedance-cheap'))
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
      assert.deepEqual(plan.candidates, [])
      assert.deepEqual(plan.unresolvedGroups, ['preferred'])
    })

    it('restricts the explicit-group failover tail to the allowed pool', () => {
      const plan = resolveChannelPlan('seedance-2-5', { group: '480p', allowedGroups: ['480p'] })
      assert.deepEqual(plan.candidates, ['seedance-2-5@desktop-480p'])
    })

    it('orders the explicit-group tail by the requested strategy', () => {
      const single = resolveChannelPlan('seedance-2-5', { group: '480p', strategy: 'cost_first' })
      assert.deepEqual(single.candidates, ['seedance-2-5@desktop-480p'])
      const plan = resolveChannelPlan('seedance-2-5', {
        group: '720p',
        strategy: 'cost_first',
        allowedGroups: ['480p', '720p'],
      })
      // 显式选中的线路排首位，其余按成本升序（480p 21 < 720p 29）。
      assert.deepEqual(plan.candidates, [
        'seedance-2-5@desktop-720p',
        'seedance-2-5@desktop-480p',
      ])
    })

    it('rejects channel intent without a pool and preserves registered aliases without intent', () => {
      const plan = resolveChannelPlan('grok-imagine-image-2', { allowedGroups: ['standard'] })
      assert.deepEqual(plan.candidates, [])
      assert.deepEqual(plan.unresolvedGroups, ['standard'])
      assert.deepEqual(resolveChannelPlan('grok-imagine-image-2').candidates, [
        'grok-imagine-image-2-0',
        'grok-imagine-image-2',
        'grok-imagine-image',
        'grok-imagine-image-2.0',
      ])
      assert.deepEqual(resolveChannelPlan('grok-imagine-image-2', { strategy: 'auto' }).candidates, [])
      // 同一产品 ID 的四种写法落到同一份候选表，顺序完全一致。
      assert.deepEqual(
        resolveChannelPlan('grok-imagine-image-2-0', { allowedGroups: ['standard'] }),
        plan,
      )
    })

    it('rejects unregistered models without synthesizing bare candidates', () => {
      const candidates = resolveChannelCandidates('custom-unregistered-test-model')
      assert.deepEqual(candidates, [])
    })

    it('fails closed and refuses to synthesize candidate on unknown channel group', () => {
      const plan = resolveChannelPlan('seedance-2-0', { group: 'totally-unknown-channel' })
      assert.deepEqual(plan.candidates, [])
      assert.deepEqual(plan.unresolvedGroups, ['totally-unknown-channel'])
    })
  })

  // 2026-10-21 网关对账 #3516：minimax-h3 上游渠道全部停用，7 条专线随分组表整体移除。
  // 分组路由必须 fail-closed，绝不合成已退场的上游型号。
  describe('MiniMax H3 series as groups', () => {
    it('retires all 7 upstream lines: the delisted model declares no channel group', () => {
      const groups = getModelChannelGroups('minimax-h3')
      assert.deepEqual(groups, [])
      for (const retired of ['standard', 'turbo', 'video_fast', 'video_pro', 'task', 'lipsync', 'comfyui']) {
        assert.equal(getModelChannelGroups('minimax-h3').some((group) => group.id === retired), false, retired)
        const plan = resolveChannelPlan('minimax-h3', { group: retired })
        assert.deepEqual(plan.candidates, [], retired)
        assert.deepEqual(plan.unresolvedGroups, [retired], retired)
      }
    })

    it('fails closed for every retired H3 line instead of routing to an upstream model', () => {
      for (const line of ['standard', 'turbo', 'video_fast', 'video_pro', 'task', 'lipsync', 'comfyui']) {
        const plan = resolveChannelPlan('minimax-h3', { allowedGroups: [line] })
        assert.deepEqual(plan.candidates, [], line)
        assert.deepEqual(plan.unresolvedGroups, [line], line)
      }
      assert.deepEqual(resolveChannelPlan('minimax-h3@video_fast').candidates, [])
      // 不带路由意图时仅保留网关登记别名；不再有分组线路候选。
      assert.deepEqual(resolveChannelPlan('minimax-h3').candidates, ['minimax-h3', 'MiniMax-H3'])
      assert.deepEqual(
        resolveChannelPlan('minimax-h3', { allowedGroups: ['standard'] }).unresolvedGroups,
        ['standard'],
      )
    })

    it('keeps strategy sorting empty when no H3 line is configured', () => {
      const allAllowed = ['standard', 'turbo', 'video_fast', 'video_pro', 'task', 'lipsync']
      for (const strategy of ['cost_first', 'stability_first', 'auto']) {
        const plan = resolveChannelPlan('minimax-h3', { strategy, allowedGroups: allAllowed })
        assert.deepEqual(plan.candidates, [], strategy)
        assert.deepEqual(plan.unresolvedGroups, allAllowed, strategy)
      }
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
      // #3516：seedance-2-0 只剩一条官方 standard 线路。
      assert.equal(groups.length, 1)
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
      // #3516：`pro` 已退场，改用现役官方分组 standard。
      const allowedIntent = resolveRequestChannelIntent({ model: 'seedance-2-0', allowedGroups: ['standard', 'default'] })
      assert.equal(allowedIntent.requestedChannel, '')
      assert.equal(allowedIntent.effectiveChannel, 'standard')
      assert.equal(allowedIntent.isByokChannel, false)
      assert.equal(allowedIntent.isOfficialChannel, true)
      // 已退场的 pro 不再被识别为官方渠道。
      assert.equal(resolveRequestChannelIntent({ model: 'seedance-2-0', allowedGroups: ['pro'] }).isOfficialChannel, false)

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
      // #3516：现役分组 id / wireGroup 动态收敛为 480p、720p、economy 及其 wire 名称。
      for (const id of ['480p', '720p', 'economy', 'desktop-480p', 'desktop-720p', 'gpt-image-2.5-economy']) {
        assert.ok(OFFICIAL_CHANNEL_IDS.includes(id), id)
      }
      // 已退场的旧线路不再出现在白名单里。
      for (const retired of ['pro', 'seedance-2-0-task-pro', 'minimax-h3-video-fast', 'preferred', 'cheap']) {
        assert.equal(OFFICIAL_CHANNEL_IDS.includes(retired), false, retired)
      }
      assert.ok(!OFFICIAL_CHANNEL_IDS.includes('byok-fal'))
      assert.throws(() => OFFICIAL_CHANNEL_IDS.push('malicious'), TypeError)
      assert.equal(isOfficialChannelId('official'), true)
      assert.equal(isOfficialChannelId('desktop-480p'), true)
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
      // 传入大写 480P 能够成功解析，匹配到对应 wireGroup，不作为未解析组
      const planUpper = resolveChannelPlan('seedance-2-5', { group: '480P' })
      assert.equal(planUpper.unresolvedGroups.length, 0)
      assert.equal(planUpper.candidates[0], 'seedance-2-5@desktop-480p')

      // wireGroup 名称同样大小写不敏感。
      const planWire = resolveChannelPlan('seedance-2-5', { group: 'DESKTOP-720P' })
      assert.equal(planWire.unresolvedGroups.length, 0)
      assert.equal(planWire.candidates[0], 'seedance-2-5@desktop-720p')

      const planStandard = resolveChannelPlan('seedance-2-0', { group: 'STANDARD' })
      assert.equal(planStandard.unresolvedGroups.length, 0)
      assert.equal(planStandard.candidates[0], 'seedance-2-0@default')
      // 已退场的 OFFICIAL 分组不再可解析（fail-closed）。
      const planOfficial = resolveChannelPlan('seedance-2-0', { group: 'OFFICIAL' })
      assert.deepEqual(planOfficial.candidates, [])
      assert.deepEqual(planOfficial.unresolvedGroups, ['OFFICIAL'])
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
