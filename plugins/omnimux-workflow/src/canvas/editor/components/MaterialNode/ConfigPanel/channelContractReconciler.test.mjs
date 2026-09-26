import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';
import { buildSync } from 'esbuild';
import {
  resolveModelChannelGroups,
  resolveLineConstraints,
  isByokGroup,
  sanitizeProviderKey,
} from './channelGroups.ts';
import { deriveSlotLayout } from '../../../../../shared/graph/feedSlot/deriveSlotLayout.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const bundlePath = join(mkdtempSync(join(tmpdir(), 'omnimux-reconciler-')), 'runtime.mjs');
buildSync({
  stdin: {
    contents: "export * from './channelContractReconciler.ts';",
    resolveDir: here,
    sourcefile: 'runtime.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundlePath,
});
const {
  buildChannelContract,
  reconcileParamsWithContract,
  resolveFallbackRouting,
  ALLOWED_CONSTRAINT_KEYS,
} = await import(pathToFileURL(bundlePath).href);

describe('Channel Contract and Adaptive Reconciler', () => {
  describe('resolveModelChannelGroups', () => {
    it('returns official groups with category official when no runtimeSettings provided', () => {
      const groups = resolveModelChannelGroups('seedance-2-0');
      assert.ok(groups.length >= 3);
      for (const group of groups) {
        assert.equal(group.category, 'official');
        assert.equal(group.isAvailable, true);
      }
    });

    it('dynamically appends byok channel when runtime key is verified', () => {
      const settings = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaVideo: true,
      };
      const groups = resolveModelChannelGroups('seedance-2-0', settings);
      const byok = groups.find((g) => g.id === 'byok-fal');
      assert.ok(byok);
      assert.equal(byok.label, '我的 fal.ai');
      assert.equal(byok.badge, '自备 API Key · 直连专线');
      assert.equal(byok.chipLabel, '按需自付');
      assert.equal(byok.category, 'byok');
      assert.equal(byok.sourceType, 'byok');
      assert.equal(byok.isAvailable, true);
      assert.equal(byok.constraints?.inputs?.image?.max, 1);
    });

    it('supports custom provider with 内部专线 chip label', () => {
      const settings = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'custom',
        runtimeKeyEndpoint: 'https://custom.endpoint.com/v1',
        runtimeMediaVideo: true,
      };
      const groups = resolveModelChannelGroups('seedance-2-0', settings);
      const byok = groups.find((g) => g.id === 'byok-custom');
      assert.ok(byok);
      assert.equal(byok.label, '我的 自建端点');
      assert.equal(byok.chipLabel, '内部专线');
    });

    it('supports multiple byokProviders in settings and deduplicates', () => {
      const settings = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaVideo: true,
        byokProviders: [
          { provider: 'openai', verified: true, capabilities: ['video'] },
          { provider: 'fal', verified: true, capabilities: ['video'] },
          { provider: 'openrouter', verified: false, capabilities: ['video'] },
        ],
      };
      const groups = resolveModelChannelGroups('seedance-2-0', settings);
      const byokIds = groups.filter((g) => g.id.startsWith('byok-')).map((g) => g.id);
      assert.deepEqual(byokIds, ['byok-fal', 'byok-openai']);
    });
  });

  describe('resolveLineConstraints for byok channels', () => {
    it('applies maxReferenceImages = 1 constraint for byok-fal routing', () => {
      const settings = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaVideo: true,
      };
      const constraints = resolveLineConstraints('seedance-2-0', { allowedGroups: ['byok-fal'] }, settings);
      assert.equal(constraints.inputs?.image?.max, 1);
    });

    it('does not apply constraints when byok channel is not declared in runtimeSettings', () => {
      const constraints = resolveLineConstraints('seedance-2-0', { allowedGroups: ['byok-openai'] });
      assert.deepEqual(constraints, {});
    });
  });

  describe('reconcileParamsWithContract', () => {
    const sampleContract = {
      contractVersion: '1.0',
      modelId: 'seedance-2.0',
      groupId: 'byok-fal',
      channelCategory: 'byok',
      endpoint: {
        provider: 'fal-ai',
        authType: 'user-bearer',
        timeoutMs: 60000,
      },
      constraints: {
        supportedAspectRatios: ['16:9'],
        defaultAspectRatio: '16:9',
        supportedDurations: [5],
        defaultDuration: 5,
        supportedResolutions: ['720p', '1080p'],
        defaultResolution: '1080p',
        maxReferenceImages: 1,
        supportsAudioGeneration: false,
        maxPromptLength: 2000,
      },
    };

    it('truncates referenceImages to 1 and generates exact note', () => {
      const currentParams = {
        referenceImages: ['img1.png', 'img2.png'],
        aspectRatio: '16:9',
        duration: 5,
      };
      const result = reconcileParamsWithContract(currentParams, sampleContract);
      assert.deepEqual(result.nextParams.referenceImages, ['img1.png']);
      const note = result.healingNotes.find((n) => n.field === 'referenceImages');
      assert.ok(note);
      assert.equal(note.message, '该渠道仅支持单张参考图');
    });

    it('truncates referenceImages to maxReferenceImages (>= 2) and generates exact note', () => {
      const contractMultiRef = {
        ...sampleContract,
        constraints: {
          ...sampleContract.constraints,
          maxReferenceImages: 2,
        },
      };
      const currentParams = {
        referenceImages: ['img1.png', 'img2.png', 'img3.png', 'img4.png'],
      };
      const result = reconcileParamsWithContract(currentParams, contractMultiRef);
      assert.deepEqual(result.nextParams.referenceImages, ['img1.png', 'img2.png']);
      const note = result.healingNotes.find((n) => n.field === 'referenceImages');
      assert.ok(note);
      assert.equal(note.message, '该渠道最多支持 2 张参考图，已自动截取');
    });

    it('removes all referenceImages when maxReferenceImages is 0 and generates exact note', () => {
      const contractNoRef = {
        ...sampleContract,
        constraints: {
          ...sampleContract.constraints,
          maxReferenceImages: 0,
        },
      };
      const currentParams = {
        referenceImages: ['img1.png', 'img2.png'],
      };
      const result = reconcileParamsWithContract(currentParams, contractNoRef);
      assert.deepEqual(result.nextParams.referenceImages, []);
      const note = result.healingNotes.find((n) => n.field === 'referenceImages');
      assert.ok(note);
      assert.equal(note.message, '当前渠道不支持参考图，已自动移除');
    });

    it('heals unsupported aspect ratio to default and generates exact note', () => {
      const currentParams = {
        aspectRatio: '9:16',
        duration: 5,
      };
      const result = reconcileParamsWithContract(currentParams, sampleContract);
      assert.equal(result.nextParams.aspectRatio, '16:9');
      const note = result.healingNotes.find((n) => n.field === 'aspectRatio');
      assert.ok(note);
      assert.equal(note.message, '已根据该渠道能力自适应调整为 16:9');
    });

    it('heals unsupported duration to default and generates exact note', () => {
      const currentParams = {
        aspectRatio: '16:9',
        duration: 10,
      };
      const result = reconcileParamsWithContract(currentParams, sampleContract);
      assert.equal(result.nextParams.duration, 5);
      const note = result.healingNotes.find((n) => n.field === 'duration');
      assert.ok(note);
      assert.equal(note.message, '该渠道仅支持标准时长（5秒）');
    });

    it('supports string numeric duration (e.g. "10") and heals unsupported value to default', () => {
      // 1. 不受支持的字符串数字 '10' 自愈为标准时长 5 并附带提示
      const unsupportedStringResult = reconcileParamsWithContract(
        { duration: '10' },
        sampleContract,
      );
      assert.equal(unsupportedStringResult.nextParams.duration, 5);
      const note = unsupportedStringResult.healingNotes.find((n) => n.field === 'duration');
      assert.ok(note);
      assert.equal(note.message, '该渠道仅支持标准时长（5秒）');

      // 2. 受支持的字符串数字 '5' 规范化为数字 5 且不产生脏提示
      const supportedStringResult = reconcileParamsWithContract(
        { duration: '5' },
        sampleContract,
      );
      assert.equal(supportedStringResult.nextParams.duration, 5);
      assert.equal(supportedStringResult.healingNotes.find((n) => n.field === 'duration'), undefined);
    });

    it('heals non-finite duration (e.g. "10s", "abc") to default and generates exact note', () => {
      // 1. 带单位字符串 '10s' 作为非法参数自愈为默认推荐时长 5
      const invalidSuffixResult = reconcileParamsWithContract(
        { duration: '10s' },
        sampleContract,
      );
      assert.equal(invalidSuffixResult.nextParams.duration, 5);
      const suffixNote = invalidSuffixResult.healingNotes.find((n) => n.field === 'duration');
      assert.ok(suffixNote);
      assert.equal(suffixNote.message, '该渠道仅支持标准时长（5秒）');

      // 2. 纯字母字符串 'abc' 自愈为默认推荐时长 5
      const invalidAlphaResult = reconcileParamsWithContract(
        { duration: 'abc' },
        sampleContract,
      );
      assert.equal(invalidAlphaResult.nextParams.duration, 5);
      const alphaNote = invalidAlphaResult.healingNotes.find((n) => n.field === 'duration');
      assert.ok(alphaNote);
      assert.equal(alphaNote.message, '该渠道仅支持标准时长（5秒）');
    });

    it('heals unsupported resolution to default and generates exact note', () => {
      const currentParams = {
        resolution: '4k',
      };
      const result = reconcileParamsWithContract(currentParams, sampleContract);
      assert.equal(result.nextParams.resolution, '1080p');
      const note = result.healingNotes.find((n) => n.field === 'resolution');
      assert.ok(note);
      assert.equal(note.message, '已根据该渠道能力自适应调整为 1080p');
    });

    it('turns off sound generation when unsupported and generates exact note', () => {
      const currentParams = {
        sound: true,
        generateSound: true,
      };
      const result = reconcileParamsWithContract(currentParams, sampleContract);
      assert.equal(result.nextParams.sound, false);
      assert.equal(result.nextParams.generateSound, false);
      const note = result.healingNotes.find((n) => n.field === 'sound');
      assert.ok(note);
      assert.equal(note.message, '该渠道暂不支持音频同步生成');
    });

    it('does not generate sound healing note when sound was already false', () => {
      const currentParams = {
        sound: false,
        generateSound: false,
      };
      const result = reconcileParamsWithContract(currentParams, sampleContract);
      const note = result.healingNotes.find((n) => n.field === 'sound');
      assert.equal(note, undefined);
    });

    it('heals non-array referenceImages and generates exact note', () => {
      const currentParams = {
        referenceImages: 'not-an-array',
      };
      const result = reconcileParamsWithContract(currentParams, sampleContract);
      assert.deepEqual(result.nextParams.referenceImages, []);
      const note = result.healingNotes.find((n) => n.field === 'referenceImages');
      assert.ok(note);
      assert.equal(note.message, '参考图数据异常，已自动重置为空');
    });

    it('does not incorrectly heal duration 0 when 0 is supported', () => {
      const contractWithZero = {
        ...sampleContract,
        constraints: {
          ...sampleContract.constraints,
          supportedDurations: [0, 5, 10],
          defaultDuration: 0,
        },
      };
      const currentParams = {
        duration: 0,
      };
      const result = reconcileParamsWithContract(currentParams, contractWithZero);
      assert.equal(result.nextParams.duration, 0);
      const note = result.healingNotes.find((n) => n.field === 'duration');
      assert.equal(note, undefined);
    });

    it('returns empty notes when all params comply with contract', () => {
      const currentParams = {
        referenceImages: ['img1.png'],
        aspectRatio: '16:9',
        duration: 5,
        resolution: '1080p',
        sound: false,
      };
      const result = reconcileParamsWithContract(currentParams, sampleContract);
      assert.equal(result.healingNotes.length, 0);
    });
  });

  describe('resolveFallbackRouting', () => {
    it('returns isFallback: false for valid official routing', () => {
      const state = resolveFallbackRouting(
        'seedance-2-0',
        'Seedance 2.0',
        { channelGroupId: 'standard', allowedGroups: ['standard'], strategy: 'auto' },
      );
      assert.equal(state.isFallback, false);
      assert.equal(state.bannerMessage, null);
      assert.equal(state.actionLabel, null);
      assert.equal(state.runBlockedReason, null);
    });

    it('returns isFallback: false when byok channel is verified in runtimeSettings', () => {
      const settings = {
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaVideo: true,
      };
      const state = resolveFallbackRouting(
        'seedance-2-0',
        'Seedance 2.0',
        { channelGroupId: 'byok-fal', allowedGroups: ['byok-fal'], strategy: 'auto', sourceType: 'byok' },
        settings,
      );
      assert.equal(state.isFallback, false);
      assert.equal(state.triggerDisplayText, 'Seedance 2.0 · 我的 fal.ai');
    });

    it('returns isFallback: true when sourceType is byok but targetGroupId is missing', () => {
      const state = resolveFallbackRouting(
        'seedance-2-0',
        'Seedance 2.0',
        { sourceType: 'byok' },
      );
      assert.equal(state.isFallback, true);
      assert.equal(state.invalidGroupId, null);
      assert.equal(state.invalidGroupLabel, '我的自备渠道');
      assert.equal(state.triggerDisplayText, 'Seedance 2.0 · 我的自备渠道 (已失效)');
      assert.equal(state.bannerMessage, '自备渠道已不可用，已自动匹配基准专线');
      assert.equal(state.actionLabel, '切换为官方标准版');
      assert.equal(state.runBlockedReason, '请配置自备 Key 或切换可用渠道');
    });

    it('returns isFallback: true with exact copy when byok channel is missing/unverified', () => {
      const settings = {
        runtimeKeyVerified: false,
      };
      const state = resolveFallbackRouting(
        'seedance-2-0',
        'Seedance 2.0',
        { channelGroupId: 'byok-fal', allowedGroups: ['byok-fal'], strategy: 'auto', sourceType: 'byok' },
        settings,
      );
      assert.equal(state.isFallback, true);
      assert.equal(state.invalidGroupId, 'byok-fal');
      assert.equal(state.triggerDisplayText, 'Seedance 2.0 · 我的 fal.ai (已失效)');
      assert.equal(state.bannerMessage, '自备渠道已不可用，已自动匹配基准专线');
      assert.equal(state.actionLabel, '切换为官方标准版');
      assert.equal(state.recommendedOfficialGroupId, 'standard');
      assert.equal(state.runBlockedReason, '请配置自备 Key 或切换可用渠道');
    });

    it('returns recommendedOfficialGroupId: null when no official channel exists for model', () => {
      const state = resolveFallbackRouting(
        'pure-byok-model-with-no-official-groups',
        'Pure Byok Model',
        { channelGroupId: 'byok-unknown', allowedGroups: ['byok-unknown'], strategy: 'auto', sourceType: 'byok' },
        null,
      );
      assert.equal(state.isFallback, true);
      assert.equal(state.recommendedOfficialGroupId, null);
    });

    it('rejects untrusted label with invalid/XSS characters and safely falls back to provider derived label', () => {
      const state = resolveFallbackRouting(
        'seedance-2-0',
        'Seedance 2.0',
        { channelGroupId: 'byok-unknown', label: '<script>alert("xss")</script>`hello', sourceType: 'byok' },
        null,
      );
      assert.equal(state.isFallback, true);
      assert.equal(state.invalidGroupLabel, '我的 unknown');
    });

    it('preserves valid labels with allowed punctuation like Ben & Jerry\'s', () => {
      const state = resolveFallbackRouting(
        'seedance-2-0',
        'Seedance 2.0',
        { channelGroupId: 'byok-custom', label: "Ben & Jerry's 专线 (A区)", sourceType: 'byok' },
        null,
      );
      assert.equal(state.isFallback, true);
      assert.equal(state.invalidGroupLabel, "Ben & Jerry's 专线 (A区)");
    });

    it('guards against non-byok candidates extraction when sourceType is byok', () => {
      // 当声明 sourceType === 'byok'，但 allowedGroups 混入官方渠道 'official' 时，
      // 绝不将 'official' 作为 targetGroupId 提取，而是安全判定为无有效 BYOK 渠道并触发失效回退
      const state = resolveFallbackRouting(
        'seedance-2-0',
        'Seedance 2.0',
        { channelGroupId: 'official', allowedGroups: ['pro'], sourceType: 'byok' },
        null,
      );
      assert.equal(state.isFallback, true);
      assert.equal(state.invalidGroupId, null);
      assert.equal(state.recommendedOfficialGroupId, 'standard');
    });
  });

  describe('buildChannelContract', () => {
    it('constructs ChannelContract from ChannelGroupItem', () => {
      const [officialGroup] = resolveModelChannelGroups('seedance-2-0');
      const contract = buildChannelContract('seedance-2-0', officialGroup);
      assert.equal(contract.modelId, 'seedance-2-0');
      assert.equal(contract.groupId, officialGroup.id);
      assert.equal(contract.channelCategory, 'official');
      assert.equal(contract.endpoint.provider, 'omnimux-gateway');
      assert.ok(contract.constraints.supportedAspectRatios.length > 0);
    });

    it('respects baseConstraints override priority over group.constraints', () => {
      const [officialGroup] = resolveModelChannelGroups('seedance-2-0');
      const groupWithConstraints = {
        ...officialGroup,
        constraints: {
          inputs: { image: { max: 1 } },
          parameters: {
            duration: { only: [5] },
          },
        },
      };
      // 显式传入 baseConstraints，要求能覆写 group 自身的约束
      const contract = buildChannelContract('seedance-2-0', groupWithConstraints, {
        maxReferenceImages: 3,
        supportedDurations: [5, 10, 15],
      });
      assert.equal(contract.constraints.maxReferenceImages, 3);
      assert.deepEqual(contract.constraints.supportedDurations, [5, 10, 15]);
    });

    it('defends against null/undefined in baseConstraints and enforces non-negative maxReferenceImages', () => {
      const [officialGroup] = resolveModelChannelGroups('seedance-2-0');
      const contract = buildChannelContract('seedance-2-0', officialGroup, {
        maxReferenceImages: -1,
        defaultDuration: null,
      });
      // 数值防御为 0
      assert.equal(contract.constraints.maxReferenceImages, 0);
      // null 不冲掉缺省值
      assert.equal(contract.constraints.defaultDuration, 5);
    });

    it('defends against non-finite or negative defaultDuration and maxPromptLength in baseConstraints', () => {
      const [officialGroup] = resolveModelChannelGroups('seedance-2-0');
      const contract = buildChannelContract('seedance-2-0', officialGroup, {
        defaultDuration: -10,
        maxPromptLength: NaN,
      });
      // 负数与非有限数被过滤，保留安全默认值
      assert.equal(contract.constraints.defaultDuration, 5);
      assert.equal(contract.constraints.maxPromptLength, 2000);

      const contractValid = buildChannelContract('seedance-2-0', officialGroup, {
        defaultDuration: 10,
        maxPromptLength: 3000,
      });
      assert.equal(contractValid.constraints.defaultDuration, 10);
      assert.equal(contractValid.constraints.maxPromptLength, 3000);
    });

    it('reconciles params consistently with baseConstraints override in contract', () => {
      const [officialGroup] = resolveModelChannelGroups('seedance-2-0');
      const contract = buildChannelContract('seedance-2-0', officialGroup, {
        maxReferenceImages: 2,
        supportedDurations: [5],
        defaultDuration: 5,
      });
      const currentParams = {
        referenceImages: ['img1.png', 'img2.png', 'img3.png'],
        duration: 10,
      };
      const result = reconcileParamsWithContract(currentParams, contract);
      assert.deepEqual(result.nextParams.referenceImages, ['img1.png', 'img2.png']);
      assert.equal(result.nextParams.duration, 5);
      const refNote = result.healingNotes.find((n) => n.field === 'referenceImages');
      assert.equal(refNote?.message, '该渠道最多支持 2 张参考图，已自动截取');
      const durationNote = result.healingNotes.find((n) => n.field === 'duration');
      assert.equal(durationNote?.message, '该渠道仅支持标准时长（5秒）');
    });

    it('does not populate video-only constraints for pure image models', () => {
      const pureImageGroup = {
        id: 'image-official-fast',
        name: '图像生成专线',
        category: 'official',
        constraints: {
          parameters: {
            aspectRatio: { only: ['1:1', '16:9', '9:16', '4:3', '3:4'] },
            duration: { only: [5, 10] }, // 干扰项：纯图片模型必须免疫 duration 注入
          },
        },
      };
      const contract = buildChannelContract('flux-1-dev', pureImageGroup);
      assert.equal(contract.constraints.supportedDurations, undefined);
      assert.equal(contract.constraints.defaultDuration, undefined);
      assert.equal(contract.constraints.supportsAudioGeneration, false);
      assert.deepEqual(contract.constraints.supportedAspectRatios, ['1:1', '16:9', '9:16', '4:3', '3:4']);
    });

    it('filters out non-array supportedAspectRatios/supportedDurations/supportedResolutions in baseConstraints', () => {
      const [officialGroup] = resolveModelChannelGroups('seedance-2-0');
      const contract = buildChannelContract('seedance-2-0', officialGroup, {
        supportedAspectRatios: 'not-an-array',
        supportedDurations: { not: 'array' },
        supportedResolutions: 12345,
      });
      assert.ok(Array.isArray(contract.constraints.supportedAspectRatios));
      assert.ok(Array.isArray(contract.constraints.supportedDurations));
      assert.ok(Array.isArray(contract.constraints.supportedResolutions));
    });

    it('strictly guards and filters invalid element types in aspectRatio/duration/resolution constraints and falls back on empty', () => {
      const dirtyGroup = {
        id: 'dirty-constraints-group',
        name: '脏约束测试组',
        category: 'official',
        constraints: {
          parameters: {
            aspectRatio: { only: [null, 123, '', '   ', '16:9', {}] },
            duration: { only: ['not-a-number', -5, NaN, 10, null] },
            resolution: { only: [false, '', '720p', undefined] },
          },
        },
      };
      const contract = buildChannelContract('seedance-2-0', dirtyGroup);
      assert.deepEqual(contract.constraints.supportedAspectRatios, ['16:9']);
      assert.deepEqual(contract.constraints.supportedDurations, [10]);
      assert.deepEqual(contract.constraints.supportedResolutions, ['720p']);

      // 测试完全无效/全空数组时安全回退到默认值
      const emptyGroup = {
        id: 'empty-constraints-group',
        name: '空约束测试组',
        category: 'official',
        constraints: {
          parameters: {
            aspectRatio: { only: [null, '', 123] },
            duration: { only: ['invalid', -1] },
            resolution: { only: [true, {}] },
          },
        },
      };
      const contractFallback = buildChannelContract('seedance-2-0', emptyGroup);
      assert.deepEqual(contractFallback.constraints.supportedAspectRatios, ['16:9', '9:16', '1:1']);
      assert.deepEqual(contractFallback.constraints.supportedDurations, [5, 10]);
      assert.deepEqual(contractFallback.constraints.supportedResolutions, ['720p', '1080p']);
    });

    it('safely guards against NaN or negative maxReferenceImages in constraints', () => {
      const [officialGroup] = resolveModelChannelGroups('seedance-2-0');
      const contractWithNaN = buildChannelContract('seedance-2-0', officialGroup, {
        maxReferenceImages: NaN,
      });
      assert.equal(contractWithNaN.constraints.maxReferenceImages, 0);

      const contractWithNegative = buildChannelContract('seedance-2-0', officialGroup, {
        maxReferenceImages: -5,
      });
      assert.equal(contractWithNegative.constraints.maxReferenceImages, 0);
    });

    it('only disables sound when supportsAudioGeneration is explicitly false', () => {
      const contractWithTrueSound = {
        contractVersion: '1.0',
        modelId: 'seedance-2.0',
        groupId: 'test',
        channelCategory: 'official',
        endpoint: { provider: 'omnimux-gateway', authType: 'official-token', timeoutMs: 60000 },
        constraints: {
          supportedAspectRatios: ['16:9'],
          defaultAspectRatio: '16:9',
          supportedResolutions: ['1080p'],
          defaultResolution: '1080p',
          maxReferenceImages: 1,
          supportsAudioGeneration: true,
          maxPromptLength: 2000,
        },
      };
      const result = reconcileParamsWithContract({ sound: true }, contractWithTrueSound);
      assert.equal(result.nextParams.sound, true);
      assert.equal(result.healingNotes.length, 0);
    });

    it('locks supportsAudioGeneration = false when group defines sound fixed false, even if baseConstraints sets true', () => {
      const groupWithNoSound = {
        id: 'no-sound-group',
        label: '静音通道',
        constraints: {
          parameters: {
            sound: { fixed: false },
          },
        },
      };
      const contract = buildChannelContract('seedance-2-0', groupWithNoSound, {
        supportsAudioGeneration: true,
      });
      assert.equal(contract.constraints.supportsAudioGeneration, false);
    });

    it('returns empty aspect ratios and resolutions for audio models (TTS/sound) and skips non-audio parameter healing', () => {
      const audioGroup = {
        id: 'byok-custom',
        category: 'byok',
        name: '我的音频渠道',
      };
      const contract = buildChannelContract('doubao-tts', audioGroup, {
        supportedAspectRatios: ['16:9'],
        supportedResolutions: ['1080p'],
        supportsAudioGeneration: true,
      });
      assert.deepEqual(contract.constraints.supportedAspectRatios, []);
      assert.equal(contract.constraints.defaultAspectRatio, '');
      assert.deepEqual(contract.constraints.supportedResolutions, []);
      assert.equal(contract.constraints.defaultResolution, '');
      assert.equal(contract.constraints.supportsAudioGeneration, false, 'supportsAudioGeneration 仅在 video 模态下生效');

      // 验证自愈跳过非音频参数
      const audioParams = {
        aspectRatio: '16:9',
        resolution: '1080p',
        sound: true,
      };
      const result = reconcileParamsWithContract(audioParams, contract);
      assert.equal(result.healingNotes.length, 0, '音频模态绝不产生比例、分辨率或音频同步的虚假提示');
      assert.equal(result.nextParams.aspectRatio, '16:9');
      assert.equal(result.nextParams.resolution, '1080p');
    });

    it('enforces supportsAudioGeneration only for video models and locks to false for non-video models', () => {
      const group = { id: 'byok-fal', category: 'byok' };
      // 视频模型：正常支持
      const videoContract = buildChannelContract('seedance-2-0', group);
      assert.equal(videoContract.constraints.supportsAudioGeneration, true);

      // 图片模型：即使 baseConstraints 传入 true 也强制锁定为 false
      const imageContract = buildChannelContract('flux-1-dev', group, { supportsAudioGeneration: true });
      assert.equal(imageContract.constraints.supportsAudioGeneration, false);

      // 音频模型：强制锁定为 false
      const audioContract = buildChannelContract('doubao-tts', group, { supportsAudioGeneration: true });
      assert.equal(audioContract.constraints.supportsAudioGeneration, false);
    });

    it('does not populate video durations when model modality is unknown or null', () => {
      const [officialGroup] = resolveModelChannelGroups('seedance-2-0');
      const contract = buildChannelContract('unknown-custom-model-xyz', officialGroup);
      assert.equal(contract.constraints.supportedDurations, undefined);
      assert.equal(contract.constraints.defaultDuration, undefined);
    });

    it('protects against NaN in pointsEstimate pricing', () => {
      const groupWithNaNPricing = {
        id: 'test-group',
        label: '测试渠道',
        pricing: {
          pointsEstimate: NaN,
        },
      };
      const contract = buildChannelContract('seedance-2-0', groupWithNaNPricing);
      assert.equal(contract.billing.unitPrice, undefined);
    });

    it('safely extracts providerKey with rawKey defense and defaults endpoint to custom-http when not starting with byok-', () => {
      const customByokGroup = {
        id: 'custom-unprefixed',
        category: 'byok',
        label: '自定义直连',
      };
      const contract = buildChannelContract('seedance-2-0', customByokGroup);
      assert.equal(contract.channelCategory, 'byok');
      assert.equal(contract.endpoint.provider, 'custom-http');

      const emptyByokIdGroup = {
        id: 'byok-',
        category: 'byok',
        label: '空提供商直连',
      };
      const contractEmpty = buildChannelContract('seedance-2-0', emptyByokIdGroup);
      assert.equal(contractEmpty.endpoint.provider, 'custom-http');
    });

    it('ALLOWED_CONSTRAINT_KEYS strictly guards against external unknown fields injection', () => {
      assert.ok(ALLOWED_CONSTRAINT_KEYS instanceof Set);
      const [officialGroup] = resolveModelChannelGroups('seedance-2-0');
      const maliciousPayload = {
        supportedAspectRatios: ['16:9'],
        __proto_pollute__: 'danger',
        maliciousKey: 'exploit',
        supportsAudioGeneration: 'not-a-boolean', // 非合法类型，被类型守卫丢弃
        maxReferenceImages: 'not-a-number', // 非数字类型，被丢弃
      };
      const contract = buildChannelContract('seedance-2-0', officialGroup, maliciousPayload);
      assert.deepEqual(contract.constraints.supportedAspectRatios, ['16:9']);
      assert.equal(contract.constraints.__proto_pollute__, undefined);
      assert.equal(contract.constraints.maliciousKey, undefined);
      // 类型守卫防御
      assert.equal(typeof contract.constraints.supportsAudioGeneration, 'boolean');
      assert.equal(typeof contract.constraints.maxReferenceImages, 'number');
    });

    it('normalizes default values to first supported item when baseConstraints overrides supported sets without explicit default', () => {
      const [officialGroup] = resolveModelChannelGroups('seedance-2-0');
      const baseConstraints = {
        supportedAspectRatios: ['9:16', '1:1'],
        supportedDurations: [10],
        supportedResolutions: ['4k'],
      };
      const contract = buildChannelContract('seedance-2-0', officialGroup, baseConstraints);
      assert.equal(contract.constraints.defaultAspectRatio, '9:16');
      assert.equal(contract.constraints.defaultDuration, 10);
      assert.equal(contract.constraints.defaultResolution, '4k');
    });

    it('normalizes default values when baseConstraints specifies default values outside new supported sets', () => {
      const [officialGroup] = resolveModelChannelGroups('seedance-2-0');
      const baseConstraints = {
        supportedAspectRatios: ['9:16'],
        defaultAspectRatio: '16:9',
        supportedDurations: [15],
        defaultDuration: 5,
        supportedResolutions: ['4k'],
        defaultResolution: '720p',
      };
      const contract = buildChannelContract('seedance-2-0', officialGroup, baseConstraints);
      assert.equal(contract.constraints.defaultAspectRatio, '9:16');
      assert.equal(contract.constraints.defaultDuration, 15);
      assert.equal(contract.constraints.defaultResolution, '4k');
    });
  });

  describe('isByokGroup and sanitizeProviderKey utilities', () => {
    it('accurately identifies byok groups from objects or ids', () => {
      assert.equal(isByokGroup('byok-fal'), true);
      assert.equal(isByokGroup('standard'), false);
      assert.equal(isByokGroup({ category: 'byok', id: 'custom' }), true);
      assert.equal(isByokGroup({ sourceType: 'byok', id: 'custom' }), true);
      assert.equal(isByokGroup({ id: 'byok-openai' }), true);
      assert.equal(isByokGroup({ category: 'official', id: 'pro' }), false);
      assert.equal(isByokGroup(null), false);
      assert.equal(isByokGroup(undefined), false);
    });

    it('safely handles prototype pollution or prototype property names like toString or constructor', () => {
      // 验证在 providerKey 命中 Object 原型属性时，不会将原型函数误当成 Provider 元数据
      const fallbackResult = resolveFallbackRouting(
        'seedance-2-0',
        'Seedance 2.0',
        { allowedGroups: ['byok-toString'], channelGroupId: 'byok-toString', sourceType: 'byok' },
      );
      assert.equal(fallbackResult.isFallback, true);
      assert.equal(fallbackResult.invalidGroupLabel, '我的 tostring');

      const byokGroup = {
        id: 'byok-toString',
        label: 'byok-toString',
        category: 'byok',
        sourceType: 'byok',
      };
      const contract = buildChannelContract('seedance-2-0', byokGroup);
      assert.equal(contract.channelCategory, 'byok');
      assert.equal(contract.endpoint.provider, 'custom-http');
    });
  });

  describe('primary slot key derivation based on target model layout', () => {
    it('correctly derives primary slot key from target model layout instead of stale layout', () => {
      // 验证针对单图渠道约束时，基于目标模型与操作派生出的首槽位 Key（如 '0'）准确作为收敛容器
      const mockCatalog = {
        models: [
          {
            id: 'nano-banana-2',
            operations: [
              {
                id: 'image_to_image',
                listed: true,
                inputs: [
                  { slot: '0', role: 'reference', type: 'image' },
                  { slot: '1', role: 'reference', type: 'image' },
                ],
                output: { type: 'image' },
              },
            ],
          },
        ],
      };
      const targetSlotLayout = deriveSlotLayout(mockCatalog, 'nano-banana-2', 'image_to_image');
      const primarySlotKey = targetSlotLayout.slots[0]?.slot ?? '0';
      assert.equal(primarySlotKey, '0', '目标模型首槽位键准确解析为 0');

      // 模拟多槽位绑定数据收敛到新模型首槽位
      const rawBindings = {
        '0': [{ assetId: 'img-1' }],
        '1': [{ assetId: 'img-2' }],
      };
      const keys = Object.keys(rawBindings);
      const hasExtra = keys.some((k) => k !== primarySlotKey && (rawBindings[k]?.length ?? 0) > 0);
      assert.equal(hasExtra, true);
      const primaryOccupants = rawBindings[primarySlotKey] ?? [];
      const firstAvailableOccupant = primaryOccupants[0]
        ?? keys.filter((k) => k !== primarySlotKey).flatMap((k) => rawBindings[k] ?? [])[0];
      const nextSlotBindings = {
        [primarySlotKey]: firstAvailableOccupant ? [firstAvailableOccupant] : [],
      };
      assert.deepEqual(nextSlotBindings, { '0': [{ assetId: 'img-1' }] });
    });
  });
});
