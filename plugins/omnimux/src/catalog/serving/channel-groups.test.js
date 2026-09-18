import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getModelChannelGroups,
  parseModelAndGroup,
  resolveChannelCandidates,
  resolveChannelPlan,
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
      assert.deepEqual(parseModelAndGroup('@group-only'), { modelId: '', group: null })
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
      // cheap (800) -> standard (1040, wireGroup: default) -> preferred (1560) -> pro (3476)
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
  })

  // H3 全系列按分组接入：包含标准版、3倍速极速版、ComfyUI工作流双档专线以及15秒长片版。
  // 靠分组自带的 wireModel 指向各自的上游独立型号；每个分组携带独立契约。
  describe('MiniMax H3 series as groups', () => {
    it('declares all 5 lines, each with its own upstream model and contract', () => {
      const groups = getModelChannelGroups('minimax-h3')
      assert.equal(groups.length, 5)
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
      // 显式点名分组同样走该线路自己的上游型号与分组
      assert.deepEqual(
        resolveChannelPlan('minimax-h3', { group: 'video_fast', allowedGroups: ['video_fast'] }).candidates,
        ['minimax-h3-video@minimax-h3-video-fast'],
      )
    })

    it('sorts by strategy: cost_first picks video_fast, stability_first picks standard', () => {
      const allAllowed = ['standard', 'turbo', 'video_fast', 'video_pro', 'task']
      // 成本优先：video_fast (0.2积分) 单价最低，排在首位
      const costPlan = resolveChannelPlan('minimax-h3', { strategy: 'cost_first', allowedGroups: allAllowed })
      assert.equal(costPlan.candidates[0], 'minimax-h3-video@minimax-h3-video-fast')

      // 稳定性优先：standard (99% 24h 稳定性) 排在首位
      const stabilityPlan = resolveChannelPlan('minimax-h3', { strategy: 'stability_first', allowedGroups: allAllowed })
      assert.equal(stabilityPlan.candidates[0], 'minimax-h3@default')
    })
  })
})
