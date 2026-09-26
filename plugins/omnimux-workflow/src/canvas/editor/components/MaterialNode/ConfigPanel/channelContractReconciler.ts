/**
 * Channel Contract and Adaptive Parameter Reconciler.
 *
 * Provides pure functions and data types to reconcile canvas node parameters
 * against ChannelContract constraints upon channel switching, generating
 * exact, normalized self-healing notes and fallback states.
 *
 * All user-facing copy strictly adheres to PRD 3.3 and PRD 6.1.
 */

import {
  resolveModelChannelGroups,
  BYOK_PROVIDER_DISPLAY_MAP,
  isByokGroup,
  sanitizeProviderKey,
  detectModelModality,
  type ChannelGroupItem,
  type RuntimeByokChannelSettings,
} from './channelGroups';

/**
 * 渠道输入与输出能力硬约束
 */
export interface ChannelConstraints {
  /** 支持的画幅比例列表 (例如 ['16:9', '9:16', '1:1']) */
  supportedAspectRatios: string[];
  /** 推荐默认画幅比例 */
  defaultAspectRatio: string;

  /** 支持的生成时长 (秒) 列表 (例如 [5, 10]) */
  supportedDurations?: number[];
  /** 推荐默认时长 */
  defaultDuration?: number;

  /** 支持的分辨率列表 (例如 ['720p', '1080p', '4k']) */
  supportedResolutions: string[];
  /** 推荐默认分辨率 */
  defaultResolution: string;

  /** 支持的最大参考图卡槽数量 (0 = 不支持垫图, 1 = 仅单张, 2 = 支持双图) */
  maxReferenceImages: number;

  /** 是否支持原生音频/音效同步输出 */
  supportsAudioGeneration: boolean;

  /** 文本提示词最大长度限制 (字符数) */
  maxPromptLength: number;
}

/**
 * 渠道契约实体 (ChannelContract)
 * 描述特定物理渠道对模型输入/输出能力的精确约束
 */
export interface ChannelContract {
  /** 契约版本号 */
  contractVersion: '1.0';
  /** 绑定的逻辑模型 ID (例如 'seedance-2.0', 'gpt-image-2.5') */
  modelId: string;
  /** 渠道分组唯一标识 (例如 'official-standard', 'byok-fal') */
  groupId: string;
  /** 渠道归属分类 */
  channelCategory: 'official' | 'byok';

  /** 物理调度端点配置 (解耦全局 runtimeMode) */
  endpoint: {
    provider: 'omnimux-gateway' | 'fal-ai' | 'openai' | 'custom-http';
    baseUrl?: string;
    authType: 'official-token' | 'user-bearer' | 'none';
    timeoutMs: number;
  };

  /** 输入/输出约束集 (用于驱动 UI 自适应与自愈) */
  constraints: ChannelConstraints;

  /** 计费元数据 (仅展示与核算用) */
  billing?: {
    type: 'quota' | 'payg' | 'free';
    unitPrice?: number;
    currency?: 'CNY' | 'USD';
  };
}

export interface HealingNote {
  field: 'referenceImages' | 'aspectRatio' | 'duration' | 'resolution' | 'sound';
  /** 严格锁定为 PRD 3.3 白名单文案 */
  message: string;
}

export interface ReconcileResult {
  nextParams: Record<string, unknown>;
  healingNotes: HealingNote[];
}

/**
 * 渠道契约自适应协调纯函数。
 * 针对切换渠道后超出约束的参数进行自愈修复，并输出 PRD 3.3 白名单字典锁定的温和提示。
 */
export function reconcileParamsWithContract(
  currentParams: Record<string, unknown>,
  newContract: ChannelContract,
): ReconcileResult {
  const nextParams: Record<string, unknown> = { ...currentParams };
  const notes: HealingNote[] = [];
  const { constraints } = newContract;

  // 1. 参考图卡槽协调
  if (nextParams.referenceImages !== undefined && !Array.isArray(nextParams.referenceImages)) {
    nextParams.referenceImages = [];
    notes.push({ field: 'referenceImages', message: '参考图数据异常，已自动重置为空' });
  }
  if (Array.isArray(nextParams.referenceImages)) {
    if (nextParams.referenceImages.length > constraints.maxReferenceImages) {
      nextParams.referenceImages = nextParams.referenceImages.slice(0, constraints.maxReferenceImages);
      if (constraints.maxReferenceImages === 0) {
        notes.push({ field: 'referenceImages', message: '当前渠道不支持参考图，已自动移除' });
      } else if (constraints.maxReferenceImages === 1) {
        notes.push({ field: 'referenceImages', message: '该渠道仅支持单张参考图' });
      } else {
        notes.push({
          field: 'referenceImages',
          message: `该渠道最多支持 ${constraints.maxReferenceImages} 张参考图，已自动截取`,
        });
      }
    }
  }

  // 2. 画幅比例自愈
  if (
    nextParams.aspectRatio !== undefined &&
    nextParams.aspectRatio !== null &&
    nextParams.aspectRatio !== '' &&
    Array.isArray(constraints.supportedAspectRatios) &&
    constraints.supportedAspectRatios.length > 0 &&
    !constraints.supportedAspectRatios.includes(String(nextParams.aspectRatio))
  ) {
    const fallbackRatio = constraints.defaultAspectRatio || constraints.supportedAspectRatios[0];
    nextParams.aspectRatio = fallbackRatio;
    notes.push({
      field: 'aspectRatio',
      message: `已根据该渠道能力自适应调整为 ${fallbackRatio}`,
    });
  }

  // 3. 时长自愈 (针对视频模型)
  if (
    constraints.supportedDurations &&
    constraints.supportedDurations.length > 0 &&
    nextParams.duration !== undefined &&
    nextParams.duration !== null &&
    nextParams.duration !== ''
  ) {
    const parsedDuration = Number(nextParams.duration);
    if (!Number.isFinite(parsedDuration) || !constraints.supportedDurations.includes(parsedDuration)) {
      const fallbackDuration = constraints.defaultDuration ?? constraints.supportedDurations[0];
      nextParams.duration = fallbackDuration;
      notes.push({
        field: 'duration',
        message: `该渠道仅支持标准时长（${fallbackDuration}秒）`,
      });
    } else if (typeof nextParams.duration === 'string') {
      nextParams.duration = parsedDuration;
    }
  }

  // 4. 分辨率受限自愈
  if (
    nextParams.resolution !== undefined &&
    nextParams.resolution !== null &&
    nextParams.resolution !== '' &&
    Array.isArray(constraints.supportedResolutions) &&
    constraints.supportedResolutions.length > 0 &&
    !constraints.supportedResolutions.includes(String(nextParams.resolution))
  ) {
    const fallbackResolution = constraints.defaultResolution || constraints.supportedResolutions[0];
    nextParams.resolution = fallbackResolution;
    notes.push({
      field: 'resolution',
      message: `已根据该渠道能力自适应调整为 ${fallbackResolution}`,
    });
  }

  // 5. 声音生成能力受限（supportsAudioGeneration 仅在 video 模态下生效，纯音频或非视频模态跳过，避免非视频节点产生虚假音频同步提示）
  if (detectModelModality(newContract.modelId) === 'video' && constraints.supportsAudioGeneration === false) {
    let soundDisabled = false;
    if (nextParams.sound === true) {
      nextParams.sound = false;
      soundDisabled = true;
    }
    if (nextParams.generateSound === true) {
      nextParams.generateSound = false;
      soundDisabled = true;
    }
    if (soundDisabled) {
      notes.push({ field: 'sound', message: '该渠道暂不支持音频同步生成' });
    }
  }

  return { nextParams, healingNotes: notes };
}

export interface ChannelFallbackState {
  isFallback: boolean;
  invalidGroupId: string | null;
  invalidGroupLabel: string | null;
  /** 触发器展示文本：例如 "Seedance 2.0 · 我的 fal.ai (已失效)" */
  triggerDisplayText: string;
  /** 面板顶部轻量警告卡片文案 */
  bannerMessage: '自备渠道已不可用，已自动匹配基准专线' | null;
  /** 一键降级按钮文案 */
  actionLabel: '切换为官方标准版' | null;
  /** 点击切换后的目标官方渠道 ID（优先 'standard'，其次首个 enabled 官方渠道） */
  recommendedOfficialGroupId: string | null;
  /** 未切换且未补全 Key 时点击运行的阻断文案 */
  runBlockedReason: '请配置自备 Key 或切换可用渠道' | null;
}

/**
 * 解析渠道失效回退状态。
 * 当持久化的自备渠道在当前配置中已失效或被删除时，平滑降级，提供一键切换与安全拦截。
 */
export function resolveFallbackRouting(
  modelId: string,
  modelDisplayName: string,
  persistedRouting: Record<string, unknown> | undefined,
  runtimeSettings?: RuntimeByokChannelSettings | null,
): ChannelFallbackState {
  if (!persistedRouting || typeof persistedRouting !== 'object') {
    return {
      isFallback: false,
      invalidGroupId: null,
      invalidGroupLabel: null,
      triggerDisplayText: modelDisplayName,
      bannerMessage: null,
      actionLabel: null,
      recommendedOfficialGroupId: null,
      runBlockedReason: null,
    };
  }

  // 提取持久化的渠道 ID
  let targetGroupId: string | null = null;
  const isByokDeclared = persistedRouting.sourceType === 'byok';

  const extractCandidate = (raw: unknown): string | null => {
    if (typeof raw === 'string' && raw.trim()) {
      const candidate = raw.trim();
      if (isByokDeclared && !isByokGroup(candidate)) {
        return null;
      }
      return candidate;
    }
    return null;
  };

  if (persistedRouting.channelGroupId) {
    targetGroupId = extractCandidate(persistedRouting.channelGroupId);
  }
  if (!targetGroupId && Array.isArray(persistedRouting.allowedGroups)) {
    for (const group of persistedRouting.allowedGroups) {
      const candidate = extractCandidate(group);
      if (candidate) {
        targetGroupId = candidate;
        break;
      }
    }
  }
  if (!targetGroupId && persistedRouting.group) {
    targetGroupId = extractCandidate(persistedRouting.group);
  }

  const isByok = Boolean(isByokDeclared || isByokGroup(targetGroupId));

  if (!isByok) {
    return {
      isFallback: false,
      invalidGroupId: null,
      invalidGroupLabel: null,
      triggerDisplayText: modelDisplayName,
      bannerMessage: null,
      actionLabel: null,
      recommendedOfficialGroupId: null,
      runBlockedReason: null,
    };
  }

  // 检查在当前可用渠道列表中是否存在且有效
  const availableGroups = resolveModelChannelGroups(modelId, runtimeSettings);
  if (targetGroupId) {
    const matched = availableGroups.find((g) => g.id === targetGroupId);
    if (matched && matched.isAvailable !== false) {
      return {
        isFallback: false,
        invalidGroupId: null,
        invalidGroupLabel: null,
        triggerDisplayText: `${modelDisplayName} · ${matched.label}`,
        bannerMessage: null,
        actionLabel: null,
        recommendedOfficialGroupId: null,
        runBlockedReason: null,
      };
    }
  }

  // 渠道失效判定成立
  const rawProviderKey = targetGroupId ? targetGroupId.replace(/^byok-/, '') : '';
  const providerKey = sanitizeProviderKey(rawProviderKey) || '';
  const displayMeta = providerKey && Object.prototype.hasOwnProperty.call(BYOK_PROVIDER_DISPLAY_MAP, providerKey)
    ? BYOK_PROVIDER_DISPLAY_MAP[providerKey]
    : undefined;
  const rawLabel = typeof persistedRouting.label === 'string' ? persistedRouting.label.trim() : '';
  // 字符白名单校验：允许中英文字符、数字、空格、常用安全标点 (- . : ( ) / @ & ' ’ · 以及全角中文括号等)；若包含非法字符（如 <script>、引号等）则直接丢弃不信任的标签，安全回退到 Provider 衍生标签
  const isTrustedLabel = rawLabel.length > 0 && /^[\p{L}\p{N}\s_.:()/@&'’·（）—–-]+$/u.test(rawLabel);
  const safeLabel = isTrustedLabel ? rawLabel : null;
  const providerDerivedLabel = displayMeta?.label || (providerKey ? `我的 ${providerKey}` : '我的自备渠道');
  const invalidGroupLabel = safeLabel || providerDerivedLabel;

  // 推荐官方渠道（优先 standard，否则首个可用渠道）
  const officialGroups = availableGroups.filter((g) => !isByokGroup(g));
  const standardOfficial = officialGroups.find((g) => g.id === 'standard' && g.isAvailable !== false);
  const fallbackOfficial = standardOfficial || officialGroups.find((g) => g.isAvailable !== false) || officialGroups[0];
  const recommendedOfficialGroupId = fallbackOfficial ? fallbackOfficial.id : null;

  return {
    isFallback: true,
    invalidGroupId: targetGroupId,
    invalidGroupLabel,
    triggerDisplayText: `${modelDisplayName} · ${invalidGroupLabel} (已失效)`,
    bannerMessage: '自备渠道已不可用，已自动匹配基准专线',
    actionLabel: '切换为官方标准版',
    recommendedOfficialGroupId,
    runBlockedReason: '请配置自备 Key 或切换可用渠道',
  };
}

/** 允许通过 baseConstraints 动态注入或覆写的合法字段白名单，杜绝外部注入未知字段破坏契约封闭性 */
export const ALLOWED_CONSTRAINT_KEYS = new Set<keyof ChannelConstraints>([
  'maxReferenceImages',
  'supportedAspectRatios',
  'defaultAspectRatio',
  'supportedDurations',
  'defaultDuration',
  'supportedResolutions',
  'defaultResolution',
  'supportsAudioGeneration',
  'maxPromptLength',
]);

/**
 * 辅助函数：从模型元数据与 ChannelGroupItem 构建标准的 ChannelContract
 */
export function buildChannelContract(
  modelId: string,
  group: ChannelGroupItem,
  baseConstraints?: Partial<ChannelConstraints>,
): ChannelContract {
  const isByok = isByokGroup(group);
  const rawKey = group.id.startsWith('byok-') ? group.id.replace(/^byok-/, '') : '';
  const providerKey = isByok ? (rawKey || null) : null;
  const providerMeta = providerKey && Object.prototype.hasOwnProperty.call(BYOK_PROVIDER_DISPLAY_MAP, providerKey)
    ? BYOK_PROVIDER_DISPLAY_MAP[providerKey]
    : undefined;

  const modality = detectModelModality(modelId);
  const isImageModel = modality === 'image';
  const isVideoModel = modality === 'video';
  const isAudioModel = modality === 'audio';

  // 默认基准约束（根据模型模态动态决定基准默认约束字段，纯音频模态返回空比例与空分辨率列表，仅视频模型挂载视频专属时长，未知模态不套用视频参数）
  const defaultConstraints: ChannelConstraints = {
    supportedAspectRatios: isAudioModel
      ? []
      : (isImageModel ? ['1:1', '16:9', '9:16', '4:3', '3:4'] : ['16:9', '9:16', '1:1']),
    defaultAspectRatio: isAudioModel ? '' : (isImageModel ? '1:1' : '16:9'),
    ...(isVideoModel ? {
      supportedDurations: [5, 10],
      defaultDuration: 5,
    } : {}),
    supportedResolutions: isAudioModel
      ? []
      : (isImageModel ? ['1024x1024', '1K', '2K'] : ['720p', '1080p']),
    defaultResolution: isAudioModel ? '' : (isImageModel ? '1024x1024' : '1080p'),
    maxReferenceImages: isAudioModel ? 0 : (isByok ? 1 : 2),
    supportsAudioGeneration: isVideoModel ? true : false,
    maxPromptLength: 2000,
  };

  const groupSoundFixedFalse = group.constraints?.parameters?.sound?.fixed === false
    || group.constraints?.parameters?.generateSound?.fixed === false;

  // 先映射 group 自身的 constraints 为基准
  if (group.constraints) {
    if (group.constraints.inputs?.image?.max !== undefined) {
      defaultConstraints.maxReferenceImages = group.constraints.inputs.image.max;
    }
    const paramConstraints = group.constraints.parameters;
    if (paramConstraints) {
      if (Array.isArray(paramConstraints.aspectRatio?.only)) {
        const validRatios = (paramConstraints.aspectRatio.only as unknown[]).filter(
          (v): v is string => typeof v === 'string' && v.trim().length > 0
        );
        if (validRatios.length > 0) {
          defaultConstraints.supportedAspectRatios = validRatios;
          if (!defaultConstraints.supportedAspectRatios.includes(defaultConstraints.defaultAspectRatio)) {
            defaultConstraints.defaultAspectRatio = defaultConstraints.supportedAspectRatios[0] || (isImageModel ? '1:1' : '16:9');
          }
        }
      } else if (typeof paramConstraints.aspectRatio?.fixed === 'string' && paramConstraints.aspectRatio.fixed.trim()) {
        defaultConstraints.supportedAspectRatios = [paramConstraints.aspectRatio.fixed.trim()];
        defaultConstraints.defaultAspectRatio = paramConstraints.aspectRatio.fixed.trim();
      }
      if (isVideoModel) {
        if (Array.isArray(paramConstraints.duration?.only)) {
          const validDurations = (paramConstraints.duration.only as unknown[]).filter(
            (v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
          );
          if (validDurations.length > 0) {
            defaultConstraints.supportedDurations = validDurations;
            if (!defaultConstraints.supportedDurations.includes(defaultConstraints.defaultDuration ?? 5)) {
              defaultConstraints.defaultDuration = defaultConstraints.supportedDurations[0];
            }
          }
        } else if (typeof paramConstraints.duration?.fixed === 'number' && Number.isFinite(paramConstraints.duration.fixed) && paramConstraints.duration.fixed >= 0) {
          defaultConstraints.supportedDurations = [paramConstraints.duration.fixed];
          defaultConstraints.defaultDuration = paramConstraints.duration.fixed;
        }
      }
      if (Array.isArray(paramConstraints.resolution?.only)) {
        const validResolutions = (paramConstraints.resolution.only as unknown[]).filter(
          (v): v is string => typeof v === 'string' && v.trim().length > 0
        );
        if (validResolutions.length > 0) {
          defaultConstraints.supportedResolutions = validResolutions;
          if (!defaultConstraints.supportedResolutions.includes(defaultConstraints.defaultResolution)) {
            defaultConstraints.defaultResolution = defaultConstraints.supportedResolutions[0] || (isImageModel ? '1024x1024' : '1080p');
          }
        }
      } else if (typeof paramConstraints.resolution?.fixed === 'string' && paramConstraints.resolution.fixed.trim()) {
        defaultConstraints.supportedResolutions = [paramConstraints.resolution.fixed.trim()];
        defaultConstraints.defaultResolution = paramConstraints.resolution.fixed.trim();
      }
      if (groupSoundFixedFalse) {
        defaultConstraints.supportsAudioGeneration = false;
      }
    }
  }

  // 再由显式传入的 baseConstraints 覆写（仅合并白名单内的有效值，避免 undefined/null 冲掉缺省值，并对字段类型增加强防御）
  if (baseConstraints && typeof baseConstraints === 'object') {
    for (const [key, value] of Object.entries(baseConstraints)) {
      if (!ALLOWED_CONSTRAINT_KEYS.has(key as keyof ChannelConstraints)) {
        continue;
      }
      if (value !== undefined && value !== null) {
        let sanitizedValue = value;
        if (key === 'supportedAspectRatios') {
          if (!Array.isArray(value)) continue;
          const filtered = (value as unknown[]).filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
          if (filtered.length === 0) continue;
          sanitizedValue = filtered;
        } else if (key === 'supportedDurations') {
          if (!Array.isArray(value)) continue;
          const filtered = (value as unknown[]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0);
          if (filtered.length === 0) continue;
          sanitizedValue = filtered;
        } else if (key === 'supportedResolutions') {
          if (!Array.isArray(value)) continue;
          const filtered = (value as unknown[]).filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
          if (filtered.length === 0) continue;
          sanitizedValue = filtered;
        }
        if (
          (key === 'defaultDuration' || key === 'maxPromptLength') &&
          (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
        ) {
          continue;
        }
        if (key === 'maxReferenceImages') {
          if (typeof value !== 'number') {
            continue;
          }
          sanitizedValue = (!Number.isFinite(value) || (value as number) < 0) ? 0 : value;
        }
        if (
          (key === 'defaultAspectRatio' || key === 'defaultResolution') &&
          typeof value !== 'string'
        ) {
          continue;
        }
        if (key === 'supportsAudioGeneration' && typeof value !== 'boolean') {
          continue;
        }
        (defaultConstraints as unknown as Record<string, unknown>)[key] = sanitizedValue;
      }
    }

    // 覆写支持集合后默认值归一化：若支持列表被更新且默认值未显式指定或不在新的支持集合中，自动归一化为对应支持列表的首项，杜绝自愈重置到集合外的非法值
    const firstAspectRatio = defaultConstraints.supportedAspectRatios?.[0];
    if (
      firstAspectRatio !== undefined &&
      (!defaultConstraints.defaultAspectRatio ||
        !defaultConstraints.supportedAspectRatios.includes(defaultConstraints.defaultAspectRatio))
    ) {
      defaultConstraints.defaultAspectRatio = firstAspectRatio;
    }

    const firstDuration = defaultConstraints.supportedDurations?.[0];
    if (
      firstDuration !== undefined &&
      (defaultConstraints.defaultDuration === undefined ||
        defaultConstraints.defaultDuration === null ||
        !defaultConstraints.supportedDurations?.includes(defaultConstraints.defaultDuration))
    ) {
      defaultConstraints.defaultDuration = firstDuration;
    }

    const firstResolution = defaultConstraints.supportedResolutions?.[0];
    if (
      firstResolution !== undefined &&
      (!defaultConstraints.defaultResolution ||
        !defaultConstraints.supportedResolutions?.includes(defaultConstraints.defaultResolution))
    ) {
      defaultConstraints.defaultResolution = firstResolution;
    }
  }

  // 若当前 group 显式定义禁用声音，在 baseConstraints 合并之后必须强制锁定，杜绝外部软约束反向覆盖 group 硬门禁
  if (groupSoundFixedFalse) {
    defaultConstraints.supportsAudioGeneration = false;
  }

  // supportsAudioGeneration 仅在 video 模态下生效，非视频模态强制为 false
  if (!isVideoModel) {
    defaultConstraints.supportsAudioGeneration = false;
  }

  // 纯音频模态强制清除非音频参数（比例与分辨率），避免外部软约束或基准约束引入虚假尺寸
  if (isAudioModel) {
    defaultConstraints.supportedAspectRatios = [];
    defaultConstraints.defaultAspectRatio = '';
    defaultConstraints.supportedResolutions = [];
    defaultConstraints.defaultResolution = '';
    defaultConstraints.maxReferenceImages = 0;
  }

  if (!Number.isFinite(defaultConstraints.maxReferenceImages) || defaultConstraints.maxReferenceImages < 0) {
    defaultConstraints.maxReferenceImages = 0;
  }
  if (defaultConstraints.defaultDuration !== undefined && (!Number.isFinite(defaultConstraints.defaultDuration) || defaultConstraints.defaultDuration < 0)) {
    delete defaultConstraints.defaultDuration;
  }
  if (!Number.isFinite(defaultConstraints.maxPromptLength) || defaultConstraints.maxPromptLength < 0) {
    defaultConstraints.maxPromptLength = 2000;
  }

  const endpointProvider = isByok
    ? (providerMeta?.provider || 'custom-http')
    : 'omnimux-gateway';

  return {
    contractVersion: '1.0',
    modelId,
    groupId: group.id,
    channelCategory: isByok ? 'byok' : 'official',
    endpoint: {
      provider: endpointProvider,
      authType: isByok ? 'user-bearer' : 'official-token',
      timeoutMs: 60000,
    },
    constraints: defaultConstraints,
    billing: isByok
      ? { type: 'payg' }
      : {
          type: 'quota',
          unitPrice: typeof group.pricing?.pointsEstimate === 'number' && Number.isFinite(group.pricing.pointsEstimate)
            ? group.pricing.pointsEstimate
            : undefined,
          currency: 'CNY',
        },
  };
}
