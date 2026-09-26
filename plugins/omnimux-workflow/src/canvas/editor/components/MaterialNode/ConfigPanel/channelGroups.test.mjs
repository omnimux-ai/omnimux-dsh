import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatBillingLabel,
  formatPriceChip,
  formatPriceLabel,
  getModelChannelGroups,
  resolveModelChannelGroups,
  parseModelAndGroup,
  resolveLineConstraints,
  resolveShortModelName,
  MODEL_CHANNEL_GROUPS,
  DEFAULT_BYOK_CONSTRAINTS,
  isRuntimeByokChannelSettings,
  isLineConstraintsShape,
  buildChannelSelectionPayload,
  detectModelModality,
} from './channelGroups.ts';
// The picker mirror must equal the hub routing table; the hub is readable from a
// test (product code may not import it). The same comparison runs as a CI gate in
// scripts/verify-cross-plugin-model-alignment.mjs.
import { MODEL_CHANNEL_GROUPS as HUB_CHANNEL_GROUPS } from '../../../../../../../omnimux/src/catalog/serving/channel-groups.js';

describe('Canvas ConfigPanel ChannelGroups', () => {
  it('parses model and group safely', () => {
    assert.deepEqual(parseModelAndGroup('seedance-2-0@standard'), {
      modelId: 'seedance-2-0',
      group: 'standard',
    });
    assert.deepEqual(parseModelAndGroup('seedance-2-0'), {
      modelId: 'seedance-2-0',
      group: null,
    });
    assert.deepEqual(parseModelAndGroup(''), {
      modelId: '',
      group: null,
    });
  });

  it('retrieves channel groups for supported models', () => {
    const seedanceGroups = getModelChannelGroups('seedance-2-0');
    assert.ok(Array.isArray(seedanceGroups));
    assert.ok(seedanceGroups.length >= 3);
    const ids = seedanceGroups.map((g) => g.id);
    assert.ok(ids.includes('pro'));
    assert.ok(ids.includes('official'));
    assert.ok(ids.includes('standard'));

    const claudeGroups = getModelChannelGroups('claude-opus-4-6');
    assert.ok(claudeGroups.length >= 2);
    assert.ok(claudeGroups.map((g) => g.id).includes('claude-plus'));
  });

  it('offers no channels for a model the hub has no pool for', () => {
    // Inventing channels and prices here would promise routing the hub cannot do.
    assert.deepEqual(getModelChannelGroups('unknown-custom-model'), []);
    // 网关定价表未收录该模型 → 没有可依据的分组，画布不得凭空给渠道。
    assert.deepEqual(getModelChannelGroups('grok-imagine-image-2-0'), []);
  });

  it('mirrors the hub routing table exactly (model keys, ids and every routing field)', () => {
    assert.deepEqual(
      Object.keys(MODEL_CHANNEL_GROUPS).sort(),
      Object.keys(HUB_CHANNEL_GROUPS).sort(),
      'picker and hub must expose the same model pools',
    );
    for (const [modelId, hubGroups] of Object.entries(HUB_CHANNEL_GROUPS)) {
      const pickerGroups = MODEL_CHANNEL_GROUPS[modelId];
      assert.deepEqual(
        pickerGroups.map((g) => g.id).sort(),
        hubGroups.map((g) => g.id).sort(),
        `${modelId} channel ids must match the hub`,
      );
      for (const hubGroup of hubGroups) {
        const pickerGroup = pickerGroups.find((g) => g.id === hubGroup.id);
        assert.ok(pickerGroup, `${modelId}@${hubGroup.id} missing from the picker`);
        assert.equal(pickerGroup.wireGroup, hubGroup.wireGroup, `${modelId}@${hubGroup.id} wireGroup`);
        assert.equal(pickerGroup.pricing?.pointsEstimate, hubGroup.pricing?.pointsEstimate, `${modelId}@${hubGroup.id} points`);
        assert.equal(pickerGroup.pricing?.discountRate, hubGroup.pricing?.discountRate, `${modelId}@${hubGroup.id} discount`);
        assert.equal(pickerGroup.pricing?.priceRatio ?? null, hubGroup.pricing?.priceRatio ?? null, `${modelId}@${hubGroup.id} ratio`);
        assert.equal(pickerGroup.pricing?.billingMode, hubGroup.pricing?.billingMode, `${modelId}@${hubGroup.id} billing`);
        assert.equal(pickerGroup.sla?.stability24h, hubGroup.sla?.stability24h, `${modelId}@${hubGroup.id} stability`);
        assert.equal(pickerGroup.sla?.avgWaitTimeSec, hubGroup.sla?.avgWaitTimeSec, `${modelId}@${hubGroup.id} wait`);
        assert.deepEqual(pickerGroup.parameterConstraints ?? null, hubGroup.parameterConstraints ?? null, `${modelId}@${hubGroup.id} parameterConstraints`);
        assert.equal(pickerGroup.enabled, hubGroup.enabled, `${modelId}@${hubGroup.id} enabled`);
      }
    }
  });

  it('derives the price chip and label from the real pricing fields', () => {
    assert.equal(formatPriceChip(0.52), '5.2折');
    assert.equal(formatPriceChip(0.97), '9.7折');
    assert.equal(formatPriceChip(1), '');
    assert.equal(formatPriceChip(undefined), '');
    // 加价组（倍率 > 1）照实显示，不再静默隐藏。
    assert.equal(formatPriceChip(1.428571), '×1.43');
    assert.equal(formatBillingLabel('per_second'), '按秒计费');
    assert.equal(formatBillingLabel('per_task'), '按条计费');
    assert.equal(formatBillingLabel('per_token'), '按量计费');
    assert.equal(formatBillingLabel(undefined), '');
    assert.equal(formatPriceLabel({ pointsEstimate: 1040 }), '≈1040 积分');
    // 只有真实倍率时给倍率，不折算成积分。
    assert.equal(formatPriceLabel({ pointsEstimate: null, priceRatio: 0.5 }), '×0.5 倍率');
    assert.equal(formatPriceLabel({ pointsEstimate: null, priceRatio: null }), '当前参数不支持报价');
    assert.equal(formatPriceLabel(undefined), '当前参数不支持报价');
  });

  it('never invents an SLA for groups the gateway does not publish one for', () => {
    for (const [modelId, groups] of Object.entries(MODEL_CHANNEL_GROUPS)) {
      for (const group of groups) {
        if (!group.sla) continue;
        assert.equal(typeof group.sla.stability24h, 'number', `${modelId}@${group.id} SLA 必须是真实数值`);
      }
    }
    // 网关公开定价接口不提供 SLA，所以这批新条目必须整体缺省。
    for (const modelId of ['gemini-3.8-flash', 'gpt-5.5', 'gpt-image-2.5', 'wan-3.0', 'suno']) {
      for (const group of MODEL_CHANNEL_GROUPS[modelId]) {
        assert.equal(group.sla, undefined, `${modelId}@${group.id} 不应凭空带 SLA`);
      }
    }
  });

  it('never repeats the discount inside a feature badge', () => {
    for (const [modelId, groups] of Object.entries(MODEL_CHANNEL_GROUPS)) {
      for (const group of groups) {
        const chip = formatPriceChip(group.pricing?.priceRatio ?? group.pricing?.discountRate);
        if (!chip) continue;
        assert.ok(
          !group.badge?.includes(chip),
          `${modelId}@${group.id} badge duplicates the price chip (${chip})`,
        );
      }
    }
  });

  it('resolves compact model names for the trigger capsule', () => {
    assert.equal(resolveShortModelName('seedance-2-0-fast'), '2.0 Fast');
    assert.equal(resolveShortModelName('seedance-2-0'), 'Seedance 2.0');
    assert.equal(resolveShortModelName('claude-opus-4-6'), 'Opus 4.6');
    assert.equal(resolveShortModelName('deepseek-v4-flash'), 'Flash Vision');
    assert.equal(resolveShortModelName(''), '选择模型');
  });

  it('keeps the capsule label across the midjourney/nano-banana canonical rename (#1751)', () => {
    // 家族优先：契约 family 不随 canonical 改名变化，这是防「下次改名再断一次」的主路径。
    assert.equal(resolveShortModelName('mj-v8-1', 'midjourney'), 'Midjourney');
    assert.equal(resolveShortModelName('mj-v7', 'midjourney'), 'Midjourney');
    assert.equal(resolveShortModelName('nano-banana-2', 'nanobanana'), 'NanoBanana');
    assert.equal(resolveShortModelName('nano-banana-pro', 'nanobanana'), 'NanoBanana');
    assert.equal(resolveShortModelName('seedream-5-0-pro', 'seedream'), 'Seedream');
    // family 大小写 / 空白不敏感
    assert.equal(resolveShortModelName('mj-v8-1', '  MidJourney '), 'Midjourney');
    // 目录未提供 family 时的显式 id 条目兜底（含动作变体与渠道后缀）
    assert.equal(resolveShortModelName('mj-v8-1'), 'Midjourney');
    assert.equal(resolveShortModelName('mj-v7'), 'Midjourney');
    assert.equal(resolveShortModelName('mj-v7-upscale'), 'Midjourney');
    assert.equal(resolveShortModelName('mj-v8-1@standard'), 'Midjourney');
    assert.equal(resolveShortModelName('nano-banana-2'), 'NanoBanana');
    assert.equal(resolveShortModelName('nano-banana-pro@standard'), 'NanoBanana');
    // 旧写法仍是契约别名，短名不得因此丢失
    assert.equal(resolveShortModelName('midjourney-8.1'), 'Midjourney');
    assert.equal(resolveShortModelName('midjourney-8.1', 'midjourney'), 'Midjourney');
    // 未被 family 命中的 id 不得被家族表误吞
    assert.equal(resolveShortModelName('gpt-5.5', 'openai'), 'GPT-5.5');
  });

  // #1818：线路约束是完整规格——可用生成方式、参数选项集与输入能力，不只是固定时长。
  it('resolves the full spec of the lines the node routes to', () => {
    // 旗舰版目前只固定了时长；标准版与自动路由都不施加约束
    assert.deepEqual(resolveLineConstraints('seedance-2-5', { group: 'pro' }), { parameters: { duration: { fixed: 30 } } });
    assert.deepEqual(resolveLineConstraints('seedance-2-5', { allowedGroups: ['standard'] }), {});
    assert.deepEqual(resolveLineConstraints('seedance-2-5', undefined), {});
    assert.deepEqual(resolveLineConstraints('seedance-2-5', {}), {});
    assert.deepEqual(resolveLineConstraints('seedance-2-5', { allowedGroups: ['nope'] }), {});
    // 未声明约束的模型行为不变
    assert.deepEqual(resolveLineConstraints('seedance-2-0', { allowedGroups: ['pro'] }), {});
  });

  // 30 秒 / 9 图特惠线路（wireGroup seedance-cheap）上游断货已下架：
  // 它不再贡献任何约束，选中它的历史工程也不得把 30 秒 / 9 图能力继续挂在节点上。
  it('drops every constraint of the delisted cheap line', () => {
    assert.deepEqual(resolveLineConstraints('seedance-2-5', { allowedGroups: ['cheap'] }), {});
    assert.deepEqual(resolveLineConstraints('seedance-2-5', { group: 'seedance-cheap' }), {});
    assert.deepEqual(resolveLineConstraints('seedance-2-5@cheap', { allowedGroups: ['cheap'] }), {});
    // 下架线路与仍在售的标准版混选时，只剩标准版（无约束）
    assert.deepEqual(resolveLineConstraints('seedance-2-5', { allowedGroups: ['cheap', 'standard'] }), {});
  });

  // H3 全系列按分组接入：包含标准版、3倍速极速版、ComfyUI工作流双档专线、15秒长片版以及口型同步专线版。
  // 画布必须把各自的独立契约落到节点上。
  it('applies the H3 task line contract and leaves the standard line unconstrained', () => {
    const task = resolveLineConstraints('minimax-h3', { allowedGroups: ['task'] });
    assert.deepEqual(task.parameters.duration, { fixed: 15 });
    assert.deepEqual(task.parameters.resolution, { only: ['768P', '2K'] });
    assert.deepEqual(task.operations, [
      'text_to_video',
      'first_frame',
      'first_last_frame',
      'video_multi_ref',
    ]);

    // 口型同步专线：约束分辨率 768P/2K，生成方式仅 digital_human（对口型）
    const lipsync = resolveLineConstraints('minimax-h3', { allowedGroups: ['lipsync'] });
    assert.deepEqual(lipsync.parameters.resolution, { only: ['768P', '2K'] });
    assert.deepEqual(lipsync.operations, ['digital_human']);

    // 工作流双档专线：约束分辨率 768P/2K
    const videoFast = resolveLineConstraints('minimax-h3', { allowedGroups: ['video_fast'] });
    assert.deepEqual(videoFast.parameters.resolution, { only: ['768P', '2K'] });
    const videoPro = resolveLineConstraints('minimax-h3', { allowedGroups: ['video_pro'] });
    assert.deepEqual(videoPro.parameters.resolution, { only: ['768P', '2K'] });

    // 极速版与标准版沿用模型契约（4–15 秒可选），不额外施加分组时长约束
    assert.deepEqual(resolveLineConstraints('minimax-h3', { allowedGroups: ['turbo'] }), {});
    assert.deepEqual(resolveLineConstraints('minimax-h3', { allowedGroups: ['standard'] }), {});
    assert.deepEqual(resolveLineConstraints('minimax-h3', undefined), {});

    // 两组同选时取交集：长片版固定 15 秒会赢（标准版不施加时长约束）
    const mixed = resolveLineConstraints('minimax-h3', { allowedGroups: ['standard', 'task'] });
    assert.deepEqual(mixed.parameters.duration, { fixed: 15 });
  });

  describe('resolveModelChannelGroups implementation robustness', () => {
    it('uses DEFAULT_BYOK_CONSTRAINTS as default constraints for byok channels', () => {
      const settings = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaVideo: true,
      };
      const groups = resolveModelChannelGroups('seedance-2-0', settings);
      const byok = groups.find((g) => g.id === 'byok-fal');
      assert.ok(byok);
      assert.equal(byok.constraints, DEFAULT_BYOK_CONSTRAINTS);
    });

    it('correctly calculates isCapEnabled: enables when caps are undefined for unknown model, or strictly by explicit toggle for video model', () => {
      // 1. 未知模态模型在全部 undefined 时应该启用保底（对齐后端非全关健壮保底）
      const groupsDefault = resolveModelChannelGroups('unknown-custom-model-xyz', {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
      });
      assert.ok(groupsDefault.some((g) => g.id === 'byok-fal'));

      // 1b. 模态已知时，严格以开关状态为准：未显式开启时绝对不挂载（对齐前后端对称收敛逻辑）
      const groupsDedicatedModelWithoutToggle = resolveModelChannelGroups('seedance-2-0', {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaVideoModel: 'seedance-2-0',
      });
      assert.ok(!groupsDedicatedModelWithoutToggle.some((g) => g.id === 'byok-fal'));

      // 1c. 显式开启开关时正常挂载
      const groupsWithExplicitToggle = resolveModelChannelGroups('seedance-2-0', {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaVideo: true,
        runtimeMediaVideoModel: 'seedance-2-0',
      });
      assert.ok(groupsWithExplicitToggle.some((g) => g.id === 'byok-fal'));

      // 2. 至少一个为 true 时启用
      const groupsVideoOnly = resolveModelChannelGroups('seedance-2-0', {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaImage: false,
        runtimeMediaVideo: true,
        runtimeMediaAudio: false,
      });
      assert.ok(groupsVideoOnly.some((g) => g.id === 'byok-fal'));

      // 3. 全部为 false 时禁用
      const groupsAllFalse = resolveModelChannelGroups('seedance-2-0', {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaImage: false,
        runtimeMediaVideo: false,
        runtimeMediaAudio: false,
      });
      assert.ok(!groupsAllFalse.some((g) => g.id === 'byok-fal'));
    });

    it('strictly filters custom byok provider when endpoint is empty or missing', () => {
      // 1. custom 提供商未配置 endpoint 时，绝对不挂载渠道
      const settingsWithoutEndpoint = {
        runtimeKeyVerified: false,
        byokProviders: [
          {
            provider: 'custom',
            verified: true,
            endpoint: '',
            capabilities: ['video'],
          },
          {
            provider: 'custom',
            verified: true,
            capabilities: ['video'],
          },
        ],
      };
      const groupsWithoutEndpoint = resolveModelChannelGroups('seedance-2-0', settingsWithoutEndpoint);
      assert.ok(!groupsWithoutEndpoint.some((g) => g.id === 'byok-custom'));

      // 2. custom 提供商配置了有效 endpoint 时，正常挂载渠道
      const settingsWithEndpoint = {
        runtimeKeyVerified: false,
        byokProviders: [
          {
            provider: 'custom',
            verified: true,
            endpoint: 'https://internal-llm.example.com/v1',
            capabilities: ['video'],
          },
        ],
      };
      const groupsWithEndpoint = resolveModelChannelGroups('seedance-2-0', settingsWithEndpoint);
      assert.ok(groupsWithEndpoint.some((g) => g.id === 'byok-custom'));

      // 3. 主配置 custom 提供商未配置 endpoint 时，绝对不挂载渠道
      const mainSettingsWithoutEndpoint = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'custom',
        runtimeMediaVideo: true,
      };
      const mainGroupsWithoutEndpoint = resolveModelChannelGroups('seedance-2-0', mainSettingsWithoutEndpoint);
      assert.ok(!mainGroupsWithoutEndpoint.some((g) => g.id === 'byok-custom'));

      // 4. 主配置 custom 提供商配置了有效 endpoint 时，正常挂载渠道
      const mainSettingsWithEndpoint = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'custom',
        runtimeKeyEndpoint: 'https://custom-main.example.com/v1',
        runtimeMediaVideo: true,
      };
      const mainGroupsWithEndpoint = resolveModelChannelGroups('seedance-2-0', mainSettingsWithEndpoint);
      assert.ok(mainGroupsWithEndpoint.some((g) => g.id === 'byok-custom'));
    });

    it('enforces modality-specific capability gate: image-only settings do not enable byok for video model', () => {
      // 视频模型在仅开启图片能力时不挂载 BYOK 渠道
      const videoGroups = resolveModelChannelGroups('seedance-2-0', {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaImage: true,
        runtimeMediaVideo: false,
        runtimeMediaAudio: false,
      });
      assert.ok(!videoGroups.some((g) => g.id === 'byok-fal'));

      // 图片模型在开启图片能力时正常挂载 BYOK 渠道
      const imageGroups = resolveModelChannelGroups('gpt-image-2.5', {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaImage: true,
        runtimeMediaVideo: false,
        runtimeMediaAudio: false,
      });
      assert.ok(imageGroups.some((g) => g.id === 'byok-fal'));
    });

    it('filters byokProviders by declared capabilities against model modality', () => {
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
      };
      // 视频模型仅挂载具有 video 能力的 openai，不挂载仅 image 的 fal
      const videoGroups = resolveModelChannelGroups('seedance-2-0', settings);
      assert.ok(videoGroups.some((g) => g.id === 'byok-openai'));
      assert.ok(!videoGroups.some((g) => g.id === 'byok-fal'));
    });

    describe('isRuntimeByokChannelSettings type guard and fallback line constraints', () => {
      it('validates strictly against well-formed runtime settings', () => {
        assert.equal(isRuntimeByokChannelSettings({
          runtimeMode: 'key',
          runtimeMediaProvider: 'fal',
          runtimeKeyVerified: true,
          runtimeMediaVideo: true,
          byokProviders: [{ provider: 'fal', verified: true, capabilities: ['video'] }],
        }), true);

        assert.equal(isRuntimeByokChannelSettings({
          runtimeKeyVerified: true,
        }), true);
      });

      it('rejects invalid, malicious or incomplete settings objects', () => {
        assert.equal(isRuntimeByokChannelSettings(null), false);
        assert.equal(isRuntimeByokChannelSettings(undefined), false);
        assert.equal(isRuntimeByokChannelSettings('string'), false);
        assert.equal(isRuntimeByokChannelSettings([]), false);
        // 空对象拒绝
        assert.equal(isRuntimeByokChannelSettings({}), false);
        // 非法 runtimeMode 拒绝
        assert.equal(isRuntimeByokChannelSettings({ runtimeMode: 'malicious' }), false);
        // 非法类型拒绝
        assert.equal(isRuntimeByokChannelSettings({ runtimeKeyVerified: 'not-a-bool' }), false);
        assert.equal(isRuntimeByokChannelSettings({ runtimeMediaProvider: 12345 }), false);
        // byokProviders 结构不合法拒绝
        assert.equal(isRuntimeByokChannelSettings({ byokProviders: 'not-an-array' }), false);
        assert.equal(isRuntimeByokChannelSettings({ byokProviders: [{ provider: 123 }] }), false);
        // constraints 结构防御
        assert.equal(isRuntimeByokChannelSettings({ constraints: 'not-an-object' }), false);
        assert.equal(isRuntimeByokChannelSettings({ constraints: [] }), false);
        assert.equal(isRuntimeByokChannelSettings({ constraints: null }), false);
        assert.equal(isRuntimeByokChannelSettings({ constraints: { inputs: { image: { max: 1 } } } }), true);
      });

      it('does not silently fall back to fal when runtimeMediaProvider is empty string or whitespace', () => {
        const emptySettings = {
          runtimeKeyVerified: true,
          runtimeMediaProvider: '',
        };
        const emptyGroups = resolveModelChannelGroups('seedance-2-0', emptySettings);
        assert.ok(!emptyGroups.some((g) => g.id === 'byok-fal'), 'explicit empty string must not append byok-fal');

        const whitespaceSettings = {
          runtimeKeyVerified: true,
          runtimeMediaProvider: '   ',
        };
        const whitespaceGroups = resolveModelChannelGroups('seedance-2-0', whitespaceSettings);
        assert.ok(!whitespaceGroups.some((g) => g.id === 'byok-fal'), 'whitespace string must not append byok-fal');
      });

      it('injects standard aspect ratio and duration constraints for video models in fallback line constraints', () => {
        const settings = {
          runtimeKeyVerified: true,
          runtimeMediaProvider: 'fal',
          runtimeMediaVideo: true,
        };
        const constraints = resolveLineConstraints('seedance-2-0', { allowedGroups: ['byok-fal'] }, settings);
        assert.equal(constraints.inputs?.image?.max, 1);
        assert.deepEqual(constraints.parameters?.aspectRatio, { only: ['16:9', '9:16', '1:1'] });
        assert.deepEqual(constraints.parameters?.duration, { only: [5, 10] });
      });
    });

    describe('buildChannelSelectionPayload pure function', () => {
      const mockGroups = [
        { id: 'standard', label: '官方标准版', category: 'official' },
        { id: 'pro', label: '旗舰版', category: 'official' },
        { id: 'byok-fal', label: '我的 fal.ai', category: 'byok', sourceType: 'byok' },
      ];

      it('builds standard payload for official group', () => {
        const payload = buildChannelSelectionPayload('seedance-2-0', ['standard'], mockGroups);
        assert.deepEqual(payload, {
          modelId: 'seedance-2-0',
          strategy: 'auto',
          allowedGroups: ['standard'],
        });
      });

      it('builds byok payload with channelGroupId and sourceType for byok group', () => {
        const payload = buildChannelSelectionPayload('seedance-2-0', ['byok-fal'], mockGroups);
        assert.deepEqual(payload, {
          modelId: 'seedance-2-0',
          strategy: 'auto',
          allowedGroups: ['byok-fal'],
          channelGroupId: 'byok-fal',
          sourceType: 'byok',
        });
      });

      it('returns standard model payload when groupIds is empty (unblocking basic models)', () => {
        const payload = buildChannelSelectionPayload('seedance-2-0', [], mockGroups);
        assert.deepEqual(payload, {
          modelId: 'seedance-2-0',
          strategy: 'auto',
        });
      });

      it('returns null when requested group is not in available groups', () => {
        const payload = buildChannelSelectionPayload('seedance-2-0', ['nonexistent'], mockGroups);
        assert.equal(payload, null);
      });

      it('fails closed and returns null when multiple groupIds are provided', () => {
        const payload = buildChannelSelectionPayload('seedance-2-0', ['standard', 'pro'], mockGroups);
        assert.equal(payload, null, '必须 Fail-Closed 阻断多选');
      });
    });

    describe('detectModelModality alignment with backend keywords', () => {
      it('correctly detects video models for all required backend keywords', () => {
        const videoModels = [
          'wan-3.0',
          'wan-2.1-t2v',
          'luma-dream-machine',
          'sora-turbo',
          'grok-imagine-video-1-5',
          'cogvideox-5b',
          'runway-gen3',
          'kling-v2-6',
          'seedance-2-0',
          'seedance-1.0-sound',
          'minimax-h3',
          'hailuo-v2',
          'veo-2.0',
        ];
        for (const modelId of videoModels) {
          assert.equal(detectModelModality(modelId), 'video', `Model ${modelId} must be detected as video`);
        }
      });

      it('correctly detects audio and image models', () => {
        assert.equal(detectModelModality('suno-v3'), 'audio');
        assert.equal(detectModelModality('doubao-tts'), 'audio');
        assert.equal(detectModelModality('seed-audio-1.0'), 'audio');
        assert.equal(detectModelModality('flux-dev'), 'image');
        assert.equal(detectModelModality('midjourney-v6'), 'image');
        assert.equal(detectModelModality('dall-e-3'), 'image');
        assert.equal(detectModelModality('stable-diffusion-xl'), 'image');
        assert.equal(detectModelModality('nano-banana-2'), 'image');

        // speech 词界正则防误伤验证
        assert.equal(detectModelModality('my-speech-1'), 'audio');
        assert.equal(detectModelModality('doubao-speech'), 'audio');
        assert.equal(detectModelModality('speech-01'), 'audio');
        assert.equal(detectModelModality('bespeech-tool'), null);
        assert.equal(detectModelModality('unspeechable-model'), null);
      });

      it('prevents false positives like software-wan-demo or illumina from being detected as video', () => {
        assert.equal(detectModelModality('software-wan-demo'), null);
        assert.equal(detectModelModality('illumina'), null);
      });
    });

    describe('resolveLineConstraints pure function isolation', () => {
      it('never relies on window.__OMNIMUX_RUNTIME_SETTINGS__ and returns standard fallback when runtimeSettings is omitted', () => {
        const originalWindow = globalThis.window;
        try {
          globalThis.window = {
            __OMNIMUX_RUNTIME_SETTINGS__: {
              runtimeKeyVerified: true,
              runtimeMediaProvider: 'fal',
              runtimeMediaVideo: true,
            },
          };
          // 纯函数调用：未传入有效 settings 时不受 window 污染，返回纯函数标准兜底
          const constraints = resolveLineConstraints('seedance-2-0', { allowedGroups: ['byok-fal'] });
          assert.deepEqual(constraints, {}, '未传入 runtimeSettings 时必须保持纯函数标准兜底，不得读取全局 window');

          // 显式传入有效 settings 时正常解析约束
          const validConstraints = resolveLineConstraints('seedance-2-0', { allowedGroups: ['byok-fal'] }, {
            runtimeKeyVerified: true,
            runtimeMediaProvider: 'fal',
            runtimeMediaVideo: true,
          });
          assert.equal(validConstraints.inputs?.image?.max, 1, '显式传入 runtimeSettings 时正确获取自备渠道约束');
          assert.deepEqual(validConstraints.parameters?.aspectRatio, { only: ['16:9', '9:16', '1:1'] });
          assert.deepEqual(validConstraints.parameters?.duration, { only: [5, 10] });
        } finally {
          globalThis.window = originalWindow;
        }
      });

      it('safely rejects invalid settings via isRuntimeByokChannelSettings guard and supports constraints injection', () => {
        assert.equal(isRuntimeByokChannelSettings({
          runtimeMode: 'malicious_mode',
          runtimeKeyVerified: 'not_a_boolean',
        }), false);

        // 对齐服务端语义：当 runtimeMediaProvider 为 undefined 且 runtimeKeyVerified === true 时，安全映射为默认 fal
        const groupsWithoutProvider = resolveModelChannelGroups('seedance-2-0', {
          runtimeKeyVerified: true,
          runtimeMediaVideo: true,
          constraints: {
            inputs: { image: { max: 1 } },
            parameters: { duration: { only: [5] } },
          },
        });
        const byokFalDefault = groupsWithoutProvider.find((g) => g.id === 'byok-fal');
        assert.ok(byokFalDefault, 'runtimeMediaProvider 为 undefined 且已验证时安全映射为默认 fal');
        assert.deepEqual(byokFalDefault.constraints?.parameters?.duration, { only: [5] }, '主渠道必须成功注入 runtimeSettings.constraints');

        // 显式配置 fal 时正常解析并注入 constraints
        const groupsWithFal = resolveModelChannelGroups('seedance-2-0', {
          runtimeKeyVerified: true,
          runtimeMediaProvider: 'fal',
          runtimeMediaVideo: true,
          constraints: {
            inputs: { image: { max: 1 } },
            parameters: { duration: { only: [5] } },
          },
        });
        const byokFal = groupsWithFal.find((g) => g.id === 'byok-fal');
        assert.ok(byokFal, '显式配置 fal 时正常解析');
        assert.deepEqual(byokFal.constraints?.parameters?.duration, { only: [5] }, '主渠道必须成功注入 runtimeSettings.constraints');

        // 空约束对象 {} 有效性保护：空对象回退到 DEFAULT_BYOK_CONSTRAINTS
        const groupsEmptyConstraints = resolveModelChannelGroups('seedance-2-0', {
          runtimeKeyVerified: true,
          runtimeMediaProvider: 'fal',
          runtimeMediaVideo: true,
          constraints: {},
        });
        const byokFalEmptyCons = groupsEmptyConstraints.find((g) => g.id === 'byok-fal');
        assert.deepEqual(byokFalEmptyCons?.constraints, DEFAULT_BYOK_CONSTRAINTS, '空约束对象 {} 自动回退到 DEFAULT_BYOK_CONSTRAINTS');

        // 空白串或显式空串坚决拒绝
        const groupsBlank = resolveModelChannelGroups('seedance-2-0', {
          runtimeKeyVerified: true,
          runtimeMediaProvider: '   ',
          runtimeMediaVideo: true,
        });
        assert.ok(!groupsBlank.some((g) => g.id === 'byok-fal'), '空白串 runtimeMediaProvider 坚决拒绝');

        const groupsEmptyStr = resolveModelChannelGroups('seedance-2-0', {
          runtimeKeyVerified: true,
          runtimeMediaProvider: '',
          runtimeMediaVideo: true,
        });
        assert.ok(!groupsEmptyStr.some((g) => g.id === 'byok-fal'), '显式空串 runtimeMediaProvider 坚决拒绝');

        // 移除通用 model 模态宽松判定：仅有通用 model 而无对应模态模型时严格排除
        const groupsGeneralModel = resolveModelChannelGroups('seedance-2-0', {
          runtimeKeyVerified: false,
          byokProviders: [
            {
              provider: 'openai',
              verified: true,
              model: 'gpt-4o', // 仅有通用 model，无 videoModel / models.video / video 开关
            },
          ],
        });
        assert.ok(!groupsGeneralModel.some((g) => g.id === 'byok-openai'), '仅有通用 model 而无当前专属模态模型时严格排除');
      });

      it('correctly reads routing.channelGroupId to resolve line constraints', () => {
        const settings = {
          runtimeKeyVerified: true,
          runtimeMediaProvider: 'fal',
          runtimeMediaVideo: true,
        };
        const constraints = resolveLineConstraints('seedance-2-0', { channelGroupId: 'byok-fal' }, settings);
        assert.equal(constraints.inputs?.image?.max, 1);
        assert.deepEqual(constraints.parameters?.aspectRatio, { only: ['16:9', '9:16', '1:1'] });
      });

      it('deeply validates LineConstraints shape preventing malformed objects from escaping', () => {
        // 合法结构
        assert.equal(isLineConstraintsShape({
          inputs: { image: { max: 1 } },
          parameters: { duration: { only: [5, 10] } },
        }), true);

        // 畸变 inputs.image.max
        assert.equal(isLineConstraintsShape({
          inputs: { image: { max: 'invalid' } },
        }), false);
        assert.equal(isLineConstraintsShape({
          inputs: { image: { max: -1 } },
        }), false);

        // 畸变 parameters.only
        assert.equal(isLineConstraintsShape({
          parameters: { duration: { only: 'not_an_array' } },
        }), false);
        assert.equal(isLineConstraintsShape({
          parameters: { duration: { only: [5, { complex: 'object' }] } },
        }), false);
        assert.equal(isLineConstraintsShape({
          parameters: { duration: { only: [null] } },
        }), false);
        assert.equal(isLineConstraintsShape({
          parameters: { duration: { only: [undefined] } },
        }), false);

        // 严格基元类型检查 parameters.fixed
        assert.equal(isLineConstraintsShape({
          parameters: { duration: { fixed: 5 } },
        }), true);
        assert.equal(isLineConstraintsShape({
          parameters: { aspectRatio: { fixed: '16:9' } },
        }), true);
        assert.equal(isLineConstraintsShape({
          parameters: { generateSound: { fixed: false } },
        }), true);
        assert.equal(isLineConstraintsShape({
          parameters: { duration: { fixed: {} } },
        }), false);
        assert.equal(isLineConstraintsShape({
          parameters: { duration: { fixed: [] } },
        }), false);
        assert.equal(isLineConstraintsShape({
          parameters: { duration: { fixed: () => {} } },
        }), false);

        // 畸变 operations
        assert.equal(isLineConstraintsShape({
          operations: 'not_an_array',
        }), false);
        assert.equal(isLineConstraintsShape({
          operations: [123],
        }), false);
      });

      it('fails closed and returns empty constraints when routing mixes official and byok channels', () => {
        const settings = {
          runtimeKeyVerified: true,
          runtimeMediaProvider: 'fal',
          runtimeMediaVideo: true,
        };
        // 模拟历史脏数据中同时混杂了官方渠道和 BYOK 渠道
        const mixedRouting = {
          allowedGroups: ['standard', 'byok-fal'],
        };
        const constraints = resolveLineConstraints('seedance-2-0', mixedRouting, settings);
        assert.deepEqual(constraints, {}, '混合渠道必须 Fail-Closed 拦截并返回空约束对象');

        // 双路由残留但显式声明 sourceType 时，优先依据 sourceType 保留对应一方约束
        const mixedByok = {
          allowedGroups: ['standard', 'byok-fal'],
          sourceType: 'byok',
        };
        const byokConstraints = resolveLineConstraints('seedance-2-0', mixedByok, settings);
        assert.deepEqual(byokConstraints.inputs, { image: { max: 1 } }, '显式 sourceType: byok 时优先采纳 BYOK 约束');

        const mixedOfficial = {
          allowedGroups: ['pro', 'byok-fal'],
          sourceType: 'official',
        };
        const officialConstraints = resolveLineConstraints('seedance-2-5', mixedOfficial, settings);
        assert.deepEqual(officialConstraints.parameters?.duration?.fixed, 30, '显式 sourceType: official 时优先采纳 official 约束');
      });

      it('deduplicates conflicting BYOK IDs with channelGroupId as authoritative source', () => {
        const settings = {
          runtimeKeyVerified: true,
          byokProviders: [
            {
              provider: 'fal',
              verified: true,
              video: true,
              constraints: { inputs: { image: { max: 1 } }, parameters: { duration: { only: [5] } } },
            },
            {
              provider: 'volcengine',
              verified: true,
              video: true,
              constraints: { inputs: { image: { max: 2 } }, parameters: { duration: { only: [10] } } },
            },
          ],
        };
        // 当 channelGroupId 为 byok-volcengine，而 allowedGroups[0] 为 byok-fal 时，明确以 channelGroupId 为权威来源去重
        const conflictingRouting = {
          channelGroupId: 'byok-volcengine',
          allowedGroups: ['byok-fal'],
        };
        const constraints = resolveLineConstraints('seedance-2-0', conflictingRouting, settings);
        assert.equal(constraints.inputs?.image?.max, 2, '以 channelGroupId 为权威来源解析 volcengine 约束，而不是 fal 约束');
        assert.deepEqual(constraints.parameters?.duration, { only: [10] });
      });

      it('accurately resolves byokProviders with legacy modal fields and cap models when capabilities is omitted or empty', () => {
        // 1. item 带有 image: true 或 video: true 等布尔开关
        const settingsWithBooleans = {
          runtimeKeyVerified: true,
          byokProviders: [
            { provider: 'fal', verified: true, video: true },
            { provider: 'openai', verified: true, image: true, video: false },
          ],
        };
        const videoGroups = resolveModelChannelGroups('seedance-2-0', settingsWithBooleans);
        assert.ok(videoGroups.some((g) => g.id === 'byok-fal'), '具备 video: true 的 provider 应被判定为视频可用');
        assert.ok(!videoGroups.some((g) => g.id === 'byok-openai'), '显式 video: false 的 provider 应被排除在视频之外');

        const imageGroups = resolveModelChannelGroups('flux-1-dev', settingsWithBooleans);
        assert.ok(imageGroups.some((g) => g.id === 'byok-openai'), '具备 image: true 的 provider 应被判定为图片可用');

        // 2. item 带有 models[capability] 或 imageModel / videoModel 等模型字段
        const settingsWithModels = {
          runtimeKeyVerified: true,
          byokProviders: [
            { provider: 'openrouter', verified: true, models: { video: 'luma-dream-machine' } },
            { provider: 'custom', verified: true, endpoint: 'https://api.example.com', videoModel: 'my-custom-video-model' },
          ],
        };
        const modelVideoGroups = resolveModelChannelGroups('seedance-2-0', settingsWithModels);
        assert.ok(modelVideoGroups.some((g) => g.id === 'byok-openrouter'), '配置 models.video 模型的 provider 应放行');
        assert.ok(modelVideoGroups.some((g) => g.id === 'byok-custom'), '配置 videoModel 的 custom provider 应放行');
      });
    });
  });
});
