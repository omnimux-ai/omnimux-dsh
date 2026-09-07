/**
 * Multimodal Compiler — 多模态 Prompt 执行编译网关 (Issue #714 / T05).
 *
 * 核心功能：
 * 1. 使用无歧义正则扫描 rawPrompt 中的全部素材引用：/@ref\[([^:]+):([^:]+):([^\]]+)\]/g
 * 2. 多级素材解析：优先从 upstreamOutputs，其次从 slotState 解析 mediaUrl 及素材类型
 * 3. 针对支持 Interleaved（交错多模态）模型：
 *    将 Prompt 切割为交织数组 interleavedParts（包含 text 与 image_url/video_url/audio_url）
 * 4. 针对传统固定槽位生成模型（Flux, SDXL, Kling, Hailuo 等）：
 *    - cleanedPrompt：将 @ref[...] 替换为用户友好标签 [参考图: fileName] 等，避免脏语法污染
 *    - resolvedReferences：提取规范引用素材列表供 API 打包
 * 5. 容错回退机制：引用的素材丢失或未就绪时，平滑降级为纯文本友好标签，杜绝 fatal crash
 */

import type { MaterialType } from '../../shared/canvasTypes.ts';
import type {
  NodeSlotEngineState,
  CompiledExecutionPayload,
  PromptReferenceToken,
} from '../../shared/graph/slotContractTypes.ts';
import { createWorkflowLogger } from './logger.ts';

const logger = createWorkflowLogger('multimodalCompiler');

export const PROMPT_REF_REGEX = /@ref\[([^:]+):([^:]+):([^\]]+)\]/g;

export interface UpstreamOutputItem {
  mediaUrl?: string;
  url?: string;
  path?: string;
  text?: string;
  mimeType?: string;
  mediaAssets?: Array<{
    url?: string;
    path?: string;
    mimeType?: string;
    type?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface ModelContractOption {
  supportsInterleaved?: boolean;
  category?: string;
  [key: string]: unknown;
}

export interface CompileMultimodalPromptArgs {
  rawPrompt: string;
  slotState?: NodeSlotEngineState;
  upstreamOutputs?:
    | Record<string, UpstreamOutputItem>
    | Map<string, UpstreamOutputItem>
    | Map<string, unknown>;
  modelContract?: ModelContractOption;
}

export interface InterleavedPart {
  type: 'text' | 'image_url' | 'video_url' | 'audio_url' | string;
  text?: string;
  url?: string;
  mediaUrl?: string;
  image_url?: { url: string };
  video_url?: { url: string };
  audio_url?: { url: string };
  mimeType?: string;
  slotIndex?: number;
  sourceNodeId?: string;
  label?: string;
  materialType?: MaterialType;
  [key: string]: unknown;
}

export interface ResolvedReferenceItem {
  role: 'reference';
  type: MaterialType;
  materialType?: MaterialType;
  pathOrUrl: string;
  mediaUrl: string;
  sourceNodeId: string;
  slotIndex: number;
  label: string;
  mimeType?: string;
  [key: string]: unknown;
}

/**
 * 根据文件名后缀或 MIME 类型推断素材类型。
 */
export function inferMaterialType(fileName: string, mimeType?: string): MaterialType {
  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('text/')) return 'text';
  }

  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'avif'].includes(ext)) {
    return 'image';
  }
  if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(ext)) {
    return 'video';
  }
  if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'].includes(ext)) {
    return 'audio';
  }
  return 'image';
}

/**
 * 将引用 Token 格式化为纯文本友好标签。
 */
export function formatFriendlyTag(materialType: MaterialType | string, fileName: string): string {
  switch (materialType) {
    case 'video':
      return `[参考视频: ${fileName}]`;
    case 'audio':
      return `[参考音频: ${fileName}]`;
    case 'image':
      return `[参考图: ${fileName}]`;
    default:
      return `[参考: ${fileName}]`;
  }
}

/**
 * 编译多模态 Prompt。
 */
export function compileMultimodalPrompt(args: CompileMultimodalPromptArgs): CompiledExecutionPayload {
  const { rawPrompt, slotState, upstreamOutputs, modelContract } = args;

  if (!rawPrompt || typeof rawPrompt !== 'string') {
    return {
      cleanedPrompt: '',
      interleavedParts: modelContract?.supportsInterleaved ? [] : undefined,
      resolvedReferences: [],
    };
  }

  const supportsInterleaved = Boolean(
    modelContract?.supportsInterleaved || modelContract?.category === 'interleaved',
  );

  // 解析并查找单个引用的媒体数据
  const resolveTokenData = (nodeId: string, slotIndex: number, fileName: string) => {
    let mediaUrl: string | undefined;
    let mimeType: string | undefined;
    let materialType: MaterialType | undefined;

    // 1. 优先从 upstreamOutputs 查找
    if (upstreamOutputs) {
      let upEntry: UpstreamOutputItem | undefined;
      if (upstreamOutputs instanceof Map || (typeof upstreamOutputs === 'object' && upstreamOutputs !== null && 'get' in upstreamOutputs && typeof (upstreamOutputs as { get: unknown }).get === 'function')) {
        upEntry = (upstreamOutputs as unknown as Map<string, UpstreamOutputItem>).get(nodeId);
      } else if (typeof upstreamOutputs === 'object') {
        upEntry = (upstreamOutputs as Record<string, UpstreamOutputItem>)[nodeId];
      }

      if (upEntry) {
        mediaUrl = upEntry.mediaUrl || upEntry.url || upEntry.path;
        if (!mediaUrl && Array.isArray(upEntry.mediaAssets) && upEntry.mediaAssets.length > 0) {
          const asset = upEntry.mediaAssets[0];
          mediaUrl = asset?.url || asset?.path;
          mimeType = asset?.mimeType;
          if (asset?.type) {
            materialType = asset.type as MaterialType;
          }
        }
        mimeType = mimeType || upEntry.mimeType;
      }
    }

    // 2. 其次从 slotState 查找
    if (!mediaUrl && slotState) {
      const activeItem = slotState.activeSlots.find(
        (s) => s.sourceNodeId === nodeId && s.slotIndex === slotIndex,
      ) || slotState.activeSlots.find((s) => s.sourceNodeId === nodeId);

      if (activeItem) {
        mediaUrl = activeItem.mediaUrl;
        mimeType = mimeType || activeItem.mimeType;
        materialType = materialType || activeItem.materialType;
      } else {
        const overflowItem = slotState.overflowPool.find((o) => o.sourceNodeId === nodeId);
        if (overflowItem) {
          mediaUrl = overflowItem.mediaUrl;
          mimeType = mimeType || overflowItem.mimeType;
          materialType = materialType || overflowItem.materialType;
        }
      }
    }

    if (!materialType) {
      materialType = inferMaterialType(fileName, mimeType);
    }

    return {
      mediaUrl,
      mimeType,
      materialType,
    };
  };

  const resolvedReferences: ResolvedReferenceItem[] = [];
  const interleavedParts: InterleavedPart[] = [];
  const seenRefKeys = new Set<string>();

  // 扫描全部 Token
  PROMPT_REF_REGEX.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  // 纯文本构建器
  let cleanedPrompt = '';

  while ((match = PROMPT_REF_REGEX.exec(rawPrompt)) !== null) {
    const matchStart = match.index;
    const matchEnd = PROMPT_REF_REGEX.lastIndex;
    const nodeId = match[1] ?? '';
    const slotIndexStr = match[2] ?? '0';
    const fileName = match[3] ?? '';
    const slotIndex = Number.parseInt(slotIndexStr, 10);
    const validSlotIndex = Number.isNaN(slotIndex) ? 0 : slotIndex;

    // 1. 处理前置纯文本
    const prefixText = rawPrompt.slice(lastIndex, matchStart);
    if (prefixText.length > 0) {
      cleanedPrompt += prefixText;
      if (supportsInterleaved) {
        interleavedParts.push({
          type: 'text',
          text: prefixText,
        });
      }
    }

    // 2. 尝试解析 Token 媒体
    const { mediaUrl, mimeType, materialType } = resolveTokenData(nodeId, validSlotIndex, fileName);
    const friendlyTag = formatFriendlyTag(materialType, fileName);

    // cleanedPrompt 始终追加友好纯文本标签
    cleanedPrompt += friendlyTag;

    if (mediaUrl) {
      // 成功解析到有效媒体
      const refKey = `${nodeId}:${validSlotIndex}:${mediaUrl}`;
      if (!seenRefKeys.has(refKey)) {
        seenRefKeys.add(refKey);
        resolvedReferences.push({
          role: 'reference',
          type: materialType,
          materialType,
          pathOrUrl: mediaUrl,
          mediaUrl,
          sourceNodeId: nodeId,
          slotIndex: validSlotIndex,
          label: fileName,
          ...(mimeType ? { mimeType } : {}),
        });
      }

      if (supportsInterleaved) {
        const partType = `${materialType}_url`;
        interleavedParts.push({
          type: partType,
          [partType]: { url: mediaUrl },
          url: mediaUrl,
          mediaUrl,
          mimeType,
          slotIndex: validSlotIndex,
          sourceNodeId: nodeId,
          label: fileName,
          materialType,
        });
      }
    } else {
      // 容错平滑降级：媒体丢失或未就绪
      logger.warn('多模态编译警告：引用素材未就绪或丢失，平滑降级为文本标签', {
        nodeId,
        slotIndex: validSlotIndex,
        fileName,
      });

      if (supportsInterleaved) {
        interleavedParts.push({
          type: 'text',
          text: friendlyTag,
        });
      }
    }

    lastIndex = matchEnd;
  }

  // 处理尾部纯文本
  if (lastIndex < rawPrompt.length) {
    const trailingText = rawPrompt.slice(lastIndex);
    cleanedPrompt += trailingText;
    if (supportsInterleaved) {
      interleavedParts.push({
        type: 'text',
        text: trailingText,
      });
    }
  }

  return {
    cleanedPrompt,
    interleavedParts: supportsInterleaved
      ? (interleavedParts as unknown as CompiledExecutionPayload['interleavedParts'])
      : undefined,
    resolvedReferences,
  };
}

export class MultimodalCompiler {
  static compile(args: CompileMultimodalPromptArgs): CompiledExecutionPayload {
    return compileMultimodalPrompt(args);
  }
}
